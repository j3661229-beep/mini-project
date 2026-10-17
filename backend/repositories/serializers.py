from rest_framework import serializers

from repositories.models import (
    Commit, FileOwnership, Repository, SourceFile, PullRequest, PullRequestFile,
    PRReview, CodeParsing, CodeSymbol, CodeImport
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


class PRReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = PRReview
        fields = [
            "id",
            "reviewer_login",
            "review_state",
            "github_review_id",
        ]


class PullRequestSummarySerializer(serializers.ModelSerializer):
    files_count = serializers.IntegerField(read_only=True, default=0)
    total_additions = serializers.IntegerField(read_only=True, default=0)
    total_deletions = serializers.IntegerField(read_only=True, default=0)
    review_count = serializers.IntegerField(read_only=True, default=0)
    latest_review_state = serializers.CharField(read_only=True, default="")

    class Meta:
        model = PullRequest
        fields = [
            "id",
            "pr_number",
            "author_login",
            "state",
            "created_at",
            "merged_at",
            "files_count",
            "total_additions",
            "total_deletions",
            "review_count",
            "latest_review_state",
        ]


class PullRequestDetailSerializer(serializers.ModelSerializer):
    files = PullRequestFileDetailSerializer(many=True, read_only=True)
    reviews = PRReviewSerializer(many=True, read_only=True)
    total_files = serializers.SerializerMethodField()
    total_additions = serializers.SerializerMethodField()
    total_deletions = serializers.SerializerMethodField()
    risk_assessment = serializers.SerializerMethodField()

    class Meta:
        model = PullRequest
        fields = [
            "id",
            "pr_number",
            "author_login",
            "state",
            "created_at",
            "merged_at",
            "files",
            "reviews",
            "total_files",
            "total_additions",
            "total_deletions",
            "risk_assessment",
        ]

    def get_total_files(self, obj) -> int:
        return obj.files.count()

    def get_total_additions(self, obj) -> int:
        return sum(f.additions for f in obj.files.all())

    def get_total_deletions(self, obj) -> int:
        return sum(f.deletions for f in obj.files.all())

    def get_risk_assessment(self, obj) -> list[dict]:
        risks = []
        for f in obj.files.all():
            ownership = FileOwnership.objects.filter(
                repository=obj.repository, file_path=f.file_path
            ).first()
            if ownership and ownership.bus_factor_risk:
                risks.append({
                    "file_path": f.file_path,
                    "top_contributor": ownership.top_contributor,
                    "top_contributor_share": ownership.top_contributor_share,
                    "bus_factor_risk": True,
                    "warning": f"File '{f.file_path}' has {int(ownership.top_contributor_share * 100)}% ownership by {ownership.top_contributor}.",
                })
        return risks



class ChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField()


class ChatQuerySerializer(serializers.Serializer):
    query = serializers.CharField(required=False, default="")
    message = serializers.CharField(required=False, default="")
    history = ChatMessageSerializer(many=True, required=False, default=list)
    top_k = serializers.IntegerField(required=False, default=6, min_value=1, max_value=20)

    def validate(self, attrs):
        query = attrs.get("query") or attrs.get("message")
        if not query or not query.strip():
            raise serializers.ValidationError("Either 'query' or 'message' is required.")
        attrs["query"] = query.strip()
        return attrs


class RAGSourceSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    file_path = serializers.CharField()
    symbol_name = serializers.CharField(allow_blank=True)
    chunk_type = serializers.CharField()
    start_line = serializers.IntegerField()
    end_line = serializers.IntegerField()
    similarity = serializers.FloatField()
    snippet = serializers.CharField()


class ChatResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    sources = RAGSourceSerializer(many=True)
    repository = serializers.DictField()
    model = serializers.CharField()

