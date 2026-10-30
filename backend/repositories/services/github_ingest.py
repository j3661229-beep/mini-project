"""Fetch PR + review metadata via PyGithub."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

from django.conf import settings
from github import Github, GithubException, RateLimitExceededException
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class ParsedReview:
    reviewer_login: str
    review_state: str
    github_review_id: int | None = None


@dataclass
class ParsedPullRequestFile:
    file_path: str
    status: str
    additions: int
    deletions: int
    patch: str
    is_truncated: bool


@dataclass
class ParsedPullRequest:
    pr_number: int
    author_login: str
    state: str
    created_at: datetime
    merged_at: datetime | None
    reviews: list[ParsedReview] = field(default_factory=list)
    files: list[ParsedPullRequestFile] = field(default_factory=list)


def fetch_pull_requests(
    owner: str,
    name: str,
    token: str | None = None,
    on_progress=None,
) -> list[ParsedPullRequest]:
    """
    Fetch closed/merged PRs and their reviews.
    On rate limit: return whatever was collected and let the caller finish
    commit-based analysis rather than sleeping for hours.
    """
    auth_token = token if token is not None else settings.GITHUB_TOKEN
    # Disable urllib3 retries so 403 rate-limits fail fast instead of multi-hour backoff.
    no_retry = Retry(total=0, redirect=False, raise_on_status=False)
    client = (
        Github(auth_token, per_page=20, retry=no_retry, seconds_between_requests=0.0)
        if auth_token
        else Github(per_page=20, retry=no_retry, seconds_between_requests=0.0)
    )

    # Fail fast when unauthenticated quota is already exhausted.
    try:
        rate = client.get_rate_limit()
        remaining = None
        if hasattr(rate, "resources") and getattr(rate.resources, "core", None):
            remaining = rate.resources.core.remaining
        elif hasattr(rate, "core") and rate.core is not None:
            remaining = rate.core.remaining
        elif hasattr(rate, "rate") and rate.rate is not None:
            remaining = rate.rate.remaining
        if remaining is not None and remaining < 15:
            raise RuntimeError(
                "GitHub API rate limit nearly exhausted. Set GITHUB_TOKEN or retry later."
            )
    except RuntimeError:
        raise
    except RateLimitExceededException as exc:
        raise RuntimeError(
            "GitHub API rate limit exceeded. Set GITHUB_TOKEN or retry later."
        ) from exc
    except GithubException:
        pass
    except Exception:  # noqa: BLE001
        pass

    try:
        repo = client.get_repo(f"{owner}/{name}")
    except RateLimitExceededException as exc:
        raise RuntimeError(
            "GitHub API rate limit exceeded. Set GITHUB_TOKEN or retry later."
        ) from exc
    except GithubException as exc:
        if exc.status == 404:
            raise RuntimeError(f"GitHub repository {owner}/{name} not found or private.") from exc
        raise RuntimeError(f"GitHub API error: {exc.data}") from exc

    results: list[ParsedPullRequest] = []
    # Keep PR work bounded so ingestion cannot stall for tens of minutes.
    pr_cap = 25 if auth_token else 8

    try:
        pulls = repo.get_pulls(state="closed", sort="updated", direction="desc")
        for idx, pr in enumerate(pulls):
            if idx >= pr_cap:
                break
            if on_progress:
                try:
                    on_progress(idx + 1, pr_cap)
                except Exception:  # noqa: BLE001
                    pass
            author = pr.user.login if pr.user else "unknown"
            state = "merged" if pr.merged else pr.state
            reviews: list[ParsedReview] = []
            files: list[ParsedPullRequestFile] = []
            if pr.merged:
                try:
                    reviews = _fetch_reviews(pr)
                    files = _fetch_pr_files(pr)
                except RateLimitExceededException:
                    logger.warning("Rate limited while fetching PR details; returning partial PR data")
                    break
                except GithubException as exc:
                    if exc.status in (403, 429):
                        logger.warning("GitHub %s on PR details; returning partial data", exc.status)
                        break
                    logger.warning("Skipping details for PR #%s: %s", pr.number, exc)
            results.append(
                ParsedPullRequest(
                    pr_number=pr.number,
                    author_login=author,
                    state=state,
                    created_at=pr.created_at,
                    merged_at=pr.merged_at,
                    reviews=reviews,
                    files=files,
                )
            )
    except RateLimitExceededException:
        logger.warning(
            "GitHub rate limit hit after %s PRs for %s/%s — continuing with partial data",
            len(results),
            owner,
            name,
        )
    except GithubException as exc:
        if exc.status == 403:
            logger.warning("GitHub 403 while fetching PRs (%s); returning partial data", exc.data)
        else:
            raise RuntimeError(f"Failed to fetch pull requests: {exc.data}") from exc

    return results


def _fetch_reviews(pr) -> list[ParsedReview]:
    reviews: list[ParsedReview] = []
    for review in pr.get_reviews():
        if not review.user:
            continue
        state = (review.state or "COMMENTED").lower()
        reviews.append(
            ParsedReview(
                reviewer_login=review.user.login,
                review_state=state,
                github_review_id=review.id,
            )
        )
    return reviews


def _fetch_pr_files(pr) -> list[ParsedPullRequestFile]:
    files: list[ParsedPullRequestFile] = []
    max_patch_size = settings.MAX_PR_PATCH_SIZE
    
    for f in pr.get_files():
        patch = f.patch or ""
        is_truncated = False
        
        # Check bytes length if we want to be precise, but string len is close enough
        if len(patch.encode('utf-8')) > max_patch_size:
            patch = ""
            is_truncated = True
            
        files.append(
            ParsedPullRequestFile(
                file_path=f.filename[:1000],
                status=f.status,
                additions=f.additions,
                deletions=f.deletions,
                patch=patch,
                is_truncated=is_truncated
            )
        )
    return files
