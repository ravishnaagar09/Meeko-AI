import contextlib
import sqlite3

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,      -- always stored in lowercase
    password_hash TEXT NOT NULL,     -- Werkzeug hash, never the real password
    college TEXT NOT NULL DEFAULT '',
    course TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    avatar TEXT,                     -- file name inside static/avatars, NULL = default avatar
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    kind TEXT NOT NULL,              -- pdf | text | image | pasted
    page_count INTEGER NOT NULL DEFAULT 1,
    char_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,                      -- extraction warnings
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page INTEGER,                    -- NULL when the source has no pages
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pages_doc ON pages(document_id);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page INTEGER,                    -- NULL when the source has no pages
    idx INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    role TEXT NOT NULL,              -- user | assistant
    content TEXT NOT NULL,
    payload TEXT,                    -- JSON: evidence, status
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_doc ON messages(document_id);
CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    difficulty TEXT NOT NULL,
    topic TEXT,
    questions TEXT NOT NULL,         -- JSON list (with answers; never sent before answering)
    answers TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',  -- active | completed
    score REAL,
    total INTEGER NOT NULL,
    feedback TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quizzes_doc ON quizzes(document_id);
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,              -- answer | general
    rating INTEGER NOT NULL,         -- answer: 1 / -1 ; general: 1..5
    comment TEXT NOT NULL DEFAULT '',
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_msg ON feedback(message_id);
"""


def connect():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


@contextlib.contextmanager
def db():
    c = connect()
    try:
        yield c
        c.commit()
    finally:
        c.close()


def _has_column(c, table, column):
    return any(r["name"] == column for r in c.execute(f"PRAGMA table_info({table})"))


def _add_column(c, table, column, ddl):
    """Adds a column only if it is missing, so running init() twice is always safe."""
    if not _has_column(c, table, column):
        c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def migrate(c):
    """Upgrades an OLD database (made before login existed) without deleting anything.
    Old rows get user_id = NULL; they are handed to the first user who signs up."""
    _add_column(c, "documents", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE")
    _add_column(c, "feedback", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE")
    c.execute("CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)")


def init():
    with db() as c:
        c.executescript(SCHEMA)
        migrate(c)


if __name__ == "__main__":
    init()
    print(f"Database ready: {DB_PATH}")