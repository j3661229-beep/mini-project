from repositories.services.security_scan import scan_text


def test_detects_github_token_and_masks_evidence():
    content = 'token = "ghp_123456789012345678901234567890123456"\n'
    findings = scan_text(content, "config.py")
    secrets = [f for f in findings if f.rule_id == "secret.github_pat"]
    assert len(secrets) == 1
    assert secrets[0].severity == "critical"
    assert "ghp_123456789012345678901234567890123456" not in secrets[0].evidence
    assert "…" in secrets[0].evidence


def test_detects_eval_and_shell_true():
    content = (
        "x = eval(user_input)\n"
        "subprocess.run(cmd, shell=True)\n"
    )
    findings = scan_text(content, "app.py")
    ids = {f.rule_id for f in findings}
    assert "vuln.eval" in ids
    assert "vuln.shell_true" in ids


def test_skips_node_modules():
    content = 'api_key = "supersecretvalue123"\n'
    assert scan_text(content, "frontend/node_modules/pkg/index.js") == []


def test_private_key_block():
    content = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n"
    findings = scan_text(content, "id_rsa")
    assert any(f.rule_id == "secret.private_key" for f in findings)
