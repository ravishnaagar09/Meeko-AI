"""Authentication helpers: validation, password hashing, user queries, avatars, CSRF, login throttling.
No web-framework code lives here, so every function is easy to test on its own."""
import io
import os
import re
import secrets
import time
import uuid
from typing import Dict, Optional, Tuple

from werkzeug.security import check_password_hash, generate_password_hash

from . import config
from .db import db

AVATAR_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# Checked even for unknown emails, so response time does not reveal which emails are registered.
_DUMMY_HASH = generate_password_hash("not-a-real-password")


# --------------------------------------------------------------------------- validation


def clean_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_signup(full_name: str, email: str, password: str, confirm: str) -> Tuple[Dict, Dict]:
    """Returns (cleaned_values, errors). errors is empty when everything is valid."""
    errors: Dict[str, str] = {}
    name = " ".join((full_name or "").split())
    email = clean_email(email)

    if not 2 <= len(name) <= 80:
        errors["full_name"] = "Enter your full name (2 to 80 characters)."
    if not EMAIL_RE.match(email) or len(email) > 254:
        errors["email"] = "Enter a valid email address."
    if len(password or "") < 8:
        errors["password"] = "Password must be at least 8 characters."
    elif len(password) > 128:
        errors["password"] = "Password is too long (max 128 characters)."
    elif not (re.search(r"[A-Za-z]", password) and re.search(r"\d", password)):
        errors["password"] = "Password must contain at least one letter and one number."
    if "password" not in errors and password != confirm:
        errors["confirm"] = "Passwords do not match."
    return {"full_name": name, "email": email}, errors


def validate_profile(full_name: str, college: str, course: str, bio: str) -> Tuple[Dict, Dict]:
    errors: Dict[str, str] = {}
    name = " ".join((full_name or "").split())
    college = " ".join((college or "").split())
    course = " ".join((course or "").split())
    bio = (bio or "").strip()
    if not 2 <= len(name) <= 80:
        errors["full_name"] = "Enter your full name (2 to 80 characters)."
    if len(college) > 100:
        errors["college"] = "College name can be at most 100 characters."
    if len(course) > 100:
        errors["course"] = "Course can be at most 100 characters."
    if len(bio) > 500:
        errors["bio"] = "Bio can be at most 500 characters."
    return {"full_name": name, "college": college, "course": course, "bio": bio}, errors


# --------------------------------------------------------------------------- users


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def get_user(user_id: Optional[int]):
    if not user_id:
        return None
    with db() as c:
        return c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()


def get_user_by_email(email: str):
    with db() as c:
        return c.execute("SELECT * FROM users WHERE email=?", (clean_email(email),)).fetchone()


def create_user(full_name: str, email: str, password: str) -> int:
    """Raises ValueError if the email is already registered."""
    import sqlite3

    try:
        with db() as c:
            cur = c.execute(
                "INSERT INTO users (full_name, email, password_hash) VALUES (?,?,?)",
                (full_name, clean_email(email), hash_password(password)),
            )
            user_id = cur.lastrowid
            # Notes saved before login existed belong to nobody yet: give them to the very first user.
            if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1:
                c.execute("UPDATE documents SET user_id=? WHERE user_id IS NULL", (user_id,))
                c.execute("UPDATE feedback SET user_id=? WHERE user_id IS NULL", (user_id,))
        return user_id
    except sqlite3.IntegrityError:
        raise ValueError("An account with this email already exists. Try logging in.")


def authenticate(email: str, password: str):
    """Returns the user row if email + password match, else None."""
    user = get_user_by_email(email)
    stored = user["password_hash"] if user else _DUMMY_HASH
    ok = check_password_hash(stored, password or "")
    return user if (user and ok) else None


def update_profile(user_id: int, values: Dict, avatar: Optional[str] = None):
    """Updates ONLY the row of `user_id`. `avatar=None` keeps the existing picture."""
    with db() as c:
        if avatar is None:
            c.execute(
                "UPDATE users SET full_name=?, college=?, course=?, bio=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (values["full_name"], values["college"], values["course"], values["bio"], user_id),
            )
        else:
            c.execute(
                "UPDATE users SET full_name=?, college=?, course=?, bio=?, avatar=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (values["full_name"], values["college"], values["course"], values["bio"], avatar, user_id),
            )


def initials(name: str) -> str:
    parts = (name or "?").split()
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()


# --------------------------------------------------------------------------- avatars


class AvatarError(Exception):
    pass


def save_avatar(data: bytes, filename: str) -> str:
    """Validates and stores a profile picture. Returns the stored file name.
    Checks: extension, size, and that the bytes really are an image (not just renamed).
    The image is re-encoded to a square JPEG, which also strips hidden metadata."""
    from PIL import Image, ImageOps

    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in config.ALLOWED_AVATAR_EXT:
        raise AvatarError("Profile picture must be a PNG, JPG or WEBP image.")
    if len(data) > config.MAX_AVATAR_MB * 1024 * 1024:
        raise AvatarError(f"Profile picture must be smaller than {config.MAX_AVATAR_MB} MB.")
    try:
        Image.open(io.BytesIO(data)).verify()  # detects fake / corrupted files
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise AvatarError("That file is not a valid image.")
    img = ImageOps.fit(img, (400, 400))
    name = uuid.uuid4().hex + ".jpg"
    img.save(os.path.join(AVATAR_DIR, name), format="JPEG", quality=88)
    return name


def delete_avatar(name: Optional[str]):
    """Removes an old picture. Only touches files directly inside the avatars folder."""
    if not name or name != os.path.basename(name):
        return
    path = os.path.join(AVATAR_DIR, name)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass


# --------------------------------------------------------------------------- CSRF


def csrf_token(session) -> str:
    """One random token per session. Every HTML form sends it back; a forged cross-site form can't know it."""
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


def csrf_ok(session, submitted: Optional[str]) -> bool:
    expected = session.get("csrf")
    return bool(expected and submitted and secrets.compare_digest(expected, submitted))


# --------------------------------------------------------------------------- login throttling

_FAILS: Dict[str, Tuple[int, float]] = {}  # key -> (failed attempts, window start)
MAX_FAILS = 5
LOCK_SECONDS = 300


def _key(email: str, ip: str) -> str:
    return f"{clean_email(email)}|{ip}"


def locked_for(email: str, ip: str) -> int:
    """Seconds left on the lock-out (0 = not locked)."""
    n, start = _FAILS.get(_key(email, ip), (0, 0.0))
    if n >= MAX_FAILS:
        left = int(start + LOCK_SECONDS - time.time())
        if left > 0:
            return left
        _FAILS.pop(_key(email, ip), None)
    return 0


def record_failure(email: str, ip: str):
    k = _key(email, ip)
    n, start = _FAILS.get(k, (0, time.time()))
    if time.time() - start > LOCK_SECONDS:
        n, start = 0, time.time()
    _FAILS[k] = (n + 1, start)


def clear_failures(email: str, ip: str):
    _FAILS.pop(_key(email, ip), None)