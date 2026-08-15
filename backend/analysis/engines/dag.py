"""Commit DAG construction via networkx."""

from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx


@dataclass
class DAGNode:
    hash: str
    parents: list[str] = field(default_factory=list)
    author: str = ""
    message: str = ""
    committed_at: str | None = None
    branch: str = ""


@dataclass
class CommitDAG:
    nodes: list[DAGNode]
    edges: list[tuple[str, str]]  # (parent, child)
    topological_order: list[str]


def build_commit_dag(commits: list[dict]) -> CommitDAG:
    """
    Build a DAG from commit records with parent_hashes.

    Expected keys per commit:
      hash, parent_hashes, author_name?, message?, committed_at?, branch?
    """
    graph = nx.DiGraph()
    node_map: dict[str, DAGNode] = {}

    for c in commits:
        h = c["hash"]
        parents = list(c.get("parent_hashes") or [])
        node = DAGNode(
            hash=h,
            parents=parents,
            author=c.get("author_name", ""),
            message=c.get("message", ""),
            committed_at=str(c["committed_at"]) if c.get("committed_at") else None,
            branch=c.get("branch", ""),
        )
        node_map[h] = node
        graph.add_node(h)

    edges: list[tuple[str, str]] = []
    for h, node in node_map.items():
        for parent in node.parents:
            # Only keep edges whose parent is in the ingested set
            if parent in node_map:
                graph.add_edge(parent, h)
                edges.append((parent, h))

    if not graph.nodes:
        return CommitDAG(nodes=[], edges=[], topological_order=[])

    if not nx.is_directed_acyclic_graph(graph):
        # Git history should be a DAG; break cycles defensively by dropping back-edges
        try:
            cycle = nx.find_cycle(graph, orientation="original")
            for u, v, *_ in cycle:
                if graph.has_edge(u, v):
                    graph.remove_edge(u, v)
                    edges = [(a, b) for a, b in edges if not (a == u and b == v)]
        except nx.NetworkXNoCycle:
            pass

    try:
        topo = list(nx.topological_sort(graph))
    except nx.NetworkXUnfeasible:
        topo = list(graph.nodes())

    nodes = [node_map[h] for h in topo if h in node_map]
    return CommitDAG(nodes=nodes, edges=edges, topological_order=topo)


def layered_positions(dag: CommitDAG) -> dict[str, tuple[float, float]]:
    """
    Assign simple layered (x, y) positions from topological depth.
    Useful as a fallback when the frontend wants precomputed layout hints.
    """
    if not dag.topological_order:
        return {}

    depth: dict[str, int] = {h: 0 for h in dag.topological_order}
    children: dict[str, list[str]] = {h: [] for h in dag.topological_order}
    for parent, child in dag.edges:
        children.setdefault(parent, []).append(child)

    for h in dag.topological_order:
        for child in children.get(h, []):
            depth[child] = max(depth[child], depth[h] + 1)

    # Lane assignment within each depth column
    columns: dict[int, list[str]] = {}
    for h, d in depth.items():
        columns.setdefault(d, []).append(h)

    positions: dict[str, tuple[float, float]] = {}
    for d, hashes in columns.items():
        for i, h in enumerate(hashes):
            positions[h] = (float(d), float(i))
    return positions
