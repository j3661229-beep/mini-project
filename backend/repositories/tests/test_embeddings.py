import pytest
from unittest.mock import patch

from rest_framework.test import APIClient
from django.urls import reverse
from repositories.models import (
    Repository, CodeChunk, CodeParsing, SourceContent, CodeSymbol, SourceFile
)
from repositories.services.chunking import generate_ast_chunks
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
def test_generate_ast_chunks(code_parsing):
    chunks = generate_ast_chunks(code_parsing)
    assert len(chunks) == 2
    
    c1 = chunks[0]
    assert c1.chunk_type == CodeChunk.ChunkType.FUNCTION
    assert c1.symbol_name == "foo"
    assert "def foo():" in c1.text
    
    c2 = chunks[1]
    assert c2.chunk_type == CodeChunk.ChunkType.CLASS_CONTEXT
    assert c2.symbol_name == "Bar"
    assert "class Bar:" in c2.text

@pytest.mark.django_db
def test_generate_repository_chunks_task(repo, code_parsing):
    # This will generate db CodeChunks
    with patch("repositories.tasks.process_pending_embeddings.delay") as mock_process:
        generate_repository_chunks(repo.id)
        
    chunks = CodeChunk.objects.filter(code_parsing=code_parsing)
    assert chunks.count() == 2
    assert chunks[0].embedding_status == CodeChunk.EmbeddingStatus.PENDING

@pytest.mark.django_db
def test_process_pending_embeddings(repo, code_parsing):
    with patch("repositories.tasks.process_pending_embeddings.delay"):
        generate_repository_chunks(repo.id)
        
    mock_embeddings = [[0.1, 0.2], [0.3, 0.4]]
    
    with patch("repositories.tasks.generate_embeddings", return_value=mock_embeddings):
        process_pending_embeddings()
        
    chunks = CodeChunk.objects.filter(code_parsing=code_parsing).order_by('id')
    assert chunks[0].embedding_status == CodeChunk.EmbeddingStatus.EMBEDDED
    # We can't easily assert vector contents in SQLite without pgvector, but we check status.
    assert chunks[0].embedding is not None

@pytest.mark.django_db
def test_semantic_search_api(repo, code_parsing):
    client = APIClient()
    
    # Generate chunks
    with patch("repositories.tasks.process_pending_embeddings.delay"):
        generate_repository_chunks(repo.id)
        
    # Mark chunks as embedded manually for test
    CodeChunk.objects.all().update(embedding_status=CodeChunk.EmbeddingStatus.EMBEDDED, embedding=[0.1, 0.2])
    
    # If using SQLite, the CosineDistance will raise an error in views, so we mock the queryset
    with patch("repositories.views.CodeChunk.objects.filter") as mock_filter:
        mock_qs = mock_filter.return_value
        
        # Add similarity to chunks
        mocked_chunks = list(CodeChunk.objects.all())
        for c in mocked_chunks:
            c.similarity = 0.95
            
        mock_qs.annotate.return_value.order_by.return_value.__getitem__.return_value = mocked_chunks
        
        with patch("repositories.views.generate_embeddings", return_value=[[0.1, 0.2]]):
            response = client.get(f"/api/repositories/{repo.id}/semantic-search/?q=foo")
            
    assert response.status_code == 200
    assert "results" in response.data
