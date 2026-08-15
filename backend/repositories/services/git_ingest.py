"""Git clone + commit log parsing via GitPython."""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from git import Repo
from git.exc import GitCommandError

logger = logging.getLogger(__name__)


import hashlib

@dataclass
class ParsedSourceFile:
    content: str
    hash: str
    is_binary: bool
    is_skipped_size: bool
    size: int
    status: str
    previous_path: str = ""
    language: str = ""


@dataclass
class ParsedCommitFile:
    file_path: str
    insertions: int
    deletions: int
    source_file: ParsedSourceFile | None = None


@dataclass
class ParsedCommit:
    hash: str
    author_name: str
    author_email: str
    committed_at: datetime
    parent_hashes: list[str]
    message: str
    branch: str
    files: list[ParsedCommitFile] = field(default_factory=list)


@dataclass
class CloneResult:
    commits: list[ParsedCommit]
    cap_reached: bool
    clone_path: Path


def clone_and_parse(
    clone_url: str,
    repo_id: int,
    commit_cap: int | None = None,
    existing_hashes: set[str] | None = None,
) -> CloneResult:
    """
    Shallow-clone a repo into a temp dir and parse commit history.
    Caller is responsible for cleanup via cleanup_clone().

    If existing_hashes is provided, commits whose hash is in the set
    will still be returned (for DAG topology) but their file stats
    will NOT be re-parsed, saving significant time on re-ingestion.
    """
    cap = commit_cap if commit_cap is not None else settings.INGESTION_COMMIT_CAP
    base = Path(settings.CLONE_BASE_DIR)
    base.mkdir(parents=True, exist_ok=True)
    clone_path = base / f"repo_{repo_id}"

    if clone_path.exists():
        shutil.rmtree(clone_path, ignore_errors=True)

    try:
        # Depth large enough for the cap; still avoids full history for huge repos.
        depth = min(max(cap, 50), 5000)
        repo = Repo.clone_from(
            clone_url,
            str(clone_path),
            multi_options=[f"--depth={depth}", "--no-single-branch"],
        )
    except GitCommandError as exc:
        raise RuntimeError(f"Failed to clone repository: {exc}") from exc

    commits, cap_reached = _parse_commits(repo, cap, existing_hashes or set())
    return CloneResult(commits=commits, cap_reached=cap_reached, clone_path=clone_path)


def cleanup_clone(clone_path: Path | None) -> None:
    if clone_path and clone_path.exists():
        shutil.rmtree(clone_path, ignore_errors=True)


def _parse_commits(
    repo: Repo, cap: int, existing_hashes: set[str] | None = None,
) -> tuple[list[ParsedCommit], bool]:
    """Parse commits from a cloned repo, skipping file stats for known hashes."""
    known = existing_hashes or set()
    branch_map = _build_branch_map(repo)
    parsed: list[ParsedCommit] = []
    cap_reached = False

    try:
        iterator = repo.iter_commits(all=True, max_count=cap + 1)
    except GitCommandError as exc:
        raise RuntimeError(f"Failed to read commit log: {exc}") from exc

    for idx, commit in enumerate(iterator):
        if idx >= cap:
            cap_reached = True
            break

        committed_at = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
        parent_hashes = [p.hexsha for p in commit.parents]

        # Skip expensive file-stat parsing for commits we already have
        if commit.hexsha in known:
            files = []
        else:
            files = _parse_commit_files(commit)

        parsed.append(
            ParsedCommit(
                hash=commit.hexsha,
                author_name=commit.author.name or "unknown",
                author_email=commit.author.email or "",
                committed_at=committed_at,
                parent_hashes=parent_hashes,
                message=(commit.message or "").strip(),
                branch=branch_map.get(commit.hexsha, ""),
                files=files,
            )
        )

    # Chronological order for storage / timeline rendering
    parsed.sort(key=lambda c: c.committed_at)
    return parsed, cap_reached


def _build_branch_map(repo: Repo) -> dict[str, str]:
    """Map tip commits to branch names (best-effort for shallow clones)."""
    mapping: dict[str, str] = {}
    for ref in repo.refs:
        name = ref.name
        if name.startswith("origin/"):
            name = name[len("origin/") :]
        if name == "HEAD":
            continue
        try:
            mapping[ref.commit.hexsha] = name
        except Exception:  # noqa: BLE001 — shallow refs can be incomplete
            continue
    return mapping


def _detect_language(path: str) -> str:
    ext = Path(path).suffix.lower()
    mapping = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".jsx": "javascript", ".tsx": "typescript", ".html": "html",
        ".css": "css", ".java": "java", ".c": "c", ".cpp": "cpp",
        ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php",
        ".sh": "shell", ".md": "markdown", ".json": "json",
    }
    return mapping.get(ext, "")


def _extract_source_blob(blob, status: str, previous_path: str = "") -> ParsedSourceFile:
    if not blob:
        return ParsedSourceFile(
            content="", hash="", is_binary=False, is_skipped_size=False,
            size=0, status=status, previous_path=previous_path
        )
    
    size = blob.size
    max_size = settings.MAX_SOURCE_FILE_SIZE

    if size > max_size:
        return ParsedSourceFile(
            content="", hash="", is_binary=False, is_skipped_size=True,
            size=size, status=status, previous_path=previous_path,
            language=_detect_language(blob.path)
        )

    # Read binary
    raw = blob.data_stream.read()
    
    # Binary detection (null bytes in first 1024 bytes)
    is_binary = b"\x00" in raw[:1024]
    
    if is_binary:
        return ParsedSourceFile(
            content="", hash="", is_binary=True, is_skipped_size=False,
            size=size, status=status, previous_path=previous_path,
            language=_detect_language(blob.path)
        )

    # Decode text and hash
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Fallback if it's not valid utf-8
        is_binary = True
        text = ""
        
    sha256 = hashlib.sha256(raw).hexdigest()

    return ParsedSourceFile(
        content=text, hash=sha256 if not is_binary else "", is_binary=is_binary,
        is_skipped_size=False, size=size, status=status, previous_path=previous_path,
        language=_detect_language(blob.path)
    )


def _parse_commit_files(commit) -> list[ParsedCommitFile]:
    files: list[ParsedCommitFile] = []
    try:
        if not commit.parents:
            # Root commit — all added
            for diff in commit.diff(None, create_patch=False):
                path = diff.b_path or diff.a_path
                if not path:
                    continue
                blob = diff.b_blob or diff.a_blob
                src = _extract_source_blob(blob, "A")
                files.append(
                    ParsedCommitFile(
                        file_path=path[:1000],
                        insertions=0,
                        deletions=0,
                        source_file=src
                    )
                )
            # Add stats if available
            try:
                for path, stats in commit.stats.files.items():
                    # Update existing
                    for f in files:
                        if f.file_path == str(path)[:1000]:
                            f.insertions = int(stats.get("insertions", 0))
                            f.deletions = int(stats.get("deletions", 0))
            except Exception:  # noqa: BLE001
                pass
            return files

        parent = commit.parents[0]
        # First gather diffs to know status and blobs
        diffs = { (d.b_path or d.a_path): d for d in parent.diff(commit, create_patch=False) }
        
        # Then gather stats
        for path, stats in commit.stats.files.items():
            path_str = str(path)[:1000]
            diff = diffs.get(path)
            
            src = None
            if diff:
                status = diff.change_type
                blob = diff.b_blob if status != 'D' else diff.a_blob
                prev_path = diff.a_path if status in ('R', 'C') else ""
                src = _extract_source_blob(blob, status, prev_path)
            else:
                # Fallback if not in diff
                try:
                    blob = commit.tree / path
                    src = _extract_source_blob(blob, "M")
                except KeyError:
                    pass

            files.append(
                ParsedCommitFile(
                    file_path=path_str,
                    insertions=int(stats.get("insertions", 0)),
                    deletions=int(stats.get("deletions", 0)),
                    source_file=src
                )
            )

        # Handle renames/deletes that might not have stats
        existing_paths = {f.file_path for f in files}
        for path, diff in diffs.items():
            if path and path not in existing_paths:
                status = diff.change_type
                blob = diff.b_blob if status != 'D' else diff.a_blob
                prev_path = diff.a_path if status in ('R', 'C') else ""
                src = _extract_source_blob(blob, status, prev_path)
                files.append(
                    ParsedCommitFile(
                        file_path=path[:1000], insertions=0, deletions=0, source_file=src
                    )
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not parse files for commit %s: %s", commit.hexsha[:8], exc)
    return files
