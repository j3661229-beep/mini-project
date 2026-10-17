"""Automated Pull Request Code Review service powered by Google Gemini."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from django.conf import settings
from repositories.models import FileOwnership, PullRequest, PullRequestFile
from repositories.services.rag import call_gemini_llm

logger = logging.getLogger(__name__)


def generate_ai_pr_review(pull_request: PullRequest) -> dict[str, Any]:
    """
    Perform an automated context-aware code review for a Pull Request.
    Combines diff analysis, commit history, and code ownership risks with Google Gemini.
    """
    repo = pull_request.repository
    files = list(PullRequestFile.objects.filter(pull_request=pull_request).order_by("file_path"))
    total_additions = sum(f.additions for f in files)
    total_deletions = sum(f.deletions for f in files)

    # 1. Ownership & Bus Factor Risk Analysis for touched files
    ownership_risks = []
    for f in files:
        ownership = FileOwnership.objects.filter(
            repository=repo, file_path=f.file_path
        ).first()
        if ownership:
            is_risk = ownership.bus_factor_risk or (
                ownership.top_contributor.lower() != pull_request.author_login.lower()
                and ownership.top_contributor_share >= 0.70
            )
            if is_risk:
                ownership_risks.append({
                    "file_path": f.file_path,
                    "top_contributor": ownership.top_contributor,
                    "top_contributor_share": ownership.top_contributor_share,
                    "bus_factor_risk": ownership.bus_factor_risk,
                })

    # 2. Build Prompt Context
    system_prompt = (
        f"You are GitPulse Senior Code Review Architect powered by Google Gemini.\n"
        f"You are performing an automated, objective code review for Pull Request #{pull_request.pr_number} "
        f"in repository '{repo.owner}/{repo.name}'.\n\n"
        "Instructions:\n"
        "1. Structure your review into clear Markdown sections:\n"
        "   - **Summary of Changes**: Concise overview of what this PR modifies.\n"
        "   - **Code Quality & Architecture**: Strengths, potential bugs, edge cases, error handling.\n"
        "   - **Ownership & Risk Assessment**: Highlight modifications to critical files or bus-factor ownership risks.\n"
        "   - **Actionable Recommendations**: Specific suggestions with code snippets where appropriate.\n"
        "   - **Review Verdict**: State clearly in the final line one of: [VERDICT: APPROVE], [VERDICT: COMMENT], or [VERDICT: REQUEST_CHANGES].\n"
        "2. Keep feedback professional, technical, constructive, and concise."
    )

    diff_lines = []
    diff_lines.append(f"### Pull Request Metadata")
    diff_lines.append(f"- **Repository**: {repo.owner}/{repo.name}")
    diff_lines.append(f"- **PR Number**: #{pull_request.pr_number}")
    diff_lines.append(f"- **Author**: @{pull_request.author_login}")
    diff_lines.append(f"- **State**: {pull_request.state}")
    diff_lines.append(f"- **Files Changed**: {len(files)} (+{total_additions} / -{total_deletions})")

    if ownership_risks:
        diff_lines.append("\n### High Ownership Concentration Alerts:")
        for r in ownership_risks:
            diff_lines.append(
                f"- `{r['file_path']}`: {int(r['top_contributor_share'] * 100)}% authored by @{r['top_contributor']}"
            )

    diff_lines.append("\n### Modified Files & Code Patches:")
    total_patch_chars = 0
    max_patch_chars = 8000

    if files:
        for f in files:
            diff_lines.append(f"\n#### File: `{f.file_path}` ({f.status}, +{f.additions}/-{f.deletions})")
            if f.patch:
                patch_snippet = f.patch
                if total_patch_chars + len(patch_snippet) > max_patch_chars:
                    allowed = max(0, max_patch_chars - total_patch_chars)
                    patch_snippet = patch_snippet[:allowed] + "\n... [diff truncated for length]"
                total_patch_chars += len(patch_snippet)
                diff_lines.append("```diff")
                diff_lines.append(patch_snippet.strip())
                diff_lines.append("```")
            else:
                diff_lines.append("*(Binary or patch diff not stored)*")
    else:
        diff_lines.append("*(No changed file diffs recorded for this PR)*")

    user_content = "\n".join(diff_lines)

    # 3. Call Google Gemini or Fallback
    gemini_key = (
        settings.GEMINI_API_KEY
        if hasattr(settings, "GEMINI_API_KEY")
        else (os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", ""))
    )
    model = getattr(settings, "LLM_MODEL", "gemini-2.5-flash")

    if gemini_key:
        try:
            review_text = call_gemini_llm(
                model_name=model,
                system_prompt=system_prompt,
                user_content=user_content,
                api_key=gemini_key,
            )
            used_model = f"google/{model}"
        except Exception as exc:
            logger.exception("Gemini PR review generation failed for PR #%s: %s", pull_request.pr_number, exc)
            review_text = _build_local_pr_review(pull_request, files, ownership_risks, total_additions, total_deletions, error=str(exc))
            used_model = f"{model} (fallback)"
    else:
        review_text = _build_local_pr_review(pull_request, files, ownership_risks, total_additions, total_deletions)
        used_model = "gitpulse-local-review"

    # 4. Extract Verdict
    verdict = "COMMENT"
    if "[VERDICT: APPROVE]" in review_text or "APPROVE" in review_text.splitlines()[-2:]:
        verdict = "APPROVE"
    elif "[VERDICT: REQUEST_CHANGES]" in review_text or "REQUEST_CHANGES" in review_text.splitlines()[-2:]:
        verdict = "REQUEST_CHANGES"
    elif total_deletions > 200 or len(ownership_risks) >= 2:
        verdict = "COMMENT"
    else:
        verdict = "APPROVE"

    return {
        "pr_number": pull_request.pr_number,
        "verdict": verdict,
        "review": review_text,
        "model": used_model,
        "files_analyzed": len(files),
        "total_additions": total_additions,
        "total_deletions": total_deletions,
        "ownership_risks": ownership_risks,
    }


def _build_local_pr_review(
    pull_request: PullRequest,
    files: list[PullRequestFile],
    ownership_risks: list[dict],
    total_additions: int,
    total_deletions: int,
    error: str | None = None,
) -> str:
    """Deterministic local code analysis review when live LLM is inactive."""
    lines = []
    gemini_key = getattr(settings, "GEMINI_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")

    if error:
        lines.append(f"> ⚠️ **Live LLM Notice**: Google Gemini call encountered an issue ({error}). Displaying local analysis.\n")
    elif not gemini_key:
        lines.append(
            "> ℹ️ **Notice**: `GEMINI_API_KEY` is not configured. Live generative critique is running in local analysis mode.\n"
        )

    lines.append(f"## Automated Pull Request Review for #{pull_request.pr_number}")
    lines.append(f"**Author**: @{pull_request.author_login} | **Status**: {pull_request.state.upper()}")
    lines.append(f"- **Volume**: {len(files)} files changed, +{total_additions} additions, -{total_deletions} deletions.")

    lines.append("\n### Code & Ownership Impact Assessment:")
    if ownership_risks:
        lines.append(
            f"⚠️ **Attention**: This pull request touches **{len(ownership_risks)}** files with high historical author ownership:"
        )
        for r in ownership_risks:
            lines.append(
                f"- `{r['file_path']}`: Top contributor @{r['top_contributor']} ({int(r['top_contributor_share']*100)}% churn share). Recommend requesting review from @{r['top_contributor']}."
            )
    else:
        lines.append("✓ No concentrated single-author bus-factor risks detected in modified files.")

    lines.append("\n### Modified File Breakdown:")
    for f in files[:10]:
        lines.append(f"- `{f.file_path}`: {f.status} (+{f.additions}/-{f.deletions})")
    if len(files) > 10:
        lines.append(f"- ...and {len(files) - 10} more files.")

    lines.append("\n### Recommendations:")
    lines.append("1. Verify test coverage for all modified paths before merging.")
    lines.append("2. Ensure CI lint and regression suites pass cleanly.")
    if ownership_risks:
        lines.append("3. Cross-validate changes with primary code owners identified above.")

    verdict_tag = "[VERDICT: APPROVE]" if not ownership_risks else "[VERDICT: COMMENT]"
    lines.append(f"\n{verdict_tag}")
    return "\n".join(lines)
