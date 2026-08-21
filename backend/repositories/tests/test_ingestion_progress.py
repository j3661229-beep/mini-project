from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from repositories.models import Repository
from repositories.tasks import _update_ingestion


@pytest.mark.django_db
def test_status_endpoint_exposes_persisted_ingestion_progress():
    repo = Repository.objects.create(
        github_url="https://github.com/example/progress-repo",
        owner="example",
        name="progress-repo",
        status=Repository.Status.PROCESSING,
        ingestion_stage="queued",
    )

    _update_ingestion(
        repo,
        stage="commits",
        processed=25,
        total=100,
        detail="Parsing commit history.",
    )

    response = APIClient().get(f"/api/repositories/{repo.id}/status/")

    assert response.status_code == 200
    assert response.data["ingestion_stage"] == "commits"
    assert response.data["ingestion_progress"] == {
        "processed": 25,
        "total": 100,
        "detail": "Parsing commit history.",
    }
    assert response.data["ingestion_stage_started_at"] is not None
    assert response.data["ingestion_heartbeat_at"] is not None


@pytest.mark.django_db
def test_stage_transition_resets_previous_work_units():
    repo = Repository.objects.create(
        github_url="https://github.com/example/transition-repo",
        owner="example",
        name="transition-repo",
        status=Repository.Status.PROCESSING,
        ingestion_stage="queued",
    )

    _update_ingestion(repo, stage="commits", processed=100, total=100, detail="Commit history persisted.")
    _update_ingestion(repo, stage="ownership", total=400, detail="Calculating ownership and bus-factor risk.")
    repo.refresh_from_db()

    assert repo.ingestion_stage == "ownership"
    assert repo.ingestion_progress == {
        "total": 400,
        "detail": "Calculating ownership and bus-factor risk.",
    }