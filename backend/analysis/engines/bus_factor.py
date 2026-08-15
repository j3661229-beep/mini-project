"""Bus factor analysis — ownership concentration per file."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass


BUS_FACTOR_THRESHOLD = 0.8


@dataclass(frozen=True)
class OwnershipResult:
    file_path: str
    top_contributor: str
    top_contributor_share: float
    bus_factor_risk: bool
    contributor_count: int
    total_churn: int


def compute_file_ownership(
    file_rows: list[dict],
    threshold: float = BUS_FACTOR_THRESHOLD,
) -> list[OwnershipResult]:
    """
    Aggregate CommitFile churn (insertions + deletions) by author per file.

    Expected row keys:
      - file_path
      - insertions
      - deletions
      - commit__author_name  (or author_name)
    """
    churn_by_file: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for row in file_rows:
        path = row["file_path"]
        author = row.get("commit__author_name") or row.get("author_name") or "unknown"
        churn = int(row.get("insertions", 0)) + int(row.get("deletions", 0))
        if churn <= 0:
            churn = 1  # touch still counts toward ownership
        churn_by_file[path][author] += churn

    results: list[OwnershipResult] = []
    for path, authors in churn_by_file.items():
        total = sum(authors.values())
        if total <= 0:
            continue
        top_author, top_churn = max(authors.items(), key=lambda kv: kv[1])
        share = top_churn / total
        results.append(
            OwnershipResult(
                file_path=path,
                top_contributor=top_author,
                top_contributor_share=round(share, 4),
                bus_factor_risk=share >= threshold,
                contributor_count=len(authors),
                total_churn=total,
            )
        )

    results.sort(key=lambda r: (-r.top_contributor_share, r.file_path))
    return results
