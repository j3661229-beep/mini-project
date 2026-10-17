from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import pytest
from rest_framework.test import APIClient

from repositories.models import (
    CodeChunk,
    CodeParsing,
    CodeSymbol,
    Commit,
    FileOwnership,
    Repository,
    SourceContent,
    SourceFile,
)
from repositories.services.rag import (
    format_rag_prompt,
    generate_rag_answer,
    get_rag_status,
    retrieve_context,
)


@pytest.fixture
def repo(db):
    return Repository.objects.create(
        github_url="https://github.com/test-org/rag-repo",
        owner="test-org",
        name="rag-repo",
        status=Repository.Status.COMPLETE,
    )


@pytest.fixture
def sample_code_context(repo):
    sc = SourceContent.objects.create(
        hash="hash_rag_1",
        content="def authenticate_user(token):\n    # verify token\n    return True\n",
    )
    c = Commit.objects.create(
        repository=repo,
        hash="commithash123",
        message="add auth logic",
        author_name="Alice Developer",
        author_email="alice@test.com",
        committed_at=datetime.now(timezone.utc),
    )
    sf = SourceFile.objects.create(
        repository=repo,
        commit=c,
        source_content=sc,
        file_path="src/auth.py",
        status="M",
    )
    parsing = CodeParsing.objects.create(
        source_content=sc,
        language="python",
        parse_status=CodeParsing.Status.PARSED,
    )
    sym = CodeSymbol.objects.create(
        parsing=parsing,
        symbol_type="function",
        name="authenticate_user",
        qualified_name="authenticate_user",
        start_line=1,
        end_line=3,
    )
    chunk = CodeChunk.objects.create(
        source_content=sc,
        code_parsing=parsing,
        symbol=sym,
        chunk_type=CodeChunk.ChunkType.FUNCTION,
        chunk_text="def authenticate_user(token):\n    return True",
        start_line=1,
        end_line=3,
        symbol_name="authenticate_user",
        chunk_hash="chunkhash123",
        embedding_model="text-embedding-3-small",
        embedding_status=CodeChunk.EmbeddingStatus.EMBEDDED,
        embedding=[0.05] * 1536,
    )
    FileOwnership.objects.create(
        repository=repo,
        file_path="src/auth.py",
        top_contributor="Alice Developer",
        top_contributor_share=0.85,
        bus_factor_risk=True,
        total_churn=120,
    )
    return {
        "source_content": sc,
        "commit": c,
        "source_file": sf,
        "parsing": parsing,
        "symbol": sym,
        "chunk": chunk,
    }


@pytest.mark.django_db
def test_get_rag_status(repo, sample_code_context):
    client = APIClient()
    response = client.get(f"/api/repositories/{repo.id}/chat/")
    assert response.status_code == 200
    data = response.data
    assert data["available"] is True
    assert data["total_chunks"] >= 1
    assert data["llm_provider"] == "gemini"
    assert data["llm_model"] == "gemini-2.5-flash"
    assert "embedded_chunks" in data



@pytest.mark.django_db
def test_retrieve_context_scoped(repo, sample_code_context):
    # Create another repo with its own chunk
    other_repo = Repository.objects.create(
        github_url="https://github.com/other-org/other-repo",
        owner="other-org",
        name="other-repo",
    )
    sc2 = SourceContent.objects.create(hash="hash_other", content="def secret_other(): pass")
    c2 = Commit.objects.create(
        repository=other_repo,
        hash="c2",
        message="init",
        author_name="Bob",
        author_email="bob@test.com",
        committed_at=datetime.now(timezone.utc),
    )
    SourceFile.objects.create(
        repository=other_repo, commit=c2, source_content=sc2, file_path="secret.py"
    )
    CodeChunk.objects.create(
        source_content=sc2,
        chunk_type=CodeChunk.ChunkType.FUNCTION,
        chunk_text="def secret_other(): pass",
        chunk_hash="ch_other",
        symbol_name="secret_other",
    )

    sources, meta = retrieve_context(repo, "authenticate_user")
    assert len(sources) >= 1
    # Verify no leaks from other_repo
    for src in sources:
        assert src["file_path"] != "secret.py"
        assert "secret_other" not in src["symbol_name"]

    assert meta["owner"] == "test-org"
    assert "src/auth.py" in meta["at_risk_files"]


@pytest.mark.django_db
def test_format_rag_prompt(repo, sample_code_context):
    sources, meta = retrieve_context(repo, "authenticate token")
    history = [
        {"role": "user", "content": "Hello!"},
        {"role": "assistant", "content": "Hi, I am GitPulse AI."},
    ]
    messages = format_rag_prompt(repo, "Where is authentication?", sources, meta, history=history)

    assert len(messages) >= 4
    assert messages[0]["role"] == "system"
    assert "GitPulse AI" in messages[0]["content"]
    assert "Google Gemini" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "Hello!"
    assert messages[2]["role"] == "assistant"
    assert messages[3]["role"] == "user"
    assert "Where is authentication?" in messages[3]["content"]


@pytest.mark.django_db
def test_generate_rag_answer_without_api_key(repo, sample_code_context, settings):
    settings.GEMINI_API_KEY = ""
    settings.OPENAI_API_KEY = ""
    result = generate_rag_answer(repo, "How does authentication work?")

    assert "answer" in result
    assert "sources" in result
    assert len(result["sources"]) >= 1
    assert result["model"] == "gitpulse-local-rag"
    assert "authenticate_user" in result["answer"] or "auth.py" in result["answer"]


@pytest.mark.django_db
def test_chat_endpoint_post_with_mocked_gemini_llm(repo, sample_code_context, settings):
    settings.LLM_PROVIDER = "gemini"
    settings.GEMINI_API_KEY = "test-gemini-key-12345"
    settings.LLM_MODEL = "gemini-2.5-flash"
    client = APIClient()

    with patch("repositories.services.rag.call_gemini_llm") as mock_gemini:
        mock_gemini.return_value = "Authentication is handled in `src/auth.py` with `authenticate_user`."

        response = client.post(
            f"/api/repositories/{repo.id}/chat/",
            data={
                "message": "Where is authentication located?",
                "history": [],
                "top_k": 3,
            },
            format="json",
        )

    assert response.status_code == 200
    data = response.data
    assert "Authentication is handled in `src/auth.py`" in data["answer"]
    assert len(data["sources"]) >= 1
    assert data["sources"][0]["file_path"] == "src/auth.py"
    assert data["repository"]["name"] == "rag-repo"
    assert data["model"] == "google/gemini-2.5-flash"



@pytest.mark.django_db
def test_chat_endpoint_post_with_mocked_openai_fallback(repo, sample_code_context, settings):
    settings.LLM_PROVIDER = "openai"
    settings.GEMINI_API_KEY = ""
    settings.OPENAI_API_KEY = "sk-mock-key-12345"
    settings.LLM_MODEL = "gpt-4o-mini"
    client = APIClient()

    mock_choice = MagicMock()
    mock_choice.message.content = "Authentication is implemented in `src/auth.py` via `authenticate_user`."
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.model = "gpt-4o-mini"

    with patch("repositories.services.embeddings.get_openai_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_get_client.return_value = mock_client

        response = client.post(
            f"/api/repositories/{repo.id}/chat/",
            data={
                "message": "Where is the authentication function located?",
                "history": [],
                "top_k": 3,
            },
            format="json",
        )

    assert response.status_code == 200
    data = response.data
    assert "Authentication is implemented in `src/auth.py`" in data["answer"]
    assert len(data["sources"]) >= 1
    assert data["model"] == "gpt-4o-mini"



@pytest.mark.django_db
def test_chat_endpoint_validation_error(repo):
    client = APIClient()
    response = client.post(f"/api/repositories/{repo.id}/chat/", data={}, format="json")
    assert response.status_code == 400
