"""Persist repository security scan results from stored source content."""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import Max

from repositories.models import SecurityFinding, SourceFile
from repositories.services.security_scan import scan_text, should_skip_path

logger = logging.getLogger(__name__)

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def scan_and_persist_security(repo) -> list[SecurityFinding]:
    """
    Scan unique latest SourceFiles for a repository and replace stored findings.
    Uses one representative file row per path (highest id = newest ingest).
    """
    latest_ids = (
        SourceFile.objects.filter(
            repository=repo,
            source_content__isnull=False,
            source_content__is_binary=False,
            source_content__is_skipped_size=False,
        )
        .values("file_path")
        .annotate(latest_id=Max("id"))
        .values_list("latest_id", flat=True)
    )

    files = (
        SourceFile.objects.filter(id__in=latest_ids)
        .select_related("source_content")
        .order_by("file_path")
    )

    rows: list[SecurityFinding] = []
    scanned = 0
    for sf in files:
        if should_skip_path(sf.file_path):
            continue
        content = sf.source_content.content if sf.source_content_id else ""
        if not content:
            continue
        scanned += 1
        for finding in scan_text(content, sf.file_path):
            rows.append(
                SecurityFinding(
                    repository=repo,
                    source_file=sf,
                    file_path=sf.file_path[:1000],
                    category=finding.category,
                    severity=finding.severity,
                    rule_id=finding.rule_id[:100],
                    title=finding.title[:255],
                    description=finding.description,
                    line_number=finding.line_number,
                    evidence=finding.evidence[:300],
                )
            )

    with transaction.atomic():
        SecurityFinding.objects.filter(repository=repo).delete()
        if rows:
            SecurityFinding.objects.bulk_create(rows, batch_size=500)

    logger.info(
        "Security scan for %s: scanned %s files, %s findings",
        repo,
        scanned,
        len(rows),
    )
    return list(SecurityFinding.objects.filter(repository=repo))


def security_summary(findings: list[SecurityFinding] | None, repo=None) -> dict:
    qs = findings
    if qs is None:
        qs = list(SecurityFinding.objects.filter(repository=repo))

    by_severity = {k: 0 for k in SEVERITY_ORDER}
    by_category = {"secret": 0, "vulnerability": 0, "misconfig": 0}
    for f in qs:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_category[f.category] = by_category.get(f.category, 0) + 1

    return {
        "total_findings": len(qs),
        "by_severity": by_severity,
        "by_category": by_category,
        "files_affected": len({f.file_path for f in qs}),
    }
