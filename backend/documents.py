"""
Evidence document conversion — replaces the earlier ".txt only" upload
restriction. Uses Microsoft's markitdown for broad format support (PDF,
Word, Excel, PowerPoint, HTML, CSV, images with embedded EXIF/basic OCR),
plus a Groq vision-model fallback for scanned/image-only content markitdown
can't extract text from. No Tesseract/native OCR binary required — this is
the mitigation flagged in DECISIONS.md for the earlier "no OCR" gap.
"""
import base64
import io
import os
from markitdown import MarkItDown
from dotenv import load_dotenv

load_dotenv()

SUPPORTED_EXTENSIONS = {
    ".txt", ".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".xls",
    ".html", ".htm", ".csv", ".json", ".xml", ".png", ".jpg", ".jpeg",
}

_converter = None


def get_converter():
    global _converter
    if _converter is None:
        _converter = MarkItDown()
    return _converter


def _looks_empty(text: str) -> bool:
    # markitdown returns near-empty/whitespace-only text for scanned
    # (image-only) PDFs and photos with no embedded text layer.
    return len(text.strip()) < 20


def ocr_with_groq_vision(raw_bytes: bytes, mime_type: str) -> str | None:
    """Fallback for scanned/image content markitdown can't read text from.
    Returns None (not an exception) if no GROQ_API_KEY or the call fails —
    callers must handle a None result as 'OCR unavailable', not crash."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=api_key)
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        resp = client.chat.completions.create(
            model=os.environ.get("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe all text visible in this image exactly, no commentary."},
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                    ],
                }
            ],
            temperature=0,
            max_tokens=2000,
        )
        text = resp.choices[0].message.content.strip()
        return text if text else None
    except Exception:
        return None


def extract_text(filename: str, raw_bytes: bytes) -> dict:
    """Returns {text, method, error}. method is one of:
    'plain-text' | 'markitdown' | 'groq-vision-ocr' | None (on failure)."""
    ext = os.path.splitext(filename.lower())[1]
    if ext not in SUPPORTED_EXTENSIONS:
        return {
            "text": None,
            "method": None,
            "error": f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}.",
        }

    if ext == ".txt":
        try:
            return {"text": raw_bytes.decode("utf-8"), "method": "plain-text", "error": None}
        except UnicodeDecodeError:
            return {"text": None, "method": None, "error": "File is not valid UTF-8 text."}

    try:
        result = get_converter().convert_stream(io.BytesIO(raw_bytes), file_extension=ext)
        text = result.text_content or ""
    except Exception as e:
        text = ""

    is_image = ext in (".png", ".jpg", ".jpeg")
    if _looks_empty(text):
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext.lstrip("."), "image/png")
        ocr_text = ocr_with_groq_vision(raw_bytes, mime) if is_image else None
        if ocr_text:
            return {"text": ocr_text, "method": "groq-vision-ocr", "error": None}
        if is_image:
            return {
                "text": None,
                "method": None,
                "error": "No text found and OCR is unavailable (set GROQ_API_KEY for image OCR).",
            }
        return {
            "text": None,
            "method": None,
            "error": "No extractable text layer found (this looks like a scanned document — "
                     "image-based OCR isn't applied to PDFs/Word docs in this prototype, only "
                     "standalone image files). See TASKS.md.",
        }

    return {"text": text, "method": "markitdown", "error": None}
