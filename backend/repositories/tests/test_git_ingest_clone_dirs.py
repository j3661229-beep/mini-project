"""Tests for collision-safe temporary Git clone allocation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Lock
from unittest.mock import MagicMock, patch

import pytest
from git.exc import GitCommandError

from repositories.services.git_ingest import cleanup_clone, clone_and_parse


@pytest.fixture
def clone_base(settings, tmp_path):
    base = tmp_path / "tmp_clones"
    settings.CLONE_BASE_DIR = str(base)
    return base


def _successful_clone(recorder):
    def clone_from(url, destination, **_kwargs):
        path = Path(destination)
        assert path.exists()
        assert not any(path.iterdir())
        recorder.append((url, path))
        return MagicMock()

    return clone_from


def _clone(url: str, repo_id: int):
    return clone_and_parse(url, repo_id=repo_id, commit_cap=50)


def test_different_repositories_receive_distinct_clone_directories(clone_base):
    observed = []
    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=_successful_clone(observed)):
        with patch("repositories.services.git_ingest._parse_commits", return_value=([], False)):
            first = _clone("https://github.com/example/project-a.git", 1)
            second = _clone("https://github.com/example/project-b.git", 2)

    assert first.clone_path != second.clone_path
    assert {url for url, _ in observed} == {
        "https://github.com/example/project-a.git",
        "https://github.com/example/project-b.git",
    }
    cleanup_clone(first.clone_path)
    cleanup_clone(second.clone_path)


def test_same_repository_twice_receives_distinct_clone_directories(clone_base):
    observed = []
    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=_successful_clone(observed)):
        with patch("repositories.services.git_ingest._parse_commits", return_value=([], False)):
            first = _clone("https://github.com/example/project.git", 9)
            second = _clone("https://github.com/example/project.git", 9)

    assert first.clone_path != second.clone_path
    cleanup_clone(first.clone_path)
    cleanup_clone(second.clone_path)


def test_stale_predictable_directory_is_not_reused_or_deleted(clone_base):
    stale = clone_base / "repo_2"
    stale.mkdir(parents=True)
    (stale / "leftover.txt").write_text("old clone")
    observed = []

    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=_successful_clone(observed)):
        with patch("repositories.services.git_ingest._parse_commits", return_value=([], False)):
            result = _clone("https://github.com/example/project.git", 2)

    assert result.clone_path != stale
    assert stale.exists()
    assert (stale / "leftover.txt").read_text() == "old clone"
    cleanup_clone(result.clone_path)


def test_concurrent_clone_operations_use_isolated_directories(clone_base):
    observed = []
    observed_lock = Lock()
    barrier = Barrier(3)

    def clone_from(url, destination, **_kwargs):
        path = Path(destination)
        assert path.exists()
        assert not any(path.iterdir())
        with observed_lock:
            observed.append((url, path))
        barrier.wait(timeout=5)
        return MagicMock()

    urls = [
        "https://github.com/example/project-a.git",
        "https://github.com/example/project-b.git",
        "https://github.com/example/project-c.git",
    ]
    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=clone_from):
        with patch("repositories.services.git_ingest._parse_commits", return_value=([], False)):
            with ThreadPoolExecutor(max_workers=3) as pool:
                results = list(pool.map(lambda pair: _clone(*pair), zip(urls, [1, 2, 1])))

    paths = [result.clone_path for result in results]
    assert len(set(paths)) == len(urls)
    assert len({path.name for path in paths}) == len(urls)
    for path in paths:
        cleanup_clone(path)


def test_failed_clone_cleans_up_its_owned_temporary_directory(clone_base):
    allocated = []

    def clone_from(_url, destination, **_kwargs):
        allocated.append(Path(destination))
        raise GitCommandError("git clone", 128, stderr="network failure")

    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=clone_from):
        with pytest.raises(RuntimeError, match="Failed to clone repository"):
            _clone("https://github.com/example/unavailable.git", 3)

    assert allocated
    assert not allocated[0].exists()


def test_successful_clone_is_cleaned_up_after_processing(clone_base):
    observed = []
    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=_successful_clone(observed)):
        with patch("repositories.services.git_ingest._parse_commits", return_value=([], False)):
            result = _clone("https://github.com/example/project.git", 4)

    assert result.clone_path.exists()
    cleanup_clone(result.clone_path)
    assert not result.clone_path.exists()


def test_multiple_repository_urls_in_one_run_do_not_interfere(clone_base):
    observed = []
    urls = [
        "https://github.com/example/one.git",
        "https://github.com/example/two.git",
        "https://github.com/example/three.git",
        "https://github.com/example/four.git",
    ]
    with patch("repositories.services.git_ingest.Repo.clone_from", side_effect=_successful_clone(observed)):
        with patch("repositories.services.git_ingest._parse_commits", return_value=([], False)):
            results = [_clone(url, index) for index, url in enumerate(urls, start=1)]

    assert len({result.clone_path for result in results}) == len(urls)
    assert [url for url, _ in observed] == urls
    for result in results:
        cleanup_clone(result.clone_path)