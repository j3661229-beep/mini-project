from repositories.services.url_validation import InvalidRepoURL, parse_github_url
import pytest


def test_parse_valid_url():
    parsed = parse_github_url("https://github.com/django/django")
    assert parsed.owner == "django"
    assert parsed.name == "django"
    assert parsed.clone_url.endswith(".git")


def test_rejects_non_github():
    with pytest.raises(InvalidRepoURL):
        parse_github_url("https://gitlab.com/foo/bar")


def test_rejects_path_traversal():
    with pytest.raises(InvalidRepoURL):
        parse_github_url("https://github.com/foo/../../../etc/passwd")


def test_strips_git_suffix():
    parsed = parse_github_url("https://github.com/owner/repo.git")
    assert parsed.name == "repo"
