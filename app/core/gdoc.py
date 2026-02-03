from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

DOC_ID_RE = re.compile(r"/d/([a-zA-Z0-9_-]+)")


@dataclass
class DocFetchResult:
    doc_id: str
    html: str


def extract_doc_id(doc_url: str) -> str:
    match = DOC_ID_RE.search(doc_url)
    if not match:
        raise ValueError("Could not extract Google Doc ID from URL")
    return match.group(1)


def export_url(doc_id: str) -> str:
    return f"https://docs.google.com/document/d/{doc_id}/export?format=html"


def fetch_doc_html(doc_url: str, timeout_s: int = 20) -> DocFetchResult:
    doc_id = extract_doc_id(doc_url)
    url = export_url(doc_id)
    with httpx.Client(timeout=timeout_s, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
    return DocFetchResult(doc_id=doc_id, html=response.text)
