from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .claims import Claim
from .parse import Segment
from .verify import LinkCheck


@dataclass
class CritiqueItem:
    severity: str
    note: str


def generate_critique(
    segments: Iterable[Segment],
    numeric_claims: list[Claim],
    link_results: dict[str, LinkCheck],
) -> list[CritiqueItem]:
    items: list[CritiqueItem] = []

    total_links = len(link_results)
    blocked_links = sum(1 for link in link_results.values() if link.status == "red")
    weak_links = sum(1 for link in link_results.values() if link.status == "yellow")

    if blocked_links:
        items.append(
            CritiqueItem(
                severity="medium",
                note=f"{blocked_links} linked sources are blocked or irrelevant; replace with higher-quality sources.",
            )
        )

    if weak_links:
        items.append(
            CritiqueItem(
                severity="low",
                note=f"{weak_links} linked sources look only weakly related to the nearby claim; tighten the linkage.",
            )
        )

    unsourced_numbers = sum(1 for claim in numeric_claims if not claim.links)
    if unsourced_numbers:
        items.append(
            CritiqueItem(
                severity="high",
                note=f"{unsourced_numbers} numeric claims have no linked source. Add citations or soften the wording.",
            )
        )

    placeholder_sources = 0
    for segment in segments:
        if "source" in segment.text.lower() and not segment.links:
            placeholder_sources += 1
    if placeholder_sources:
        items.append(
            CritiqueItem(
                severity="medium",
                note=f"{placeholder_sources} 'Source' placeholders found without links. Replace with actual URLs.",
            )
        )

    if total_links == 0:
        items.append(
            CritiqueItem(
                severity="high",
                note="No hyperlinks were detected. This makes verification difficult.",
            )
        )

    return items
