from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

BLOCKED_DOMAINS = {
    "wikipedia.org",
    "wikimedia.org",
    "reddit.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "quora.com",
}

COMP_EXAM_HINTS = {
    "byju",
    "toppr",
    "testbook",
    "gradeup",
    "unacademy",
    "embibe",
    "adda247",
    "careerpower",
    "bankersadda",
    "ssc",
    "upsc",
    "neet",
    "jee",
}

DUBIOUS_MARKET_RESEARCH = {
    "fortunebusinessinsights",
    "grandviewresearch",
    "marketresearchfuture",
    "reportlinker",
    "alliedmarketresearch",
    "researchandmarkets",
    "mordorintelligence",
    "imarcgroup",
    "verifiedmarketresearch",
    "marketsandmarkets",
    "databridge",
    "precedenceresearch",
    "futuremarketinsights",
    "gminsights",
    "coherentmarketinsights",
}

LOW_TRUST_HINTS = {
    "blogspot",
    "wordpress",
    "medium.com",
    "substack.com",
}


@dataclass
class SourceVerdict:
    allowed: bool
    reason: str | None
    quality: str


def _base_domain(hostname: str) -> str:
    hostname = hostname.lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname


def classify_source(url: str) -> SourceVerdict:
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
    except ValueError:
        return SourceVerdict(False, "Invalid URL", "blocked")

    if parsed.scheme not in {"http", "https"}:
        return SourceVerdict(False, "Unsupported URL scheme", "blocked")

    host = _base_domain(hostname)
    if not host:
        return SourceVerdict(False, "Invalid URL", "blocked")

    for blocked in BLOCKED_DOMAINS:
        if host == blocked or host.endswith(f".{blocked}"):
            return SourceVerdict(False, f"Blocked domain: {blocked}", "blocked")

    for hint in COMP_EXAM_HINTS:
        if hint in host:
            return SourceVerdict(False, "Competitive exam prep source", "blocked")

    for hint in DUBIOUS_MARKET_RESEARCH:
        if hint in host:
            return SourceVerdict(False, "Dubious market-research source", "blocked")

    for hint in LOW_TRUST_HINTS:
        if hint in host:
            return SourceVerdict(True, "Low-trust blog platform", "low")

    return SourceVerdict(True, None, "standard")
