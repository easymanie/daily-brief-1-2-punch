from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

import httpx
from bs4 import BeautifulSoup

from .claims import Claim
from .parse import LinkRef, Segment
from .source_policy import classify_source

STOPWORDS = {
    "the",
    "and",
    "a",
    "an",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "as",
    "at",
    "from",
    "that",
    "this",
    "it",
    "be",
    "or",
    "their",
    "they",
    "has",
    "have",
    "had",
    "not",
    "but",
    "which",
    "who",
    "will",
    "would",
    "can",
    "could",
    "should",
    "into",
}


@dataclass
class LinkCheck:
    url: str
    status: str
    quality: str
    notes: str


@dataclass
class ClaimCheck:
    claim_id: str
    status: str
    notes: str


def _clean_text(text: str) -> str:
    return " ".join(text.split())


def _extract_text_from_html(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return _clean_text(soup.get_text(" ", strip=True))


def _keyword_hits(text: str, keywords: list[str]) -> int:
    lowered = text.lower()
    return sum(1 for keyword in keywords if keyword in lowered)


def _keywords_from_text(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z]{3,}", text.lower())
    return [word for word in words if word not in STOPWORDS]


def _normalize_number(num: str) -> list[str]:
    raw = num.strip()
    variants = {raw}
    cleaned = raw.replace(",", "")
    variants.add(cleaned)
    variants.add(cleaned.replace(" ", ""))
    if raw.endswith("%"):
        variants.add(raw.replace("%", " %"))
    return list(variants)


def _number_in_text(num: str, text: str) -> bool:
    for variant in _normalize_number(num):
        if variant and variant in text:
            return True
    return False


def _fetch_url(url: str, client: httpx.Client, cache: dict[str, str]) -> str:
    if url in cache:
        return cache[url]
    response = client.get(url)
    response.raise_for_status()
    cache[url] = response.text
    return cache[url]


def check_links(segments: Iterable[Segment]) -> dict[str, LinkCheck]:
    cache: dict[str, str] = {}
    link_results: dict[str, LinkCheck] = {}

    with httpx.Client(timeout=20, follow_redirects=True) as client:
        for segment in segments:
            keywords = _keywords_from_text(segment.text)
            for link in segment.links:
                if link.url in link_results:
                    continue
                source = classify_source(link.url)
                if not source.allowed:
                    link_results[link.url] = LinkCheck(
                        url=link.url,
                        status="red",
                        quality=source.quality,
                        notes=source.reason or "Blocked source",
                    )
                    continue
                try:
                    html = _fetch_url(link.url, client, cache)
                except httpx.HTTPError as exc:
                    link_results[link.url] = LinkCheck(
                        url=link.url,
                        status="yellow",
                        quality=source.quality,
                        notes=f"Could not fetch link ({exc.__class__.__name__})",
                    )
                    continue
                text = _extract_text_from_html(html)
                hits = _keyword_hits(text, keywords)
                if hits >= 3:
                    status = "green"
                    notes = "Link content appears relevant to nearby claim"
                elif hits >= 1:
                    status = "yellow"
                    notes = "Link is weakly related to nearby claim"
                else:
                    status = "red"
                    notes = "Link content appears unrelated to nearby claim"
                link_results[link.url] = LinkCheck(
                    url=link.url,
                    status=status,
                    quality=source.quality,
                    notes=notes,
                )

    return link_results


def check_numeric_claims(
    claims: Iterable[Claim],
    link_results: dict[str, LinkCheck],
) -> list[ClaimCheck]:
    checks: list[ClaimCheck] = []

    cache: dict[str, str] = {}
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        for claim in claims:
            if not claim.links:
                checks.append(
                    ClaimCheck(
                        claim_id=claim.claim_id,
                        status="yellow",
                        notes="No linked source near this numeric claim",
                    )
                )
                continue

            best_status = "yellow"
            notes = "No matching number found in linked sources"
            for link in claim.links:
                link_check = link_results.get(link.url)
                if link_check and link_check.status == "red":
                    notes = "Linked source appears irrelevant or blocked"
                    continue

                if link_check and link_check.status == "yellow":
                    best_status = "yellow"

                try:
                    html = _fetch_url(link.url, client, cache)
                except httpx.HTTPError:
                    notes = "Linked source could not be fetched"
                    continue

                text = _extract_text_from_html(html)
                if any(_number_in_text(num, text) for num in claim.numbers):
                    best_status = "green"
                    notes = "Number appears in linked source"
                    break

            checks.append(
                ClaimCheck(
                    claim_id=claim.claim_id,
                    status=best_status,
                    notes=notes,
                )
            )

    return checks
