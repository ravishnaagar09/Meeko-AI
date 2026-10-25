"""Text extraction (PDF / text / OCR) and chunking that preserves page references."""
import io
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

from pypdf import PdfReader

from . import llm

OCR_PROMPT = (
    "Transcribe ALL text in this document exactly as written, including handwriting. "
    "Preserve line breaks, headings, lists and formulas. Do not summarise, correct, "
    "translate or add anything. If a word is illegible write [illegible]. "
    "Output only the transcription. If there is no readable text, output exactly: NO_TEXT"
)

PDF_OCR_PROMPT = (
    "This PDF contains scanned or handwritten pages. Transcribe ALL text exactly as written. "
    "Start each page with a line of the form '=== PAGE n ===' (n = page number starting at 1). "
    "Do not summarise, correct or add anything. Write [illegible] for unreadable words. "
    "If there is no readable text, output exactly: NO_TEXT"
)


class ExtractionError(Exception):
    pass


@dataclass
class Extracted:
    pages: List[Tuple[Optional[int], str]]  # (page number or None, text)
    kind: str
    notes: str = ""


def clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf(data: bytes) -> Extracted:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ExtractionError("This PDF is password-protected. Remove the password and upload it again.")
        pages = []
        for i, p in enumerate(reader.pages, start=1):
            try:
                pages.append((i, clean(p.extract_text() or "")))
            except Exception:
                pages.append((i, ""))
    except ExtractionError:
        raise
    except Exception:
        raise ExtractionError("This PDF could not be opened. It may be corrupted.")

    total = sum(len(t) for _, t in pages)
    notes = ""

    # Scanned / handwritten PDF: no text layer -> OCR the whole PDF with Gemini.
    if total < 10 * max(1, len(pages)):
        if not llm.configured():
            raise ExtractionError(
                "This PDF looks scanned (no text layer) and OCR needs GEMINI_API_KEY to be configured."
            )
        try:
            raw = llm.transcribe(data, "application/pdf", PDF_OCR_PROMPT)
        except llm.LLMError as e:
            raise ExtractionError(f"OCR failed: {e}")
        if not raw or raw.strip() == "NO_TEXT":
            raise ExtractionError("No readable text was found in this PDF.")
        parts = re.split(r"^=== PAGE (\d+) ===\s*$", raw, flags=re.M)
        ocr_pages = []
        if len(parts) > 1:
            for j in range(1, len(parts), 2):
                ocr_pages.append((int(parts[j]), clean(parts[j + 1])))
        else:
            ocr_pages = [(1, clean(raw))]
        pages = ocr_pages
        notes = "Scanned PDF read with OCR. Check the extracted text for transcription errors."
    return Extracted(pages=pages, kind="pdf", notes=notes)


def extract_text_file(data: bytes) -> Extracted:
    for enc in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except Exception:
            continue
    else:
        raise ExtractionError("This text file could not be decoded.")
    return Extracted(pages=[(None, clean(text))], kind="text")


def preprocess_image(data: bytes) -> Tuple[bytes, str]:
    """Grayscale, auto-contrast and size-normalise before OCR."""
    from PIL import Image, ImageOps

    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
    except Exception:
        raise ExtractionError("This image could not be opened.")
    img = img.convert("L")
    img = ImageOps.autocontrast(img, cutoff=1)
    longest = max(img.size)
    if longest > 3000:
        s = 3000 / longest
        img = img.resize((int(img.width * s), int(img.height * s)))
    elif longest < 1200:
        s = 1200 / longest
        img = img.resize((int(img.width * s), int(img.height * s)))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png"


def extract_image(data: bytes) -> Extracted:
    if not llm.configured():
        raise ExtractionError("Reading images needs GEMINI_API_KEY to be configured (used for OCR).")
    processed, mime = preprocess_image(data)
    try:
        text = llm.transcribe(processed, mime, OCR_PROMPT)
    except llm.LLMError as e:
        raise ExtractionError(f"OCR failed: {e}")
    if not text or text.strip() == "NO_TEXT":
        raise ExtractionError("No readable text was found in this image. Try a sharper, well-lit photo.")
    return Extracted(
        pages=[(None, clean(text))],
        kind="image",
        notes="Read with OCR. Check the extracted text for transcription errors.",
    )


def chunk_text(text: str, size: int = 900, overlap: int = 150) -> List[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    out, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            cut = max(text.rfind(". ", start, end), text.rfind("\n", start, end))
            if cut > start + size * 0.5:
                end = cut + 1
            else:
                sp = text.rfind(" ", start, end)
                if sp > start + size * 0.5:
                    end = sp
        piece = text[start:end].strip()
        if piece:
            out.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return out


def to_chunks(pages: List[Tuple[Optional[int], str]]) -> List[Tuple[Optional[int], str]]:
    chunks = []
    for page, text in pages:
        for piece in chunk_text(text):
            chunks.append((page, piece))
    return chunks
