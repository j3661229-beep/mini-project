from django.contrib import admin

from .models import (
    Commit,
    CommitFile,
    FileOwnership,
    PRReview,
    PullRequest,
    Repository,
    SecurityFinding,
)


@admin.register(Repository)
class RepositoryAdmin(admin.ModelAdmin):
    list_display = ("owner", "name", "status", "last_ingested_at", "created_at")
    list_filter = ("status",)
    search_fields = ("owner", "name", "github_url")


@admin.register(Commit)
class CommitAdmin(admin.ModelAdmin):
    list_display = ("hash", "author_name", "committed_at", "repository")
    search_fields = ("hash", "author_name", "message")
    raw_id_fields = ("repository",)


@admin.register(CommitFile)
class CommitFileAdmin(admin.ModelAdmin):
    list_display = ("file_path", "insertions", "deletions", "commit")
    search_fields = ("file_path",)
    raw_id_fields = ("commit",)


@admin.register(PullRequest)
class PullRequestAdmin(admin.ModelAdmin):
    list_display = ("pr_number", "author_login", "state", "repository")
    list_filter = ("state",)
    raw_id_fields = ("repository",)


@admin.register(PRReview)
class PRReviewAdmin(admin.ModelAdmin):
    list_display = ("reviewer_login", "review_state", "pull_request")
    raw_id_fields = ("pull_request",)


@admin.register(FileOwnership)
class FileOwnershipAdmin(admin.ModelAdmin):
    list_display = (
        "file_path",
        "top_contributor",
        "top_contributor_share",
        "bus_factor_risk",
        "repository",
    )
    list_filter = ("bus_factor_risk",)
    search_fields = ("file_path", "top_contributor")
    raw_id_fields = ("repository",)


@admin.register(SecurityFinding)
class SecurityFindingAdmin(admin.ModelAdmin):
    list_display = ("severity", "category", "title", "file_path", "line_number", "repository")
    list_filter = ("severity", "category")
    search_fields = ("title", "file_path", "rule_id", "evidence")
    raw_id_fields = ("repository", "source_file")
