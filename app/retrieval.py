"""Lightweight BM25 retrieval over a single document's chunks, plus evidence verification."""
import math
import re
from collections import Counter
from difflib import SequenceMatcher
from typing import Dict, List, Tuple

STOP = set(
    "a an and are as at be but by for from has have how i if in into is it its of on or "
    "that the their then there these this to was were what when where which who why will "
    "with you your do does did can could should would about tell me explain give define "
    "describe please".split()
)


def stem(w: str) -> str:
    for suf in ("ingly", "ing", "edly", "ed", "es", "s", "ly"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def tokens(text: str) -> List[str]:
    return [stem(t) for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP and len(t) > 1]


def bm25_rank(query: str, chunks: List[Dict], k1: float = 1.5, b: float = 0.75) -> List[Tuple[float, Dict]]:
    q = tokens(query)
    if not q or not chunks:
        return []
    docs = [Counter(tokens(c["text"])) for c in chunks]
    lens = [sum(d.values()) or 1 for d in docs]
    avg = sum(lens) / len(lens)
    N = len(chunks)
    df = Counter()
    for d in docs:
        for t in set(d):
            df[t] += 1
    scored = []
    for c, d, L in zip(chunks, docs, lens):
        s = 0.0
        for t in set(q):
            f = d.get(t, 0)
            if not f:
                continue
            idf = math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * L / avg))
        scored.append((s, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored


def retrieve(query: str, chunks: List[Dict], k: int = 6) -> List[Dict]:
    """Return the most relevant chunks. Small documents are passed whole and the
    model + verifier decide relevance; large ones must have lexical overlap."""
    ranked = bm25_rank(query, chunks)
    hits = [c for s, c in ranked if s > 0][:k]
    if len(chunks) <= 4:
        return chunks
    return hits


def norm(s: str) -> str:
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", s).strip().casefold()


def quote_in(chunk_text: str, quote: str) -> bool:
    """True if `quote` really appears in the chunk (allowing tiny OCR/whitespace differences)."""
    qn, cn = norm(quote), norm(chunk_text)
    if len(qn) < 8:
        return False
    if qn in cn:
        return True
    m = SequenceMatcher(None, cn, qn, autojunk=False).find_longest_match(0, len(cn), 0, len(qn))
    return m.size >= 0.9 * len(qn)
