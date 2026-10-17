from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest
from rest_framework.test import APIClient

from repositories.models import (
    FileOwnership,
    PullRequest,
    PullRequestFile,
    PRReview,
    Repository,
)
from repositories.services.pr_review import generate_ai_pr_review


@pytest.fixture
def repo(db):
    return Repository.objects.create(
        github_url="https://github.com/test-org/pr-test-repo",
        owner="test-org",
        name="pr-test-repo",
        status=Repository.Status.COMPLETE,
    )


@pytest.fixture
def sample_pr(repo):
    now = datetime.now(timezone.utc)
    pr = PullRequest.objects.create(
        repository=repo,
        pr_number=42,
        author_login="contributor-bob",
        state="open",
        created_at=now - timedelta(days=2),
    )
    PullRequestFile.objects.create(
        pull_request=pr,
        file_path="src/engine.py",
        status="modified",
        additions=15,
        deletions=3,
        patch="@@ -1,5 +1,15 @@\n+def optimized_query():\n+    return True\n",
    )
    PRReview.objects.create(
        pull_request=pr,
        reviewer_login="lead-alice",
        review_state="APPROVED",
    )
    FileOwnership.objects.create(
        repository=repo,
        file_path="src/engine.py",
        top_contributor="lead-alice",
        top_contributor_share=0.88,
        bus_factor_risk=True,
        total_churn=200,
    )
    return pr


@pytest.mark.django_db
def test_pull_requests_list_endpoint(repo, sample_pr):
    client = APIClient()
    response = client.get(f"/api/repositories/{repo.id}/pull-requests/")
    assert response.status_code == 200
    data = response.data
    assert "results" in data
    assert len(data["results"]) == 1
    item = data["results"][0]
    assert item["pr_number"] == 42
    assert item["author_login"] == "contributor-bob"
    assert item["state"] == "open"
    assert item["files_count"] == 1
    assert item["total_additions"] == 15
    assert item["total_deletions"] == 3


@pytest.mark.django_db
def test_pull_requests_filter_by_state(repo, sample_pr):
    client = APIClient()
    # Test matching filter
    res_open = client.get(f"/api/repositories/{repo.id}/pull-requests/?state=open")
    assert res_open.status_code == 200
    assert len(res_open.data["results"]) == 1

    # Test non-matching filter
    res_closed = client.get(f"/api/repositories/{repo.id}/pull-requests/?state=closed")
    assert res_closed.status_code == 200
    assert len(res_closed.data["results"]) == 0


@pytest.mark.django_db
def test_pull_request_detail_endpoint(repo, sample_pr):
    client = APIClient()
    response = client.get(f"/api/repositories/{repo.id}/pull-requests/42/")
    assert response.status_code == 200
    data = response.data
    assert data["pr_number"] == 42
    assert data["author_login"] == "contributor-bob"
    assert len(data["files"]) == 1
    assert data["files"][0]["file_path"] == "src/engine.py"
    assert "optimized_query" in data["files"][0]["patch"]
    assert len(data["reviews"]) == 1
    assert data["reviews"][0]["reviewer_login"] == "lead-alice"

    # Bus factor risk assessment
    assert len(data["risk_assessment"]) == 1
    risk = data["risk_assessment"][0]
    assert risk["file_path"] == "src/engine.py"
    assert risk["top_contributor"] == "lead-alice"
    assert risk["bus_factor_risk"] is True


@pytest.mark.django_db
def test_pull_request_not_found(repo):
    client = APIClient()
    response = client.get(f"/api/repositories/{repo.id}/pull-requests/99999/")
    assert response.status_code == 400 or response.status_code == 404


@pytest.mark.django_db
def test_generate_ai_pr_review_service(repo, sample_pr, settings):
    settings.GEMINI_API_KEY = "mock-key"
    settings.LLM_MODEL = "gemini-2.5-flash"

    mock_llm_text = (
        "### Summary of Changes\nOptimizes query execution in `src/engine.py`.\n\n"
        "### Risk Assessment\nNote: `src/engine.py` is predominantly authored by @lead-alice.\n\n"
        "[VERDICT: APPROVE]"
    )

    with patch("repositories.services.pr_review.call_gemini_llm", return_value=mock_llm_text):
        result = generate_ai_pr_review(sample_pr)

    assert result["pr_number"] == 42
    assert result["verdict"] == "APPROVE"
    assert result["model"] == "google/gemini-2.5-flash"
    assert result["files_analyzed"] == 1
    assert len(result["ownership_risks"]) == 1


@pytest.mark.django_db
def test_pr_ai_review_endpoint(repo, sample_pr):
    client = APIClient()
    mock_review_data = {
        "pr_number": 42,
        "verdict": "APPROVE",
        "review": "### Automated Code Review\nLooks good to merge.\n\n[VERDICT: APPROVE]",
        "model": "google/gemini-2.5-flash",
        "files_analyzed": 1,
        "total_additions": 15,
        "total_deletions": 3,
        "ownership_risks": [],
    }

    with patch("repositories.views.generate_ai_pr_review", return_value=mock_review_data):
        response = client.post(f"/api/repositories/{repo.id}/pull-requests/42/review/", data={})

    assert response.status_code == 200
    data = response.data
    assert data["verdict"] == "APPROVE"
    assert data["pr_number"] == 42
    assert "Automated Code Review" in data["review"]
