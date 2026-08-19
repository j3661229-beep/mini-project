from datetime import datetime, timedelta, timezone

import pytest
from rest_framework.test import APIClient

from repositories.models import Commit, CommitFile, Repository


@pytest.fixture
def repo(db):
    return Repository.objects.create(owner="example", name="analytics", github_url="https://github.com/example/analytics")


def add_commit(repo, suffix, author, when, path, insertions=5, deletions=1):
    commit = Commit.objects.create(
        repository=repo, hash=f"{suffix:0>40}", author_name=author,
        author_email=f"{author}@example.test", committed_at=when, message="change", branch="main",
    )
    CommitFile.objects.create(commit=commit, file_path=path, insertions=insertions, deletions=deletions)


@pytest.mark.django_db
def test_activity_endpoint_aggregates_real_commit_history(repo):
    now = datetime.now(timezone.utc)
    add_commit(repo, "1", "alice", now - timedelta(days=2), "src/api/views.py")
    add_commit(repo, "2", "bob", now - timedelta(days=2), "src/api/models.py")
    add_commit(repo, "3", "alice", now, "docs/readme.md")

    response = APIClient().get(f"/api/repositories/{repo.id}/activity/?days=7")

    assert response.status_code == 200
    assert response.data["total_commits"] == 3
    assert response.data["active_days"] == 2
    assert response.data["peak_commits"] == 2
    assert response.data["contributors"][0] == {"author_name": "alice", "commits": 2}


@pytest.mark.django_db
def test_activity_endpoint_supports_real_contributor_filter(repo):
    now = datetime.now(timezone.utc)
    add_commit(repo, "1", "alice", now, "src/a.py")
    add_commit(repo, "2", "bob", now, "src/b.py")

    response = APIClient().get(f"/api/repositories/{repo.id}/activity/?days=30&contributor=alice")

    assert response.status_code == 200
    assert response.data["total_commits"] == 1
    assert response.data["contributors"] == [{"author_name": "alice", "commits": 1}]


@pytest.mark.django_db
def test_directory_ownership_rolls_up_subdirectories_from_commit_churn(repo):
    now = datetime.now(timezone.utc)
    add_commit(repo, "1", "alice", now, "src/api/views.py", 18, 2)
    add_commit(repo, "2", "alice", now, "src/api/models.py", 8, 2)
    add_commit(repo, "3", "bob", now, "src/api/models.py", 1, 1)
    add_commit(repo, "4", "bob", now, "docs/readme.md", 4, 0)

    response = APIClient().get(f"/api/repositories/{repo.id}/directory-ownership/?depth=1")

    assert response.status_code == 200
    src = next(row for row in response.data["results"] if row["directory"] == "src")
    assert src["top_contributor"] == "alice"
    assert src["affected_file_count"] == 2
    assert src["total_churn"] == 32
    assert src["bus_factor_risk"] is True


@pytest.mark.django_db
def test_directory_ownership_respects_requested_depth(repo):
    add_commit(repo, "1", "alice", datetime.now(timezone.utc), "src/api/views.py")

    response = APIClient().get(f"/api/repositories/{repo.id}/directory-ownership/?depth=2")

    assert response.status_code == 200
    assert response.data["results"][0]["directory"] == "src/api"