from analysis.engines.dag import build_commit_dag, layered_positions


def test_dag_topological_order_respects_parents():
    commits = [
        {"hash": "a", "parent_hashes": [], "author_name": "alice", "message": "root"},
        {"hash": "b", "parent_hashes": ["a"], "author_name": "bob", "message": "feat"},
        {"hash": "c", "parent_hashes": ["b"], "author_name": "carol", "message": "fix"},
        {"hash": "d", "parent_hashes": ["b", "c"], "author_name": "dave", "message": "merge"},
    ]
    dag = build_commit_dag(commits)

    assert set(dag.topological_order) == {"a", "b", "c", "d"}
    assert dag.topological_order.index("a") < dag.topological_order.index("b")
    assert dag.topological_order.index("b") < dag.topological_order.index("c")
    assert dag.topological_order.index("c") < dag.topological_order.index("d")
    assert ("a", "b") in dag.edges
    assert ("b", "c") in dag.edges
    assert ("b", "d") in dag.edges
    assert ("c", "d") in dag.edges


def test_dag_drops_parents_outside_ingested_set():
    commits = [
        {"hash": "b", "parent_hashes": ["missing"], "author_name": "bob", "message": "x"},
    ]
    dag = build_commit_dag(commits)
    assert dag.topological_order == ["b"]
    assert dag.edges == []


def test_layered_positions_assign_depths():
    commits = [
        {"hash": "a", "parent_hashes": []},
        {"hash": "b", "parent_hashes": ["a"]},
        {"hash": "c", "parent_hashes": ["b"]},
    ]
    dag = build_commit_dag(commits)
    pos = layered_positions(dag)
    assert pos["a"][0] == 0
    assert pos["b"][0] == 1
    assert pos["c"][0] == 2
