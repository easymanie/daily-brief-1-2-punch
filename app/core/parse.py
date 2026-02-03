from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from bs4 import BeautifulSoup


@dataclass
class LinkRef:
    url: str
    anchor: str


@dataclass
class Segment:
    text: str
    links: list[LinkRef] = field(default_factory=list)


BLOCK_TAGS = {"script", "style", "noscript"}


def _extract_links(element) -> list[LinkRef]:
    links: list[LinkRef] = []
    for link in element.find_all("a", href=True):
        href = link.get("href", "").strip()
        if not href or href.startswith("#"):
            continue
        anchor = link.get_text(" ", strip=True)
        links.append(LinkRef(url=href, anchor=anchor))
    return links


def _clean_text(text: str) -> str:
    return " ".join(text.split())


def extract_segments(html: str) -> list[Segment]:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.find_all(list(BLOCK_TAGS)):
        tag.decompose()

    segments: list[Segment] = []
    selectors = [
        "p",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "td",
        "th",
    ]
    for element in soup.find_all(selectors):
        text = _clean_text(element.get_text(" ", strip=True))
        if not text:
            continue
        links = _extract_links(element)
        segments.append(Segment(text=text, links=links))

    return segments


def iter_links(segments: Iterable[Segment]) -> list[LinkRef]:
    seen: set[str] = set()
    unique: list[LinkRef] = []
    for segment in segments:
        for link in segment.links:
            if link.url in seen:
                continue
            seen.add(link.url)
            unique.append(link)
    return unique
