"""Thin wrapper around the official google-genai SDK. The API key never leaves the backend."""
import io
import re
import time
from typing import Optional, Type, TypeVar

from pydantic import BaseModel

from . import config

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    pass


_client = None


def configured() -> bool:
    return bool(config.GEMINI_API_KEY)


def _get_client():
    global _client
    if not configured():
        raise LLMError("GEMINI_API_KEY is not set. Add it to your .env file and restart the server.")
    if _client is None:
        from google import genai
        from google.genai import types
        _client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=15000),  # 15 seconds, then fail fast (value is in milliseconds)
        )
    return _client


# ---------------------------------------------------------------- classify Google errors

def _is_rate_limit(e: Exception) -> bool:
    t = str(e)
    return "429" in t or "RESOURCE_EXHAUSTED" in t


def _is_overloaded(e: Exception) -> bool:
    """Google-side trouble that usually passes by itself (503 busy, 500/502/504, timeouts)."""
    t = str(e)
    low = t.lower()
    return bool(
        re.search(r"\b(500|502|503|504)\b", t)
        or any(k in t for k in ("UNAVAILABLE", "INTERNAL", "DEADLINE_EXCEEDED"))
        or "high demand" in low
        or "overloaded" in low
        or "timed out" in low
    )


def _is_model_problem(e: Exception) -> bool:
    """The model name is wrong or not open to this key, so another model may work."""
    t = str(e)
    low = t.lower()
    return "unexpected model name" in low or ("404" in t and "model" in low) or "NOT_FOUND" in t


def _is_key_problem(e: Exception) -> bool:
    """The key itself is bad: no model will work, so stop at once."""
    t = str(e)
    low = t.lower()
    return "api key" in low or "api_key" in low or "401" in t or "403" in t or "PERMISSION_DENIED" in t


def _retry_seconds(e: Exception):
    """How long Google says to wait, if it says."""
    t = str(e)
    m = re.search(r"retry in ([\d.]+)\s*s", t, re.I) or re.search(r"retryDelay'?\"?:\s*'?\"?(\d+)s", t)
    return int(float(m.group(1))) if m else None


def _explain(e) -> str:
    """Turns Google's long technical error into one clear sentence."""
    if e is None:
        return "The AI service did not respond. Please try again."
    t = str(e)
    low = t.lower()
    if _is_rate_limit(e):
        secs = _retry_seconds(e)
        if "limit: 0" in low:
            return ("This model has no free quota for your API key. Change GEMINI_MODEL in your .env file "
                    "to another model that your key can use (see https://ai.dev/rate-limit), then restart the server.")
        if "perday" in low or "per day" in low:
            return ("Your free Gemini quota for today is used up. It resets once a day at midnight Pacific time "
                    "(around 12:30 to 1:30 PM India time). You can wait, switch GEMINI_MODEL in .env to another model, "
                    "or enable billing in Google AI Studio.")
        if secs:
            return f"Gemini is receiving too many requests. Please wait about {secs} seconds and try again."
        return ("Gemini's free request limit was reached. Wait a minute and try again. "
                "If it keeps happening, the daily limit is used up (see https://ai.dev/rate-limit).")
    if _is_overloaded(e):
        return ("Google's AI servers are very busy right now. This is usually temporary, so please try again in a minute.")
    if _is_model_problem(e):
        return "The model name in GEMINI_MODEL is not available for your key. Check the exact name in Google AI Studio and fix .env."
    if _is_key_problem(e):
        return "Gemini rejected the API key. Check GEMINI_API_KEY in your .env file and restart the server."
    return f"AI service error: {t[:300]}"


def _models():
    """The main model first, then the backup models from .env (no duplicates)."""
    fallbacks = getattr(config, "GEMINI_FALLBACK_MODELS", [])
    return [config.GEMINI_MODEL] + [m for m in fallbacks if m and m != config.GEMINI_MODEL]


def _make_config(model: str, **kwargs):
    from google.genai import types

    cfg_args = dict(kwargs)

    if model.startswith("gemma-4"):
        cfg_args["thinking_config"] = types.ThinkingConfig(
            thinking_level="minimal"
        )
    elif model.startswith("gemini"):
        cfg_args["thinking_config"] = types.ThinkingConfig(
            thinking_budget=0
        )

    return types.GenerateContentConfig(**cfg_args)


def _call(contents, cfg_kwargs: dict):
    last = None
    for model in _models():
        cfg = _make_config(model, **cfg_kwargs)
        for attempt in range(2):
            t0 = time.time()
            try:
                resp = _get_client().models.generate_content(model=model, contents=contents, config=cfg)
                print(f"[ai] {model} ok in {time.time() - t0:.1f}s")
                return resp
            except LLMError:
                raise
            except Exception as e:
                last = e
                print(f"[ai] {model} attempt {attempt + 1} FAILED after {time.time() - t0:.1f}s: {str(e)[:120]}")
                if _is_key_problem(e):
                    raise LLMError(_explain(e))
                if _is_rate_limit(e):
                    secs = _retry_seconds(e)
                    if attempt == 0 and secs is not None and secs <= 15:
                        time.sleep(secs + 1)  # short per-minute limit: wait it out once
                        continue
                    break  # this model's quota is used up: try the next model
                if _is_model_problem(e):
                    break  # wrong or closed model name: try the next model
                if _is_overloaded(e):
                    if attempt == 0:
                        time.sleep(1)  # busy right now: one short wait, then try again
                        continue
                    break  # still busy: try the next model
                break  # other error for this model (for example an unsupported request): try the next model
    raise LLMError(_explain(last))

def generate_json(prompt: str, schema: Type[T], system: str, temperature: float = 0.1) -> T:
    resp = _call(prompt, dict(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
    ))
    try:
        return schema.model_validate_json(resp.text)
    except Exception:
        raise LLMError("The AI returned an unreadable response. Please try again.")

def transcribe(data: bytes, mime: str, instruction: str) -> str:
    from google.genai import types

    part = types.Part.from_bytes(data=data, mime_type=mime)
    resp = _call([part, instruction], dict(temperature=0.0))
    return (resp.text or "").strip()
