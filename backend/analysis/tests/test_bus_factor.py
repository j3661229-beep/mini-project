from analysis.engines.bus_factor import compute_file_ownership


def test_bus_factor_flags_single_owner():
    rows = [
        {"file_path": "src/core.py", "insertions": 80, "deletions": 20, "author_name": "alice"},
        {"file_path": "src/core.py", "insertions": 5, "deletions": 0, "author_name": "bob"},
        {"file_path": "src/utils.py", "insertions": 10, "deletions": 10, "author_name": "alice"},
        {"file_path": "src/utils.py", "insertions": 10, "deletions": 10, "author_name": "bob"},
    ]
    results = {r.file_path: r for r in compute_file_ownership(rows)}

    core = results["src/core.py"]
    assert core.top_contributor == "alice"
    assert core.top_contributor_share >= 0.8
    assert core.bus_factor_risk is True

    utils = results["src/utils.py"]
    assert utils.bus_factor_risk is False
    assert utils.contributor_count == 2


def test_bus_factor_zero_churn_counts_as_touch():
    rows = [
        {"file_path": "a.txt", "insertions": 0, "deletions": 0, "author_name": "solo"},
    ]
    results = compute_file_ownership(rows)
    assert len(results) == 1
    assert results[0].top_contributor == "solo"
    assert results[0].bus_factor_risk is True
    assert results[0].total_churn == 1


def test_bus_factor_uses_commit_author_name_key():
    rows = [
        {
            "file_path": "x.py",
            "insertions": 9,
            "deletions": 1,
            "commit__author_name": "carol",
        },
    ]
    results = compute_file_ownership(rows)
    assert results[0].top_contributor == "carol"
