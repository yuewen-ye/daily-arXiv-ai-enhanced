"""Read-only Zotero recommendations, with the weighting used by zotero-arxiv-daily.

Only public candidate scores leave this module. Library entries and embeddings
are kept in memory and must never be written to the published data branch.
"""

import fnmatch
import math
import re
import time
from functools import lru_cache

import requests


DEFAULT_MODEL = "jinaai/jina-embeddings-v5-text-nano-retrieval"
DEFAULT_REVISION = "ac5d898c8d382b17167c33e5c8af644a3519b47d"
ITEM_TYPES = {"conferencePaper", "journalArticle", "preprint"}


def matches_path(path: str, pattern: str) -> bool:
    """Match collection paths; ** spans directories, * stays in one directory."""
    parts, rules = path.split("/"), pattern.split("/")

    @lru_cache(None)
    def match(i, j):
        if j == len(rules):
            return i == len(parts)
        if rules[j] == "**":
            return match(i, j + 1) or (i < len(parts) and match(i + 1, j))
        return i < len(parts) and fnmatch.fnmatchcase(parts[i], rules[j]) and match(i + 1, j + 1)

    return match(0, 0)


def _get_all(session, url, key):
    result, start, version = [], 0, None
    while True:
        response = session.get(
            url,
            headers={"Zotero-API-Key": key, "Zotero-API-Version": "3"},
            params={"format": "json", "limit": 100, "start": start},
            timeout=60,
        )
        # Do not include response bodies or authenticated URLs in diagnostics.
        if response.status_code != 200:
            raise RuntimeError(f"Zotero read failed (HTTP {response.status_code}). Check the read-only key and user ID.")
        current_version = response.headers.get("Last-Modified-Version")
        if version is not None and current_version != version:
            raise RuntimeError("Zotero library changed during pagination; retry the task.")
        version = current_version
        page = response.json()
        if not isinstance(page, list):
            raise RuntimeError("Unexpected Zotero response format.")
        result.extend(page)
        if len(page) < 100:
            return result
        start += len(page)
        backoff = float(response.headers.get("Backoff", "0"))
        if backoff > 0:
            time.sleep(min(backoff, 60))


def fetch_corpus(user_id, api_key, include_paths=None, ignore_paths=None, session=None):
    for patterns in (include_paths, ignore_paths):
        if patterns is not None and (not isinstance(patterns, list) or not all(isinstance(pattern, str) for pattern in patterns)):
            raise ValueError("Zotero path filters must be JSON lists of strings, or null.")
    if not re.fullmatch(r"[0-9]+", str(user_id or "")) or not api_key:
        raise ValueError("Set ZOTERO_ID (numeric user ID) and ZOTERO_KEY (library read access).")
    session = session or requests.Session()
    base = f"https://api.zotero.org/users/{user_id}"
    items = _get_all(session, base + "/items", api_key)
    paths = {}
    if include_paths or ignore_paths:
        collections = {c["key"]: c["data"] for c in _get_all(session, base + "/collections", api_key)}

        def resolve(key, seen=frozenset()):
            if key in paths:
                return paths[key]
            if key in seen or key not in collections:
                raise RuntimeError("Invalid Zotero collection hierarchy.")
            data = collections[key]
            parent = data.get("parentCollection")
            paths[key] = (resolve(parent, seen | {key}) + "/" if parent else "") + data["name"]
            return paths[key]

        for key in collections:
            resolve(key)

    corpus = []
    for item in items:
        data = item["data"]
        abstract = data.get("abstractNote", "")
        if data.get("itemType") not in ITEM_TYPES or not abstract.strip():
            continue
        item_paths = [paths[k] for k in data.get("collections", []) if k in paths]
        if include_paths and not any(matches_path(p, g) for p in item_paths for g in include_paths):
            continue
        if ignore_paths and any(matches_path(p, g) for p in item_paths for g in ignore_paths):
            continue
        corpus.append({"abstract": abstract, "dateAdded": data.get("dateAdded", "")})
    # ISO UTC dateAdded sorts chronologically. Stable ties preserve API order.
    corpus.sort(key=lambda entry: entry["dateAdded"], reverse=True)
    if not corpus:
        raise ValueError("No eligible Zotero papers with abstracts. Check synchronization, item types and collection filters.")
    return corpus


def weighted_scores(similarities, corpus_size):
    """10 × weighted average similarity; recency is rank, not elapsed days."""
    if corpus_size < 1:
        raise ValueError("Cannot recommend from an empty Zotero corpus.")
    raw = [1 / (1 + math.log10(i + 1)) for i in range(corpus_size)]
    total = sum(raw)
    scores = []
    for row in similarities:
        if len(row) != corpus_size or not all(math.isfinite(float(value)) for value in row):
            raise ValueError("Invalid embedding similarity matrix.")
        scores.append(10 * sum(float(value) * weight for value, weight in zip(row, raw)) / total)
    return scores


def recommend(papers, corpus, model_name=DEFAULT_MODEL, encoder=None):
    """Use the original document/document retrieval encoding and model similarity."""
    if not papers:
        return []
    corpus = sorted(corpus, key=lambda entry: entry["dateAdded"], reverse=True)
    if not corpus:
        raise ValueError("Cannot recommend from an empty Zotero corpus.")
    if encoder is None:
        from sentence_transformers import SentenceTransformer

        encoder = SentenceTransformer(model_name, revision=DEFAULT_REVISION if model_name == DEFAULT_MODEL else None, trust_remote_code=True, device="cpu")
    kwargs = {"task": "retrieval", "prompt_name": "document", "batch_size": 16, "show_progress_bar": False}
    references = encoder.encode([item["abstract"] for item in corpus], **kwargs)
    scores = []
    # Bound the candidate/corpus similarity matrix rather than materializing it all.
    for start in range(0, len(papers), 32):
        candidates = encoder.encode([p["summary"] for p in papers[start:start + 32]], **kwargs)
        matrix = encoder.similarity(candidates, references)
        scores.extend(weighted_scores(matrix.tolist(), len(corpus)))
    order = sorted(range(len(papers)), key=lambda i: -scores[i])
    ranks = {index: rank for rank, index in enumerate(order, 1)}
    return [dict(paper, zotero={"score": round(scores[i], 6), "rank": ranks[i]}) for i, paper in enumerate(papers)]
