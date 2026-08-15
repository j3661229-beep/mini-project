"""
Comprehensive tests for the non-destructive incremental ingestion pipeline.

All tests mock clone_and_parse and fetch_pull_requests to avoid network/Git calls.
Uses Django's test database (SQLite in-memory via pytest-django).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone as dj_tz

from repositories.models import (
    Commit,
    CommitFile,
    FileOwnership,
    PRReview,
    PullRequest,
    Repository,
)
from repositories.services.git_ingest import CloneResult, ParsedCommit, ParsedCommitFile
from repositories.services.github_ingest import ParsedPullRequest, ParsedReview
from repositories.tasks import (
    _acquire_lock,
    _persist_new_commits,
    _release_lock,
    _run_analysis,
    _upsert_pull_requests,
    ingest_repository,
)

# ─── Fixtures ────────────────────────────────────────────────────────────────

DT_1 = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
DT_2 = datetime(2024, 1, 2, 12, 0, tzinfo=timezone.utc)
DT_3 = datetime(2024, 1, 3, 12, 0, tzinfo=timezone.utc)


def _make_clone_result(commits: list[ParsedCommit], cap_reached: bool = False):
    return CloneResult(
        commits=commits,
        cap_reached=cap_reached,
        clone_path=Path("/tmp/fake_clone"),
    )


def _commit(
    hash: str,
    author: str = "alice",
    dt: datetime = DT_1,
    parents: list[str] | None = None,
    files: list[ParsedCommitFile] | None = None,
) -> ParsedCommit:
    return ParsedCommit(
        hash=hash,
        author_name=author,
        author_email=f"{author}@test.com",
        committed_at=dt,
        parent_hashes=parents or [],
        message=f"commit {hash}",
        branch="main",
        files=files or [],
    )


def _file(path: str, ins: int = 10, dels: int = 2) -> ParsedCommitFile:
    return ParsedCommitFile(file_path=path, insertions=ins, deletions=dels)


def _pr(
    number: int,
    author: str = "alice",
    state: str = "merged",
    reviews: list[ParsedReview] | None = None,
) -> ParsedPullRequest:
    return ParsedPullRequest(
        pr_number=number,
        author_login=author,
        state=state,
        created_at=DT_1,
        merged_at=DT_2 if state == "merged" else None,
        reviews=reviews or [],
    )


def _review(
    reviewer: str, state: str = "approved", review_id: int | None = None
) -> ParsedReview:
    return ParsedReview(
        reviewer_login=reviewer,
        review_state=state,
        github_review_id=review_id,
    )


@pytest.fixture
def repo(db):
    return Repository.objects.create(
        github_url="https://github.com/test/repo",
        owner="test",
        name="repo",
        status=Repository.Status.PENDING,
    )


# ─── A. First Ingestion ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestFirstIngestion:
    """Repository starts empty — commits, files, PRs, reviews are inserted."""

    def test_first_ingestion_creates_all_data(self, repo):
        commits = [
            _commit("aaa", files=[_file("src/a.py"), _file("src/b.py")]),
            _commit("bbb", author="bob", dt=DT_2, parents=["aaa"], files=[_file("src/a.py", 5, 1)]),
        ]
        prs = [
            _pr(1, reviews=[_review("bob", "approved", review_id=101)]),
        ]
        clone_result = _make_clone_result(commits)

        with patch("repositories.tasks.clone_and_parse", return_value=clone_result):
            with patch("repositories.tasks.fetch_pull_requests", return_value=prs):
                with patch("repositories.tasks.cleanup_clone"):
                    result = ingest_repository.run(repo.id)

        assert result["ok"] is True

        repo.refresh_from_db()
        assert repo.status == Repository.Status.COMPLETE

        # Commits
        assert Commit.objects.filter(repository=repo).count() == 2
        assert set(Commit.objects.filter(repository=repo).values_list("hash", flat=True)) == {"aaa", "bbb"}

        # CommitFiles
        assert CommitFile.objects.filter(commit__repository=repo).count() == 3

        # PRs
        assert PullRequest.objects.filter(repository=repo).count() == 1
        pr = PullRequest.objects.get(repository=repo, pr_number=1)
        assert pr.state == "merged"

        # Reviews
        assert PRReview.objects.filter(pull_request=pr).count() == 1
        review = PRReview.objects.get(pull_request=pr)
        assert review.reviewer_login == "bob"
        assert review.github_review_id == 101

        # Ownership was computed
        assert FileOwnership.objects.filter(repository=repo).count() > 0


# ─── B. Second Ingestion With No Changes ─────────────────────────────────────


@pytest.mark.django_db
class TestIdempotentReIngestion:
    """Running ingestion twice with identical data produces no duplicates."""

    def test_no_duplicates_on_reingestion(self, repo):
        commits = [
            _commit("aaa", files=[_file("src/a.py")]),
        ]
        prs = [
            _pr(1, reviews=[_review("bob", "approved", review_id=101)]),
        ]
        clone_result = _make_clone_result(commits)

        for _ in range(2):
            with patch("repositories.tasks.clone_and_parse", return_value=clone_result):
                with patch("repositories.tasks.fetch_pull_requests", return_value=prs):
                    with patch("repositories.tasks.cleanup_clone"):
                        result = ingest_repository.run(repo.id)

            assert result["ok"] is True

        # Exactly 1 commit, 1 file, 1 PR, 1 review
        assert Commit.objects.filter(repository=repo).count() == 1
        assert CommitFile.objects.filter(commit__repository=repo).count() == 1
        assert PullRequest.objects.filter(repository=repo).count() == 1
        assert PRReview.objects.filter(pull_request__repository=repo).count() == 1


# ─── C. Incremental Ingestion ────────────────────────────────────────────────


@pytest.mark.django_db
class TestIncrementalIngestion:
    """New commits are added; old commits and files are preserved."""

    def test_only_new_data_added(self, repo):
        # First ingestion: 1 commit
        commits_v1 = [_commit("aaa", files=[_file("src/a.py")])]
        clone_v1 = _make_clone_result(commits_v1)

        with patch("repositories.tasks.clone_and_parse", return_value=clone_v1):
            with patch("repositories.tasks.fetch_pull_requests", return_value=[]):
                with patch("repositories.tasks.cleanup_clone"):
                    ingest_repository.run(repo.id)

        assert Commit.objects.filter(repository=repo).count() == 1
        assert CommitFile.objects.filter(commit__repository=repo).count() == 1
        old_commit_id = Commit.objects.get(repository=repo, hash="aaa").id

        # Second ingestion: returns old commit + 1 new commit
        commits_v2 = [
            _commit("aaa"),  # old — files will be empty because existing_hashes
            _commit("bbb", author="bob", dt=DT_2, parents=["aaa"], files=[_file("src/b.py")]),
        ]
        clone_v2 = _make_clone_result(commits_v2)

        with patch("repositories.tasks.clone_and_parse", return_value=clone_v2):
            with patch("repositories.tasks.fetch_pull_requests", return_value=[]):
                with patch("repositories.tasks.cleanup_clone"):
                    ingest_repository.run(repo.id)

        # 2 commits total
        assert Commit.objects.filter(repository=repo).count() == 2

        # Old commit preserved with same PK
        assert Commit.objects.filter(repository=repo, hash="aaa", id=old_commit_id).exists()

        # Old file still exists
        assert CommitFile.objects.filter(commit__repository=repo, commit__hash="aaa").count() == 1

        # New file added
        assert CommitFile.objects.filter(commit__repository=repo, commit__hash="bbb").count() == 1

        # Total files: 2
        assert CommitFile.objects.filter(commit__repository=repo).count() == 2


# ─── D. Failed Ingestion ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestFailedIngestion:
    """Clone failure must not destroy existing data."""

    def test_clone_failure_preserves_data(self, repo):
        # First: successful ingestion
        commits = [_commit("aaa", files=[_file("src/a.py")])]
        clone_result = _make_clone_result(commits)

        with patch("repositories.tasks.clone_and_parse", return_value=clone_result):
            with patch("repositories.tasks.fetch_pull_requests", return_value=[]):
                with patch("repositories.tasks.cleanup_clone"):
                    ingest_repository.run(repo.id)

        assert Commit.objects.filter(repository=repo).count() == 1

        # Second: clone fails — in eager Celery mode, retry() re-raises,
        # so we catch the exception and verify data preservation.
        with patch("repositories.tasks.clone_and_parse", side_effect=RuntimeError("clone failed")):
            with patch("repositories.tasks.cleanup_clone"):
                try:
                    ingest_repository.run(repo.id)
                except RuntimeError:
                    pass  # Expected in eager Celery mode

        repo.refresh_from_db()
        assert repo.status == Repository.Status.FAILED

        # Data is preserved — this is the critical assertion
        assert Commit.objects.filter(repository=repo).count() == 1
        assert CommitFile.objects.filter(commit__repository=repo).count() == 1


# ─── E. Failed Analysis ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestFailedAnalysis:
    """If analysis fails, previously valid ownership data must not be destroyed."""

    def test_analysis_failure_preserves_ownership(self, repo):
        # First: successful ingestion with ownership
        commits = [_commit("aaa", files=[_file("src/a.py")])]
        clone_result = _make_clone_result(commits)

        with patch("repositories.tasks.clone_and_parse", return_value=clone_result):
            with patch("repositories.tasks.fetch_pull_requests", return_value=[]):
                with patch("repositories.tasks.cleanup_clone"):
                    ingest_repository.run(repo.id)

        assert FileOwnership.objects.filter(repository=repo).count() > 0
        old_ownership_count = FileOwnership.objects.filter(repository=repo).count()

        # Second: clone succeeds but analysis blows up
        commits_v2 = [
            _commit("aaa"),
            _commit("bbb", dt=DT_2, parents=["aaa"], files=[_file("src/b.py")]),
        ]
        clone_v2 = _make_clone_result(commits_v2)

        with patch("repositories.tasks.clone_and_parse", return_value=clone_v2):
            with patch("repositories.tasks.fetch_pull_requests", return_value=[]):
                with patch("repositories.tasks.cleanup_clone"):
                    with patch(
                        "repositories.tasks.compute_file_ownership",
                        side_effect=RuntimeError("analysis exploded"),
                    ):
                        try:
                            ingest_repository.run(repo.id)
                        except RuntimeError:
                            pass  # Expected in eager Celery mode

        repo.refresh_from_db()
        assert repo.status == Repository.Status.FAILED

        # Ownership data from the FIRST successful ingestion is preserved
        assert FileOwnership.objects.filter(repository=repo).count() == old_ownership_count


# ─── F. Concurrent Ingestion ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestConcurrentIngestion:
    """Two ingestion attempts for the same repo cannot run simultaneously."""

    def test_lock_blocks_concurrent_ingestion(self, repo):
        # Simulate: first worker acquires lock
        assert _acquire_lock(repo.id) is True

        # Second worker cannot acquire lock
        assert _acquire_lock(repo.id) is False

        # Release lock
        _release_lock(repo.id)

        # Now it can be acquired again
        assert _acquire_lock(repo.id) is True
        _release_lock(repo.id)

    def test_stale_lock_is_reclaimed(self, repo):
        # Simulate a stale lock from 31 minutes ago
        stale_time = dj_tz.now() - timedelta(minutes=31)
        Repository.objects.filter(pk=repo.id).update(ingestion_locked_at=stale_time)

        # A new worker can acquire the lock because the old one is stale
        assert _acquire_lock(repo.id) is True
        _release_lock(repo.id)

    def test_concurrent_task_returns_error(self, repo):
        # Acquire the lock before calling the task
        assert _acquire_lock(repo.id) is True

        # Task should exit early without touching data
        result = ingest_repository.run(repo.id)
        assert result["ok"] is False
        assert result["error"] == "ingestion_already_running"

        # Release lock
        _release_lock(repo.id)


# ─── G. PR Updates ───────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestPRUpdates:
    """Existing PR changes state — updated in place, not duplicated."""

    def test_pr_state_update(self, repo):
        # First ingestion: PR is open
        prs_v1 = [_pr(42, state="open")]

        _upsert_pull_requests(repo, prs_v1)

        assert PullRequest.objects.filter(repository=repo).count() == 1
        pr = PullRequest.objects.get(repository=repo, pr_number=42)
        assert pr.state == "open"
        original_pk = pr.pk

        # Second ingestion: same PR is now merged
        prs_v2 = [_pr(42, state="merged")]
        _upsert_pull_requests(repo, prs_v2)

        assert PullRequest.objects.filter(repository=repo).count() == 1
        pr.refresh_from_db()
        assert pr.state == "merged"
        assert pr.pk == original_pk  # Same row, updated in place

    def test_review_state_update(self, repo):
        """Review changes from changes_requested to approved — updated, not duplicated."""
        prs = [_pr(10, reviews=[_review("carol", "changes_requested", review_id=200)])]
        _upsert_pull_requests(repo, prs)

        assert PRReview.objects.filter(pull_request__repository=repo).count() == 1
        review = PRReview.objects.get(github_review_id=200)
        assert review.review_state == "changes_requested"

        # Same review ID, new state
        prs_v2 = [_pr(10, reviews=[_review("carol", "approved", review_id=200)])]
        _upsert_pull_requests(repo, prs_v2)

        assert PRReview.objects.filter(pull_request__repository=repo).count() == 1
        review.refresh_from_db()
        assert review.review_state == "approved"


# ─── H. Duplicate Prevention ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestDuplicatePrevention:
    """Unique constraints prevent duplicate commits, PRs, and reviews."""

    def test_duplicate_commits_prevented(self, repo):
        """bulk_create with ignore_conflicts=True skips duplicates."""
        commits = [_commit("aaa", files=[_file("src/a.py")])]
        _persist_new_commits(repo, commits, set())

        # Try to insert the same commit again
        _persist_new_commits(repo, commits, set())

        assert Commit.objects.filter(repository=repo).count() == 1

    def test_duplicate_prs_prevented(self, repo):
        prs = [_pr(1)]
        _upsert_pull_requests(repo, prs)
        _upsert_pull_requests(repo, prs)

        assert PullRequest.objects.filter(repository=repo).count() == 1

    def test_duplicate_reviews_prevented(self, repo):
        prs = [_pr(1, reviews=[_review("bob", "approved", review_id=101)])]
        _upsert_pull_requests(repo, prs)
        _upsert_pull_requests(repo, prs)

        assert PRReview.objects.filter(pull_request__repository=repo).count() == 1

    def test_persist_new_commits_with_existing_hashes_skips(self, repo):
        """When existing_hashes is provided, those commits are skipped entirely."""
        commits = [
            _commit("aaa", files=[_file("src/a.py")]),
            _commit("bbb", files=[_file("src/b.py")]),
        ]
        # First: insert both
        _persist_new_commits(repo, commits, set())
        assert Commit.objects.filter(repository=repo).count() == 2

        # Second: "aaa" is existing, only "ccc" is new
        commits_v2 = [
            _commit("aaa"),
            _commit("ccc", dt=DT_3, files=[_file("src/c.py")]),
        ]
        _persist_new_commits(repo, commits_v2, {"aaa", "bbb"})

        assert Commit.objects.filter(repository=repo).count() == 3
        # "aaa" files untouched (1 file), "ccc" has 1 file
        assert CommitFile.objects.filter(commit__hash="aaa").count() == 1
        assert CommitFile.objects.filter(commit__hash="ccc").count() == 1

    def test_analysis_is_atomic_refresh(self, repo):
        """Ownership is atomically replaced — old rows are cleaned up."""
        # Create a commit and initial ownership
        commits = [_commit("aaa", files=[_file("src/a.py")])]
        _persist_new_commits(repo, commits, set())
        _run_analysis(repo)

        assert FileOwnership.objects.filter(repository=repo).count() == 1
        old_path = FileOwnership.objects.get(repository=repo).file_path
        assert old_path == "src/a.py"

        # Add a second commit touching a different file
        commits_v2 = [_commit("bbb", dt=DT_2, files=[_file("src/b.py")])]
        _persist_new_commits(repo, commits_v2, {"aaa"})
        _run_analysis(repo)

        # Both files now have ownership rows
        assert FileOwnership.objects.filter(repository=repo).count() == 2
        paths = set(FileOwnership.objects.filter(repository=repo).values_list("file_path", flat=True))
        assert paths == {"src/a.py", "src/b.py"}
