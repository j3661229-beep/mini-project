from rest_framework import serializers

from repositories.models import (
    Commit, FileOwnership, Repository, SourceFile, PullRequestFile,
    CodeParsing, CodeSymbol, CodeImport
)
from repositories.services.url_validation import InvalidRepoURL, parse_github_url


class RepositoryCreateSerializer(serializers.Serializer):
    github_url = serializers.CharField(max_length=500)

    def validate_github_url(self, value: str) -> str:
        try:
            parsed = parse_github_url(value)
        except InvalidRepoURL as exc:
            raise serializers.ValidationError(str(exc)) from exc
        self.context["parsed_repo"] = parsed
        return parsed.github_url


class RepositorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Repository
        fields = [
            "id",
            "github_url",
            "owner",
            "name",
            "status",
            "error_message",
            "ingestion_stage",
            "last_ingested_at",
            "commit_cap_reached",
            "created_at",
        ]
        read_only_fields = fields


class RepositoryStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Repository
        fields = ["id", "status", "ingestion_stage", "ingestion_progress", "ingestion_stage_started_at", "ingestion_heartbeat_at", "error_message", "commit_cap_reached"]
        read_only_fields = fields


class CommitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commit
        fields = [
            "id",
            "hash",
            "author_name",
            "author_email",
            "committed_at",
            "parent_hashes",
            "message",
            "branch",
        ]
        read_only_fields = fields


class FileOwnershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = FileOwnership
        fields = [
            "file_path",
            "top_contributor",
            "top_contributor_share",
            "bus_factor_risk",
            "contributor_count",
            "total_churn",
        ]
        read_only_fields = fields


class ReviewEdgeSerializer(serializers.Serializer):
    reviewer = serializers.CharField()
    author = serializers.CharField()
    count = serializers.IntegerField()


class ReviewNodeSerializer(serializers.Serializer):
    login = serializers.CharField()
    in_degree = serializers.IntegerField()
    out_degree = serializers.IntegerField()
    is_bottleneck = serializers.BooleanField()


class ReviewGraphSerializer(serializers.Serializer):
    edges = ReviewEdgeSerializer(many=True)
    nodes = ReviewNodeSerializer(many=True)


class SummarySerializer(serializers.Serializer):
    owner = serializers.CharField()
    name = serializers.CharField()
    status = serializers.CharField()
    commit_count = serializers.IntegerField()
    contributor_count = serializers.IntegerField()
    pr_count = serializers.IntegerField()
    at_risk_file_count = serializers.IntegerField()
    bottleneck_count = serializers.IntegerField()
    commit_cap_reached = serializers.BooleanField()
    last_ingested_at = serializers.DateTimeField(allow_null=True)


class SourceFileSerializer(serializers.ModelSerializer):
    hash = serializers.CharField(source="source_content.hash", read_only=True, default="")
    size = serializers.IntegerField(source="source_content.size", read_only=True, default=0)
    is_binary = serializers.BooleanField(source="source_content.is_binary", read_only=True, default=False)
    is_skipped_size = serializers.BooleanField(source="source_content.is_skipped_size", read_only=True, default=False)
    commit_hash = serializers.CharField(source="commit.hash", read_only=True)

    class Meta:
        model = SourceFile
        fields = [
            "id",
            "commit_hash",
            "file_path",
            "status",
            "previous_path",
            "language",
            "hash",
            "size",
            "is_binary",
            "is_skipped_size",
            "created_at",
            "updated_at",
        ]


class SourceFileDetailSerializer(SourceFileSerializer):
    content = serializers.CharField(source="source_content.content", read_only=True, default="")

    class Meta(SourceFileSerializer.Meta):
        fields = SourceFileSerializer.Meta.fields + ["content"]


class CodeSymbolSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeSymbol
        fields = [
            "id",
            "symbol_type",
            "name",
            "qualified_name",
            "signature",
            "start_line",
            "end_line",
            "start_column",
            "end_column",
            "parent",
        ]


class CodeImportSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeImport
        fields = [
            "id",
            "imported_module",
            "imported_name",
            "alias",
            "start_line",
        ]


class PullRequestFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = PullRequestFile
        fields = [
            "id",
            "file_path",
            "status",
            "additions",
            "deletions",
            "is_truncated",
        ]


class PullRequestFileDetailSerializer(PullRequestFileSerializer):
    class Meta(PullRequestFileSerializer.Meta):
        fields = PullRequestFileSerializer.Meta.fields + ["patch"]
