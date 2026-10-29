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


def directory_tree_hierarchy(
    repository: Repository,
    root_path: str = "",
    max_depth: int = 10,
    min_churn: int = 0,
) -> dict:
    """
    Build a nested hierarchical tree of directories and files for zoomable treemaps
    and interactive drill-down navigation.
    Computes churn, top contributors, bus-factor risk, and file counts at every level.
    """
    root_path = root_path.strip("/ ")
    max_depth = max(1, min(max_depth, 20))

    from repositories.models import FileOwnership
    ownership_map = {
        fo.file_path: fo
        for fo in FileOwnership.objects.filter(repository=repository)
    }

    rows = (
        CommitFile.objects.filter(commit__repository=repository)
        .select_related("commit")
        .values("file_path", "insertions", "deletions", "commit__author_name")
    )

    file_stats: dict[str, dict] = {}
    for r in rows:
        path = r["file_path"].strip("/")
        if not path:
            continue
        st = file_stats.setdefault(
            path,
            {
                "insertions": 0,
                "deletions": 0,
                "churn": 0,
                "authors": defaultdict(int),
                "commit_count": 0,
            },
        )
        insertions = max(0, r["insertions"])
        deletions = max(0, r["deletions"])
        churn = insertions + deletions
        if churn <= 0:
            churn = 1
        st["insertions"] += insertions
        st["deletions"] += deletions
        st["churn"] += churn
        author = r["commit__author_name"] or "unknown"
        st["authors"][author] += churn
        st["commit_count"] += 1

    for f_path, fo in ownership_map.items():
        clean_p = f_path.strip("/")
        if clean_p not in file_stats:
            file_stats[clean_p] = {
                "insertions": fo.total_churn,
                "deletions": 0,
                "churn": fo.total_churn,
                "authors": {fo.top_contributor: fo.total_churn},
                "commit_count": 1,
            }

    root_node = {
        "name": repository.name or "root",
        "path": "",
        "type": "directory",
        "insertions": 0,
        "deletions": 0,
        "total_churn": 0,
        "file_count": 0,
        "at_risk_file_count": 0,
        "top_contributor": "",
        "top_contributor_share": 0.0,
        "contributor_count": 0,
        "bus_factor_risk": False,
        "_authors": defaultdict(int),
        "_children": {},
    }

    for file_path, st in file_stats.items():
        if min_churn > 0 and st["churn"] < min_churn:
            continue

        parts = [p for p in file_path.split("/") if p]
        if not parts:
            continue

        fo = ownership_map.get(file_path)
        if fo:
            top_author = fo.top_contributor
            share = fo.top_contributor_share
            is_risk = fo.bus_factor_risk
            contrib_count = fo.contributor_count
            total_file_churn = fo.total_churn or st["churn"]
        else:
            sorted_authors = sorted(st["authors"].items(), key=lambda x: -x[1])
            top_author, top_churn = sorted_authors[0] if sorted_authors else ("unknown", 0)
            total_file_churn = st["churn"]
            share = round(top_churn / total_file_churn, 4) if total_file_churn > 0 else 0.0
            is_risk = share >= 0.8
            contrib_count = len(sorted_authors)

        curr = root_node
        accum_path = []
        for d in parts[:-1]:
            accum_path.append(d)
            dir_path = "/".join(accum_path)
            if d not in curr["_children"]:
                curr["_children"][d] = {
                    "name": d,
                    "path": dir_path,
                    "type": "directory",
                    "insertions": 0,
                    "deletions": 0,
                    "total_churn": 0,
                    "file_count": 0,
                    "at_risk_file_count": 0,
                    "top_contributor": "",
                    "top_contributor_share": 0.0,
                    "contributor_count": 0,
                    "bus_factor_risk": False,
                    "_authors": defaultdict(int),
                    "_children": {},
                }
            curr = curr["_children"][d]

        file_name = parts[-1]
        leaf = {
            "name": file_name,
            "path": file_path,
            "type": "file",
            "value": max(1, total_file_churn),
            "insertions": st["insertions"],
            "deletions": st["deletions"],
            "total_churn": total_file_churn,
            "file_count": 1,
            "at_risk_file_count": 1 if is_risk else 0,
            "top_contributor": top_author,
            "top_contributor_share": share,
            "contributor_count": contrib_count,
            "bus_factor_risk": is_risk,
            "commit_count": st["commit_count"],
        }
        curr["_children"][file_name] = leaf

    def rollup(node: dict) -> None:
        if node["type"] == "file":
            return

        total_churn = 0
        insertions = 0
        deletions = 0
        file_count = 0
        at_risk_file_count = 0
        authors = defaultdict(int)

        for child in node["_children"].values():
            if child["type"] == "directory":
                rollup(child)
                total_churn += child["total_churn"]
                insertions += child["insertions"]
                deletions += child["deletions"]
                file_count += child["file_count"]
                at_risk_file_count += child["at_risk_file_count"]
                for auth, val in child["_authors"].items():
                    authors[auth] += val
            else:
                total_churn += child["total_churn"]
                insertions += child["insertions"]
                deletions += child["deletions"]
                file_count += 1
                if child["bus_factor_risk"]:
                    at_risk_file_count += 1
                author = child.get("top_contributor") or "unknown"
                authors[author] += child["total_churn"]

        node["total_churn"] = total_churn
        node["value"] = max(1, total_churn)
        node["insertions"] = insertions
        node["deletions"] = deletions
        node["file_count"] = file_count
        node["at_risk_file_count"] = at_risk_file_count
        node["_authors"] = authors

        if authors and total_churn > 0:
            sorted_authors = sorted(authors.items(), key=lambda x: -x[1])
            top_author, top_churn = sorted_authors[0]
            share = round(top_churn / total_churn, 4)
            node["top_contributor"] = top_author
            node["top_contributor_share"] = share
            node["contributor_count"] = len(sorted_authors)
            node["bus_factor_risk"] = share >= 0.8
        else:
            node["top_contributor"] = "none"
            node["top_contributor_share"] = 0.0
            node["contributor_count"] = 0
            node["bus_factor_risk"] = False

    rollup(root_node)

    def finalize_node(node: dict, depth: int) -> dict:
        result = {
            "name": node["name"],
            "path": node["path"],
            "type": node["type"],
            "value": node.get("value", max(1, node.get("total_churn", 1))),
            "total_churn": node.get("total_churn", 0),
            "insertions": node.get("insertions", 0),
            "deletions": node.get("deletions", 0),
            "file_count": node.get("file_count", 1),
            "at_risk_file_count": node.get("at_risk_file_count", 0),
            "top_contributor": node.get("top_contributor", ""),
            "top_contributor_share": node.get("top_contributor_share", 0.0),
            "contributor_count": node.get("contributor_count", 0),
            "bus_factor_risk": node.get("bus_factor_risk", False),
        }
        if node["type"] == "file":
            result["commit_count"] = node.get("commit_count", 1)
            return result

        if depth >= max_depth:
            result["children"] = []
            return result

        children_list = []
        for child in node.get("_children", {}).values():
            children_list.append(finalize_node(child, depth + 1))

        children_list.sort(key=lambda c: (0 if c["type"] == "directory" else 1, -c["total_churn"], c["name"]))
        result["children"] = children_list
        return result

    target_node = root_node
    breadcrumbs = [{"name": repository.name or "root", "path": ""}]

    if root_path:
        curr = root_node
        accum = []
        for part in root_path.split("/"):
            if not part:
                continue
            accum.append(part)
            if "_children" in curr and part in curr["_children"]:
                curr = curr["_children"][part]
                breadcrumbs.append({"name": part, "path": "/".join(accum)})
            else:
                curr = None
                break
        if curr is not None:
            target_node = curr

    final_tree = finalize_node(target_node, 0)

    return {
        "tree": final_tree,
        "breadcrumbs": breadcrumbs,
        "summary": {
            "root_path": root_path,
            "total_files": root_node["file_count"],
            "at_risk_files": root_node["at_risk_file_count"],
            "total_churn": root_node["total_churn"],
            "risk_ratio": round(root_node["at_risk_file_count"] / max(1, root_node["file_count"]), 4),
        },
    }