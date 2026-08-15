"""Review bottleneck graph — directed reviewer → author edges."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class ReviewEdge:
    reviewer: str
    author: str
    count: int


@dataclass(frozen=True)
class ReviewNodeStats:
    login: str
    in_degree: int  # reviews performed (relied on as reviewer) — drives node size
    out_degree: int  # reviews received on own PRs
    is_bottleneck: bool


@dataclass
class ReviewGraph:
    edges: list[ReviewEdge]
    nodes: list[ReviewNodeStats]


def compute_review_edges(rows: list[dict]) -> list[ReviewEdge]:
    """
    Build directed edges reviewer → author with counts.

    Expected keys: reviewer_login, author_login
    Self-reviews are ignored.
    """
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for row in rows:
        reviewer = row["reviewer_login"]
        author = row["author_login"]
        if not reviewer or not author or reviewer == author:
            continue
        counts[(reviewer, author)] += 1

    edges = [
        ReviewEdge(reviewer=r, author=a, count=c)
        for (r, a), c in counts.items()
    ]
    edges.sort(key=lambda e: -e.count)
    return edges


def compute_review_graph(
    rows: list[dict],
    bottleneck_in_degree_min: int = 3,
) -> ReviewGraph:
    """
    Product semantics (aligned with the dashboard):
      in_degree  = how often someone is relied on to review (reviews given)
      out_degree = how often their own PRs receive reviews (reviews received)

    Bottlenecks: high in_degree with low reciprocal out_degree.
    Graph edges remain reviewer → author as specified.
    """
    edges = compute_review_edges(rows)
    reviews_given: dict[str, int] = defaultdict(int)
    reviews_received: dict[str, int] = defaultdict(int)
    logins: set[str] = set()

    for e in edges:
        logins.add(e.reviewer)
        logins.add(e.author)
        reviews_given[e.reviewer] += e.count
        reviews_received[e.author] += e.count

    nodes: list[ReviewNodeStats] = []
    for login in sorted(logins):
        indeg = reviews_given.get(login, 0)
        outdeg = reviews_received.get(login, 0)
        is_bottleneck = False
        if indeg >= bottleneck_in_degree_min:
            # Low reciprocity: reviews many, rarely reviewed in return
            if outdeg == 0 or (outdeg / indeg) < 0.35:
                is_bottleneck = True
        nodes.append(
            ReviewNodeStats(
                login=login,
                in_degree=indeg,
                out_degree=outdeg,
                is_bottleneck=is_bottleneck,
            )
        )

    nodes.sort(key=lambda n: (-n.in_degree, n.login))
    return ReviewGraph(edges=edges, nodes=nodes)
