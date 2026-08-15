"""Validate and sanitize GitHub repository URLs before cloning."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

GITHUB_HOSTS = {"github.com", "www.github.com"}
OWNER_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


class InvalidRepoURL(ValueError):
    """Raised when a repository URL fails validation."""


@dataclass(frozen=True)
class ParsedRepoURL:
    owner: str
    name: str
    clone_url: str
    github_url: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.name}"


def parse_github_url(raw_url: str) -> ParsedRepoURL:
    """
    Accept https://github.com/owner/repo[.git][/...] forms only.
    Rejects path traversal, non-GitHub hosts, and malformed owner/repo names.
    """
    if not raw_url or not isinstance(raw_url, str):
        raise InvalidRepoURL("Repository URL is required.")

    url = raw_url.strip()
    if any(ch in url for ch in ("\x00", ";", "|", "&", "`", "$", "(", ")")):
        raise InvalidRepoURL("Repository URL contains disallowed characters.")

    if url.startswith("git@"):
        raise InvalidRepoURL("Only HTTPS GitHub URLs are supported.")

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise InvalidRepoURL("Repository URL must use HTTPS.")
    if parsed.hostname not in GITHUB_HOSTS:
        raise InvalidRepoURL("Only public github.com repositories are supported.")

    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise InvalidRepoURL("URL must be of the form github.com/owner/repo.")

    owner, name = parts[0], parts[1]
    if name.endswith(".git"):
        name = name[:-4]

    if ".." in owner or ".." in name:
        raise InvalidRepoURL("Path traversal is not allowed in repository URLs.")
    if not OWNER_REPO_RE.match(owner) or not OWNER_REPO_RE.match(name):
        raise InvalidRepoURL("Invalid owner or repository name.")

    github_url = f"https://github.com/{owner}/{name}"
    clone_url = f"{github_url}.git"
    return ParsedRepoURL(owner=owner, name=name, clone_url=clone_url, github_url=github_url)
