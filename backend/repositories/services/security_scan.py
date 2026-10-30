"""Static security heuristics: secret leakage + risky code patterns."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RawFinding:
    category: str  # secret | vulnerability | misconfig
    severity: str  # critical | high | medium | low | info
    rule_id: str
    title: str
    description: str
    line_number: int
    evidence: str


def _mask_secret(text: str) -> str:
    """Redact likely secret material while keeping enough context to locate it."""
    if len(text) <= 8:
        return "***"
    return text[:4] + "…" + text[-2:]


def _line_evidence(line: str, match: re.Match | None = None) -> str:
    snippet = line.strip()
    if len(snippet) > 160:
        snippet = snippet[:157] + "..."
    if match:
        secret = match.group(0)
        if len(secret) >= 8:
            snippet = snippet.replace(secret, _mask_secret(secret))
    return snippet


SECRET_RULES: list[tuple[str, str, str, str, re.Pattern[str]]] = [
    (
        "secret.aws_access_key",
        "critical",
        "AWS Access Key ID",
        "Hard-coded AWS access key ID detected.",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    ),
    (
        "secret.github_pat",
        "critical",
        "GitHub Personal Access Token",
        "GitHub token (ghp_/github_pat_) appears in source.",
        re.compile(r"\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,})\b"),
    ),
    (
        "secret.slack_token",
        "high",
        "Slack Token",
        "Slack bot/user token pattern found.",
        re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b"),
    ),
    (
        "secret.google_api_key",
        "high",
        "Google API Key",
        "Google API key pattern (AIza…) found.",
        re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"),
    ),
    (
        "secret.stripe_key",
        "critical",
        "Stripe Secret Key",
        "Stripe live/test secret key pattern found.",
        re.compile(r"\bsk_(?:live|test)_[0-9A-Za-z]{20,}\b"),
    ),
    (
        "secret.private_key",
        "critical",
        "Private Key Block",
        "PEM private key header found in a tracked file.",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    ),
    (
        "secret.generic_assignment",
        "high",
        "Hard-coded Credential Assignment",
        "Likely secret assigned to a sensitive variable name.",
        re.compile(
            r"""(?i)\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|private[_-]?key)\b\s*[:=]\s*['\"][^'\"]{8,}['\"]"""
        ),
    ),
    (
        "secret.jwt_like",
        "medium",
        "JWT-like Token",
        "String looks like a JWT (three base64 segments).",
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    ),
]

VULN_RULES: list[tuple[str, str, str, str, re.Pattern[str]]] = [
    (
        "vuln.eval",
        "high",
        "Dynamic eval()",
        "Use of eval() can execute attacker-controlled code.",
        re.compile(r"\beval\s*\("),
    ),
    (
        "vuln.exec",
        "high",
        "Dynamic exec()",
        "Use of exec() can execute attacker-controlled code.",
        re.compile(r"\bexec\s*\("),
    ),
    (
        "vuln.pickle_loads",
        "high",
        "Unsafe pickle.loads",
        "Untrusted pickle deserialization can lead to RCE.",
        re.compile(r"\bpickle\.loads?\s*\("),
    ),
    (
        "vuln.shell_true",
        "high",
        "subprocess shell=True",
        "shell=True enables command injection if input is unsanitized.",
        re.compile(r"subprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*True"),
    ),
    (
        "vuln.os_system",
        "high",
        "os.system() Call",
        "os.system() is prone to command injection.",
        re.compile(r"\bos\.system\s*\("),
    ),
    (
        "vuln.inner_html",
        "medium",
        "innerHTML Assignment",
        "Assigning to innerHTML can introduce XSS.",
        re.compile(r"\.innerHTML\s*="),
    ),
    (
        "vuln.dangerously_set_inner_html",
        "medium",
        "dangerouslySetInnerHTML",
        "React dangerouslySetInnerHTML can introduce XSS if content is untrusted.",
        re.compile(r"dangerouslySetInnerHTML"),
    ),
    (
        "vuln.document_write",
        "medium",
        "document.write()",
        "document.write() with untrusted input can introduce XSS.",
        re.compile(r"\bdocument\.write\s*\("),
    ),
    (
        "vuln.tls_verify_false",
        "high",
        "TLS Verification Disabled",
        "verify=False disables certificate validation (MITM risk).",
        re.compile(r"""verify\s*=\s*False"""),
    ),
    (
        "vuln.md5_password",
        "medium",
        "Weak Hash for Secrets",
        "MD5/SHA1 used near password/hash context is cryptographically weak.",
        re.compile(r"""(?i)(?:password|passwd|secret).{0,40}\b(?:md5|sha1)\b|\b(?:md5|sha1)\b.{0,40}(?:password|passwd|secret)"""),
    ),
]

MISCONFIG_RULES: list[tuple[str, str, str, str, re.Pattern[str]]] = [
    (
        "misconfig.debug_true",
        "medium",
        "DEBUG Enabled in Code",
        "Hard-coded DEBUG = True may leak in production.",
        re.compile(r"""(?i)\bDEBUG\s*=\s*True\b"""),
    ),
    (
        "misconfig.cors_star",
        "medium",
        "Permissive CORS (*)",
        "Allowing all origins (CORS *) can enable cross-site data theft.",
        re.compile(r"""(?i)(?:allow_origins|allowed_origins|Access-Control-Allow-Origin).{0,40}['\"]\*['\"]"""),
    ),
]

SKIP_PATH_FRAGMENTS = (
    "node_modules/",
    "vendor/",
    ".venv/",
    "dist/",
    "build/",
    "coverage/",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".min.js",
    ".map",
)


def should_skip_path(file_path: str) -> bool:
    lowered = file_path.replace("\\", "/").lower()
    return any(frag in lowered for frag in SKIP_PATH_FRAGMENTS)


def scan_text(content: str, file_path: str = "") -> list[RawFinding]:
    """Scan a single file's text content and return findings."""
    if should_skip_path(file_path):
        return []
    if not content or content.startswith("\x00"):
        return []

    findings: list[RawFinding] = []
    lines = content.splitlines()
    # Cap scan size for pathological files
    max_lines = min(len(lines), 20_000)

    rules = SECRET_RULES + VULN_RULES + MISCONFIG_RULES
    for idx in range(max_lines):
        line = lines[idx]
        if not line or line.lstrip().startswith(("#", "//", "*", "<!--")):
            # Still scan comments for secrets — secrets often hide in comments.
            pass
        for rule_id, severity, title, description, pattern in rules:
            category = rule_id.split(".", 1)[0]
            # Map rule prefix to category name used by API
            category = {
                "secret": "secret",
                "vuln": "vulnerability",
                "misconfig": "misconfig",
            }.get(category, "vulnerability")

            for match in pattern.finditer(line):
                findings.append(
                    RawFinding(
                        category=category,
                        severity=severity,
                        rule_id=rule_id,
                        title=title,
                        description=description,
                        line_number=idx + 1,
                        evidence=_line_evidence(line, match if category == "secret" else None),
                    )
                )

    # Deduplicate identical rule+line hits
    unique: dict[tuple[str, int, str], RawFinding] = {}
    for f in findings:
        unique[(f.rule_id, f.line_number, f.evidence)] = f
    return list(unique.values())
