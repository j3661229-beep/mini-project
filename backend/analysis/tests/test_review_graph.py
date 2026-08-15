from analysis.engines.review_graph import compute_review_edges, compute_review_graph


def test_review_edges_aggregate_and_skip_self():
    rows = [
        {"reviewer_login": "alice", "author_login": "bob"},
        {"reviewer_login": "alice", "author_login": "bob"},
        {"reviewer_login": "alice", "author_login": "carol"},
        {"reviewer_login": "bob", "author_login": "bob"},  # self-review ignored
    ]
    edges = compute_review_edges(rows)
    by_pair = {(e.reviewer, e.author): e.count for e in edges}
    assert by_pair[("alice", "bob")] == 2
    assert by_pair[("alice", "carol")] == 1
    assert ("bob", "bob") not in by_pair


def test_bottleneck_high_reliance_low_reciprocity():
    rows = [
        {"reviewer_login": "alice", "author_login": "bob"},
        {"reviewer_login": "alice", "author_login": "carol"},
        {"reviewer_login": "alice", "author_login": "dave"},
        {"reviewer_login": "alice", "author_login": "erin"},
        # bob rarely reviews anyone
        {"reviewer_login": "bob", "author_login": "carol"},
    ]
    graph = compute_review_graph(rows, bottleneck_in_degree_min=3)
    nodes = {n.login: n for n in graph.nodes}

    assert nodes["alice"].in_degree == 4
    assert nodes["alice"].is_bottleneck is True
    assert nodes["bob"].is_bottleneck is False
