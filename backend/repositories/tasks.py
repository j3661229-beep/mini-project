"""Celery ingestion pipeline for repositories â€” incremental & non-destructive."""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from analysis.engines.bus_factor import compute_file_ownership
from analysis.engines.review_graph import compute_review_edges
from repositories.models import (
    Commit,
    CommitFile,
    FileOwnership,
    PRReview,
    PullRequest,
    Repository,
    SourceContent,
    SourceFile,
    PullRequestFile,
    CodeParsing,
    CodeSymbol,
    CodeImport,
    CodeChunk,
    SecurityFinding,
)
from repositories.services.ast_parser import parse_code
from repositories.services.chunking import generate_ast_chunks
from repositories.services.embeddings import generate_embeddings
from repositories.services.git_ingest import cleanup_clone, clone_and_parse
from repositories.services.github_ingest import fetch_pull_requests

logger = logging.getLogger(__name__)

def _update_ingestion(
    repo: Repository,
    *,
    stage: str | None = None,
    processed: int | None = None,
    total: int | None = None,
    detail: str | None = None,
) -> None:
    """Persist worker-owned progress for the status API without inventing totals."""
    now = timezone.now()
    stage_changed = bool(stage and stage != repo.ingestion_stage)
    progress = {} if stage_changed else dict(repo.ingestion_progress or {})
    if stage_changed:
        repo.ingestion_stage = stage
        repo.ingestion_stage_started_at = now
    if processed is not None:
        progress["processed"] = processed
    if total is not None:
        progress["total"] = total
    if detail is not None:
        progress["detail"] = detail
    repo.ingestion_progress = progress
    repo.ingestion_heartbeat_at = now
    repo.save(update_fields=["ingestion_stage", "ingestion_progress", "ingestion_stage_started_at", "ingestion_heartbeat_at"])
# Stale lock threshold — if a lock is older than this, consider it abandoned.
# Keep this short for local eager/thread mode where server reloads kill workers.
LOCK_STALE_MINUTES = 5
# If processing has no recent heartbeat, treat the job as dead even before lock expiry.
HEARTBEAT_STALE_MINUTES = 3


def _acquire_lock(repo_id: int) -> bool:
    """
    Attempt to acquire an ingestion lock for the given repository.

    Uses an atomic UPDATE ... WHERE to ensure only one worker can acquire
    the lock, even across multiple Celery workers / processes.

    Returns True if the lock was acquired, False if another job holds it.
    """
    now = timezone.now()
    stale_cutoff = now - timedelta(minutes=LOCK_STALE_MINUTES)

    updated = Repository.objects.filter(
        Q(pk=repo_id),
        Q(ingestion_locked_at__isnull=True) | Q(ingestion_locked_at__lt=stale_cutoff),
    ).update(ingestion_locked_at=now)

    return updated == 1


def _release_lock(repo_id: int) -> None:
    """Release the ingestion lock for the given repository."""
    Repository.objects.filter(pk=repo_id).update(ingestion_locked_at=None)


def reclaim_stale_ingestion(repo: Repository) -> bool:
    """
    If a repository is stuck in pending/processing with a stale lock or
    missing heartbeat (common after Django autoreload kills daemon threads),
    clear the lock and mark it failed so a new analyze can run.
    Returns True if the repo was reclaimed.
    """
    if repo.status not in (Repository.Status.PENDING, Repository.Status.PROCESSING):
        return False

    now = timezone.now()
    lock_stale = (
        repo.ingestion_locked_at is not None
        and repo.ingestion_locked_at < now - timedelta(minutes=LOCK_STALE_MINUTES)
    )
    heartbeat = repo.ingestion_heartbeat_at
    heartbeat_stale = heartbeat is None or heartbeat < now - timedelta(
        minutes=HEARTBEAT_STALE_MINUTES
    )
    # No heartbeat shortly after lock → worker likely died before progress updates
    if (
        heartbeat is None
        and repo.ingestion_locked_at is not None
        and repo.ingestion_locked_at < now - timedelta(minutes=1)
    ):
        heartbeat_stale = True

    abandoned = False
    if repo.ingestion_locked_at is not None and (lock_stale or heartbeat_stale):
        abandoned = True
    elif (
        repo.status == Repository.Status.PROCESSING
        and repo.ingestion_locked_at is None
        and heartbeat_stale
    ):
        abandoned = True

    if not abandoned:
        return False

    Repository.objects.filter(pk=repo.pk).update(
        status=Repository.Status.FAILED,
        ingestion_stage="failed",
        ingestion_locked_at=None,
        error_message=(
            "Ingestion was interrupted or stalled (stale worker lock/heartbeat). "
            "Re-submit the repository URL to retry."
        )[:2000],
    )
    repo.refresh_from_db()
    return True


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def ingest_repository(self, repo_id: int) -> dict:
    """
    Incremental, non-destructive repository ingestion pipeline.

    1. Acquire concurrency lock (database-level)
    2. Mark status='processing'
    3. Shallow clone + parse commits (skip known hashes for file stats)
    4. Persist only NEW commits and their files
    5. Upsert PRs + reviews
    6. Recalculate ownership atomically
    7. Mark complete (or failed), release lock
    """
    try:
        repo = Repository.objects.get(pk=repo_id)
    except Repository.DoesNotExist:
        logger.error("Repository %s does not exist", repo_id)
        return {"ok": False, "error": "not_found"}

    # â”€â”€ Step 1: Acquire concurrency lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if not _acquire_lock(repo_id):
        logger.warning(
            "Ingestion already in progress for repo %s â€” skipping", repo_id
        )
        return {"ok": False, "error": "ingestion_already_running"}

    clone_path = None
    repo.status = Repository.Status.PROCESSING
    repo.error_message = None
    repo.ingestion_stage = "queued"
    repo.save(update_fields=["status", "ingestion_stage", "error_message"])
    _update_ingestion(repo, stage="cloning", detail="Preparing an isolated clone workspace.")

    try:
        # â”€â”€ Step 2: Determine which commits we already have â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        existing_hashes = set(
            Commit.objects.filter(repository=repo).values_list("hash", flat=True)
        )

        # â”€â”€ Step 3: Clone and parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        clone_url = f"https://github.com/{repo.owner}/{repo.name}.git"

        def record_commit_progress(processed: int, total: int | None) -> None:
            _update_ingestion(
                repo,
                stage="commits",
                processed=processed,
                total=total,
                detail="Parsing commit history.",
            )

        clone_result = clone_and_parse(
            clone_url,
            repo_id=repo.id,
            existing_hashes=existing_hashes,
            on_commit_progress=record_commit_progress,
        )
        clone_path = clone_result.clone_path

        # â”€â”€ Step 4: Persist new commits (non-destructive) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        _update_ingestion(repo, stage="commits", processed=0, total=len(clone_result.commits), detail="Persisting new commits and file changes.")
        _persist_new_commits(repo, clone_result.commits, existing_hashes)
        _update_ingestion(repo, processed=len(clone_result.commits), total=len(clone_result.commits), detail="Commit history persisted.")

        repo.commit_cap_reached = clone_result.cap_reached
        repo.save(update_fields=["commit_cap_reached"])

        # â”€â”€ Step 5: Fetch and upsert PRs + reviews â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        _update_ingestion(repo, stage="reviews", processed=0, total=None, detail="Collecting available pull requests and reviews.")
        try:
            def pr_progress(processed: int, total: int | None) -> None:
                _update_ingestion(
                    repo,
                    stage="reviews",
                    processed=processed,
                    total=total,
                    detail=f"Fetching pull requests ({processed}{f'/{total}' if total else ''}).",
                )

            prs = fetch_pull_requests(repo.owner, repo.name, on_progress=pr_progress)
        except RuntimeError as gh_err:
            logger.warning("PR fetch issue for %s: %s", repo, gh_err)
            prs = []
            _update_ingestion(
                repo,
                stage="reviews",
                detail=f"PR fetch skipped/partial: {gh_err}",
            )

        _upsert_pull_requests(repo, prs)
        _update_ingestion(repo, processed=len(prs), total=len(prs), detail="Pull request and review data updated.")

        # â”€â”€ Step 6: Recalculate analysis (atomic ownership refresh) â”€â”€â”€
        _update_ingestion(repo, stage="ownership", processed=0, total=CommitFile.objects.filter(commit__repository=repo).count(), detail="Calculating ownership and bus-factor risk.")
        _run_analysis(repo)
        _update_ingestion(repo, detail="Ownership analysis complete.")

        # â”€â”€ Step 7: Mark complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        repo.status = Repository.Status.COMPLETE
        repo.last_ingested_at = timezone.now()
        repo.error_message = None
        repo.ingestion_stage = "complete"
        repo.ingestion_locked_at = None
        repo.save(
            update_fields=[
                "status",
                "ingestion_stage",
                "last_ingested_at",
                "error_message",
                "ingestion_locked_at",
            ]
        )
        _update_ingestion(repo, stage="complete", detail="Core repository intelligence is ready.")

        # Trigger incremental parsing asynchronously (best-effort)
        try:
            parse_repository_code.delay(repo_id)
        except Exception:
            logger.exception("Failed to enqueue parse_repository_code for %s", repo_id)

        return {"ok": True, "repo_id": repo_id}

    except Exception as exc:
        logger.exception("Ingestion failed for repo %s", repo_id)
        repo.status = Repository.Status.FAILED
        repo.error_message = str(exc)[:2000]
        repo.ingestion_stage = "failed"
        repo.save(update_fields=["status", "ingestion_stage", "error_message"])
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            return {"ok": False, "error": str(exc)}
    finally:
        cleanup_clone(clone_path)
        _release_lock(repo_id)


def _persist_new_commits(
    repo: Repository,
    parsed_commits: list,
    existing_hashes: set[str],
) -> None:
    """
    Insert only commits that don't already exist in the database.
    Uses ignore_conflicts=True as a safety net against the unique constraint
    on (repository, hash).
    """
    new_commits = [pc for pc in parsed_commits if pc.hash not in existing_hashes]

    if not new_commits:
        logger.info("No new commits to insert for %s", repo)
        return

    with transaction.atomic():
        commit_objs = [
            Commit(
                repository=repo,
                hash=pc.hash,
                author_name=pc.author_name,
                author_email=pc.author_email,
                committed_at=pc.committed_at,
                parent_hashes=pc.parent_hashes,
                message=pc.message[:10000],
                branch=pc.branch[:255],
            )
            for pc in new_commits
        ]
        Commit.objects.bulk_create(commit_objs, batch_size=500, ignore_conflicts=True)

        # Fetch IDs for the newly created commits only
        new_hash_set = {pc.hash for pc in new_commits}
        hash_to_id = dict(
            Commit.objects.filter(repository=repo, hash__in=new_hash_set).values_list(
                "hash", "id"
            )
        )

        # 1. Deduplicate and create SourceContents
        source_contents = {}
        for pc in new_commits:
            for pf in pc.files:
                sf = pf.source_file
                if sf and sf.hash and sf.hash not in source_contents:
                    source_contents[sf.hash] = SourceContent(
                        hash=sf.hash,
                        content=sf.content,
                        is_binary=sf.is_binary,
                        is_skipped_size=sf.is_skipped_size,
                        size=sf.size,
                    )
        
        if source_contents:
            SourceContent.objects.bulk_create(
                source_contents.values(), batch_size=500, ignore_conflicts=True
            )

        file_objs: list[CommitFile] = []
        source_file_objs: list[SourceFile] = []
        
        for pc in new_commits:
            commit_id = hash_to_id.get(pc.hash)
            if not commit_id:
                continue
            for pf in pc.files:
                file_objs.append(
                    CommitFile(
                        commit_id=commit_id,
                        file_path=pf.file_path,
                        insertions=pf.insertions,
                        deletions=pf.deletions,
                    )
                )
                if pf.source_file:
                    sf = pf.source_file
                    source_file_objs.append(
                        SourceFile(
                            repository=repo,
                            commit_id=commit_id,
                            file_path=pf.file_path,
                            source_content_id=sf.hash if sf.hash else None,
                            status=sf.status,
                            previous_path=sf.previous_path,
                            language=sf.language,
                        )
                    )
        if file_objs:
            CommitFile.objects.bulk_create(file_objs, batch_size=1000)
        if source_file_objs:
            SourceFile.objects.bulk_create(source_file_objs, batch_size=1000, ignore_conflicts=True)

    logger.info("Inserted %d new commits for %s", len(new_commits), repo)


def _upsert_pull_requests(repo: Repository, prs: list) -> None:
    """
    Upsert pull requests and their reviews without deleting existing data.

    - PRs: update_or_create keyed on (repository, pr_number)
    - Reviews with github_review_id: update_or_create keyed on
      (pull_request, github_review_id)
    - Reviews without github_review_id (legacy/edge): replace-per-PR
    """
    if not prs:
        return

    with transaction.atomic():
        for p in prs:
            pr_obj, _ = PullRequest.objects.update_or_create(
                repository=repo,
                pr_number=p.pr_number,
                defaults={
                    "author_login": p.author_login,
                    "state": p.state,
                    "created_at": p.created_at,
                    "merged_at": p.merged_at,
                },
            )

            # Partition reviews by whether they have a github_review_id
            reviews_with_id = [r for r in p.reviews if r.github_review_id is not None]
            reviews_without_id = [r for r in p.reviews if r.github_review_id is None]

            # Reviews WITH github_review_id: upsert individually
            for r in reviews_with_id:
                PRReview.objects.update_or_create(
                    pull_request=pr_obj,
                    github_review_id=r.github_review_id,
                    defaults={
                        "reviewer_login": r.reviewer_login,
                        "review_state": r.review_state,
                    },
                )

            # Reviews WITHOUT github_review_id: safe replace for this PR
            # (bounded scope â€” only touches reviews for this specific PR
            #  that lack a review ID)
            if reviews_without_id:
                PRReview.objects.filter(
                    pull_request=pr_obj, github_review_id__isnull=True
                ).delete()
                PRReview.objects.bulk_create(
                    [
                        PRReview(
                            pull_request=pr_obj,
                            reviewer_login=r.reviewer_login,
                            review_state=r.review_state,
                            github_review_id=None,
                        )
                        for r in reviews_without_id
                    ],
                    batch_size=200,
                )

            # Sync PR files
            if p.files:
                PullRequestFile.objects.filter(pull_request=pr_obj).delete()
                PullRequestFile.objects.bulk_create(
                    [
                        PullRequestFile(
                            pull_request=pr_obj,
                            file_path=f.file_path,
                            status=f.status,
                            additions=f.additions,
                            deletions=f.deletions,
                            patch=f.patch,
                            is_truncated=f.is_truncated,
                        )
                        for f in p.files
                    ],
                    batch_size=200,
                )


def _run_analysis(repo: Repository) -> None:
    """
    Compute and persist bus-factor ownership rows.

    Wrapped in transaction.atomic() so that if the bulk_create fails,
    the old ownership data is preserved via rollback.
    """
    file_rows = (
        CommitFile.objects.filter(commit__repository=repo)
        .select_related("commit")
        .values("file_path", "insertions", "deletions", "commit__author_name")
    )
    ownership = compute_file_ownership(file_rows)

    # Atomic swap: delete old + create new inside one transaction.
    # If anything fails, the old rows are preserved by the rollback.
    with transaction.atomic():
        FileOwnership.objects.filter(repository=repo).delete()
        FileOwnership.objects.bulk_create(
            [
                FileOwnership(
                    repository=repo,
                    file_path=row.file_path,
                    top_contributor=row.top_contributor,
                    top_contributor_share=row.top_contributor_share,
                    bus_factor_risk=row.bus_factor_risk,
                    contributor_count=row.contributor_count,
                    total_churn=row.total_churn,
                )
                for row in ownership
            ],
            batch_size=500,
        )

    # Review graph is computed on read from PRReview rows â€” no separate table.
    # Touch the function so the pipeline exercises it and validates data shape.
    review_qs = PRReview.objects.filter(
        pull_request__repository=repo
    ).select_related("pull_request")
    edges = compute_review_edges(
        [
            {
                "reviewer_login": r.reviewer_login,
                "author_login": r.pull_request.author_login,
            }
            for r in review_qs
        ]
    )
    # Security heuristics over persisted source content (secrets + risky patterns)
    try:
        from repositories.services.security import scan_and_persist_security

        security_findings = scan_and_persist_security(repo)
        security_count = len(security_findings)
    except Exception:
        logger.exception("Security scan failed for %s", repo)
        security_count = SecurityFinding.objects.filter(repository=repo).count()

    logger.info(
        "Analysis complete for %s: %s ownership rows, %s review edges, %s security findings",
        repo,
        len(ownership),
        len(edges),
        security_count,
    )

@shared_task
def parse_repository_code(repo_id: int):
    """
    Incrementally parse AST symbols and imports for all unparsed source content in this repository.
    """
    try:
        repo = Repository.objects.get(pk=repo_id)
    except Repository.DoesNotExist:
        return
        
    current_parser_version = "tree-sitter-0.26"
    
    # We want to find SourceFiles for this repo whose content isn't yet parsed in the correct context
    # To avoid loading everything, we can do this in batches or just find the unique contents
    # that need parsing.
    
    # Get all unique (content_hash, language) pairs for this repository's files
    # Exclude binaries and skipped sizes
    source_files_data = (
        SourceFile.objects.filter(
            repository=repo, 
            source_content__is_binary=False, 
            source_content__is_skipped_size=False,
            source_content__isnull=False
        )
        .exclude(language="")
        .values_list("source_content_id", "language")
        .distinct()
    )
    
    for content_hash, language in source_files_data:
        # Check if a parsing context already exists
        parsing, created = CodeParsing.objects.get_or_create(
            source_content_id=content_hash,
            language=language,
            parser_version=current_parser_version,
            defaults={"parse_status": CodeParsing.Status.PENDING}
        )
        
        if not created and parsing.parse_status in (CodeParsing.Status.PARSED, CodeParsing.Status.UNSUPPORTED):
            continue
            
        # Needs parsing!
        parsing.parse_status = CodeParsing.Status.PENDING
        parsing.parse_error = None
        parsing.save(update_fields=["parse_status", "parse_error"])
        
        # We must load the content
        try:
            from repositories.models import SourceContent
            content_obj = SourceContent.objects.get(hash=content_hash)
            
            result = parse_code(content_obj.content, language)
            
            if result.status == "failed":
                parsing.parse_status = CodeParsing.Status.FAILED
                parsing.parse_error = result.error
                parsing.save(update_fields=["parse_status", "parse_error"])
                continue
                
            if result.status == "unsupported":
                parsing.parse_status = CodeParsing.Status.UNSUPPORTED
                parsing.parse_error = result.error
                parsing.save(update_fields=["parse_status", "parse_error"])
                continue
                
            # If parsed, we must save symbols and imports
            with transaction.atomic():
                parsing.parse_status = CodeParsing.Status.PARSED
                parsing.metrics = result.metrics
                parsing.save(update_fields=["parse_status", "metrics"])
                
                # We need to maintain parent/child relationships for symbols.
                # Since we don't know the primary keys until we insert, we must insert them carefully.
                # Tree traversal order in ast_parser is parent first, then children.
                # Let's insert them one by one or in levels if we want bulk, but one by one is safe for a single file.
                
                # Delete existing if any (in case of a retry or re-parse)
                CodeSymbol.objects.filter(parsing=parsing).delete()
                CodeImport.objects.filter(parsing=parsing).delete()
                
                # Bulk create imports
                if result.imports:
                    CodeImport.objects.bulk_create([
                        CodeImport(
                            parsing=parsing,
                            imported_module=imp.imported_module[:1000],
                            imported_name=imp.imported_name[:500],
                            alias=imp.alias[:500],
                            start_line=imp.start_line
                        ) for imp in result.imports
                    ], batch_size=200)
                    
                # Insert symbols and keep track of mapping from node_id to DB ID
                node_to_db_id = {}
                for sym in result.symbols:
                    parent_db_id = node_to_db_id.get(sym.parent.node_id) if sym.parent else None
                    db_sym = CodeSymbol.objects.create(
                        parsing=parsing,
                        parent_id=parent_db_id,
                        symbol_type=sym.symbol_type[:50],
                        name=sym.name[:500],
                        qualified_name=sym.qualified_name[:1000],
                        signature=sym.signature,
                        start_line=sym.start_line,
                        end_line=sym.end_line,
                        start_column=sym.start_column,
                        end_column=sym.end_column
                    )
                    node_to_db_id[sym.node_id] = db_sym.id

        except Exception as e:
            logger.exception("Failed to parse SourceContent %s", content_hash)
            parsing.parse_status = CodeParsing.Status.FAILED
            parsing.parse_error = str(e)[:1000]
            parsing.save(update_fields=["parse_status", "parse_error"])

    # After AST generation completes for the repository, generate chunks
    generate_repository_chunks.delay(repo_id)

@shared_task
def generate_repository_chunks(repo_id: int):
    """
    Generate semantic chunks for the parsed files of a repository.
    """
    try:
        repo = Repository.objects.get(pk=repo_id)
    except Repository.DoesNotExist:
        return

    current_model = getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")
    current_dim = getattr(settings, "EMBEDDING_DIMENSION", 1536)
    
    # We find all CodeParsing contexts belonging to this repository
    parsings = CodeParsing.objects.filter(
        source_content__files__repository=repo,
        parse_status=CodeParsing.Status.PARSED
    ).distinct()

    chunks_created = 0

    for parsing in parsings:
        semantic_chunks = generate_ast_chunks(parsing)
        
        # Check existing chunks to avoid exact deduplication regeneration
        # We uniquely identify chunks by their chunk_hash and embedding_model
        
        new_db_chunks = []
        for sc in semantic_chunks:
            # Check if we already have it
            exists = CodeChunk.objects.filter(
                chunk_hash=sc.hash,
                embedding_model=current_model
            ).exists()
            
            if not exists:
                new_db_chunks.append(CodeChunk(
                    source_content=parsing.source_content,
                    code_parsing=parsing,
                    symbol_id=sc.symbol_id,
                    chunk_type=sc.chunk_type,
                    chunk_text=sc.text,
                    start_line=sc.start_line,
                    end_line=sc.end_line,
                    symbol_name=sc.symbol_name,
                    chunk_hash=sc.hash,
                    embedding_model=current_model,
                    embedding_dimension=current_dim,
                    embedding_status=CodeChunk.EmbeddingStatus.PENDING
                ))
        
        if new_db_chunks:
            CodeChunk.objects.bulk_create(new_db_chunks, batch_size=200, ignore_conflicts=True)
            chunks_created += len(new_db_chunks)

    # After chunks are created, trigger embedding generation globally if there are pending chunks.
    if chunks_created > 0:
        process_pending_embeddings.delay()


@shared_task
def process_pending_embeddings():
    """
    Batch process pending embeddings globally.
    """
    current_model = getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")
    
    # Grab a batch of pending chunks
    batch_size = 100
    
    # We must lock the rows so parallel tasks don't embed the same chunks twice
    pending_chunks = list(
        CodeChunk.objects.select_for_update(skip_locked=True).filter(
            embedding_status=CodeChunk.EmbeddingStatus.PENDING,
            embedding_model=current_model
        )[:batch_size]
    )
    
    if not pending_chunks:
        return
        
    # Mark them as processing
    chunk_ids = [c.id for c in pending_chunks]
    CodeChunk.objects.filter(id__in=chunk_ids).update(embedding_status=CodeChunk.EmbeddingStatus.PROCESSING)
    
    texts_to_embed = [c.chunk_text for c in pending_chunks]
    
    try:
        embeddings = generate_embeddings(texts_to_embed)
        
        # Update chunks
        for chunk, emb in zip(pending_chunks, embeddings):
            chunk.embedding = emb
            chunk.embedding_status = CodeChunk.EmbeddingStatus.EMBEDDED
            
        CodeChunk.objects.bulk_update(pending_chunks, ["embedding", "embedding_status"], batch_size=100)
        
    except Exception as e:
        logger.exception("Failed to generate embeddings batch")
        CodeChunk.objects.filter(id__in=chunk_ids).update(embedding_status=CodeChunk.EmbeddingStatus.FAILED)
        
    # If we processed a full batch, there might be more, queue another run
    if len(pending_chunks) == batch_size:
        process_pending_embeddings.delay()
