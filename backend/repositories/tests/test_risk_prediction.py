from datetime import timedelta

import pytest
from django.utils import timezone

from repositories.models import (
    Commit,
    CommitFile,
    FileOwnership,
    Repository,
    SecurityFinding,
)
from repositories.services.risk_prediction import build_risk_prediction, predict_file_risks


@pytest.mark.django_db
def test_bus_factor_and_security_raise_file_risk():
    repo = Repository.objects.create(
        github_url="https://github.com/example/risk-demo",
        owner="example",
        name="risk-demo",
        status=Repository.Status.COMPLETE,
    )
    FileOwnership.objects.create(
        repository=repo,
        file_path="auth/login.py",
        top_contributor="alice",
        top_contributor_share=0.95,
        bus_factor_risk=True,
        contributor_count=1,
        total_churn=500,
    )
    FileOwnership.objects.create(
        repository=repo,
        file_path="readme.md",
        top_contributor="bob",
        top_contributor_share=0.4,
        bus_factor_risk=False,
        contributor_count=3,
        total_churn=10,
    )
    SecurityFinding.objects.create(
        repository=repo,
        file_path="auth/login.py",
        category="secret",
        severity="critical",
        rule_id="secret.test",
        title="Hard-coded secret",
        description="test",
        line_number=1,
        evidence="api_key=***",
    )
    commit = Commit.objects.create(
        repository=repo,
        hash="a" * 40,
        author_name="alice",
        author_email="a@x.com",
        committed_at=timezone.now() - timedelta(days=2),
        parent_hashes=[],
        message="touch auth",
    )
    CommitFile.objects.create(
        commit=commit, file_path="auth/login.py", insertions=20, deletions=5
    )

    risks = {r.file_path: r for r in predict_file_risks(repo)}
    assert "auth/login.py" in risks
    assert "readme.md" not in risks  # low-signal files are omitted
    assert risks["auth/login.py"].risk_level in ("high", "critical")
    assert any("Bus-factor" in reason for reason in risks["auth/login.py"].reasons)

    payload = build_risk_prediction(repo)
    assert payload["summary"]["files_scored"] >= 1
    assert payload["overall_risk_score"] > 0
