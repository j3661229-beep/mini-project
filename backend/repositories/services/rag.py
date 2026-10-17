"""Generative RAG (Retrieval-Augmented Generation) service for repositories using Google Gemini."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from django.conf import settings
from repositories.models import (
    CodeChunk,
    CodeParsing,
    CodeSymbol,
    FileOwnership,
    Repository,
    SourceFile,
)
from repositories.services.embeddings import generate_embeddings

logger = logging.getLogger(__name__)


def retrieve_context(
    repository: Repository, query: str, top_k: int = 6
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Retrieve repository-scoped code chunks and metadata relevant to the query.
    Uses pgvector cosine distance when available, and seamlessly falls back
    to hybrid keyword/symbol matching on SQLite or non-vector environments.
    """
    sources: list[dict[str, Any]] = []
    top_k = max(1, min(top_k, 20))

    # 1. Attempt pgvector Cosine Search
    try:
        from pgvector.django import CosineDistance

        query_vectors = generate_embeddings([query])
        if query_vectors and len(query_vectors[0]) > 0:
            query_vector = query_vectors[0]
            vector_chunks = list(
                CodeChunk.objects.filter(
                    source_content__files__repository=repository,
                    embedding_status=CodeChunk.EmbeddingStatus.EMBEDDED,
                )
                .annotate(similarity=1 - CosineDistance("embedding", query_vector))
                .order_by(CosineDistance("embedding", query_vector))[:top_k]
            )

            for chunk in vector_chunks:
                source_file = SourceFile.objects.filter(
                    repository=repository, source_content=chunk.source_content
                ).first()
                file_path = source_file.file_path if source_file else "unknown"
                sources.append(
                    {
                        "id": chunk.id,
                        "file_path": file_path,
                        "symbol_name": chunk.symbol_name or "",
                        "chunk_type": chunk.chunk_type,
                        "start_line": chunk.start_line or 1,
                        "end_line": chunk.end_line or (chunk.start_line or 1),
                        "similarity": round(float(getattr(chunk, "similarity", 0.0) or 0.0), 3),
                        "snippet": (chunk.chunk_text[:350] + "...") if len(chunk.chunk_text) > 350 else chunk.chunk_text,
                        "chunk_text": chunk.chunk_text,
                    }
                )
    except Exception as exc:
        logger.debug("pgvector search not available or failed: %s; using hybrid retrieval", exc)

    # 2. Fallback / Hybrid Keyword & Symbol Augmentation if vector results are scarce
    if len(sources) < top_k:
        needed = top_k - len(sources)
        existing_chunk_ids = {s["id"] for s in sources}
        fallback_sources = _hybrid_keyword_retrieval(repository, query, limit=needed, exclude_ids=existing_chunk_ids)
        sources.extend(fallback_sources)

    # 3. Retrieve Repository Metadata Context
    repo_metadata = _build_repository_metadata(repository)

    return sources, repo_metadata


def _hybrid_keyword_retrieval(
    repository: Repository, query: str, limit: int = 5, exclude_ids: set[int] | None = None
) -> list[dict[str, Any]]:
    """Keyword and AST symbol search over repository code chunks and files."""
    exclude_ids = exclude_ids or set()
    results: list[dict[str, Any]] = []

    # Tokenize query words
    terms = [w.lower() for w in re.findall(r"\w+", query) if len(w) >= 3]
    if not terms:
        terms = [query.strip().lower()]

    # A. Search CodeChunks with symbol_name or text matching terms
    candidate_chunks = (
        CodeChunk.objects.filter(
            source_content__files__repository=repository
        )
        .exclude(id__in=exclude_ids)
        .distinct()[:50]
    )

    scored_chunks = []
    for c in candidate_chunks:
        text_lower = c.chunk_text.lower()
        sym_lower = (c.symbol_name or "").lower()
        matches = sum(1 for term in terms if term in text_lower or term in sym_lower)
        if matches > 0:
            score = round(matches / max(len(terms), 1), 2)
            scored_chunks.append((score, c))

    scored_chunks.sort(key=lambda x: -x[0])

    for score, chunk in scored_chunks[:limit]:
        source_file = SourceFile.objects.filter(
            repository=repository, source_content=chunk.source_content
        ).first()
        file_path = source_file.file_path if source_file else "unknown"
        results.append(
            {
                "id": chunk.id,
                "file_path": file_path,
                "symbol_name": chunk.symbol_name or "",
                "chunk_type": chunk.chunk_type,
                "start_line": chunk.start_line or 1,
                "end_line": chunk.end_line or (chunk.start_line or 1),
                "similarity": min(1.0, round(score * 0.85 + 0.1, 3)),
                "snippet": (chunk.chunk_text[:350] + "...") if len(chunk.chunk_text) > 350 else chunk.chunk_text,
                "chunk_text": chunk.chunk_text,
            }
        )

    # B. If still under limit, search SourceFiles directly
    if len(results) < limit:
        remaining = limit - len(results)
        matching_files = (
            SourceFile.objects.filter(
                repository=repository,
                source_content__isnull=False,
                source_content__is_binary=False,
            )
            .select_related("source_content")[:20]
        )
        for sf in matching_files:
            fp_lower = sf.file_path.lower()
            if any(t in fp_lower for t in terms) or not results:
                content = sf.source_content.content if sf.source_content else ""
                if not content:
                    continue
                snippet = content[:400] + ("..." if len(content) > 400 else "")
                results.append(
                    {
                        "id": -sf.id,
                        "file_path": sf.file_path,
                        "symbol_name": "",
                        "chunk_type": "file_fallback",
                        "start_line": 1,
                        "end_line": min(len(content.splitlines()), 50),
                        "similarity": 0.70,
                        "snippet": snippet,
                        "chunk_text": content[:1200],
                    }
                )
                if len(results) >= limit:
                    break

    return results


def _build_repository_metadata(repository: Repository) -> dict[str, Any]:
    """Compile high-level structural metrics for prompt grounding."""
    at_risk_files = list(
        FileOwnership.objects.filter(repository=repository, bus_factor_risk=True)
        .order_by("-total_churn")
        .values_list("file_path", flat=True)[:5]
    )

    top_authors = list(
        repository.commits.values("author_name")
        .annotate(total=django_count("id"))
        .order_by("-total")[:4]
    )

    return {
        "owner": repository.owner,
        "name": repository.name,
        "github_url": repository.github_url,
        "status": repository.status,
        "total_commits": repository.commits.count(),
        "total_pull_requests": repository.pull_requests.count(),
        "at_risk_files": at_risk_files,
        "top_contributors": [a["author_name"] for a in top_authors if a.get("author_name")],
    }


def django_count(field_name: str):
    from django.db.models import Count

    return Count(field_name)


def build_system_and_user_prompts(
    repository: Repository,
    query: str,
    sources: list[dict[str, Any]],
    repo_metadata: dict[str, Any],
) -> tuple[str, str]:
    """Build system instructions and grounded user context payload."""
    system_prompt = (
        f"You are GitPulse AI, an intelligent repository architect and code analysis assistant powered by Google Gemini.\n"
        f"You are answering questions about the GitHub repository '{repository.owner}/{repository.name}'.\n\n"
        "Instructions:\n"
        "1. Base your explanations on the provided Repository Overview and Code Context Snippets.\n"
        "2. When discussing logic or files, cite the specific file path and line numbers (e.g., `path/to/file.py#L10-25`).\n"
        "3. Explain architectural concepts clearly, using markdown headings, bullet points, and code blocks.\n"
        "4. If a file or pattern is not found in the retrieved context, state clearly what information is available and what is missing.\n"
        "5. Maintain a helpful, technical, and objective tone."
    )

    context_lines = [
        "### Repository Overview",
        f"- Repository: {repo_metadata['owner']}/{repo_metadata['name']}",
        f"- Total Recorded Commits: {repo_metadata['total_commits']}",
        f"- Total Pull Requests: {repo_metadata['total_pull_requests']}",
    ]

    if repo_metadata["top_contributors"]:
        context_lines.append(f"- Key Contributors: {', '.join(repo_metadata['top_contributors'])}")
    if repo_metadata["at_risk_files"]:
        context_lines.append(
            f"- High Bus-Factor Risk Files (>=80% single-author ownership): {', '.join(repo_metadata['at_risk_files'])}"
        )

    context_lines.append("\n### Code Context Snippets")
    if sources:
        for idx, src in enumerate(sources, 1):
            sym = f" | Symbol: `{src['symbol_name']}`" if src["symbol_name"] else ""
            sim = f" (relevance: {int(src['similarity'] * 100)}%)" if src.get("similarity") else ""
            context_lines.append(
                f"\n#### [{idx}] File: `{src['file_path']}` (Lines {src['start_line']}-{src['end_line']}){sym}{sim}"
            )
            context_lines.append("```")
            context_lines.append(src["chunk_text"].strip())
            context_lines.append("```")
    else:
        context_lines.append("No specific code snippets were matched for this query.")

    context_payload = "\n".join(context_lines)

    user_message = (
        f"Context from codebase:\n"
        f"{context_payload}\n\n"
        f"User Question:\n{query}"
    )

    return system_prompt, user_message


def format_rag_prompt(
    repository: Repository,
    query: str,
    sources: list[dict[str, Any]],
    repo_metadata: dict[str, Any],
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    """Format prompt messages with system instructions, conversation history, and context."""
    system_prompt, user_message = build_system_and_user_prompts(repository, query, sources, repo_metadata)
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history:
            if msg.get("role") in ("user", "assistant") and msg.get("content"):
                messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages



def call_gemini_llm(
    model_name: str,
    system_prompt: str,
    user_content: str,
    history: list[dict[str, str]] | None = None,
    api_key: str = "",
) -> str:
    """Call Google Gemini model using the official google.genai SDK."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    contents = []
    if history:
        for msg in history:
            role = "user" if msg.get("role") == "user" else "model"
            content = msg.get("content", "").strip()
            if content:
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=content)],
                    )
                )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_content)],
        )
    )

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.2,
        max_output_tokens=1500,
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )
    except Exception as exc:
        if "NOT_FOUND" in str(exc) or "404" in str(exc):
            fallback_model = "gemini-2.5-flash" if model_name != "gemini-2.5-flash" else "gemini-flash-latest"
            logger.info("Retrying Gemini call with fallback model %s due to: %s", fallback_model, exc)
            response = client.models.generate_content(
                model=fallback_model,
                contents=contents,
                config=config,
            )
        else:
            raise

    return response.text or "No response generated."


def generate_rag_answer(
    repository: Repository,
    query: str,
    history: list[dict[str, str]] | None = None,
    top_k: int = 6,
) -> dict[str, Any]:
    """
    Main RAG workflow:
    1. Retrieve repository-scoped code chunks & overview metadata
    2. Format prompt with grounding context
    3. Call Google Gemini (or OpenAI if configured), with local synthesis fallback
    """
    sources, repo_metadata = retrieve_context(repository, query, top_k=top_k)
    system_prompt, user_content = build_system_and_user_prompts(repository, query, sources, repo_metadata)

    gemini_key = (
        settings.GEMINI_API_KEY
        if hasattr(settings, "GEMINI_API_KEY")
        else (os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", ""))
    )
    openai_key = settings.OPENAI_API_KEY if hasattr(settings, "OPENAI_API_KEY") else os.environ.get("OPENAI_API_KEY", "")

    provider = getattr(settings, "LLM_PROVIDER", "gemini").lower()
    model = getattr(settings, "LLM_MODEL", "gemini-2.5-flash")


    if provider == "gemini" and gemini_key:
        try:
            answer = call_gemini_llm(
                model_name=model,
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
                api_key=gemini_key,
            )
            used_model = f"google/{model}"
        except Exception as exc:
            logger.exception("Google Gemini call failed for query '%s': %s", query, exc)
            answer = _build_fallback_answer(repository, query, sources, repo_metadata, error=str(exc))
            used_model = f"{model} (fallback)"
    elif openai_key:
        try:
            from repositories.services.embeddings import get_openai_client

            client = get_openai_client()
            messages = [{"role": "system", "content": system_prompt}]
            if history:
                for msg in history:
                    if msg.get("role") in ("user", "assistant") and msg.get("content"):
                        messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": user_content})

            response = client.chat.completions.create(
                model=model if "gpt" in model else "gpt-4o-mini",
                messages=messages,  # type: ignore[arg-type]
                temperature=0.2,
                max_tokens=1500,
            )
            answer = response.choices[0].message.content or "No response generated."
            used_model = response.model or "openai/gpt-4o-mini"
        except Exception as exc:
            logger.exception("OpenAI call failed for query '%s': %s", query, exc)
            answer = _build_fallback_answer(repository, query, sources, repo_metadata, error=str(exc))
            used_model = f"{model} (fallback)"
    else:
        # Graceful simulated response when no API key is set
        answer = _build_fallback_answer(repository, query, sources, repo_metadata)
        used_model = "gitpulse-local-rag"

    # Clean sources for response payload
    clean_sources = [
        {
            "id": s["id"],
            "file_path": s["file_path"],
            "symbol_name": s["symbol_name"],
            "chunk_type": s["chunk_type"],
            "start_line": s["start_line"],
            "end_line": s["end_line"],
            "similarity": s["similarity"],
            "snippet": s["snippet"],
        }
        for s in sources
    ]

    return {
        "answer": answer,
        "sources": clean_sources,
        "repository": {
            "id": repository.id,
            "owner": repository.owner,
            "name": repository.name,
            "github_url": repository.github_url,
        },
        "model": used_model,
    }


def _build_fallback_answer(
    repository: Repository,
    query: str,
    sources: list[dict[str, Any]],
    repo_metadata: dict[str, Any],
    error: str | None = None,
) -> str:
    """Construct an informative local architectural synthesis when live LLM is inactive."""
    lines = []
    gemini_key = (
        settings.GEMINI_API_KEY
        if hasattr(settings, "GEMINI_API_KEY")
        else (os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", ""))
    )

    if error:
        lines.append(f"> ⚠️ **Live LLM Notice**: Google Gemini call encountered an issue ({error}). Displaying local codebase analysis.\n")
    elif not gemini_key:
        lines.append(
            "> ℹ️ **Notice**: `GEMINI_API_KEY` is not configured in `.env`. Live generative responses require a Google Gemini API key. Below is the semantic retrieval summary directly from the indexed codebase.\n"
        )

    lines.append(f"### Repository Intelligence for `{repository.owner}/{repository.name}`")
    lines.append(
        f"- **Repository Activity**: {repo_metadata['total_commits']} commits recorded across {len(repo_metadata['top_contributors'])} primary contributors."
    )
    if repo_metadata["at_risk_files"]:
        lines.append(
            f"- **Bus-Factor Alert**: {len(repo_metadata['at_risk_files'])} files identified with high ownership concentration (>= 80% churn)."
        )

    lines.append("\n### Relevant Code Artifacts Identified:")
    if sources:
        for idx, src in enumerate(sources, 1):
            sym_part = f" — symbol `{src['symbol_name']}`" if src["symbol_name"] else ""
            lines.append(
                f"{idx}. **`{src['file_path']}`** (lines {src['start_line']}–{src['end_line']}{sym_part})\n"
                f"   *Relevance*: `{int(src['similarity'] * 100)}%`\n"
                f"   *Preview*:\n"
                f"   ```\n   {src['snippet'].splitlines()[0] if src['snippet'] else ''}\n   ```"
            )
        lines.append(
            "\n*To enable conversational generative synthesis and code explanation with Google Gemini, add `GEMINI_API_KEY=...` to your `.env` file.*"
        )
    else:
        lines.append(
            "No specific code chunks or symbols closely matched your query terms. Try rephrasing your question or indexing additional repository commits."
        )

    return "\n".join(lines)


def get_rag_status(repository: Repository) -> dict[str, Any]:
    """Diagnostic endpoint checking RAG indexing readiness."""
    total_chunks = CodeChunk.objects.filter(
        source_content__files__repository=repository
    ).distinct().count()

    embedded_chunks = CodeChunk.objects.filter(
        source_content__files__repository=repository,
        embedding_status=CodeChunk.EmbeddingStatus.EMBEDDED,
    ).distinct().count()

    total_symbols = CodeSymbol.objects.filter(
        parsing__source_content__files__repository=repository
    ).distinct().count()

    gemini_key = bool(
        settings.GEMINI_API_KEY
        if hasattr(settings, "GEMINI_API_KEY")
        else (os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", ""))
    )
    openai_key = bool(
        settings.OPENAI_API_KEY
        if hasattr(settings, "OPENAI_API_KEY")
        else os.environ.get("OPENAI_API_KEY", "")
    )


    return {
        "available": (total_chunks > 0 or repository.commits.exists()),
        "has_api_key": bool(gemini_key or openai_key),
        "llm_provider": getattr(settings, "LLM_PROVIDER", "gemini"),
        "llm_model": getattr(settings, "LLM_MODEL", "gemini-2.5-flash"),
        "embedding_model": getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small"),
        "total_chunks": total_chunks,
        "embedded_chunks": embedded_chunks,
        "total_symbols": total_symbols,
    }
