"""Heuristic change-risk prediction from stored ownership, churn, and security data."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from repositories.models import (
    CommitFile,
    FileOwnership,
    PullRequest,
    PullRequestFile,
    SecurityFinding,
)


SEVERITY_WEIGHT = {
    "critical": 1.0,
    "high": 0.75,
    "medium": 0.45,
    "low": 0.2,
    "info": 0.05,
}


@dataclass
class FileRisk:
    file_path: str
    risk_score: float
    risk_level: str
    reasons: list[str]
    top_contributor: str
    top_contributor_share: float
    total_churn: int
    security_count: int
    recent_commits: int


def _level(score: float) -> str:
    if score >= 0.75:
        return "critical"
    if score >= 0.55:
        return "high"
    if score >= 0.35:
        return "medium"
    if score >= 0.15:
        return "low"
    return "info"


def predict_file_risks(repo, limit: int = 100) -> list[FileRisk]:
    ownership = {
        row.file_path: row
        for row in FileOwnership.objects.filter(repository=repo)
    }
    if not ownership:
        return []

    max_churn = max((o.total_churn for o in ownership.values()), default=1) or 1

    since = timezone.now() - timedelta(days=90)
    recent_counts: dict[str, int] = defaultdict(int)
    for path, cnt in (
        CommitFile.objects.filter(
            commit__repository=repo,
            commit__committed_at__gte=since,
        )
        .values("file_path")
        .annotate(c=Count("id"))
        .values_list("file_path", "c")
    ):
        recent_counts[path] = cnt
    max_recent = max(recent_counts.values(), default=1) or 1

    security_by_file: dict[str, list[SecurityFinding]] = defaultdict(list)
    for finding in SecurityFinding.objects.filter(repository=repo):
        security_by_file[finding.file_path].append(finding)

    risks: list[FileRisk] = []
    for path, own in ownership.items():
        reasons: list[str] = []
        score = 0.0

        ownership_component = own.top_contributor_share if own.bus_factor_risk else own.top_contributor_share * 0.35
        score += 0.35 * ownership_component
        if own.bus_factor_risk:
            reasons.append(
                f"Bus-factor risk: {own.top_contributor} owns {own.top_contributor_share:.0%} of churn"
            )
        elif own.top_contributor_share >= 0.6:
            reasons.append(
                f"Concentrated ownership ({own.top_contributor_share:.0%} by {own.top_contributor})"
            )

        churn_norm = min(own.total_churn / max_churn, 1.0)
        score += 0.25 * churn_norm
        if churn_norm >= 0.6:
            reasons.append(f"High historical churn ({own.total_churn} lines)")

        recent = recent_counts.get(path, 0)
        recent_norm = min(recent / max_recent, 1.0)
        score += 0.2 * recent_norm
        if recent >= 5:
            reasons.append(f"Frequently changed recently ({recent} commits / 90d)")

        secs = security_by_file.get(path, [])
        if secs:
            sec_score = min(sum(SEVERITY_WEIGHT.get(s.severity, 0.2) for s in secs) / 2.0, 1.0)
            score += 0.2 * sec_score
            top = max(secs, key=lambda s: SEVERITY_WEIGHT.get(s.severity, 0))
            reasons.append(f"{len(secs)} security finding(s), worst={top.severity} ({top.title})")

        # Hotspot paths
        lowered = path.lower()
        if any(tok in lowered for tok in ("auth", "payment", "billing", "crypto", "password", "token", "secret")):
            score = min(score + 0.08, 1.0)
            reasons.append("Sensitive path keyword (auth/payment/secret area)")

        if not reasons:
            continue

        risks.append(
            FileRisk(
                file_path=path,
                risk_score=round(min(score, 1.0), 4),
                risk_level=_level(score),
                reasons=reasons,
                top_contributor=own.top_contributor,
                top_contributor_share=own.top_contributor_share,
                total_churn=own.total_churn,
                security_count=len(secs),
                recent_commits=recent,
            )
        )

    risks.sort(key=lambda r: (-r.risk_score, r.file_path))
    return risks[:limit]


def predict_pr_risks(repo, limit: int = 30) -> list[dict]:
    """Score recent PRs by touched-file risk + size."""
    file_risks = {r.file_path: r for r in predict_file_risks(repo, limit=500)}
    prs = (
        PullRequest.objects.filter(repository=repo)
        .order_by("-created_at")[:80]
    )
    results: list[dict] = []
    for pr in prs:
        files = list(PullRequestFile.objects.filter(pull_request=pr))
        if not files:
            continue
        additions = sum(f.additions for f in files)
        deletions = sum(f.deletions for f in files)
        paths = [f.file_path for f in files]
        touched_risks = [file_risks[p] for p in paths if p in file_risks]
        avg_file_risk = (
            sum(r.risk_score for r in touched_risks) / len(touched_risks)
            if touched_risks
            else 0.15
        )
        size_score = min((additions + deletions) / 800.0, 1.0)
        breadth_score = min(len(files) / 25.0, 1.0)
        score = min(0.55 * avg_file_risk + 0.25 * size_score + 0.2 * breadth_score, 1.0)
        reasons = []
        if touched_risks:
            top = max(touched_risks, key=lambda r: r.risk_score)
            reasons.append(f"Touches risky file {top.file_path} (score {top.risk_score:.2f})")
        if additions + deletions >= 400:
            reasons.append(f"Large diff (+{additions}/-{deletions})")
        if len(files) >= 12:
            reasons.append(f"Wide blast radius ({len(files)} files)")
        if not reasons:
            reasons.append("Moderate change footprint")
        results.append(
            {
                "pr_number": pr.pr_number,
                "author_login": pr.author_login,
                "state": pr.state,
                "title_hint": f"PR #{pr.pr_number} by {pr.author_login}",
                "files_changed": len(files),
                "additions": additions,
                "deletions": deletions,
                "risk_score": round(score, 4),
                "risk_level": _level(score),
                "reasons": reasons,
            }
        )

    results.sort(key=lambda r: (-r["risk_score"], -r["pr_number"]))
    return results[:limit]


def build_risk_prediction(repo) -> dict:
    files = predict_file_risks(repo)
    prs = predict_pr_risks(repo)
    by_level = defaultdict(int)
    for f in files:
        by_level[f.risk_level] += 1

    overall = 0.0
    if files:
        # Emphasize the worst files
        top = files[:10]
        overall = sum(f.risk_score for f in top) / len(top)

    return {
        "overall_risk_score": round(overall, 4),
        "overall_risk_level": _level(overall),
        "summary": {
            "files_scored": len(files),
            "critical_files": by_level["critical"],
            "high_files": by_level["high"],
            "medium_files": by_level["medium"],
            "prs_scored": len(prs),
            "high_risk_prs": sum(1 for p in prs if p["risk_level"] in ("critical", "high")),
        },
        "risky_files": [
            {
                "file_path": f.file_path,
                "risk_score": f.risk_score,
                "risk_level": f.risk_level,
                "reasons": f.reasons,
                "top_contributor": f.top_contributor,
                "top_contributor_share": f.top_contributor_share,
                "total_churn": f.total_churn,
                "security_count": f.security_count,
                "recent_commits": f.recent_commits,
            }
            for f in files
        ],
        "risky_pull_requests": prs,
        "method": (
            "Heuristic ensemble over bus-factor ownership, churn intensity, "
            "recent change frequency, security findings, and PR blast radius. "
            "Not a trained ML model — interpretable risk scoring for triage."
        ),
    }
