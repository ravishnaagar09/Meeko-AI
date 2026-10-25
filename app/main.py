import json
import os
from collections import Counter
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config, extract, llm, meeko, study
from .db import db, init
import time

ROOT = os.path.dirname(os.path.dirname(__file__))
STATIC = os.path.join(ROOT, "static")
templates = Jinja2Templates(directory=os.path.join(ROOT, "templates"))

PUBLIC_API = {"/api/health"}  # everything else under /api/ needs a login


def current_user(request: Request):
    """The logged-in user row, or None. Looked up once per request."""
    if not hasattr(request.state, "user"):
        user = auth.get_user(request.session.get("uid"))
        if user is None and "uid" in request.session:
            request.session.clear()  # account was deleted or the cookie is stale
        request.state.user = user
    return request.state.user


def guard(request: Request):
    """Runs before every route. API calls without a login get 401; pages redirect to /login themselves."""
    path = request.url.path
    if not path.startswith("/api/") or path in PUBLIC_API:
        return
    if current_user(request) is None:
        raise HTTPException(401, "Please log in to continue.")
    # A normal website form cannot add this header, so other sites can't trigger changes in your account.
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "fetch":
        raise HTTPException(403, "Blocked: this request did not come from the app.")


def uid(request: Request) -> int:
    """The logged-in user's id. guard() has already made sure someone is logged in."""
    return current_user(request)["id"]


app = FastAPI(title="Study Companion", version="1.1.0", dependencies=[Depends(guard)])
app.add_middleware(
    SessionMiddleware,
    secret_key=config.SECRET_KEY,          # signs the cookie so nobody can edit it
    session_cookie="marginalia_session",
    max_age=config.SESSION_MAX_AGE,        # auto logout after N days
    same_site="lax",                       # browser won't send the cookie on cross-site POSTs
    https_only=config.SESSION_HTTPS_ONLY,  # set SESSION_HTTPS_ONLY=true when deployed on https
)


@app.on_event("startup")
def _startup():
    init()  # creates tables and upgrades an old database safely
    app.include_router(meeko.router)  # MeekoMateAI chatbot: /api/meeko/chat


# --------------------------------------------------------------------------- helpers


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _ctx_or_404(doc_id: int, user_id: int):
    """Loads a document only if it belongs to this user. Someone else's document looks exactly like a missing one (404)."""
    ctx = study.load_doc(doc_id)
    if not ctx or ctx["doc"]["user_id"] != user_id:
        raise HTTPException(404, "Document not found. It may have been deleted.")
    return ctx


def _llm_guard(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except llm.LLMError as e:
        raise HTTPException(503, str(e))


def save_document(filename: str, ex: extract.Extracted, user_id: int) -> dict:
    pages = [(p, t) for p, t in ex.pages if t.strip()]
    chunks = extract.to_chunks(pages)
    if not chunks:
        raise extract.ExtractionError("No readable text was found in this file.")
    chars = sum(len(t) for _, t in pages)
    with db() as c:
        cur = c.execute(
            "INSERT INTO documents (filename, kind, page_count, char_count, notes, user_id) VALUES (?,?,?,?,?,?)",
            (filename, ex.kind, len(pages), chars, ex.notes, user_id),
        )
        did = cur.lastrowid
        c.executemany("INSERT INTO pages (document_id, page, text) VALUES (?,?,?)", [(did, p, t) for p, t in pages])
        c.executemany(
            "INSERT INTO chunks (document_id, page, idx, text) VALUES (?,?,?,?)",
            [(did, p, i, t) for i, (p, t) in enumerate(chunks)],
        )
    return {"id": did, "filename": filename, "kind": ex.kind, "page_count": len(pages), "char_count": chars, "notes": ex.notes}


# --------------------------------------------------------------------------- meta


@app.get("/api/health")
def health():
    return {"ok": True, "gemini_configured": llm.configured(), "model": config.GEMINI_MODEL, "max_upload_mb": config.MAX_UPLOAD_MB}


# --------------------------------------------------------------------------- documents


@app.post("/api/documents/upload")
def upload(files: List[UploadFile] = File(...), user_id: int = Depends(uid)):
    results = []
    limit = config.MAX_UPLOAD_MB * 1024 * 1024
    for f in files:
        name = os.path.basename(f.filename or "untitled")
        ext = os.path.splitext(name)[1].lower()
        kind = config.ALLOWED_EXT.get(ext)
        if not kind:
            results.append({"filename": name, "error": f"{ext or 'This'} files aren't supported. Use PDF, TXT, PNG, JPG or WEBP."})
            continue
        data = f.file.read(limit + 1)
        if len(data) > limit:
            results.append({"filename": name, "error": f"File is larger than {config.MAX_UPLOAD_MB} MB."})
            continue
        if not data:
            results.append({"filename": name, "error": "The file is empty."})
            continue
        try:
            ex = extract.extract_pdf(data) if kind == "pdf" else extract.extract_text_file(data) if kind == "text" else extract.extract_image(data)
            results.append({"filename": name, "document": save_document(name, ex, user_id)})
        except extract.ExtractionError as e:
            results.append({"filename": name, "error": str(e)})
    return {"results": results}


class PasteIn(BaseModel):
    title: str = Field(default="Pasted notes", max_length=120)
    text: str = Field(max_length=500_000)


@app.post("/api/documents/paste")
def paste(body: PasteIn, user_id: int = Depends(uid)):
    text = extract.clean(body.text)
    if len(text) < 20:
        raise HTTPException(422, "Paste at least a few sentences of notes.")
    title = body.title.strip() or "Pasted notes"
    try:
        doc = save_document(title, extract.Extracted(pages=[(None, text)], kind="pasted"), user_id)
    except extract.ExtractionError as e:
        raise HTTPException(422, str(e))
    return doc


@app.get("/api/documents")
def list_documents(q: str = "", user_id: int = Depends(uid)):
    with db() as c:
        rows = c.execute(
            """SELECT d.*,
                (SELECT COUNT(*) FROM quizzes z WHERE z.document_id=d.id AND z.status='completed') AS quiz_count,
                (SELECT AVG(100.0*z.score/z.total) FROM quizzes z WHERE z.document_id=d.id AND z.status='completed') AS avg_pct,
                (SELECT COUNT(*) FROM messages m WHERE m.document_id=d.id AND m.role='user') AS question_count
               FROM documents d WHERE d.user_id=? AND d.filename LIKE ? ORDER BY d.id DESC""",
            (user_id, f"%{q.strip()}%"),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: int, user_id: int = Depends(uid)):
    with db() as c:
        d = c.execute("SELECT * FROM documents WHERE id=? AND user_id=?", (doc_id, user_id)).fetchone()
        if not d:
            raise HTTPException(404, "Document not found.")
        pages = [dict(r) for r in c.execute("SELECT page, text FROM pages WHERE document_id=? ORDER BY id", (doc_id,))]
    return {"document": dict(d), "pages": pages}


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: int, user_id: int = Depends(uid)):
    with db() as c:
        cur = c.execute("DELETE FROM documents WHERE id=? AND user_id=?", (doc_id, user_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Document not found.")
    return {"deleted": doc_id}


# --------------------------------------------------------------------------- chat


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1500)


@app.get("/api/documents/{doc_id}/chat")
def chat_history(doc_id: int, user_id: int = Depends(uid)):
    _ctx_or_404(doc_id, user_id)
    with db() as c:
        rows = c.execute(
            """SELECT m.id, m.role, m.content, m.payload, m.created_at, f.rating AS fb_rating
               FROM messages m LEFT JOIN feedback f ON f.message_id=m.id
               WHERE m.document_id=? ORDER BY m.id""",
            (doc_id,),
        ).fetchall()
    out = []
    for r in rows:
        m = {"id": r["id"], "role": r["role"], "content": r["content"], "created_at": r["created_at"],
             "feedback": {"rating": r["fb_rating"]} if r["fb_rating"] is not None else None}
        if r["payload"]:
            m.update(json.loads(r["payload"]))
        out.append(m)
    return out


@app.post("/api/documents/{doc_id}/chat")
def chat(doc_id: int, body: ChatIn, user_id: int = Depends(uid)):
    t_start = time.time()
    ctx = _ctx_or_404(doc_id, user_id)
    question = body.message.strip()
    with db() as c:
        hist = [dict(r) for r in c.execute("SELECT role, content FROM messages WHERE document_id=? ORDER BY id DESC LIMIT 8", (doc_id,))][::-1]
    result = _llm_guard(study.answer_question, ctx, question, hist)
    payload = {k: result[k] for k in ("status", "missing", "evidence")}
    with db() as c:
        c.execute("INSERT INTO messages (document_id, role, content) VALUES (?,?,?)", (doc_id, "user", question))
        cur = c.execute("INSERT INTO messages (document_id, role, content, payload) VALUES (?,?,?,?)", (doc_id, "assistant", result["answer"], json.dumps(payload)))
        message_id = cur.lastrowid
        print(f"[chat] total time {time.time() - t_start:.1f}s")
    return {**result, "message_id": message_id}


@app.delete("/api/documents/{doc_id}/chat")
def clear_chat(doc_id: int, user_id: int = Depends(uid)):
    with db() as c:
        c.execute(
            "DELETE FROM messages WHERE document_id IN (SELECT id FROM documents WHERE id=? AND user_id=?)",
            (doc_id, user_id),
        )
    return {"cleared": True}


# --------------------------------------------------------------------------- quizzes


class QuizIn(BaseModel):
    difficulty: str = "medium"
    count: int = Field(default=5, ge=3, le=15)
    types: List[str] = ["mcq", "tf", "short"]
    topic: str = Field(default="", max_length=120)


def _public_question(q: dict) -> dict:
    return {"id": q["id"], "type": q["type"], "question": q["question"], "options": q["options"]}


def _quiz_row(r) -> dict:
    return {
        "id": r["id"], "document_id": r["document_id"], "difficulty": r["difficulty"], "topic": r["topic"],
        "status": r["status"], "score": r["score"], "total": r["total"],
        "created_at": r["created_at"], "completed_at": r["completed_at"],
    }


@app.post("/api/documents/{doc_id}/quiz")
def create_quiz(doc_id: int, body: QuizIn, user_id: int = Depends(uid)):
    ctx = _ctx_or_404(doc_id, user_id)
    difficulty = body.difficulty if body.difficulty in ("easy", "medium", "hard") else "medium"

    # Adaptive difficulty: if the last completed quiz on this document scored under 50%, make this one easy.
    adapted = False
    with db() as c:
        last = c.execute(
            "SELECT score, total FROM quizzes WHERE document_id=? AND status='completed' ORDER BY id DESC LIMIT 1",
            (doc_id,),
        ).fetchone()
    if last and last["total"] and 100 * last["score"] / last["total"] < 50:
        difficulty, adapted = "easy", True

    types = [t for t in body.types if t in ("mcq", "tf", "short")]
    if not types:
        raise HTTPException(422, "Choose at least one question type.")
    try:
        gen = _llm_guard(study.generate_quiz, ctx, difficulty, body.count, types, body.topic.strip(), adapted)
    except ValueError as e:
        raise HTTPException(422, str(e))
    qs = gen["questions"]
    with db() as c:
        cur = c.execute(
            "INSERT INTO quizzes (document_id, difficulty, topic, questions, total) VALUES (?,?,?,?,?)",
            (doc_id, difficulty, body.topic.strip() or None, json.dumps(qs), len(qs)),
        )
        qid = cur.lastrowid

    warning = None
    if len(qs) < gen["requested"]:
        warning = f"Only {len(qs)} of {gen['requested']} questions could be verified against your notes."
    return {
        "id": qid, "total": len(qs), "questions": [_public_question(q) for q in qs], "answered": {},
        "warning": warning, "difficulty": difficulty, "adapted": adapted,
    }


@app.get("/api/quizzes")
def list_quizzes(document_id: Optional[int] = None, user_id: int = Depends(uid)):
    sql = "SELECT z.*, d.filename FROM quizzes z JOIN documents d ON d.id=z.document_id WHERE d.user_id=?"
    args = (user_id,)
    if document_id:
        sql += " AND z.document_id=?"
        args = (user_id, document_id)
    with db() as c:
        rows = c.execute(sql + " ORDER BY z.id DESC", args).fetchall()
    return [{**_quiz_row(r), "filename": r["filename"]} for r in rows]


def _load_quiz(quiz_id: int, user_id: int):
    with db() as c:
        r = c.execute(
            "SELECT z.*, d.filename FROM quizzes z JOIN documents d ON d.id=z.document_id WHERE z.id=? AND d.user_id=?",
            (quiz_id, user_id),
        ).fetchone()
    if not r:
        raise HTTPException(404, "Quiz not found.")
    return r


@app.get("/api/quizzes/{quiz_id}")
def get_quiz(quiz_id: int, user_id: int = Depends(uid)):
    r = _load_quiz(quiz_id, user_id)
    qs, answers = json.loads(r["questions"]), json.loads(r["answers"])
    base = {**_quiz_row(r), "filename": r["filename"]}
    if r["status"] == "completed":
        return {**base, "questions": qs, "answers": answers, "feedback": json.loads(r["feedback"] or "null")}
    return {**base, "questions": [_public_question(q) for q in qs], "answered": answers}


class AnswerIn(BaseModel):
    question_id: int
    response: str = Field(default="", max_length=2000)


@app.post("/api/quizzes/{quiz_id}/answer")
def answer(quiz_id: int, body: AnswerIn, user_id: int = Depends(uid)):
    r = _load_quiz(quiz_id, user_id)
    if r["status"] == "completed":
        raise HTTPException(409, "This quiz is already finished.")
    qs, answers = json.loads(r["questions"]), json.loads(r["answers"])
    q = next((x for x in qs if x["id"] == body.question_id), None)
    if not q:
        raise HTTPException(404, "Question not found.")
    if str(q["id"]) in answers:
        return answers[str(q["id"])]
    ctx = _ctx_or_404(r["document_id"], user_id)
    g = _llm_guard(study.grade_answer, ctx, q, body.response)
    result = {
        "response": body.response.strip(), "points": g["points"], "correct": g["correct"], "grader_feedback": g["feedback"],
        "correct_answer": q["answer"], "explanation": q["explanation"], "evidence": q["evidence"],
    }
    answers[str(q["id"])] = result
    with db() as c:
        c.execute("UPDATE quizzes SET answers=? WHERE id=?", (json.dumps(answers), quiz_id))
    return result


class HintIn(BaseModel):
    question_id: int


@app.post("/api/quizzes/{quiz_id}/hint")
def hint(quiz_id: int, body: HintIn, user_id: int = Depends(uid)):
    r = _load_quiz(quiz_id, user_id)
    if r["status"] == "completed":
        raise HTTPException(409, "This quiz is already finished.")
    q = next((x for x in json.loads(r["questions"]) if x["id"] == body.question_id), None)
    if not q:
        raise HTTPException(404, "Question not found.")
    ctx = _ctx_or_404(r["document_id"], user_id)
    return {"hint": _llm_guard(study.give_hint, ctx, q)}


@app.post("/api/quizzes/{quiz_id}/finish")
def finish(quiz_id: int, user_id: int = Depends(uid)):
    r = _load_quiz(quiz_id, user_id)
    qs, answers = json.loads(r["questions"]), json.loads(r["answers"])
    if r["status"] == "completed":
        return {"score": r["score"], "total": r["total"], "feedback": json.loads(r["feedback"] or "null")}
    if len(answers) < len(qs):
        raise HTTPException(400, "Answer every question before finishing.")
    score = sum(a["points"] for a in answers.values())
    ctx = _ctx_or_404(r["document_id"], user_id)
    feedback = _llm_guard(study.build_feedback, ctx, qs, answers)
    with db() as c:
        c.execute(
            "UPDATE quizzes SET status='completed', score=?, feedback=?, completed_at=? WHERE id=?",
            (score, json.dumps(feedback), _now(), quiz_id),
        )
    return {"score": score, "total": len(qs), "feedback": feedback}


@app.delete("/api/quizzes/{quiz_id}")
def delete_quiz(quiz_id: int, user_id: int = Depends(uid)):
    with db() as c:
        c.execute(
            "DELETE FROM quizzes WHERE id=? AND document_id IN (SELECT id FROM documents WHERE user_id=?)",
            (quiz_id, user_id),
        )
    return {"deleted": quiz_id}


# --------------------------------------------------------------------------- progress


@app.get("/api/progress")
def progress(user_id: int = Depends(uid)):
    with db() as c:
        n_docs = c.execute("SELECT COUNT(*) FROM documents WHERE user_id=?", (user_id,)).fetchone()[0]
        n_q = c.execute(
            "SELECT COUNT(*) FROM messages m JOIN documents d ON d.id=m.document_id WHERE m.role='user' AND d.user_id=?",
            (user_id,),
        ).fetchone()[0]
        rows = c.execute(
            "SELECT z.*, d.filename FROM quizzes z JOIN documents d ON d.id=z.document_id "
            "WHERE z.status='completed' AND d.user_id=? ORDER BY z.id",
            (user_id,),
        ).fetchall()
    weak, trend = Counter(), []
    for r in rows:
        qs, answers = json.loads(r["questions"]), json.loads(r["answers"])
        for q in qs:
            if answers.get(str(q["id"]), {}).get("points", 1) < 1:
                weak[q["concept"]] += 1
        trend.append({"id": r["id"], "filename": r["filename"], "pct": round(100 * r["score"] / r["total"]), "date": r["completed_at"]})
    avg = round(sum(t["pct"] for t in trend) / len(trend)) if trend else None
    return {
        "documents": n_docs, "questions_asked": n_q, "quizzes_completed": len(trend), "average_pct": avg,
        "trend": trend[-12:], "weak_concepts": [{"concept": k, "misses": v} for k, v in weak.most_common(8)],
    }


# --------------------------------------------------------------------------- feedback


class FeedbackIn(BaseModel):
    kind: str
    rating: int
    comment: str = Field(default="", max_length=1000)
    message_id: Optional[int] = None


@app.post("/api/feedback")
def submit_feedback(body: FeedbackIn, user_id: int = Depends(uid)):
    comment = body.comment.strip()
    if body.kind == "answer":
        if body.rating not in (1, -1) or body.message_id is None:
            raise HTTPException(422, "Invalid feedback.")
        with db() as c:
            m = c.execute(
                "SELECT m.id, m.document_id FROM messages m JOIN documents d ON d.id=m.document_id "
                "WHERE m.id=? AND m.role='assistant' AND d.user_id=?",
                (body.message_id, user_id),
            ).fetchone()
            if not m:
                raise HTTPException(404, "That answer no longer exists.")
            c.execute("DELETE FROM feedback WHERE message_id=?", (body.message_id,))  # one vote per answer; re-voting replaces it
            c.execute(
                "INSERT INTO feedback (kind, rating, comment, message_id, document_id, user_id) VALUES ('answer',?,?,?,?,?)",
                (body.rating, comment, m["id"], m["document_id"], user_id),
            )
    elif body.kind == "general":
        if not 1 <= body.rating <= 5:
            raise HTTPException(422, "Choose a rating from 1 to 5.")
        if len(comment) < 5:
            raise HTTPException(422, "Please write a few words about your experience.")
        with db() as c:
            c.execute("INSERT INTO feedback (kind, rating, comment, user_id) VALUES ('general',?,?,?)", (body.rating, comment, user_id))
    else:
        raise HTTPException(422, "Invalid feedback type.")
    return {"saved": True}


@app.get("/api/feedback")
def list_feedback(user_id: int = Depends(uid)):
    with db() as c:
        rows = c.execute(
            """SELECT f.id, f.kind, f.rating, f.comment, f.created_at, d.filename,
                      substr(m.content, 1, 160) AS answer_snippet
               FROM feedback f
               LEFT JOIN documents d ON d.id=f.document_id
               LEFT JOIN messages m ON m.id=f.message_id
               WHERE f.user_id=?
               ORDER BY f.id DESC LIMIT 100""",
            (user_id,),
        ).fetchall()
        s = c.execute(
            """SELECT
                 SUM(kind='answer' AND rating=1) AS helpful,
                 SUM(kind='answer' AND rating=-1) AS not_helpful,
                 SUM(kind='general') AS general_count,
                 AVG(CASE WHEN kind='general' THEN rating END) AS avg_rating
               FROM feedback WHERE user_id=?""",
            (user_id,),
        ).fetchone()
    return {
        "summary": {
            "helpful": s["helpful"] or 0,
            "not_helpful": s["not_helpful"] or 0,
            "general_count": s["general_count"] or 0,
            "avg_rating": round(s["avg_rating"], 1) if s["avg_rating"] is not None else None,
        },
        "items": [dict(r) for r in rows],
    }


# --------------------------------------------------------------------------- auth + profile pages


def avatar_url(user):
    return f"/static/avatars/{user['avatar']}" if user and user["avatar"] else None


def flash(request: Request, message: str, kind: str = "ok"):
    request.session.setdefault("flash", []).append({"message": message, "kind": kind})


def page(request: Request, name: str, status_code: int = 200, **extra):
    """Renders a template with the data every page needs."""
    user = current_user(request)
    context = {
        "user": user,
        "avatar_url": avatar_url(user),
        "initials": auth.initials(user["full_name"]) if user else "",
        "csrf": auth.csrf_token(request.session),
        "flash": request.session.pop("flash", []),
        "errors": {},
        "values": {},
        **extra,
    }
    resp = templates.TemplateResponse(request, name, context, status_code=status_code)
    resp.headers["Cache-Control"] = "no-store"  # back button must not show private pages after logout
    return resp


def login_user(request: Request, user_id: int):
    request.session.clear()  # brand-new session at login (prevents session fixation)
    request.session["uid"] = user_id
    auth.csrf_token(request.session)
    request.state.user = auth.get_user(user_id)


def to(url: str):
    return RedirectResponse(url, status_code=303)


@app.get("/signup")
def signup_page(request: Request):
    if current_user(request):
        return to("/")
    return page(request, "signup.html")


@app.post("/signup")
async def signup_submit(
    request: Request,
    full_name: str = Form(""),
    email: str = Form(""),
    password: str = Form(""),
    confirm: str = Form(""),
    csrf: str = Form(""),
):
    if not auth.csrf_ok(request.session, csrf):
        flash(request, "Your page expired. Please try again.", "error")
        return to("/signup")
    cleaned, errors = auth.validate_signup(full_name, email, password, confirm)
    if not errors:
        try:
            user_id = auth.create_user(cleaned["full_name"], cleaned["email"], password)
        except ValueError as e:
            errors["email"] = str(e)
    if errors:
        return page(request, "signup.html", 400, errors=errors, values=cleaned)
    login_user(request, user_id)
    flash(request, "Welcome to Meeko! Add your college and course to complete your profile.")
    return to("/profile")


@app.get("/login")
def login_page(request: Request):
    if current_user(request):
        return to("/")
    return page(request, "login.html")


@app.post("/login")
async def login_submit(
    request: Request,
    email: str = Form(""),
    password: str = Form(""),
    csrf: str = Form(""),
):
    if not auth.csrf_ok(request.session, csrf):
        flash(request, "Your page expired. Please try again.", "error")
        return to("/login")
    ip = request.client.host if request.client else "unknown"
    wait = auth.locked_for(email, ip)
    if wait:
        msg = f"Too many failed attempts. Try again in about {wait // 60 + 1} minute(s)."
        return page(request, "login.html", 429, errors={"form": msg}, values={"email": email.strip()})
    user = auth.authenticate(email, password)
    if not user:
        auth.record_failure(email, ip)
        # same message for unknown email and wrong password, so attackers can't tell which emails exist
        return page(request, "login.html", 401, errors={"form": "Invalid email or password."}, values={"email": email.strip()})
    auth.clear_failures(email, ip)
    login_user(request, user["id"])
    return to("/")


@app.post("/logout")
async def logout(request: Request):
    token = request.headers.get("x-csrf-token") or (await request.form()).get("csrf")
    if auth.csrf_ok(request.session, token):
        request.session.clear()
    return to("/login")


@app.get("/profile")
def profile_page(request: Request):
    if not current_user(request):
        return to("/login")
    return page(request, "profile.html")


@app.get("/profile/edit")
def profile_edit_page(request: Request):
    user = current_user(request)
    if not user:
        return to("/login")
    values = {k: user[k] for k in ("full_name", "college", "course", "bio")}
    return page(request, "profile_edit.html", values=values)


@app.post("/profile/edit")
async def profile_edit_submit(
    request: Request,
    full_name: str = Form(""),
    college: str = Form(""),
    course: str = Form(""),
    bio: str = Form(""),
    csrf: str = Form(""),
    avatar: Optional[UploadFile] = File(None),
):
    user = current_user(request)
    if not user:
        return to("/login")
    if not auth.csrf_ok(request.session, csrf):
        flash(request, "Your page expired. Please try again.", "error")
        return to("/profile/edit")

    # Only the logged-in user's own row is ever changed: the id comes from the session, never from the form/URL.
    values, errors = auth.validate_profile(full_name, college, course, bio)
    new_avatar = None
    if not errors and avatar is not None and avatar.filename:
        data = await avatar.read(config.MAX_AVATAR_MB * 1024 * 1024 + 1)
        try:
            new_avatar = auth.save_avatar(data, avatar.filename)
        except auth.AvatarError as e:
            errors["avatar"] = str(e)
    if errors:
        return page(request, "profile_edit.html", 400, errors=errors, values=values)

    auth.update_profile(user["id"], values, avatar=new_avatar)  # new_avatar=None keeps the old picture
    if new_avatar:
        auth.delete_avatar(user["avatar"])
    flash(request, "Profile updated successfully.")
    return to("/profile")


@app.get("/api/me")
def me(request: Request):
    user = current_user(request)
    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "avatar_url": avatar_url(user),
        "initials": auth.initials(user["full_name"]),
        "csrf": auth.csrf_token(request.session),
    }


# --------------------------------------------------------------------------- frontend


@app.get("/")
def index(request: Request):
    if not current_user(request):
        return to("/login")
    return FileResponse(os.path.join(STATIC, "index.html"), headers={"Cache-Control": "no-store"})


@app.get("/static/index.html", include_in_schema=False)
def _no_direct_index():
    return to("/")  # the app page must only be reached through "/", which checks the login


app.mount("/static", StaticFiles(directory=STATIC), name="static")