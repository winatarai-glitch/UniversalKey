"""PageRank + Louvain communities + betweenness centrality.

Determinism rules (Wave 6 A1 audits these):
    - Input graph must have nodes inserted in sorted ID order
      (load.load_graph guarantees this).
    - PageRank pinned to alpha=0.85, tol=1e-6, max_iter=100, weight=None default.
    - Louvain pinned to random_state=42.
    - Betweenness uses k=None for full computation by default; --betweenness-k flag
      enables sampling for runtime escape hatch.
    - Compare partition LABELS, not float modularity (NumPy LSB drift across versions).

Public API:
    compute(G, *, louvain_seed, betweenness_k, edge_weight_scheme) -> MetricsResult

Wave 1.5 stub. Wave 2 fills bodies.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Literal

import networkx as nx
from community import community_louvain


@dataclass(frozen=True)
class MetricsResult:
    """All metric outputs for a single graph analysis run.

    Attributes:
        pagerank: node_id -> PageRank score (sums to 1.0 ± floating-point ε).
        louvain_partition: node_id -> community_id (integer label).
        betweenness: node_id -> betweenness centrality score.
        modularity: Louvain modularity score for the partition.
        community_sizes: community_id -> number of nodes in that community.
        config: Snapshot of the configuration used (for reproducibility in report).
    """
    pagerank: dict[str, float]
    louvain_partition: dict[str, int]
    betweenness: dict[str, float]
    modularity: float
    community_sizes: dict[int, int]
    config: dict[str, str | int | float | None]


EdgeWeightScheme = Literal["uniform", "typed-bonus"]
"""How to weight edges in PageRank.

- "uniform": all edges weight=1 (default; matches B4 sanity baseline).
- "typed-bonus": frontmatter typed edges weight=2.0, body edges weight=1.0.
  Experimental — does NOT preserve the B4 `index` top-3 anchor.
"""


def compute(
    G: nx.DiGraph,
    *,
    louvain_seed: int = 42,
    betweenness_k: int | None = None,
    edge_weight_scheme: EdgeWeightScheme = "uniform",
) -> MetricsResult:
    """Compute PageRank + Louvain + betweenness on the merged graph.

    Algorithm:
        1. PageRank: nx.pagerank(G, alpha=0.85, tol=1e-6, max_iter=100,
           weight=<scheme-dependent>).
        2. Louvain: convert DiGraph to undirected for community_louvain
           (python-louvain operates on undirected); call best_partition(seed=...).
        3. Betweenness: nx.betweenness_centrality(G, k=betweenness_k, normalized=True,
           seed=42 if k is not None).

    Args:
        G: The merged graph (body + frontmatter typed edges). Nodes MUST be in
           sorted ID order — caller (cli.py) guarantees this via load.load_graph.
        louvain_seed: Random state for python-louvain. Default 42.
        betweenness_k: If provided, sample k pivot nodes for betweenness
           (runtime escape hatch). Default None = full computation.
        edge_weight_scheme: "uniform" (default) or "typed-bonus".

    Returns:
        MetricsResult dataclass with all four metric outputs + config snapshot.

    Raises:
        ValueError: If G is empty (caller should detect and produce zero-row report instead).
    """
    if G.number_of_nodes() == 0:
        raise ValueError(
            "compute() requires non-empty graph; caller should detect zero nodes"
            " and emit zero-row report"
        )

    # --- 0-edge graceful path (Wave 7 patch from Wave 4 finding) ---
    # PageRank IS defined for an edgeless graph (uniform 1/N). Louvain modularity
    # is undefined (raises ValueError), and betweenness is trivially zero. Return
    # the meaningful uniform result instead of letting Louvain abort the run.
    if G.number_of_edges() == 0:
        n = G.number_of_nodes()
        uniform_pr: dict[str, float] = {node: 1.0 / n for node in G.nodes()}
        partition_each_singleton: dict[str, int] = {
            node: idx for idx, node in enumerate(G.nodes())
        }
        sizes_each_singleton: dict[int, int] = dict(
            Counter(partition_each_singleton.values())
        )
        return MetricsResult(
            pagerank=uniform_pr,
            louvain_partition=partition_each_singleton,
            betweenness={node: 0.0 for node in G.nodes()},
            modularity=0.0,
            community_sizes=sizes_each_singleton,
            config={
                "alpha": 0.85,
                "tol": 1e-6,
                "max_iter": 100,
                "weight_scheme": edge_weight_scheme,
                "louvain_seed": louvain_seed,
                "betweenness_k": betweenness_k,
                "edgeless_graph": True,
            },
        )

    # --- PageRank ---
    if edge_weight_scheme == "uniform":
        weight_kwarg: str | None = None
        G_pr = G
    else:
        # "typed-bonus": copy graph, assign per-edge weights
        G_pr = G.copy()
        for s, t, data in G_pr.edges(data=True):
            data["weight"] = (
                2.0 if data.get("source_layer") in {"frontmatter", "both"} else 1.0
            )
        weight_kwarg = "weight"

    pagerank: dict[str, float] = nx.pagerank(
        G_pr, alpha=0.85, tol=1e-6, max_iter=100, weight=weight_kwarg
    )

    # --- Louvain (requires undirected graph) ---
    G_und = G.to_undirected(reciprocal=False)
    partition: dict[str, int] = community_louvain.best_partition(
        G_und, random_state=louvain_seed
    )
    modularity: float = community_louvain.modularity(partition, G_und)
    community_sizes: dict[int, int] = dict(Counter(partition.values()))

    # --- Betweenness centrality ---
    seed_kwarg = 42 if betweenness_k is not None else None
    betweenness: dict[str, float] = nx.betweenness_centrality(
        G, k=betweenness_k, normalized=True, seed=seed_kwarg
    )

    config: dict[str, str | int | float | None] = {
        "alpha": 0.85,
        "tol": 1e-6,
        "max_iter": 100,
        "weight_scheme": edge_weight_scheme,
        "louvain_seed": louvain_seed,
        "betweenness_k": betweenness_k,
    }

    return MetricsResult(
        pagerank=pagerank,
        louvain_partition=partition,
        betweenness=betweenness,
        modularity=modularity,
        community_sizes=community_sizes,
        config=config,
    )
