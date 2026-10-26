/* Marginalia – vanilla JS front end. All user/document text is rendered via textContent (never innerHTML). */
"use strict";
const SAMPLE_NOTES = `Photosynthesis is the process by which green plants, algae and some bacteria use light energy to make food. It takes place mainly in the chloroplasts, which contain the green pigment chlorophyll. Chlorophyll absorbs light, mostly red and blue wavelengths, and reflects green light, which is why plants look green. The process has two main stages. In the light-dependent reactions, which happen in the thylakoid membranes, light energy splits water molecules, releases oxygen as a by-product and produces ATP and NADPH. In the Calvin cycle, which takes place in the stroma, the plant uses ATP and NADPH to fix carbon dioxide into glucose. The overall equation is: 6CO2 + 6H2O + light energy gives C6H12O6 + 6O2. Factors that affect the rate of photosynthesis include light intensity, carbon dioxide concentration and temperature.`;

// ------------------------------------------------------------------ utils
const $ = (s, r = document) => r.querySelector(s);
const PROPS = new Set(["value", "checked", "disabled", "selected", "open"]);

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return e;
}

const ICONS = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  upload: "M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  quiz: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  trash: "M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.3-4.3",
  menu: "M3 6h18M3 12h18M3 18h18",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  alert: "M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M20 6L9 17l-5-5",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  chev: "M6 9l6 6 6-6",
  up: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
  down: "M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3zm7-13h2.7A2.3 2.3 0 0 1 22 4v7a2.3 2.3 0 0 1-2.3 2H17",
  msg: "M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 1-2z",
  bot: "M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14h2M20 14h2M15 13v2M9 13v2",
  clip: "M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
};
function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "ic");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONS[name]);
  s.append(p);
  return s;
}

async function api(path, opts = {}) {
  const o = { ...opts, headers: { ...(opts.headers || {}), "X-Requested-With": "fetch" } };
  if (o.json !== undefined) {
    o.body = JSON.stringify(o.json);
    o.headers["Content-Type"] = "application/json";
    o.method = o.method || "POST";
    delete o.json;
  }
  let r;
  try {
    r = await fetch("/api" + path, o);
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("This is taking too long. Try fewer questions or a shorter topic.");
    throw new Error("Can't reach the server. Check that it is running and try again.");
  }
  if (r.status === 401) {
    location.href = "/login"; // session ended: go back to the login page
    throw new Error("Please log in to continue.");
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const d = data && data.detail;
    let msg;
    if (typeof d === "string") msg = d;
    else if (Array.isArray(d)) msg = d.map((x) => `${(x.loc || []).slice(-1)[0] ?? "input"}: ${x.msg}`).join("; ");
    else msg = `Server error (${r.status}). Check the terminal running the app for details.`;
    throw new Error(msg);
  }
  return data;
}

function toast(msg, type = "ok") {
  const t = h("div", { class: "toast " + (type === "error" ? "error" : ""), role: type === "error" ? "alert" : "status" }, icon(type === "error" ? "alert" : "check"), h("span", {}, msg));
  $("#toasts").append(t);
  setTimeout(() => t.remove(), type === "error" ? 7000 : 3500);
}

const fmtDate = (s) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const pct = (score, total) => (total ? Math.round((100 * score) / total) : 0);
const pillClass = (p) => (p >= 75 ? "" : p >= 50 ? "mid" : "low");
const loading = (msg) => h("div", { class: "loading", role: "status" }, h("span", { class: "spinner" }), h("span", {}, msg));
const errorBox = (msg) => h("div", { class: "alert", role: "alert" }, icon("alert"), h("span", {}, msg));
const emptyState = (title, text, ...actions) => h("div", { class: "empty" }, h("h3", {}, title), h("p", {}, text), ...actions);

function renderText(text) {
  const box = h("div");
  let list = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-•*]\s+(.*)/);
    if (m) {
      if (!list) { list = h("ul"); box.append(list); }
      list.append(h("li", {}, m[1]));
    } else if (line.trim()) {
      list = null;
      box.append(h("p", {}, line));
    } else list = null;
  }
  return box;
}

// ------------------------------------------------------------------ state
const S = {
  docs: [],
  docId: Number(localStorage.getItem("docId")) || null,
  health: { gemini_configured: true, max_upload_mb: 15 },
  studyTab: "chat",
  focus: null,
  quiz: null,
  route: "dashboard",
  me: null,
};
const curDoc = () => S.docs.find((d) => d.id === S.docId) || null;
function setDoc(id) {
  S.docId = id;
  id ? localStorage.setItem("docId", id) : localStorage.removeItem("docId");
}

const ROUTES = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "meeko", label: "MeekoMateAI", icon: "bot" },
  { id: "upload", label: "Upload notes", icon: "upload" },
  { id: "study", label: "Ask your notes", icon: "chat" },
  { id: "quiz", label: "Practice quiz", icon: "quiz" },
  { id: "progress", label: "Progress & history", icon: "chart" },
  { id: "feedback", label: "Feedback", icon: "msg" },
];

// ------------------------------------------------------------------ shell
function avatarNode(me) {
  return me.avatar_url
    ? h("img", { class: "avatar sm", src: me.avatar_url, alt: "" })
    : h("span", { class: "avatar sm initials", "aria-hidden": "true" }, me.initials);
}

async function logout() {
  try {
    await fetch("/logout", { method: "POST", headers: { "X-CSRF-Token": S.me.csrf, "X-Requested-With": "fetch" } });
  } catch { /* we leave the page either way */ }
  location.href = "/login";
}

function renderShell() {
  const nav = $("#nav");
  nav.replaceChildren(
    ...ROUTES.map((r) =>
      h("a", { class: "nav-link", href: "#" + r.id, "aria-current": r.id === S.route ? "page" : null }, icon(r.icon), r.label)
    ),
    h("a", { class: "nav-link", href: "/profile" }, icon("user"), "Profile")
  );
  const sel = $("#docSelect");
  sel.replaceChildren(
    ...(S.docs.length ? S.docs.map((d) => h("option", { value: d.id, selected: d.id === S.docId }, d.filename)) : [h("option", { value: "" }, "No documents yet")])
  );
  sel.disabled = !S.docs.length;
  const ok = S.health.gemini_configured;
  $("#status").replaceChildren(h("span", { class: "dot" + (ok ? "" : " off") }), h("span", { class: "txt" }, ok ? "AI connected" : "API key missing"));

  const me = S.me;
  if (me) {
    $("#sideUser").replaceChildren(
      h("a", { class: "user-chip", href: "/profile", "aria-label": "Open my profile" },
        avatarNode(me),
        h("span", { class: "user-chip-text" }, h("strong", {}, me.full_name), h("small", {}, me.email))),
      h("button", { class: "nav-link", type: "button", onclick: logout }, icon("logout"), "Log out")
    );
    $("#topUser").replaceChildren(avatarNode(me), h("span", { class: "topbar-name" }, me.full_name.split(" ")[0]));
  }
}

async function refreshDocs() {
  S.docs = await api("/documents");
  if (!S.docs.find((d) => d.id === S.docId)) setDoc(S.docs[0] ? S.docs[0].id : null);
  renderShell();
}

function closeMenu() {
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("show");
}

async function render() {
  S.route = (location.hash || "#dashboard").slice(1);
  if (!ROUTES.find((r) => r.id === S.route)) S.route = "dashboard";
  renderShell();
  closeMenu();
  const view = $("#view");
  view.replaceChildren(loading("Loading…"));
  try {
    await { dashboard: viewDashboard, upload: viewUpload, study: viewStudy, quiz: viewQuiz, progress: viewProgress, feedback: viewFeedback, meeko: viewMeeko }[S.route](view);
  } catch (e) {
    view.replaceChildren(errorBox(e.message));
  }
}

function go(route) {
  if (location.hash === "#" + route) render();
  else location.hash = route;
}

// ------------------------------------------------------------------ evidence slip
function slip(ev, docId) {
  return h(
    "figure",
    { class: "slip" },
    h("blockquote", {}, "“" + ev.quote + "”"),
    h(
      "figcaption",
      {},
      h("span", { class: "src" }, ev.source + (ev.page ? " · page " + ev.page : "")),
      h("button", { class: "link", onclick: () => openSource(docId, ev) }, "Open in notes")
    )
  );
}

function openSource(docId, ev) {
  setDoc(docId);
  S.focus = { page: ev.page, start: ev.start, end: ev.end };
  S.studyTab = "notes";
  go("study");
}

function greeting() {
  const first = S.me ? S.me.full_name.split(" ")[0] : "";
  const hello = window.marginaliaGreeting ? window.marginaliaGreeting() : "Hello";
  return hello + (first ? ", " + first : "");
}

// ------------------------------------------------------------------ dashboard
async function viewDashboard(root) {
  await refreshDocs();
  const [prog, quizzes] = await Promise.all([api("/progress"), api("/quizzes")]);
  let query = "";

  const list = h("div");
  const drawDocs = async () => {
    const docs = query ? await api("/documents?q=" + encodeURIComponent(query)) : S.docs;
    if (!docs.length) {
      list.replaceChildren(
        query
          ? emptyState("No matches", `No documents match “${query}”.`)
          : emptyState("Your desk is empty", "Upload a PDF, a photo of handwritten notes, or paste text to start studying.", h("button", { class: "btn", onclick: () => go("upload") }, icon("upload"), "Upload notes"))
      );
      return;
    }
    list.replaceChildren(
      h(
        "div",
        { class: "rows" },
        docs.map((d) =>
          h(
            "div",
            { class: "row" + (d.id === S.docId ? " active" : "") },
            h(
              "div",
              { class: "row-main" },
              h("div", { class: "row-title" }, d.filename),
              h("div", { class: "row-meta" },
                h("span", {}, { pdf: "PDF", text: "Text", image: "Image (OCR)", pasted: "Pasted" }[d.kind] || d.kind),
                h("span", {}, d.page_count + (d.page_count === 1 ? " section" : " pages")),
                h("span", {}, "Added " + fmtDate(d.created_at)),
                h("span", {}, d.question_count + " questions asked"),
                d.quiz_count ? h("span", {}, d.quiz_count + " quizzes") : null)
            ),
            d.avg_pct != null ? h("span", { class: "score-pill " + pillClass(d.avg_pct) }, Math.round(d.avg_pct) + "% avg") : null,
            h(
              "div",
              { class: "row-actions" },
              h("button", { class: "btn sm", onclick: () => { setDoc(d.id); go("study"); } }, icon("chat"), "Study"),
              h("button", { class: "btn sm secondary", onclick: () => { setDoc(d.id); go("quiz"); } }, icon("quiz"), "Quiz"),
              h("button", { class: "btn sm danger", "aria-label": "Delete " + d.filename, onclick: () => removeDoc(d, drawDocs) }, icon("trash"))
            )
          )
        )
      )
    );
  };

  const recent = quizzes.slice(0, 5);
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, greeting()), h("p", {}, "Everything here comes from your own notes. Answers always show where in them they were found."))),
    h("div", { class: "stats" },
      stat(prog.documents, "documents"),
      stat(prog.questions_asked, "questions asked"),
      stat(prog.quizzes_completed, "quizzes finished"),
      stat(prog.average_pct == null ? "–" : prog.average_pct + "%", "average score")),
    h("div", { class: "section-title" }, h("h2", {}, "Documents"),
      h("div", { class: "search" }, icon("search"), h("input", { type: "search", placeholder: "Search documents", "aria-label": "Search documents", oninput: (e) => { query = e.target.value.trim(); drawDocs().catch((x) => toast(x.message, "error")); } }))),
    list,
    h("div", { class: "section-title" }, h("h2", {}, "Recent study sessions")),
    recent.length ? quizRows(recent, () => render()) : emptyState("No quiz sessions yet", "Take a practice quiz to see your scores here.")
  );
  await drawDocs();
}

const stat = (n, label) => h("div", { class: "stat" }, h("b", {}, n), h("span", {}, label));

async function removeDoc(d, after) {
  if (!confirm(`Delete “${d.filename}”? Its chat and quiz history will be deleted too.`)) return;
  try {
    await api("/documents/" + d.id, { method: "DELETE" });
    toast("Deleted " + d.filename);
    if (S.quiz && S.quiz.document_id === d.id) S.quiz = null;
    await refreshDocs();
    after ? await after() : render();
  } catch (e) {
    toast(e.message, "error");
  }
}

function quizRows(quizzes, onChange) {
  return h(
    "div",
    { class: "rows" },
    quizzes.map((z) => {
      const done = z.status === "completed";
      const p = pct(z.score, z.total);
      return h(
        "div",
        { class: "row" },
        h("div", { class: "row-main" },
          h("div", { class: "row-title" }, z.filename),
          h("div", { class: "row-meta" }, h("span", {}, fmtDate(z.created_at)), h("span", {}, z.difficulty), h("span", {}, z.total + " questions"), z.topic ? h("span", {}, "Topic: " + z.topic) : null)),
        done ? h("span", { class: "score-pill " + pillClass(p) }, `${z.score}/${z.total} · ${p}%`) : h("span", { class: "tag" }, "In progress"),
        h("div", { class: "row-actions" },
          h("button", { class: "btn sm secondary", onclick: () => openQuiz(z.id) }, done ? "Review" : "Resume"),
          h("button", { class: "btn sm danger", "aria-label": "Delete quiz attempt", onclick: async () => {
            if (!confirm("Delete this quiz attempt?")) return;
            try { await api("/quizzes/" + z.id, { method: "DELETE" }); if (S.quiz && S.quiz.id === z.id) S.quiz = null; toast("Quiz deleted"); onChange(); } catch (e) { toast(e.message, "error"); }
          } }, icon("trash")))
      );
    })
  );
}

// ------------------------------------------------------------------ upload
const EXTS = [".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];

async function viewUpload(root) {
  const results = h("div", { "aria-live": "polite" });
  const dropLabel = h("label", { class: "drop" });
  const input = h("input", { type: "file", multiple: true, accept: EXTS.join(",") });
  const busy = h("div");

  async function send(files) {
    files = [...files];
    if (!files.length) return;
    const limit = S.health.max_upload_mb * 1024 * 1024;
    const ok = [], bad = [];
    for (const f of files) {
      const ext = "." + f.name.split(".").pop().toLowerCase();
      if (!EXTS.includes(ext)) bad.push({ filename: f.name, error: "Unsupported type. Use PDF, TXT, PNG, JPG or WEBP." });
      else if (f.size > limit) bad.push({ filename: f.name, error: `Larger than ${S.health.max_upload_mb} MB.` });
      else ok.push(f);
    }
    results.replaceChildren(...bad.map(resultNode));
    if (!ok.length) return;
    busy.replaceChildren(loading("Reading your notes… scanned pages and photos take a little longer."));
    const fd = new FormData();
    ok.forEach((f) => fd.append("files", f));
    try {
      const data = await api("/documents/upload", { method: "POST", body: fd });
      results.replaceChildren(...bad.map(resultNode), ...data.results.map(resultNode));
      const added = data.results.filter((r) => r.document);
      if (added.length) { setDoc(added[0].document.id); toast(`${added.length} file${added.length > 1 ? "s" : ""} added`); }
      await refreshDocs();
    } catch (e) {
      results.append(errorBox(e.message));
    } finally {
      busy.replaceChildren();
      input.value = "";
    }
  }

  function resultNode(r) {
    if (r.error) return h("div", { class: "result err", role: "alert" }, icon("alert"), h("div", { class: "grow" }, h("strong", {}, r.filename), h("div", {}, r.error)));
    const d = r.document;
    return h("div", { class: "result" }, icon("check"),
      h("div", { class: "grow" }, h("strong", {}, d.filename), h("div", { class: "small muted" }, `${d.char_count.toLocaleString()} characters · ${d.page_count} ${d.page_count === 1 ? "section" : "pages"}${d.notes ? " · " + d.notes : ""}`)),
      h("button", { class: "btn sm", onclick: () => { setDoc(d.id); S.studyTab = "notes"; go("study"); } }, "Check text"));
  }

  input.addEventListener("change", () => send(input.files));
  dropLabel.append(icon("upload"), h("strong", {}, "Drop your notes here"), h("span", { class: "muted" }, "or click to choose files"), h("span", { class: "hint" }, `PDF, TXT, PNG, JPG or WEBP · up to ${S.health.max_upload_mb} MB each`), input);
  ["dragenter", "dragover"].forEach((ev) => dropLabel.addEventListener(ev, (e) => { e.preventDefault(); dropLabel.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dropLabel.addEventListener(ev, (e) => { e.preventDefault(); dropLabel.classList.remove("over"); }));
  dropLabel.addEventListener("drop", (e) => send(e.dataTransfer.files));

  const title = h("input", { type: "text", id: "ptitle", placeholder: "e.g. Biology – cell respiration", maxlength: 120 });
  const text = h("textarea", { id: "ptext", placeholder: "Paste your notes here…" });
  const pasteBtn = h("button", { class: "btn", type: "button" }, "Add pasted notes");
  pasteBtn.addEventListener("click", async () => {
    pasteBtn.disabled = true;
    try {
      const d = await api("/documents/paste", { json: { title: title.value, text: text.value } });
      results.replaceChildren(resultNode({ document: d }));
      title.value = ""; text.value = "";
      setDoc(d.id);
      toast("Notes added");
      await refreshDocs();
    } catch (e) {
      results.replaceChildren(resultNode({ filename: "Pasted notes", error: e.message }));
    } finally { pasteBtn.disabled = false; }
  });

  const sampleBtn = h("button", { class: "btn", type: "button" }, icon("upload"), "Load sample notes (Photosynthesis)");
  sampleBtn.addEventListener("click", async () => {
    sampleBtn.disabled = true;
    try {
      const d = await api("/documents/paste", { json: { title: "Sample: Photosynthesis", text: SAMPLE_NOTES } });
      setDoc(d.id);
      toast("Sample notes loaded");
      await refreshDocs();
      go("study");
    } catch (e) { toast(e.message, "error"); }
    finally { sampleBtn.disabled = false; }
  });

  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Upload your notes"), h("p", {}, "Handwritten pages and scans are read with OCR. Always check the extracted text, since the AI can only be as accurate as what it reads."))),
    !S.health.gemini_configured ? h("div", { class: "alert info" }, icon("alert"), h("span", {}, "No Gemini API key is configured. Text files, text PDFs and pasted notes can be stored, but chat, quizzes and OCR need the key in your .env file.")) : null,
    h("div", { class: "upload-grid" },
      h("div", {}, dropLabel, busy, h("div", { style: "margin-top:12px" }, sampleBtn)),
      h("div", { class: "card" }, h("h2", { style: "margin-bottom:14px" }, "Or paste text"),
        h("div", { class: "field" }, h("label", { for: "ptitle" }, "Title"), title),
        h("div", { class: "field" }, h("label", { for: "ptext" }, "Notes"), text),
        pasteBtn)),
    results
  );
}

// ------------------------------------------------------------------ study (notes + chat)
async function viewStudy(root) {
  await refreshDocs();
  const doc = curDoc();
  if (!doc) {
    root.replaceChildren(emptyState("Nothing to study yet", "Upload or paste notes first, then ask questions about them.", h("button", { class: "btn", onclick: () => go("upload") }, icon("upload"), "Upload notes")));
    return;
  }
  const docId = doc.id;
  const [full, history] = await Promise.all([api("/documents/" + docId), api(`/documents/${docId}/chat`)]);

  const log = h("div", { class: "chat-log", "aria-live": "polite" });
  const chatBody = h("div", { class: "panel-body" }, log);
  const study = h("div", { class: "study", "data-tab": S.studyTab });

  const pageEls = new Map();
  const notesBody = h("div", { class: "panel-body" },
    full.document.notes ? h("div", { class: "alert info" }, icon("alert"), h("span", {}, full.document.notes)) : null,
    full.pages.map((p) => {
      const t = h("div", { class: "notes-text" }, p.text);
      const el = h("section", { class: "notes-page" }, p.page ? h("h3", {}, "Page " + p.page) : null, t);
      pageEls.set(p.page, { t, text: p.text });
      return el;
    })
  );

  const setTab = (t) => {
    S.studyTab = t;
    study.dataset.tab = t;
    segBtns.forEach(([id, b]) => b.setAttribute("aria-pressed", id === t));
  };
  const segBtns = [["notes", h("button", { onclick: () => setTab("notes") }, "Notes")], ["chat", h("button", { onclick: () => setTab("chat") }, "Ask")]];
  segBtns.forEach(([id, b]) => b.setAttribute("aria-pressed", id === S.studyTab));

  function botMsg(m) {
    const status = m.status || "answered";
    const n = h("div", { class: "msg bot " + status }, renderText(m.content));
    if (status === "partial" && m.missing) n.append(h("div", { class: "missing" }, h("strong", {}, "Not covered in your notes: "), m.missing));
    if (m.evidence && m.evidence.length) {
      const d = h("details", { class: "evidence" }, h("summary", {}, `View evidence (${m.evidence.length})`, icon("chev")));
      m.evidence.forEach((ev) => d.append(slip(ev, docId)));
      n.append(d);
    } else {
      n.append(h("div", { class: "small", style: "margin-top:8px" }, "No supporting evidence found in this document."));
    }
    if (m.id) n.append(feedbackRow(m));
    return n;
  }
  const draw = (m) => log.append(m.role === "user" ? h("div", { class: "msg user" }, m.content) : botMsg(m));
  const scroll = () => (chatBody.scrollTop = chatBody.scrollHeight);

  const input = h("textarea", { rows: 1, placeholder: "Ask something about these notes…", "aria-label": "Your question", maxlength: 1500 });
  const sendBtn = h("button", { class: "btn", "aria-label": "Send question" }, icon("send"));

  function ask(q) {
    q = q.trim();
    if (!q) return;
    input.value = "";
    draw({ role: "user", content: q });
    log.append(JOBS.thinking("Searching your notes…"));
    scroll();
    JOBS.start("chat", docId, "Your question in Ask your notes",
      (signal) => api(`/documents/${docId}/chat`, { json: { message: q }, signal }),
      {
        payload: q,
        isHere: () => S.route === "study" && S.docId === docId,
        onDone: () => render(),
        onError: (e) => { toast(e.message, "error"); render(); },
        open: () => { setDoc(docId); S.studyTab = "chat"; go("study"); },
        openLabel: "Open",
      });
  }
  sendBtn.addEventListener("click", () => ask(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });

  history.forEach(draw);
  if (!history.length) {
    log.append(h("div", { class: "msg bot" }, h("p", {}, "Ask me anything about these notes. I only answer from what is written in them, and I show the passage I used."),
      h("div", { class: "suggest" }, ["What are the main ideas in these notes?", "Which key terms are defined?"].map((s) => h("button", { class: "chip", onclick: () => ask(s) }, s)))));
  }

  const pendingChat = JOBS.running("chat", docId);
  if (pendingChat) log.append(h("div", { class: "msg user" }, pendingChat.payload), JOBS.thinking("Searching your notes…"));

  const clear = h("button", { class: "btn sm secondary", onclick: async () => {
    if (!confirm("Clear this conversation?")) return;
    try { await api(`/documents/${docId}/chat`, { method: "DELETE" }); toast("Conversation cleared"); render(); } catch (e) { toast(e.message, "error"); }
  } }, "Clear chat");

  study.append(
    h("section", { class: "panel notes-panel", "aria-label": "Extracted notes" },
      h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "Your notes"), h("div", { class: "small muted" }, `${doc.filename} · ${full.document.char_count.toLocaleString()} characters`))),
      notesBody),
    h("section", { class: "panel chat-panel", "aria-label": "Chat" },
      h("div", { class: "panel-head" }, h("h2", {}, "Ask your notes"), history.length ? clear : null),
      chatBody,
      h("div", { class: "composer" }, input, sendBtn))
  );
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, doc.filename), h("p", {}, "Check that the extracted text on the left matches your original, then ask questions on the right."))),
    h("div", { class: "seg", role: "group", "aria-label": "Switch panel" }, segBtns.map(([, b]) => b)),
    study
  );
  scroll();

  if (S.focus) {
    const f = S.focus;
    S.focus = null;
    const pg = pageEls.get(f.page) || pageEls.values().next().value;
    if (pg) {
      if (f.start != null && f.end != null) {
        pg.t.replaceChildren(pg.text.slice(0, f.start), h("mark", { class: "hl" }, pg.text.slice(f.start, f.end)), pg.text.slice(f.end));
        const mk = pg.t.querySelector("mark");
        requestAnimationFrame(() => mk.scrollIntoView({ block: "center" }));
      } else requestAnimationFrame(() => pg.t.scrollIntoView({ block: "start" }));
    }
  }
}

// ------------------------------------------------------------------ answer feedback
function feedbackRow(m) {
  const box = h("div", { class: "fb-row" });
  const send = async (rating, comment = "") => {
    try {
      await api("/feedback", { json: { kind: "answer", rating, comment, message_id: m.id } });
      show({ rating });
      toast("Thanks, your feedback was saved");
    } catch (e) { toast(e.message, "error"); }
  };
  function show(fb) {
    box.replaceChildren();
    if (fb) {
      box.append(h("span", { class: "small muted" }, fb.rating > 0 ? "Marked helpful. Thank you." : "Marked not helpful. Thank you."), h("button", { class: "link small", onclick: () => show(null) }, "Change"));
      return;
    }
    const up = h("button", { class: "btn sm secondary", "aria-label": "This answer was helpful" }, icon("up"), "Helpful");
    const down = h("button", { class: "btn sm secondary", "aria-label": "This answer was not helpful" }, icon("down"), "Not helpful");
    up.addEventListener("click", () => send(1));
    down.addEventListener("click", () => {
      const inp = h("input", { type: "text", placeholder: "What was wrong? (optional)", maxlength: 500, "aria-label": "What was wrong with this answer?" });
      const go1 = h("button", { class: "btn sm" }, "Send");
      go1.addEventListener("click", () => send(-1, inp.value));
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") send(-1, inp.value); });
      box.replaceChildren(inp, go1);
      inp.focus();
    });
    box.append(h("span", { class: "small muted" }, "Was this answer helpful?"), up, down);
  }
  show(m.feedback || null);
  return box;
}

// ------------------------------------------------------------------ quiz
function feedbackNode(fb, docId) {
  if (!fb) return null;
  if (fb.perfect) return h("div", { class: "card" }, h("h2", {}, "Perfect score"), h("p", { class: "muted" }, "Nothing to revise from this quiz. Try a harder level or another topic."));
  const sec = (title, body) => h("div", { style: "margin-top:18px" }, h("h3", {}, title), body);
  return h("div", { class: "card" },
    h("h2", {}, "What to work on"),
    fb.weak_concepts.length ? sec("Concepts to revisit", h("div", { class: "suggest" }, fb.weak_concepts.map((c) => h("span", { class: "tag teal" }, c)))) : null,
    fb.mistakes.length ? sec("Where it went wrong", h("ul", { class: "fb-list" }, fb.mistakes.map((m) => h("li", {}, h("strong", {}, m.question), h("div", {}, m.explanation))))) : null,
    fb.revision_plan.length ? sec("Revision plan", h("ol", { class: "fb-list" }, fb.revision_plan.map((s) => h("li", {}, s)))) : null,
    fb.sections.length ? sec("Sections to revise", h("div", {}, fb.sections.map((s) => h("figure", { class: "slip" },
      h("blockquote", {}, "“" + s.quote + "”"),
      h("figcaption", {}, h("span", { class: "src" }, `${s.concept}${s.page ? " · page " + s.page : ""}`), h("button", { class: "link", onclick: () => openSource(docId, s) }, "Open in notes")))))) : null,
    fb.further_practice ? sec("Further practice", h("p", {}, fb.further_practice)) : null
  );
}

async function openQuiz(id) {
  const z = await api("/quizzes/" + id).catch((e) => { toast(e.message, "error"); return null; });
  if (!z) return;
  setDoc(z.document_id);
  S.quiz = { id: z.id, document_id: z.document_id, filename: z.filename, questions: z.questions, answered: z.status === "completed" ? z.answers : z.answered, status: z.status, result: null, feedback: z.feedback, score: z.score, idx: 0, warning: null };
  if (z.status === "active") S.quiz.idx = Math.max(0, z.questions.findIndex((q) => !S.quiz.answered[q.id]));
  go("quiz");
}

function quizState(doc, q) {
  return { id: q.id, document_id: doc.id, filename: doc.filename, questions: q.questions, answered: {}, status: "active", result: null, idx: 0, warning: q.warning };
}

async function viewQuiz(root) {
  await refreshDocs();
  const doc = curDoc();
  const busy = doc ? JOBS.running("quiz", doc.id) : null;
  if (busy) {
    const cancel = h("button", { class: "btn secondary", type: "button" }, "Cancel");
    cancel.addEventListener("click", () => {
      JOBS.cancel(busy);
      render();
    });
    root.replaceChildren(
      h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Practice quiz"), h("p", {}, "Writing questions from “" + doc.filename + "”…"))),
      h("div", { class: "card quiz-wrap" },
        loading("Writing questions from your notes. This can take up to a few minutes."),
        h("div", { style: "margin-top:16px" }, cancel))
    );
    return;
  }
  if (S.quiz) {
    if (S.quiz.status === "completed") return quizReview(root);
    if (S.quiz.result) return quizResult(root);
    return quizRun(root);
  }
  if (!doc) {
    root.replaceChildren(emptyState("No notes to quiz yet", "Upload or paste notes, then come back to generate practice questions.", h("button", { class: "btn", onclick: () => go("upload") }, icon("upload"), "Upload notes")));
    return;
  }
  const radio = (name, val, label, checked) => h("label", {}, h("input", { type: "radio", name, value: val, checked }), h("span", {}, label));
  const count = h("input", { type: "range", min: 3, max: 15, value: 5, id: "qcount", "aria-describedby": "qcountv" });
  const countV = h("output", { id: "qcountv" }, "5");
  count.addEventListener("input", () => (countV.textContent = count.value));
  const topic = h("input", { type: "text", id: "qtopic", placeholder: "Leave empty to cover the whole document", maxlength: 120 });
  const typeBox = (v, label) => h("label", { class: "choice" }, h("input", { type: "checkbox", name: "qtype", value: v, checked: true }), label);
  const err = h("div");
  const btn = h("button", { class: "btn", type: "button" }, icon("quiz"), "Generate quiz");
  btn.addEventListener("click", () => {
    const types = [...root.querySelectorAll('input[name="qtype"]:checked')].map((i) => i.value);
    if (!types.length) return err.replaceChildren(errorBox("Choose at least one question type."));
    const difficulty = root.querySelector('input[name="diff"]:checked').value;
    const n = Number(count.value);
    const topicText = topic.value.trim();
    const job = JOBS.start("quiz", doc.id, "Quiz from " + doc.filename,
      (signal) => api(`/documents/${doc.id}/quiz`, { json: { difficulty, count: n, types, topic: topicText }, signal }),
      {
        dedupe: true,
        isHere: () => S.route === "quiz",
        onDone: (q) => {
          if (q.adapted) toast("Last score was under 50%, so this quiz is set to Easy with simpler explanations.");
          S.quiz = quizState(doc, q);
          render();
        },
        onError: (e) => { toast(e.message, "error"); render(); },
        open: (q) => { S.quiz = quizState(doc, q); go("quiz"); },
        openLabel: "Open quiz",
      });
    // Stop waiting after 5 minutes. The tray then shows the job as failed.
    setTimeout(() => { if (job.status === "running") job.controller.abort(); }, 300000);
    render();
  });
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Practice quiz"), h("p", {}, "Questions are written from “" + doc.filename + "” only. If the notes are too thin, you'll be told instead of getting filler."))),
    h("div", { class: "card quiz-wrap" },
      h("div", { class: "field" }, h("span", { class: "label" }, "Difficulty"), h("div", { class: "seg-radio", role: "radiogroup", "aria-label": "Difficulty" }, radio("diff", "easy", "Easy"), radio("diff", "medium", "Medium", true), radio("diff", "hard", "Hard"))),
      h("div", { class: "field" }, h("label", { for: "qcount" }, "Number of questions: ", countV), count),
      h("div", { class: "field" }, h("span", { class: "label" }, "Question types"), h("div", { class: "options-grid" }, typeBox("mcq", "Multiple choice"), typeBox("tf", "True / false"), typeBox("short", "Short answer"))),
      h("div", { class: "field" }, h("label", { for: "qtopic" }, "Topic (optional)"), topic),
      btn, err)
  );
}

function quizRun(root) {
  const Q = S.quiz;
  const q = Q.questions[Q.idx];
  const done = Q.answered[q.id];
  let sel = done ? done.response : "";
  const total = Q.questions.length;

  const check = h("button", { class: "btn", disabled: !done && !sel }, "Check answer");
  const hintBox = h("div", { "aria-live": "polite" });
  const hintBtn = h("button", { class: "btn", type: "button", disabled: !!done }, "💡 Need a Hint?");
  hintBtn.addEventListener("click", async () => {
    hintBtn.disabled = true;
    try {
      const r = await api(`/quizzes/${Q.id}/hint`, { json: { question_id: q.id } });
      hintBox.replaceChildren(h("p", { class: "muted", style: "margin-top:10px" }, "Hint: " + r.hint));
    } catch (e) {
      toast(e.message, "error");
      hintBtn.disabled = false;
    }
  });
  const fb = h("div", { "aria-live": "polite" });
  const optsWrap = h("div", { class: "options-grid", role: q.type === "short" ? null : "radiogroup", "aria-label": "Answer options" });

  function paint(res) {
    fb.replaceChildren();
    if (!res) return;
    const kind = res.points >= 1 ? "good" : res.points > 0 ? "mid" : "bad";
    fb.append(
      h("div", { class: "verdict " + kind }, icon(kind === "bad" ? "alert" : "check"), kind === "good" ? "Correct" : kind === "mid" ? "Partly correct" : "Not quite"),
      res.grader_feedback ? h("p", { style: "margin-top:10px" }, res.grader_feedback) : null,
      res.points < 1 ? h("p", { style: "margin-top:10px" }, h("strong", {}, "Correct answer: "), res.correct_answer) : null,
      h("p", { style: "margin-top:10px" }, res.explanation),
      slip(res.evidence, Q.document_id)
    );
    const last = Q.idx === total - 1;
    const next = h("button", { class: "btn navy", style: "margin-top:16px" }, last ? "Finish and see results" : "Next question");
    next.addEventListener("click", async () => {
      if (!last) { Q.idx++; return render(); }
      next.disabled = true;
      try { Q.result = await api(`/quizzes/${Q.id}/finish`, { method: "POST" }); if (S.route === "quiz") render(); else toast("Quiz finished. Open Practice quiz to see your results."); } catch (e) { toast(e.message, "error"); next.disabled = false; }
    });
    fb.append(next);
  }

  if (q.type === "short") {
    const ta = h("textarea", { rows: 4, "aria-label": "Your answer", placeholder: "Type your answer…", disabled: !!done, value: sel });
    ta.addEventListener("input", () => { sel = ta.value; check.disabled = !sel.trim(); });
    optsWrap.append(ta);
  } else {
    q.options.forEach((o) => {
      const correct = done && o === done.correct_answer, wrong = done && o === done.response && !done.correct;
      const inp = h("input", { type: "radio", name: "ans", value: o, checked: done ? o === done.response : false, disabled: !!done });
      inp.addEventListener("change", () => { sel = o; check.disabled = false; });
      optsWrap.append(h("label", { class: "choice" + (correct ? " right" : wrong ? " wrong" : "") }, inp, h("span", {}, o)));
    });
  }

  check.addEventListener("click", async () => {
    check.disabled = true;
    check.replaceChildren(h("span", { class: "spinner" }), "Checking…");
    root.querySelectorAll("input,textarea").forEach((i) => (i.disabled = true));
    try {
      const res = await api(`/quizzes/${Q.id}/answer`, { json: { question_id: q.id, response: sel } });
      Q.answered[q.id] = res;
      if (S.route === "quiz") render();
      else toast("Answer checked. Open Practice quiz to continue.");
    } catch (e) {
      toast(e.message, "error");
      check.disabled = false;
      check.replaceChildren("Check answer");
      root.querySelectorAll("input,textarea").forEach((i) => (i.disabled = false));
    }
  });

  root.replaceChildren(
    h("div", { class: "quiz-wrap" },
      h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Practice quiz"), h("p", {}, Q.filename))),
      Q.warning ? h("div", { class: "alert info" }, icon("alert"), h("span", {}, Q.warning)) : null,
      h("div", { class: "card" },
        h("div", { class: "row-meta" }, h("span", {}, `Question ${Q.idx + 1} of ${total}`), h("span", { class: "tag" }, { mcq: "Multiple choice", tf: "True / false", short: "Short answer" }[q.type])),
        h("div", { class: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": Q.idx + (done ? 1 : 0) }, h("i", { style: `width:${((Q.idx + (done ? 1 : 0)) / total) * 100}%` })),
        h("div", { class: "q-text" }, q.question),
        optsWrap,
        done ? null : h("div", { style: "margin-top:16px;display:flex;gap:10px;flex-wrap:wrap" }, hintBtn, check),
        hintBox,
        fb))
  );
  paint(done);
}

function quizResult(root) {
  const Q = S.quiz, r = Q.result, p = pct(r.score, r.total);
  root.replaceChildren(
    h("div", { class: "quiz-wrap" },
      h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Quiz complete"), h("p", {}, Q.filename))),
      h("div", { class: "card", style: "display:flex;gap:24px;align-items:center;flex-wrap:wrap" },
        h("div", { class: "score-big" }, `${r.score}/${r.total}`),
        h("div", {}, h("h2", {}, p >= 80 ? "Strong result" : p >= 50 ? "Good start" : "Worth another pass"), h("p", { class: "muted" }, `${p}% correct`)),
        h("div", { class: "row-actions", style: "margin-left:auto" },
          h("button", { class: "btn", onclick: () => { S.quiz = null; render(); } }, "New quiz"),
          h("button", { class: "btn secondary", onclick: () => openQuiz(Q.id) }, "Review answers"))),
      h("div", { style: "margin-top:18px" }, feedbackNode(r.feedback, Q.document_id)))
  );
}

function quizReview(root) {
  const Q = S.quiz;
  const p = pct(Q.score, Q.questions.length);
  root.replaceChildren(
    h("div", { class: "quiz-wrap" },
      h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Quiz review"), h("p", {}, Q.filename)), h("span", { class: "score-pill " + pillClass(p) }, `${Q.score}/${Q.questions.length} · ${p}%`)),
      h("div", { class: "card" },
        Q.questions.map((q, i) => {
          const a = Q.answered[q.id] || {};
          const kind = a.points >= 1 ? "good" : a.points > 0 ? "mid" : "bad";
          return h("div", { class: "review-q" },
            h("div", { class: "row-meta" }, h("span", {}, "Question " + (i + 1)), h("span", { class: "tag teal" }, q.concept)),
            h("div", { class: "q-text", style: "font-size:1.1rem" }, q.question),
            h("div", { class: "verdict " + kind }, icon(kind === "bad" ? "alert" : "check"), kind === "good" ? "Correct" : kind === "mid" ? "Partly correct" : "Incorrect"),
            h("p", { style: "margin-top:10px" }, h("strong", {}, "Your answer: "), a.response || "(blank)"),
            a.points < 1 ? h("p", {}, h("strong", {}, "Correct answer: "), q.answer) : null,
            h("p", {}, q.explanation),
            slip(q.evidence, Q.document_id));
        })),
      h("div", { style: "margin-top:18px" }, feedbackNode(Q.feedback, Q.document_id)),
      h("div", { style: "margin-top:18px" }, h("button", { class: "btn", onclick: () => { S.quiz = null; go("quiz"); } }, "Take a new quiz")))
  );
}

// ------------------------------------------------------------------ progress
async function viewProgress(root) {
  await refreshDocs();
  const [prog, quizzes] = await Promise.all([api("/progress"), api("/quizzes")]);
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Progress & history"), h("p", {}, "Track your scores and reopen any earlier attempt."))),
    h("div", { class: "stats" }, stat(prog.quizzes_completed, "quizzes finished"), stat(prog.average_pct == null ? "–" : prog.average_pct + "%", "average score"), stat(prog.questions_asked, "questions asked"), stat(prog.documents, "documents")),
    h("div", { class: "two-col section-title", style: "display:grid;margin-top:30px;align-items:stretch" },
      h("div", { class: "card" }, h("h2", { style: "margin-bottom:12px" }, "Recent scores"),
        prog.trend.length
          ? h("div", { class: "trend", role: "img", "aria-label": "Bar chart of recent quiz scores" }, prog.trend.map((t) => h("div", { class: "bar " + pillClass(t.pct), title: `${t.filename}: ${t.pct}%` }, h("span", {}, t.pct + "%"), h("i", { style: `height:${Math.max(t.pct, 2)}%` }))))
          : h("p", { class: "muted" }, "Finish a quiz to see your scores here.")),
      h("div", { class: "card" }, h("h2", { style: "margin-bottom:12px" }, "Concepts to revisit"),
        prog.weak_concepts.length
          ? h("ul", { class: "fb-list" }, prog.weak_concepts.map((w) => h("li", {}, w.concept, " ", h("span", { class: "tag" }, w.misses + (w.misses === 1 ? " miss" : " misses")))))
          : h("p", { class: "muted" }, "Nothing flagged yet."))),
    h("div", { class: "section-title" }, h("h2", {}, "Quiz history")),
    quizzes.length ? quizRows(quizzes, () => render()) : emptyState("No attempts yet", "Generate a practice quiz from one of your documents.", h("button", { class: "btn", onclick: () => go("quiz") }, "Start a quiz"))
  );
}

// ------------------------------------------------------------------ feedback page
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

async function viewFeedback(root) {
  await refreshDocs();
  const data = await api("/feedback");
  const sm = data.summary;
  const comment = h("textarea", { id: "fbtext", placeholder: "What worked? What was confusing or wrong?", maxlength: 1000 });
  const err = h("div");
  const btn = h("button", { class: "btn", type: "button" }, "Send feedback");
  btn.addEventListener("click", async () => {
    const picked = root.querySelector('input[name="fbrate"]:checked');
    if (!picked) return err.replaceChildren(errorBox("Choose a rating first."));
    btn.disabled = true;
    try {
      await api("/feedback", { json: { kind: "general", rating: Number(picked.value), comment: comment.value } });
      toast("Thank you for your feedback");
      render();
    } catch (e) {
      err.replaceChildren(errorBox(e.message));
      btn.disabled = false;
    }
  });
  const rate = (n) => h("label", {}, h("input", { type: "radio", name: "fbrate", value: n }), h("span", {}, n + " ★"));
  const items = data.items;
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Feedback"), h("p", {}, "Tell us how the study companion is working for you. You can also rate individual answers with Helpful / Not helpful in the chat."))),
    h("div", { class: "stats" }, stat(sm.general_count, "reviews"), stat(sm.avg_rating == null ? "–" : sm.avg_rating + " ★", "average rating"), stat(sm.helpful, "answers marked helpful"), stat(sm.not_helpful, "answers marked not helpful")),
    h("div", { class: "card quiz-wrap", style: "margin-top:24px" },
      h("h2", { style: "margin-bottom:14px" }, "Share your experience"),
      h("div", { class: "field" }, h("span", { class: "label" }, "Overall rating"), h("div", { class: "seg-radio", role: "radiogroup", "aria-label": "Rating from 1 to 5" }, [1, 2, 3, 4, 5].map(rate))),
      h("div", { class: "field" }, h("label", { for: "fbtext" }, "Comments"), comment),
      btn, err),
    h("div", { class: "section-title" }, h("h2", {}, "Feedback received")),
    items.length
      ? h("div", { class: "rows" }, items.map((f) =>
          h("div", { class: "row" },
            h("div", { class: "row-main" },
              h("div", { class: "row-title" }, f.kind === "general" ? h("span", { "aria-label": f.rating + " out of 5 stars" }, stars(f.rating)) : h("span", {}, f.rating > 0 ? "Answer marked helpful" : "Answer marked not helpful")),
              f.comment ? h("p", { style: "margin:4px 0 0" }, f.comment) : null,
              h("div", { class: "row-meta" }, h("span", {}, fmtDate(f.created_at)), f.filename ? h("span", {}, f.filename) : null, f.answer_snippet ? h("span", {}, "Answer: “" + f.answer_snippet + (f.answer_snippet.length >= 160 ? "…" : "") + "”") : null)),
            h("span", { class: "tag " + (f.kind === "general" ? "teal" : "") }, f.kind === "general" ? "General" : "Answer"))))
      : emptyState("No feedback yet", "Be the first to leave a rating above."),
  );
}

// ------------------------------------------------------------------ boot
$("#menuBtn").append(icon("menu"));
$("#menuBtn").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); });
$("#scrim").addEventListener("click", closeMenu);
$("#docSelect").addEventListener("change", (e) => {
  setDoc(Number(e.target.value) || null);
  S.quiz = null;
  if (S.route === "study" || S.route === "quiz") render();
  else renderShell();
});
window.addEventListener("hashchange", render);

(async function boot() {
  try { S.me = await api("/me"); } catch { /* api() already sent us to the login page */ }
  try { S.health = await api("/health"); } catch { S.health.gemini_configured = false; }
  try { await refreshDocs(); } catch { /* shown by render */ }
  render();
})();