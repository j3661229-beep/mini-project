import pytest
from datetime import datetime, timezone
from django.conf import settings
from unittest.mock import patch, MagicMock
from rest_framework.test import APIClient

from repositories.models import (
    Repository, Commit, SourceContent, SourceFile, 
    PullRequest, PullRequestFile
)
from repositories.services.git_ingest import ParsedCommit, ParsedCommitFile, ParsedSourceFile
from repositories.services.github_ingest import ParsedPullRequest, ParsedPullRequestFile
from repositories.tasks import _persist_new_commits, _upsert_pull_requests

@pytest.fixture
def repo():
    return Repository.objects.create(owner="test", name="repo", github_url="http://test")

@pytest.fixture
def client():
    return APIClient()

@pytest.mark.django_db
def test_new_source_file_is_persisted(repo):
    src = ParsedSourceFile(
        content="print('hello')", hash="abcd123", is_binary=False,
        is_skipped_size=False, size=14, status="A", language="python"
    )
    pf = ParsedCommitFile(file_path="main.py", insertions=1, deletions=0, source_file=src)
    pc = ParsedCommit(
        hash="commit1", author_name="author", author_email="e@e",
        committed_at=datetime.now(timezone.utc), parent_hashes=[],
        message="init", branch="main", files=[pf]
    )

    _persist_new_commits(repo, [pc], set())
    
    # Assert
    assert SourceContent.objects.count() == 1
    sc = SourceContent.objects.get(hash="abcd123")
    assert sc.content == "print('hello')"

    assert SourceFile.objects.count() == 1
    sf = SourceFile.objects.get(file_path="main.py")
    assert sf.source_content == sc
    assert sf.status == "A"
    assert sf.language == "python"

@pytest.mark.django_db
def test_deduplication_of_source_content(repo):
    src1 = ParsedSourceFile(content="hello", hash="hash1", is_binary=False, is_skipped_size=False, size=5, status="A")
    pf1 = ParsedCommitFile("file1.txt", 1, 0, src1)
    pc1 = ParsedCommit("commit1", "a", "a", datetime.now(timezone.utc), [], "msg1", "main", [pf1])

    # Exactly same content, different file path and commit
    src2 = ParsedSourceFile(content="hello", hash="hash1", is_binary=False, is_skipped_size=False, size=5, status="A")
    pf2 = ParsedCommitFile("file2.txt", 1, 0, src2)
    pc2 = ParsedCommit("commit2", "a", "a", datetime.now(timezone.utc), [], "msg2", "main", [pf2])

    _persist_new_commits(repo, [pc1, pc2], set())
    
    # Should only create 1 SourceContent, but 2 SourceFiles
    assert SourceContent.objects.count() == 1
    assert SourceFile.objects.count() == 2

@pytest.mark.django_db
def test_oversized_and_binary_files(repo):
    src_bin = ParsedSourceFile(content="", hash="", is_binary=True, is_skipped_size=False, size=1024, status="A")
    src_big = ParsedSourceFile(content="", hash="", is_binary=False, is_skipped_size=True, size=5000000, status="A")
    
    pf_bin = ParsedCommitFile("bin.exe", 0, 0, src_bin)
    pf_big = ParsedCommitFile("big.txt", 0, 0, src_big)
    
    pc = ParsedCommit("commit1", "a", "a", datetime.now(timezone.utc), [], "msg", "main", [pf_bin, pf_big])
    _persist_new_commits(repo, [pc], set())
    
    # Binary and Skipped files don't insert SourceContent if hash is empty (or they insert empty ones, depending on logic)
    # Our logic: if sf.hash is falsy, it might skip SourceContent creation.
    # Let's check SourceFile objects
    assert SourceFile.objects.count() == 2
    sf_bin = SourceFile.objects.get(file_path="bin.exe")
    assert sf_bin.source_content is None
    
    sf_big = SourceFile.objects.get(file_path="big.txt")
    assert sf_big.source_content is None

@pytest.mark.django_db
def test_pr_file_persistence(repo):
    pr_file = ParsedPullRequestFile(
        file_path="pr.txt", status="modified", additions=5, deletions=2,
        patch="diff --git", is_truncated=False
    )
    pr = ParsedPullRequest(
        pr_number=1, author_login="author", state="open",
        created_at=datetime.now(timezone.utc), merged_at=None,
        reviews=[], files=[pr_file]
    )
    
    _upsert_pull_requests(repo, [pr])
    
    assert PullRequestFile.objects.count() == 1
    prf = PullRequestFile.objects.get(file_path="pr.txt")
    assert prf.patch == "diff --git"
    assert prf.pull_request.pr_number == 1

@pytest.mark.django_db
def test_idempotent_source_storage(repo):
    src = ParsedSourceFile("hi", "hashx", False, False, 2, "A")
    pf = ParsedCommitFile("main.py", 1, 0, src)
    pc = ParsedCommit("commitX", "a", "a", datetime.now(timezone.utc), [], "msg", "main", [pf])

    _persist_new_commits(repo, [pc], set())
    assert SourceFile.objects.count() == 1

    # Run again, simulating incremental with same commit in parsed_commits but empty existing_hashes
    # (actually the real pipeline would populate existing_hashes)
    # But even if it bypasses existing_hashes, ignore_conflicts=True should prevent crashing.
    _persist_new_commits(repo, [pc], {"commitX"}) # properly simulate existing_hashes
    
    # Still 1
    assert SourceFile.objects.count() == 1

@pytest.mark.django_db
def test_source_api_endpoints(repo, client):
    src = ParsedSourceFile("print(1)", "h1", False, False, 8, "A")
    pf = ParsedCommitFile("main.py", 1, 0, src)
    pc = ParsedCommit("commit1", "a", "a", datetime.now(timezone.utc), [], "msg", "main", [pf])
    _persist_new_commits(repo, [pc], set())
    
    sf = SourceFile.objects.first()
    
    # test list (should not include content)
    resp = client.get(f"/api/repositories/{repo.id}/files/")
    assert resp.status_code == 200
    assert "content" not in resp.data["results"][0]
    
    # test detail (should include content)
    resp = client.get(f"/api/repositories/{repo.id}/files/{sf.id}/")
    assert resp.status_code == 200
    assert resp.data["content"] == "print(1)"
    
    # test commits route
    resp = client.get(f"/api/repositories/{repo.id}/commits/commit1/files/")
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
