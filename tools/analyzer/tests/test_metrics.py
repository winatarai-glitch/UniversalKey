"""Unit tests for metrics.py (Wave 2, M3).

Three tests:
    1. test_pagerank_sums_to_one        — 4-node ring graph; PR sums to 1.0.
    2. test_louvain_deterministic_with_seed — 6-node two-cluster graph;
       partition is label-identical across 3 seeded runs.
    3. test_betweenness_k_subsamples    — same 6-node graph; betweenness_k=3
       returns all nodes with values in [0, 1].
"""

from __future__ import annotations

import networkx as nx
import pytest

from universalkey_analyzer.metrics import compute


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _ring_graph() -> nx.DiGraph:
    """4-node directed ring: a→b→c→d→a."""
    G = nx.DiGraph()
    G.add_edge("a", "b")
    G.add_edge("b", "c")
    G.add_edge("c", "d")
    G.add_edge("d", "a")
    return G


def _two_cluster_graph() -> nx.DiGraph:
    """6-node graph with two obvious triangles bridged by a single edge.

    Cluster 1: a–b–c (triangle)
    Cluster 2: d–e–f (triangle)
    Bridge:    c–d
    """
    G = nx.DiGraph()
    # Triangle 1
    G.add_edge("a", "b")
    G.add_edge("b", "c")
    G.add_edge("c", "a")
    # Triangle 2
    G.add_edge("d", "e")
    G.add_edge("e", "f")
    G.add_edge("f", "d")
    # Single bridge
    G.add_edge("c", "d")
    return G


# ---------------------------------------------------------------------------
# Test 1 — PageRank sums to 1.0
# ---------------------------------------------------------------------------

def test_pagerank_sums_to_one() -> None:
    """PageRank scores on a 4-node ring must sum to 1.0 (±1e-6)."""
    G = _ring_graph()
    result = compute(G)

    pr = result.pagerank

    # All 4 nodes present
    assert set(pr.keys()) == {"a", "b", "c", "d"}

    # Scores sum to 1.0 within floating-point tolerance
    assert abs(sum(pr.values()) - 1.0) < 1e-6


# ---------------------------------------------------------------------------
# Test 2 — Louvain is label-identical across 3 seeded runs
# ---------------------------------------------------------------------------

def test_louvain_deterministic_with_seed() -> None:
    """Running compute() 3× with louvain_seed=42 must yield identical partitions."""
    G = _two_cluster_graph()

    result_1 = compute(G, louvain_seed=42)
    result_2 = compute(G, louvain_seed=42)
    result_3 = compute(G, louvain_seed=42)

    p1 = result_1.louvain_partition
    p2 = result_2.louvain_partition
    p3 = result_3.louvain_partition

    # Label-identical dict comparison (not just modularity similarity)
    assert p1 == p2, f"Run 1 vs Run 2 differ: {p1!r} != {p2!r}"
    assert p2 == p3, f"Run 2 vs Run 3 differ: {p2!r} != {p3!r}"

    # Sanity: partition covers all 6 nodes
    assert set(p1.keys()) == {"a", "b", "c", "d", "e", "f"}


# ---------------------------------------------------------------------------
# Test 3 — betweenness_k subsampling returns all nodes in [0, 1]
# ---------------------------------------------------------------------------

def test_betweenness_k_subsamples() -> None:
    """betweenness_k=3 must return a dict with every node, values in [0, 1]."""
    G = _two_cluster_graph()
    result = compute(G, betweenness_k=3)

    bc = result.betweenness

    # All 6 nodes present (sampling skips pivot selection, not nodes in output)
    assert set(bc.keys()) == {"a", "b", "c", "d", "e", "f"}

    # All values are valid centrality scores
    for node, score in bc.items():
        assert 0.0 <= score <= 1.0, (
            f"betweenness score for {node!r} out of range: {score}"
        )


# ---------------------------------------------------------------------------
# Bonus — empty graph raises ValueError (contract guard)
# ---------------------------------------------------------------------------

def test_empty_graph_raises() -> None:
    """compute() on an empty graph must raise ValueError per contract."""
    G = nx.DiGraph()
    with pytest.raises(ValueError, match="non-empty graph"):
        compute(G)
