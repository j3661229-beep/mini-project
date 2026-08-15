from django.conf import settings
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response

from analysis.engines.review_graph import compute_review_graph
from repositories.models import (
    Commit,
    FileOwnership,
    PRReview,
    PullRequestFile,
    Repository,
    SourceFile,
    CodeParsing,
    CodeSymbol,
    CodeImport,
    CodeChunk,
)
from pgvector.django import CosineDistance
from repositories.services.embeddings import generate_embeddings
from repositories.serializers import (
    CommitSerializer,
    FileOwnershipSerializer,
    PullRequestFileDetailSerializer,
    PullRequestFileSerializer,
    RepositoryCreateSerializer,
    RepositorySerializer,
    RepositoryStatusSerializer,
    ReviewGraphSerializer,
    SourceFileDetailSerializer,
    SourceFileSerializer,
    SummarySerializer,
    CodeSymbolSerializer,
    CodeImportSerializer,
)
from repositories.tasks import ingest_repository


def enqueue_ingestion(repo_id: int) -> None:
    """
    Always return control to the HTTP handler quickly.
    With CELERY_TASK_ALWAYS_EAGER (no Redis worker), run in a daemon thread
    so the API still returns a job id immediately.
    """
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        import threading

        threading.Thread(
            target=lambda: ingest_repository.run(repo_id),
            daemon=True,
            name=f"ingest-repo-{repo_id}",
        ).start()
    else:
        ingest_repository.delay(repo_id)


class CommitCursorPagination(CursorPagination):
    page_size = 100
    ordering = "committed_at"
    cursor_query_param = "cursor"


class RepositoryViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Repository.objects.all()
    serializer_class = RepositorySerializer

    def create(self, request, *args, **kwargs):
        serializer = RepositoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parsed = serializer.context["parsed_repo"]

        repo, created = Repository.objects.get_or_create(
            github_url=parsed.github_url,
            defaults={
                "owner": parsed.owner,
                "name": parsed.name,
                "status": Repository.Status.PENDING,
            },
        )

        # Re-enqueue if previously failed or if explicitly re-requested
        if created or repo.status in (
            Repository.Status.FAILED,
            Repository.Status.COMPLETE,
            Repository.Status.PENDING,
        ):
            if not created and repo.status != Repository.Status.PROCESSING:
                repo.status = Repository.Status.PENDING
                repo.error_message = None
                repo.save(update_fields=["status", "error_message"])
            if repo.status != Repository.Status.PROCESSING:
                enqueue_ingestion(repo.id)

        return Response(
            RepositorySerializer(repo).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="status")
    def status_view(self, request, pk=None):
        repo = self.get_object()
        return Response(RepositoryStatusSerializer(repo).data)

    @action(detail=True, methods=["get"], url_path="commits")
    def commits(self, request, pk=None):
        repo = self.get_object()
        qs = Commit.objects.filter(repository=repo).order_by("committed_at")
        paginator = CommitCursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = CommitSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="ownership")
    def ownership(self, request, pk=None):
        repo = self.get_object()
        qs = FileOwnership.objects.filter(repository=repo).order_by(
            "-bus_factor_risk", "-top_contributor_share"
        )
        risk_only = request.query_params.get("risk_only")
        if risk_only in ("1", "true", "True"):
            qs = qs.filter(bus_factor_risk=True)
        return Response(FileOwnershipSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="reviews")
    def reviews(self, request, pk=None):
        repo = self.get_object()
        rows = list(
            PRReview.objects.filter(pull_request__repository=repo)
            .select_related("pull_request")
            .values_list("reviewer_login", "pull_request__author_login")
        )
        graph = compute_review_graph(
            [{"reviewer_login": r, "author_login": a} for r, a in rows]
        )
        payload = {
            "edges": [
                {"reviewer": e.reviewer, "author": e.author, "count": e.count}
                for e in graph.edges
            ],
            "nodes": [
                {
                    "login": n.login,
                    "in_degree": n.in_degree,
                    "out_degree": n.out_degree,
                    "is_bottleneck": n.is_bottleneck,
                }
                for n in graph.nodes
            ],
        }
        return Response(ReviewGraphSerializer(payload).data)

    @action(detail=True, methods=["get"], url_path="summary")
    def summary(self, request, pk=None):
        repo = self.get_object()
        commit_count = repo.commits.count()
        contributor_count = (
            repo.commits.order_by("author_email")
            .values("author_email")
            .distinct()
            .count()
        )
        pr_count = repo.pull_requests.count()
        at_risk = repo.ownership.filter(bus_factor_risk=True).count()

        review_rows = list(
            PRReview.objects.filter(pull_request__repository=repo).values_list(
                "reviewer_login", "pull_request__author_login"
            )
        )
        graph = compute_review_graph(
            [{"reviewer_login": r, "author_login": a} for r, a in review_rows]
        )
        bottleneck_count = sum(1 for n in graph.nodes if n.is_bottleneck)

        payload = {
            "owner": repo.owner,
            "name": repo.name,
            "status": repo.status,
            "commit_count": commit_count,
            "contributor_count": contributor_count,
            "pr_count": pr_count,
            "at_risk_file_count": at_risk,
            "bottleneck_count": bottleneck_count,
            "commit_cap_reached": repo.commit_cap_reached,
            "last_ingested_at": repo.last_ingested_at,
        }
        return Response(SummarySerializer(payload).data)

    @action(detail=True, methods=["get"], url_path="files")
    def files(self, request, pk=None):
        repo = self.get_object()
        qs = SourceFile.objects.filter(repository=repo).select_related("commit", "source_content").order_by("-id")
        
        paginator = CursorPagination()
        paginator.ordering = "-id"
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = SourceFileSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path=r"files/(?P<file_id>\d+)")
    def files_detail(self, request, pk=None, file_id=None):
        repo = self.get_object()
        try:
            file_obj = SourceFile.objects.select_related("commit", "source_content").get(repository=repo, id=file_id)
        except SourceFile.DoesNotExist:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = SourceFileDetailSerializer(file_obj)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path=r"commits/(?P<commit_hash>[^/.]+)/files")
    def commit_files(self, request, pk=None, commit_hash=None):
        repo = self.get_object()
        qs = SourceFile.objects.filter(repository=repo, commit__hash=commit_hash).select_related("commit", "source_content").order_by("id")
        
        paginator = CursorPagination()
        paginator.ordering = "id"
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = SourceFileSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path=r"pull-requests/(?P<pr_number>\d+)/files")
    def pr_files(self, request, pk=None, pr_number=None):
        repo = self.get_object()
        qs = PullRequestFile.objects.filter(pull_request__repository=repo, pull_request__pr_number=pr_number).order_by("id")
        
        paginator = CursorPagination()
        paginator.ordering = "id"
        page = paginator.paginate_queryset(qs, request, view=self)
        
        # We can use DetailSerializer if we want patches inline for PRs, but since PR patches can be large,
        # let's stick to the prompt requirement: "Do not return huge source files unnecessarily in list endpoints."
        # However, a specific PR's files are bounded. But standard Serializer excludes `patch`.
        # If we need the patch, we'd add a detail endpoint, or just return it if it's not huge.
        # Let's just use the detail serializer here if the query param asks for it, or just return list.
        # The prompt asked for GET /api/repositories/{id}/pull-requests/{pr_number}/files/
        include_patch = request.query_params.get("include_patch", "false").lower() == "true"
        SerializerClass = PullRequestFileDetailSerializer if include_patch else PullRequestFileSerializer
        
        serializer = SerializerClass(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="symbols")
    def symbols(self, request, pk=None):
        repo = self.get_object()
        qs = CodeSymbol.objects.filter(parsing__source_content__sourcefile__repository=repo).distinct().order_by("id")
        
        paginator = CursorPagination()
        paginator.ordering = "id"
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = CodeSymbolSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="imports")
    def imports(self, request, pk=None):
        repo = self.get_object()
        qs = CodeImport.objects.filter(parsing__source_content__sourcefile__repository=repo).distinct().order_by("id")
        
        paginator = CursorPagination()
        paginator.ordering = "id"
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = CodeImportSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path=r"files/(?P<file_id>\d+)/symbols")
    def file_symbols(self, request, pk=None, file_id=None):
        repo = self.get_object()
        try:
            file_obj = SourceFile.objects.get(repository=repo, id=file_id)
        except SourceFile.DoesNotExist:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)
            
        qs = CodeSymbol.objects.filter(
            parsing__source_content=file_obj.source_content_id,
            parsing__language=file_obj.language
        ).order_by("start_line")
        
        paginator = CursorPagination()
        paginator.ordering = "start_line"
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = CodeSymbolSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="code-metrics")
    def code_metrics(self, request, pk=None):
        repo = self.get_object()
        # For a simple aggregate, sum metrics over uniquely parsed contents
        # tied to the repo. A more precise metric would scope to a specific commit.
        # But this suffices for an overall repository view.
        parsings = CodeParsing.objects.filter(
            source_content__sourcefile__repository=repo,
            parse_status="parsed"
        ).distinct()
        
        total_loc = 0
        total_classes = 0
        total_functions = 0
        total_methods = 0
        total_imports = 0
        
        for p in parsings:
            m = p.metrics or {}
            total_loc += m.get("loc", 0)
            total_classes += m.get("classes", 0)
            total_functions += m.get("functions", 0)
            total_methods += m.get("methods", 0)
            total_imports += m.get("imports", 0)
            
        return Response({
            "total_loc": total_loc,
            "total_classes": total_classes,
            "total_functions": total_functions,
            "total_methods": total_methods,
            "total_imports": total_imports,
            "parsed_files": parsings.count()
        })

    @action(detail=True, methods=["get"], url_path="semantic-search")
    def semantic_search(self, request, pk=None):
        repo = self.get_object()
        query = request.query_params.get("q", "").strip()
        top_k = int(request.query_params.get("top_k", 10))
        
        if not query:
            return Response({"error": "Query parameter 'q' is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        # 1. Embed the query
        try:
            query_vector = generate_embeddings([query])[0]
        except Exception as e:
            return Response({"error": "Failed to generate query embedding"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
        # 2. Search CodeChunks scoped to repository
        # Use pgvector CosineDistance
        try:
            chunks = (
                CodeChunk.objects.filter(
                    source_content__files__repository=repo,
                    embedding_status=CodeChunk.EmbeddingStatus.EMBEDDED
                )
                .annotate(similarity=1 - CosineDistance("embedding", query_vector))
                .order_by(CosineDistance("embedding", query_vector))
                [:top_k]
            )
            
            results = []
            for chunk in chunks:
                # Resolve file path
                source_file = SourceFile.objects.filter(
                    repository=repo, 
                    source_content=chunk.source_content
                ).first()
                file_path = source_file.file_path if source_file else None
                
                results.append({
                    "id": chunk.id,
                    "file_path": file_path,
                    "symbol_name": chunk.symbol_name,
                    "chunk_type": chunk.chunk_type,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "similarity": chunk.similarity,
                    "chunk_text_snippet": chunk.chunk_text[:500] + ("..." if len(chunk.chunk_text) > 500 else "")
                })
                
            return Response({"results": results})
        except Exception as e:
            # Fallback if DB doesn't support vector ops (e.g. SQLite local dev)
            import logging
            logging.error(f"Semantic search DB error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
