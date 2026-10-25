
import os
from dotenv import load_dotenv

load_dotenv()

# AI Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

# Recommended starting model for the demo
GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemma-4-26b-a4b-it"
).strip()

# Fallback model: tried only if your existing retry logic supports it
GEMINI_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv(
        "GEMINI_FALLBACK_MODELS",
        "gemma-4-31b-it"
    ).split(",")
    if model.strip()
]

# Upload and database settings
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
DB_PATH = os.getenv("DB_PATH", "studycompanion.db")

# Faster responses: skip the additional verification API call
VERIFY_ANSWERS = (
    os.getenv("VERIFY_ANSWERS", "false").strip().lower() == "true"
)

# Supported file formats
ALLOWED_EXT = {
    ".pdf": "pdf",
    ".txt": "text",
    ".md": "text",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
}

NOT_FOUND_MESSAGE = (
    "Answer not found in your notes. Please upload relevant study material "
    "or ask a question related to the available content."
)

# Authentication and sessions
SECRET_KEY = os.getenv("SECRET_KEY", "").strip()

if len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY missing or too short. Add a secure key to your .env file. "
        "Generate one with: "
        'python -c "import secrets; print(secrets.token_hex(32))"'
    )

SESSION_MAX_AGE = (
    int(os.getenv("SESSION_MAX_AGE_DAYS", "7")) * 24 * 60 * 60
)

SESSION_HTTPS_ONLY = (
    os.getenv("SESSION_HTTPS_ONLY", "false").strip().lower() == "true"
)

# Profile pictures
MAX_AVATAR_MB = 2

ALLOWED_AVATAR_EXT = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}
