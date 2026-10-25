# Study Companion — AI-Powered Study Assistant

Study Companion is a web application that helps students study from their own notes. It combines a FastAPI backend, a browser-based interface, SQLite storage, and Google's GenAI API for note-grounded answers and study assistance.

## Key Features

- **Sign up, log in, and profile management**
- **Upload study material:** PDF, TXT, Markdown, PNG, JPG/JPEG, and WEBP files
- **OCR and text extraction:** extracts readable text from supported documents and images; OCR quality can vary
- **Ask questions about notes:** retrieves relevant passages from the selected document
- **Evidence and page references:** shows supporting material when available
- **Honest answer labels:** distinguishes answers found in notes, partly supported answers, and answers not found in notes
- **Quiz generation:** create practice questions from uploaded material
- **Progress and revision support:** review quiz results and identify topics that may need more practice
- **MeekoMateAI assistant:** a separate AI chat feature
- **Configurable AI model:** select a model through environment settings
- **SQLite database:** stores application data locally

> AI-generated answers can be incorrect. Check important information against your course material and teacher's guidance.

## Technology Stack

- **Backend:** Python, FastAPI, Uvicorn
- **AI integration:** Google GenAI Python SDK
- **Database:** SQLite
- **Frontend:** HTML, CSS, JavaScript
- **Templates:** Jinja2
- **Document processing:** pypdf and Pillow
- **Authentication/session support:** Werkzeug, ItsDangerous, Starlette SessionMiddleware

## Project Structure

```text
study-companion/
├── app/
│   ├── main.py          # FastAPI application and API routes
│   ├── auth.py          # Authentication helpers
│   ├── config.py        # Environment-based configuration
│   ├── db.py            # SQLite database setup and access
│   ├── extract.py       # PDF, text, and image text extraction
│   ├── llm.py           # Google GenAI calls and retry/fallback handling
│   ├── meeko.py         # MeekoMateAI chat routes
│   ├── retrieval.py     # Relevant note passage retrieval
│   └── study.py         # Study answers, quizzes, and revision logic
├── static/
│   ├── index.html
│   ├── app.js
│   ├── meeko.js
│   ├── *.css
│   └── image assets
├── templates/           # Login, signup, and profile pages
├── .env.example         # Safe configuration template; no real secrets
├── .gitignore
├── requirements.txt
└── README.md
```

## Requirements

- Windows, macOS, or Linux
- Python 3.10 or newer recommended
- Internet connection for AI features
- A Google GenAI API key with access to the model you configure

Check Python installation:

```bash
python --version
```

## Setup on Windows (Command Prompt)

### 1. Open the project folder

In Command Prompt, move to the folder that contains `app`, `static`, `templates`, and `requirements.txt`.

Example:

```bat
cd /d "C:\path\to\study-companion"
```

Replace the example path with your actual project location.

### 2. Create and activate a virtual environment

```bat
python -m venv .venv
.venv\Scripts\activate
```

### 3. Install dependencies

```bat
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Create your local environment file

Copy `.env.example` to `.env`:

```bat
copy .env.example .env
```

Open `.env` in VS Code or Notepad and set your own values. **Never publish your real API key or secret key.**

Example configuration:

```dotenv
GEMINI_API_KEY=PASTE_YOUR_OWN_API_KEY_HERE
GEMINI_MODEL=YOUR_SUPPORTED_MODEL_NAME
GEMINI_FALLBACK_MODELS=
MAX_UPLOAD_MB=15
DB_PATH=studycompanion.db
SECRET_KEY=REPLACE_WITH_A_RANDOM_SECRET
VERIFY_ANSWERS=true
SESSION_HTTPS_ONLY=false
SESSION_MAX_AGE_DAYS=7
```

Generate a secure secret key in the activated terminal:

```bat
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy the generated value into `SECRET_KEY` in `.env`. Choose model names that are currently available to your Google GenAI API key. If you configure fallback models, separate their names with commas.

For local development, `SESSION_HTTPS_ONLY=false` allows the session cookie to work over localhost HTTP. For an HTTPS deployment, set it to `true`.

### 5. Start the application

From the project root—the directory containing the `app` folder—run:

```bat
python -m uvicorn app.main:app --reload
```

Open the application in your browser:

- Main app: http://127.0.0.1:8000
- Health check: http://127.0.0.1:8000/api/health
- Interactive API documentation: http://127.0.0.1:8000/docs

Stop the local server with `Ctrl+C`.

## Setup on macOS/Linux

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your own API key and secret, then start the server:

```bash
python -m uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000.

## Configuration Reference

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | API key used by the backend; keep it private |
| `GEMINI_MODEL` | Primary model name available to your API key |
| `GEMINI_FALLBACK_MODELS` | Optional comma-separated backup model names |
| `MAX_UPLOAD_MB` | Maximum size per uploaded file; default is 15 MB |
| `DB_PATH` | SQLite database file path |
| `SECRET_KEY` | Secret used to sign session cookies; must be at least 32 characters |
| `VERIFY_ANSWERS` | When `true`, runs an additional answer-verification step; this may increase response time and API usage |
| `SESSION_HTTPS_ONLY` | Set to `true` when deployed over HTTPS |
| `SESSION_MAX_AGE_DAYS` | Session lifetime in days; default is 7 |

## How Note-Grounded Answers Work

1. **Extract text:** the application extracts text from uploaded material.
2. **Split into chunks:** extracted text is divided into smaller sections while retaining page references.
3. **Retrieve relevant passages:** the retrieval layer ranks passages from the selected document.
4. **Generate a structured answer:** the AI receives relevant excerpts and is asked to answer using that evidence.
5. **Verify evidence quotes:** the backend checks that cited evidence appears in the retrieved text.
6. **Optional verification pass:** when `VERIFY_ANSWERS=true`, an additional AI call checks the answer against the evidence.
7. **Show the result:** the interface can distinguish supported, partially supported, and not-found answers.

This process reduces unsupported answers but does not guarantee that every AI response is correct. Users should verify important answers against the original notes.

## Common Problems

### `ModuleNotFoundError: No module named 'app'`

Make sure the terminal is in the project root, where the `app` folder and `requirements.txt` are located. Then run:

```bat
python -m uvicorn app.main:app --reload
```

### `GEMINI_API_KEY is not set`

Check that `.env` exists in the project root, contains your own key, and has no extra quotes or spaces around the value. Restart the server after editing it.

### `SECRET_KEY missing or too short`

Generate a new value with:

```bat
python -c "import secrets; print(secrets.token_hex(32))"
```

Put it in `.env` as `SECRET_KEY=...`, then restart the server.

### AI is slow, rate-limited, or reports a model error

- Check your internet connection and the API key's quota.
- Confirm that `GEMINI_MODEL` is a valid model name available to your key.
- Optionally configure a supported backup model in `GEMINI_FALLBACK_MODELS`.
- Set `VERIFY_ANSWERS=false` only if you accept skipping the additional verification pass. This can reduce one extra AI call for supported answer flows, but answers may be less thoroughly checked.

### Uploaded file is too large

The default limit is 15 MB per file. Change `MAX_UPLOAD_MB` in `.env` and restart the server if a different limit is needed.

### Scanned notes have missing or incorrect text

Check the extracted-text preview and compare it with the original scan. Clear images, good lighting, and straight pages generally improve OCR results.

## Security and Privacy Checklist

Before publishing or submitting this project:

- Never include `.env`, real API keys, or real secret keys in a ZIP or public repository.
- Never include your personal `studycompanion.db` file or real users' data in a public submission.
- Remove `.venv/` and `__pycache__/` from the submission ZIP; they can be recreated.
- Keep `.env.example` limited to placeholder values.
- Use HTTPS and set `SESSION_HTTPS_ONLY=true` in production.
- Do not commit uploaded personal files or profile photos unless they are intentional demo assets.
- Test signup, login, logout, file upload, note answers, quiz generation, and AI error handling before the demo.
- Rotate an API key immediately if it has accidentally been included in a shared file or repository.

## Hackathon Demo Checklist

- [ ] App starts from a clean environment using `requirements.txt`
- [ ] Signup and login work
- [ ] A small PDF or TXT note uploads successfully
- [ ] A question answered by the notes shows supporting evidence
- [ ] A question not covered by the notes receives the correct not-found/AI label
- [ ] Quiz generation and submission work
- [ ] Progress/revision view works
- [ ] MeekoMateAI chat works
- [ ] API quota/model errors are handled clearly
- [ ] No real secrets or personal database are included in the submission

## Current Project Status

This README describes the intended features and setup based on the project structure. Verify each feature by running the app before presenting it as fully working. Model availability, API quota, and OCR quality depend on your configuration and environment.

## License

No license is specified yet. Add a license file if you intend to publish or accept contributions to this project.
