from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

from .parse import Segment, LinkRef

NUMBER_RE = re.compile(
    r"(?<!\w)(?:[₹$€£]?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*%|\s*(?:cr|crore|lakh|mn|million|bn|billion))?(?!\w)",
    re.IGNORECASE,
)

MONTHS = (
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
)
MONTH_RE = re.compile(r"\b(" + "|".join(MONTHS) + r")\b", re.IGNORECASE)
YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")
FISCAL_RE = re.compile(r"\bFY\s?\d{2}\b|\bQ\d\s?FY\s?\d{2}\b", re.IGNORECASE)


@dataclass
class Claim:
    claim_id: str
    text: str
    fact_type: str
    numbers: list[str] = field(default_factory=list)
    dates: list[str] = field(default_factory=list)
    links: list[LinkRef] = field(default_factory=list)


def split_sentences(text: str) -> list[str]:
    chunks = re.split(r"(?<=[.!?])\s+", text)
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def extract_numeric_claims(segments: Iterable[Segment]) -> list[Claim]:
    claims: list[Claim] = []
    idx = 1
    for segment in segments:
        for sentence in split_sentences(segment.text):
            numbers = [match.group(0).strip() for match in NUMBER_RE.finditer(sentence)]
            if not numbers:
                continue
            claims.append(
                Claim(
                    claim_id=f"num-{idx}",
                    text=sentence,
                    fact_type="number",
                    numbers=numbers,
                    links=segment.links,
                )
            )
            idx += 1
    return claims


def extract_date_claims(segments: Iterable[Segment]) -> list[Claim]:
    claims: list[Claim] = []
    idx = 1
    for segment in segments:
        for sentence in split_sentences(segment.text):
            if not (MONTH_RE.search(sentence) or YEAR_RE.search(sentence) or FISCAL_RE.search(sentence)):
                continue
            dates = []
            dates.extend([m.group(0) for m in MONTH_RE.finditer(sentence)])
            dates.extend([m.group(0) for m in YEAR_RE.finditer(sentence)])
            dates.extend([m.group(0) for m in FISCAL_RE.finditer(sentence)])
            claims.append(
                Claim(
                    claim_id=f"date-{idx}",
                    text=sentence,
                    fact_type="date",
                    dates=dates,
                    links=segment.links,
                )
            )
            idx += 1
    return claims
