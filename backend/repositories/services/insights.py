"""Read-only repository intelligence aggregations."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate

from repositories.models import Commit, CommitFile, Repository


def activity_summary(repository: Repository, days: int = 365, contributor: str | None = None) -> dict:
    """Return bounded, calendar-friendly commit activity from stored Git history."""
    days = max(1, min(days, 366))
    commits = Commit.objects.filter(repository=repository)
    if contributor:
        commits = commits.filter(author_name=contributor)
    latest = commits.order_by("-committed_at").values_list("committed_at", flat=True).first()
    if latest is None:
        return {"days": days, "start_date": None, "end_date": None, "total_commits": 0, "active_days": 0, "peak_commits": 0, "series": [], "contributors": []}

    start = latest.date() - timedelta(days=days - 1)
    commits = commits.filter(committed_at__date__gte=start)
    series = list(
        commits.annotate(day=TruncDate("committed_at"))
        .values("day")
        .annotate(commits=Count("id"), contributors=Count("author_email", distinct=True))
        .order_by("day")
    )
    contributors = list(
        commits.values("author_name")
        .annotate(commits=Count("id"))
        .order_by("-commits", "author_name")[:12]
    )
    return {
        "days": days,
        "start_date": start,
        "end_date": latest.date(),
        "total_commits": sum(row["commits"] for row in series),
        "active_days": len(series),
        "peak_commits": max((row["commits"] for row in series), default=0),
        "series": series,
        "contributors": contributors,
    }


def directory_ownership(repository: Repository, depth: int = 1) -> list[dict]:
    """Roll up commit-file churn into directory ownership using stored Git data."""
    depth = max(1, min(depth, 8))
    paths: dict[str, dict] = {}
    rows = CommitFile.objects.filter(commit__repository=repository).select_related("commit").values(
        "file_path", "insertions", "deletions", "commit__author_name"
    )
    for row in rows:
        parts = [part for part in row["file_path"].split("/") if part]
        if len(parts) < 2:
            continue
        directory = "/".join(parts[: min(depth, len(parts) - 1)])
        bucket = paths.setdefault(directory, {"authors": defaultdict(int), "files": set(), "churn": 0})
        churn = max(0, row["insertions"]) + max(0, row["deletions"])
        bucket["authors"][row["commit__author_name"] or "unknown"] += churn
        bucket["files"].add(row["file_path"])
        bucket["churn"] += churn

    result = []
    for directory, bucket in paths.items():
        author_churn = sorted(bucket["authors"].items(), key=lambda item: (-item[1], item[0]))
        total = bucket["churn"]
        if not author_churn or total <= 0:
            continue
        top_author, top_churn = author_churn[0]
        share = top_churn / total
        cumulative = 0
        bus_factor = 0
        for _, churn in author_churn:
            cumulative += churn
            bus_factor += 1
            if cumulative / total >= 0.8:
                break
        result.append({
            "directory": directory,
            "top_contributor": top_author,
            "top_contributor_share": share,
            "contributor_count": len(author_churn),
            "bus_factor": bus_factor,
            "total_churn": total,
            "affected_file_count": len(bucket["files"]),
            "bus_factor_risk": share >= 0.8,
        })
    return sorted(result, key=lambda row: (-row["bus_factor_risk"], -row["total_churn"], row["directory"]))