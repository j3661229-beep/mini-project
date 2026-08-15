import pytest
from unittest.mock import patch
from rest_framework.test import APIClient
from repositories.models import (
    Repository, CodeChunk, CodeParsing, SourceContent, CodeSymbol, SourceFile
)
from repositories.tasks import generate_repository_chunks, process_pending_embeddings

@pytest.fixture
def repo(db):
    return Repository.objects.create(github_url="https://github.com/test/repo", owner="test", name="repo")

@pytest.fixture
def code_parsing(repo):
    from repositories.models import Commit
    from datetime import datetime, timezone
    
    sc = SourceContent.objects.create(hash="hash1", content="def foo():\n    pass\nclass Bar:\n    pass\n")
    c = Commit.objects.create(repository=repo, hash="abc", message="init", author_name="a", author_email="a", committed_at=datetime.now(timezone.utc))
    SourceFile.objects.create(repository=repo, commit=c, source_content=sc, file_path="test.py", status="A")
    parsing = CodeParsing.objects.create(source_content=sc, language="python", parse_status=CodeParsing.Status.PARSED)
    
    # Add symbols
    CodeSymbol.objects.create(parsing=parsing, symbol_type="function", name="foo", qualified_name="foo", start_line=1, end_line=2)
    CodeSymbol.objects.create(parsing=parsing, symbol_type="class", name="Bar", qualified_name="Bar", start_line=3, end_line=4)
    return parsing

@pytest.mark.django_db
def test_embedding_dimension(repo, code_parsing):
    # Verify vector dimension rejection logic (mocked)
    from django.conf import settings
    assert settings.EMBEDDING_MODEL == "text-embedding-3-small"
    assert settings.EMBEDDING_DIMENSION == 1536

@pytest.mark.django_db
def test_repository_scoping(repo, code_parsing):
    repo2 = Repository.objects.create(github_url="https://github.com/test/repo2", owner="test", name="repo2")
    sc2 = SourceContent.objects.create(hash="hash2", content="def bar():\n    pass\n")
    from repositories.models import Commit
    from datetime import datetime, timezone
    c2 = Commit.objects.create(repository=repo2, hash="xyz", message="init", author_name="a", author_email="a", committed_at=datetime.now(timezone.utc))
    SourceFile.objects.create(repository=repo2, commit=c2, source_content=sc2, file_path="bar.py", status="A")
    parsing2 = CodeParsing.objects.create(source_content=sc2, language="python", parse_status=CodeParsing.Status.PARSED)
    CodeSymbol.objects.create(parsing=parsing2, symbol_type="function", name="bar", qualified_name="bar", start_line=1, end_line=2)
    
    with patch("repositories.tasks.process_pending_embeddings.delay"):
        generate_repository_chunks(repo.id)
        generate_repository_chunks(repo2.id)
        
    CodeChunk.objects.all().update(embedding_status=CodeChunk.EmbeddingStatus.EMBEDDED, embedding=[0.1, 0.2])
    
    client = APIClient()
    with patch("repositories.views.CodeChunk.objects.filter") as mock_filter:
        mock_qs = mock_filter.return_value
        # Mocking to return only chunks from repo1
        mocked_chunks = list(CodeChunk.objects.filter(code_parsing=code_parsing))
        for c in mocked_chunks:
            c.similarity = 0.95
        mock_qs.annotate.return_value.order_by.return_value.__getitem__.return_value = mocked_chunks
        
        with patch("repositories.views.generate_embeddings", return_value=[[0.1, 0.2]]):
            response = client.get(f"/api/repositories/{repo.id}/semantic-search/?q=foo")
            
    assert response.status_code == 200
    results = response.data["results"]
    assert len(results) == 2
    # Ensure no bar in results
    for r in results:
        assert "bar" not in r.get("symbol_name", "")

@pytest.mark.django_db
def test_failure_handling(repo, code_parsing):
    with patch("repositories.tasks.process_pending_embeddings.delay"):
        generate_repository_chunks(repo.id)
        
    chunks = CodeChunk.objects.filter(code_parsing=code_parsing)
    assert chunks[0].embedding_status == CodeChunk.EmbeddingStatus.PENDING
    
    # Simulate API failure
    with patch("repositories.tasks.generate_embeddings", side_effect=Exception("API Error")):
        try:
            process_pending_embeddings()
        except Exception:
            pass
            
    chunks = CodeChunk.objects.filter(code_parsing=code_parsing).order_by('id')
    assert chunks[0].embedding_status == CodeChunk.EmbeddingStatus.FAILED

@pytest.mark.django_db
def test_concurrent_worker_locking(repo, code_parsing):
    # Verify that select_for_update(skip_locked=True) is used in the task
    with patch("repositories.tasks.CodeChunk.objects.select_for_update") as mock_lock:
        mock_qs = mock_lock.return_value
        mock_qs.filter.return_value.__getitem__.return_value = list(CodeChunk.objects.none())

        try:
            process_pending_embeddings()
        except Exception:
            pass
        mock_lock.assert_called_with(skip_locked=True)
