from django.db import models
from django.utils.translation import gettext_lazy as _
from pgvector.django import VectorField, HnswIndex


class Repository(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    github_url = models.URLField(unique=True)
    owner = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    error_message = models.TextField(blank=True, null=True)
    last_ingested_at = models.DateTimeField(null=True, blank=True)
    commit_cap_reached = models.BooleanField(default=False)
    ingestion_locked_at = models.DateTimeField(null=True, blank=True, default=None)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "repositories"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.owner}/{self.name}"


class Commit(models.Model):
    repository = models.ForeignKey(
        Repository,
        on_delete=models.CASCADE,
        related_name="commits",
        db_index=True,
    )
    hash = models.CharField(max_length=40, db_index=True)
    author_name = models.CharField(max_length=255)
    author_email = models.CharField(max_length=255)
    committed_at = models.DateTimeField()
    parent_hashes = models.JSONField(default=list)
    message = models.TextField()
    branch = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["repository", "committed_at"]),
            models.Index(fields=["repository", "hash"]),
        ]
        unique_together = [("repository", "hash")]
        ordering = ["committed_at"]

    def __str__(self) -> str:
        return self.hash[:8]


class CommitFile(models.Model):
    commit = models.ForeignKey(
        Commit,
        on_delete=models.CASCADE,
        related_name="files",
        db_index=True,
    )
    file_path = models.CharField(max_length=1000)
    insertions = models.IntegerField(default=0)
    deletions = models.IntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["commit", "file_path"]),
        ]

    def __str__(self) -> str:
        return self.file_path


class PullRequest(models.Model):
    repository = models.ForeignKey(
        Repository,
        on_delete=models.CASCADE,
        related_name="pull_requests",
        db_index=True,
    )
    pr_number = models.IntegerField()
    author_login = models.CharField(max_length=255)
    state = models.CharField(max_length=20)
    created_at = models.DateTimeField()
    merged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["repository", "pr_number"]),
        ]
        unique_together = [("repository", "pr_number")]

    def __str__(self) -> str:
        return f"#{self.pr_number}"


class PRReview(models.Model):
    pull_request = models.ForeignKey(
        PullRequest,
        on_delete=models.CASCADE,
        related_name="reviews",
        db_index=True,
    )
    reviewer_login = models.CharField(max_length=255)
    review_state = models.CharField(max_length=30)
    github_review_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["pull_request", "reviewer_login"]),
        ]
        unique_together = [("pull_request", "github_review_id")]

    def __str__(self) -> str:
        return f"{self.reviewer_login}:{self.review_state}"


class FileOwnership(models.Model):
    """Precomputed by the analysis engine — one row per file per repo."""

    repository = models.ForeignKey(
        Repository,
        on_delete=models.CASCADE,
        related_name="ownership",
        db_index=True,
    )
    file_path = models.CharField(max_length=1000)
    top_contributor = models.CharField(max_length=255)
    top_contributor_share = models.FloatField()
    bus_factor_risk = models.BooleanField(default=False)
    contributor_count = models.IntegerField(default=1)
    total_churn = models.IntegerField(default=0)

    class Meta:
        verbose_name_plural = "file ownership"
        indexes = [
            models.Index(fields=["repository", "bus_factor_risk"]),
            models.Index(fields=["repository", "file_path"]),
        ]
        unique_together = [("repository", "file_path")]

    def __str__(self) -> str:
        return self.file_path


class SourceContent(models.Model):
    hash = models.CharField(max_length=64, primary_key=True)
    content = models.TextField(blank=True)
    is_binary = models.BooleanField(default=False)
    is_skipped_size = models.BooleanField(default=False)
    size = models.IntegerField(default=0)

    def __str__(self) -> str:
        return self.hash[:8]


class SourceFile(models.Model):
    repository = models.ForeignKey(
        Repository,
        on_delete=models.CASCADE,
        related_name="source_files",
        db_index=True,
    )
    commit = models.ForeignKey(
        Commit,
        on_delete=models.CASCADE,
        related_name="source_files",
        db_index=True,
    )
    file_path = models.CharField(max_length=1000)
    source_content = models.ForeignKey(
        SourceContent,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="files",
    )
    status = models.CharField(max_length=20)
    previous_path = models.CharField(max_length=1000, blank=True)
    language = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["repository", "commit", "file_path"]),
            models.Index(fields=["repository", "file_path"]),
        ]
        unique_together = [("repository", "commit", "file_path")]

    def __str__(self) -> str:
        return self.file_path


class PullRequestFile(models.Model):
    pull_request = models.ForeignKey(
        PullRequest,
        on_delete=models.CASCADE,
        related_name="files",
        db_index=True,
    )
    file_path = models.CharField(max_length=1000)
    status = models.CharField(max_length=20)
    additions = models.IntegerField(default=0)
    deletions = models.IntegerField(default=0)
    patch = models.TextField(blank=True)
    is_truncated = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["pull_request", "file_path"]),
        ]
        unique_together = [("pull_request", "file_path")]

    def __str__(self) -> str:
        return f"{self.pull_request.pr_number}: {self.file_path}"


class CodeParsing(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PARSED = "parsed", "Parsed"
        UNSUPPORTED = "unsupported", "Unsupported"
        FAILED = "failed", "Failed"

    source_content = models.ForeignKey(
        SourceContent,
        on_delete=models.CASCADE,
        related_name="parsings",
        db_index=True,
    )
    language = models.CharField(max_length=50)
    parser_version = models.CharField(max_length=50)
    parse_status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    parse_error = models.TextField(blank=True, null=True)
    metrics = models.JSONField(blank=True, null=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["source_content", "language", "parser_version"]),
        ]
        unique_together = [("source_content", "language", "parser_version")]

    def __str__(self) -> str:
        return f"{self.source_content.hash[:8]} ({self.language})"


class CodeSymbol(models.Model):
    parsing = models.ForeignKey(
        CodeParsing,
        on_delete=models.CASCADE,
        related_name="symbols",
        db_index=True,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    symbol_type = models.CharField(max_length=50)
    name = models.CharField(max_length=500)
    qualified_name = models.CharField(max_length=1000)
    signature = models.TextField(blank=True)
    start_line = models.IntegerField(default=0)
    end_line = models.IntegerField(default=0)
    start_column = models.IntegerField(default=0)
    end_column = models.IntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["parsing", "start_line"]),
            models.Index(fields=["parsing", "symbol_type"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self) -> str:
        return f"{self.symbol_type}: {self.name}"


class CodeChunk(models.Model):
    class ChunkType(models.TextChoices):
        FUNCTION = "function", _("Function")
        METHOD = "method", _("Method")
        CLASS_CONTEXT = "class_context", _("Class Context")
        FILE_FALLBACK = "file_fallback", _("File Fallback")
        COMMIT_MESSAGE = "commit_message", _("Commit Message")
        PR_PATCH = "pr_patch", _("PR Patch")

    class EmbeddingStatus(models.TextChoices):
        PENDING = "pending", _("Pending")
        PROCESSING = "processing", _("Processing")
        EMBEDDED = "embedded", _("Embedded")
        FAILED = "failed", _("Failed")
        SKIPPED = "skipped", _("Skipped")

    source_content = models.ForeignKey(SourceContent, on_delete=models.CASCADE, null=True, blank=True)
    code_parsing = models.ForeignKey(CodeParsing, on_delete=models.CASCADE, null=True, blank=True)
    symbol = models.ForeignKey(CodeSymbol, on_delete=models.SET_NULL, null=True, blank=True)
    
    chunk_type = models.CharField(max_length=50, choices=ChunkType.choices)
    chunk_text = models.TextField()
    start_line = models.IntegerField(null=True, blank=True)
    end_line = models.IntegerField(null=True, blank=True)
    symbol_name = models.CharField(max_length=1000, blank=True)
    
    # Exact input deduplication hash: SHA-256(chunk_text)
    chunk_hash = models.CharField(max_length=64, db_index=True)
    
    embedding = VectorField(null=True, blank=True) # Omitting dimension to allow multiple model versions
    embedding_model = models.CharField(max_length=100, blank=True)
    embedding_dimension = models.IntegerField(null=True, blank=True)
    embedding_status = models.CharField(max_length=20, choices=EmbeddingStatus.choices, default=EmbeddingStatus.PENDING)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["chunk_hash", "embedding_model"]),
            # Add HNSW index using vector_cosine_ops
            # HnswIndex(
            #     name="codechunk_embedding_hnsw",
            #     fields=["embedding"],
            #     m=16,
            #     ef_construction=64,
            #     opclasses=["vector_cosine_ops"]
            # )
        ]


class CodeImport(models.Model):
    parsing = models.ForeignKey(
        CodeParsing,
        on_delete=models.CASCADE,
        related_name="imports",
        db_index=True,
    )
    imported_module = models.CharField(max_length=1000)
    imported_name = models.CharField(max_length=500, blank=True)
    alias = models.CharField(max_length=500, blank=True)
    start_line = models.IntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["parsing", "imported_module"]),
        ]

    def __str__(self) -> str:
        return f"import {self.imported_module}"
