"""Markdown + JSON report rendering for B6 UniversalKey Analyzer.

Writes <out_dir>/report.md (GFM tables) and <out_dir>/report.json (sort_keys)
atomically via temp+rename. Top-N ties broken by node-ID ascending (determinism).
Zero counts emitted for all 20 edge types and 3 source layers.

Empty-graph contract: cli.py must pass a synthetic zero MetricsResult when
metrics.compute() raises ValueError — render() never receives None.

Public API: render(G, metrics, edge_provenance, out_dir) -> None
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import networkx as nx

from universalkey_analyzer.frontmatter_edges import ALL_EDGE_TYPES
from universalkey_analyzer.metrics import MetricsResult

# All edge types that always appear in the histogram (zero counts shown explicitly).
# 17 from ALL_EDGE_TYPES + 3 structural types = 20 rows total.
_HISTOGRAM_EDGE_TYPES: frozenset[str] = ALL_EDGE_TYPES | frozenset({
    "links_to",
    "supersedes",
    "superseded_by",
})

# Source layers always shown in source-layer table (zero counts shown explicitly).
_SOURCE_LAYERS: tuple[str, ...] = ("body", "both", "frontmatter")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _top_n(scores: dict[str, float], n: int) -> list[tuple[str, float]]:
    """Return top-N entries sorted by score DESC, then node-id ASC (deterministic)."""
    return sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:n]


def _atomic_write(path: Path, content: str) -> None:
    """Atomic write via temp+rename (same volume). Unix line endings."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8", newline="\n")
    tmp.replace(path)  # atomic on same volume


def _edge_type_histogram(G: nx.DiGraph) -> dict[str, int]:
    """Count edges by type attribute, filling zeros for all known types."""
    counts: Counter[str] = Counter()
    for s, t in G.edges():
        edge_type = G[s][t].get("type", "links_to")
        counts[edge_type] += 1
    # Ensure all 20 types appear (even at zero)
    result = {et: 0 for et in sorted(_HISTOGRAM_EDGE_TYPES)}
    for et, count in counts.items():
        result[et] = count  # preserves unknown types from real graphs too
    return dict(sorted(result.items()))


def _source_layer_counts(G: nx.DiGraph) -> dict[str, int]:
    """Count edges by source_layer attribute; always emit 3 fixed rows."""
    counts: Counter[str] = Counter()
    for s, t in G.edges():
        layer = G[s][t].get("source_layer", "body")
        counts[layer] += 1
    return {layer: counts.get(layer, 0) for layer in _SOURCE_LAYERS}


def _sanity_anchor(pagerank: dict[str, float]) -> tuple[bool | None, list[str]]:
    """Return (index_in_top_3, top_3_ids). None when 'index' not in graph."""
    top3 = [nid for nid, _ in _top_n(pagerank, 3)]
    if not pagerank:
        return None, []
    if "index" not in pagerank:
        return None, top3
    return "index" in top3, top3


def _md_table(headers: list[str], rows: list[list[str]]) -> str:
    """Render a GitHub-flavored Markdown table."""
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    header_row = "| " + " | ".join(headers) + " |"
    data_rows = ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join([header_row, sep] + data_rows)


def _build_markdown(
    G: nx.DiGraph,
    metrics: MetricsResult,
    edge_type_hist: dict[str, int],
    source_layer_counts: dict[str, int],
    top_pr: list[tuple[str, float]],
    top_bw: list[tuple[str, float]],
    top_communities: list[tuple[int, int]],
    community_member_samples: dict[int, list[str]],
    sanity_in_top3: bool | None,
    top3_ids: list[str],
    top_n_pagerank: int,
    top_n_betweenness: int,
    top_n_communities: int,
) -> str:
    """Build the full markdown report string."""
    lines: list[str] = []

    # Title
    lines.append("# UniversalKey Analyzer Report")
    lines.append("")

    # --- Summary ---
    lines.append("## Summary")
    lines.append("")
    node_count = G.number_of_nodes()
    edge_count = G.number_of_edges()
    mod_str = f"{metrics.modularity:.6f}"
    # Sanity-anchor message (Wave 7 patch — B4 "index top-3" baseline was a misconception:
    # PageRank rewards in-degree, not out-degree. Report neutrally instead of flagging.)
    if sanity_in_top3 is None:
        if node_count == 0:
            anchor_status = "ℹ️ empty graph"
        else:
            anchor_status = "ℹ️ no 'index' node in graph (UK skeleton or non-SB corpus)"
    elif sanity_in_top3:
        anchor_status = "ℹ️ 'index' node ranks in top-3 by PageRank"
    else:
        anchor_status = "ℹ️ top PageRank nodes ranked by in-degree authority"

    lines.append(
        f"Graph has **{node_count}** nodes and **{edge_count}** edges. "
        f"Louvain modularity: **{mod_str}**. "
        f"Sanity anchor: {anchor_status}."
    )
    lines.append("")

    # --- Configuration ---
    lines.append("## Configuration")
    lines.append("")
    if metrics.config:
        cfg_rows = [[str(k), str(v)] for k, v in sorted(metrics.config.items())]
        lines.append(_md_table(["Key", "Value"], cfg_rows))
    else:
        lines.append("_(no configuration recorded)_")
    lines.append("")

    # --- Edge type histogram ---
    lines.append("## Edge type histogram")
    lines.append("")
    hist_rows = [[et, str(cnt)] for et, cnt in sorted(edge_type_hist.items())]
    lines.append(_md_table(["Type", "Count"], hist_rows))
    lines.append("")

    # --- Source layer counts ---
    lines.append("## Source layer counts")
    lines.append("")
    total = sum(source_layer_counts.values())
    sl_rows = [[layer, str(cnt)] for layer, cnt in source_layer_counts.items()]
    sl_rows.append(["**TOTAL**", str(total)])
    lines.append(_md_table(["Source", "Count"], sl_rows))
    lines.append("")

    # --- Top N by PageRank ---
    lines.append(f"## Top {top_n_pagerank} by PageRank")
    lines.append("")
    if top_pr:
        pr_rows = [
            [str(rank), node_id, f"{score:.6f}"]
            for rank, (node_id, score) in enumerate(top_pr, start=1)
        ]
        lines.append(_md_table(["Rank", "Node ID", "Score"], pr_rows))
    else:
        lines.append("_(empty graph — no PageRank scores)_")
    lines.append("")

    # --- Top N by Betweenness Centrality ---
    lines.append(f"## Top {top_n_betweenness} by Betweenness Centrality")
    lines.append("")
    if top_bw:
        bw_rows = [
            [str(rank), node_id, f"{score:.6f}"]
            for rank, (node_id, score) in enumerate(top_bw, start=1)
        ]
        lines.append(_md_table(["Rank", "Node ID", "Score"], bw_rows))
    else:
        lines.append("_(empty graph — no betweenness scores)_")
    lines.append("")

    # --- Top N Communities ---
    lines.append(f"## Top {top_n_communities} Communities by Size")
    lines.append("")
    if top_communities:
        comm_rows = [
            [
                str(rank),
                str(cid),
                str(sz),
                ", ".join(community_member_samples.get(cid, [])),
            ]
            for rank, (cid, sz) in enumerate(top_communities, start=1)
        ]
        lines.append(_md_table(["Rank", "Community ID", "Size", "Sample members"], comm_rows))
    else:
        lines.append("_(empty graph — no communities)_")
    lines.append("")

    # --- Sanity anchor ---
    lines.append("## Sanity anchor")
    lines.append("")
    if sanity_in_top3 is None:
        if not top3_ids:
            lines.append(
                "ℹ️ **Empty graph** — no PageRank scores to report."
            )
        else:
            lines.append(
                "ℹ️ **`index` node not present in graph.** "
                "This is expected for UK skeleton graphs or non-SB corpora. "
                f"Top-3 PageRank: {', '.join(f'`{n}`' for n in top3_ids)}."
            )
    elif sanity_in_top3:
        lines.append(
            f"ℹ️ `index` node ranks in top-3 by PageRank. "
            f"Top-3 nodes: {', '.join(f'`{n}`' for n in top3_ids)}."
        )
    else:
        # NOTE: B4's original sanity anchor said `index` should top-3 by PageRank
        # because of its out-degree of 491. That was a misconception — PageRank
        # rewards in-degree authority, not out-degree broadcast. Top PR nodes are
        # the most-linked-to nodes, which is correct algorithm behavior.
        lines.append(
            f"ℹ️ Top-3 PageRank: {', '.join(f'`{n}`' for n in top3_ids)}. "
            "These are the highest in-degree authority nodes (correct PageRank semantics). "
            "Out-degree hubs like `index` rank lower because PageRank rewards incoming, "
            "not outgoing, links."
        )
    lines.append("")

    return "\n".join(lines)


def _build_json_payload(
    G: nx.DiGraph,
    metrics: MetricsResult,
    edge_type_hist: dict[str, int],
    source_layer_counts: dict[str, int],
    top_pr: list[tuple[str, float]],
    top_bw: list[tuple[str, float]],
    top_communities: list[tuple[int, int]],
    community_member_samples: dict[int, list[str]],
    sanity_in_top3: bool | None,
    top3_ids: list[str],
) -> dict:
    """Build the JSON payload dict."""
    return {
        "graph_summary": {
            "edge_count": G.number_of_edges(),
            "edge_type_histogram": edge_type_hist,
            "node_count": G.number_of_nodes(),
            "source_layer_counts": source_layer_counts,
        },
        "config": metrics.config,
        "modularity": metrics.modularity,
        "sanity_anchor": {
            "index_in_top_3": sanity_in_top3,
            "top_3_pagerank_ids": top3_ids,
        },
        "top_betweenness": [
            {"node_id": nid, "score": score} for nid, score in top_bw
        ],
        "top_communities": [
            {
                "community_id": cid,
                "members_sample": community_member_samples.get(cid, []),
                "size": sz,
            }
            for cid, sz in top_communities
        ],
        "top_pagerank": [
            {"node_id": nid, "score": score} for nid, score in top_pr
        ],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def render(
    G: nx.DiGraph,
    metrics: MetricsResult,
    edge_provenance: dict[tuple[str, str], str],
    out_dir: Path,
    *,
    top_n_pagerank: int = 10,
    top_n_betweenness: int = 10,
    top_n_communities: int = 20,
) -> None:
    """Render report.md + report.json atomically into out_dir.

    For empty graphs, cli.py must catch metrics.compute()'s ValueError and pass
    a synthetic zero MetricsResult (pagerank={}, betweenness={}, etc.).
    edge_provenance is built by cli.py during merge; missing entries default to "body".

    Raises:
        OSError: If out_dir is unwritable or atomic-rename fails.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    # --- Compute derived data ---
    edge_type_hist = _edge_type_histogram(G)
    source_layer_counts = _source_layer_counts(G)
    top_pr = _top_n(metrics.pagerank, top_n_pagerank)
    top_bw = _top_n(metrics.betweenness, top_n_betweenness)
    sanity_in_top3, top3_ids = _sanity_anchor(metrics.pagerank)

    # Top communities: sort by size DESC then community_id ASC
    sorted_communities = sorted(
        metrics.community_sizes.items(),
        key=lambda kv: (-kv[1], kv[0]),
    )[:top_n_communities]

    # Build per-community member samples (3 members, sorted ASC)
    community_member_samples: dict[int, list[str]] = {}
    for cid, _sz in sorted_communities:
        members = sorted(
            node_id
            for node_id, c in metrics.louvain_partition.items()
            if c == cid
        )
        community_member_samples[cid] = members[:3]

    # --- Render markdown ---
    md_content = _build_markdown(
        G=G,
        metrics=metrics,
        edge_type_hist=edge_type_hist,
        source_layer_counts=source_layer_counts,
        top_pr=top_pr,
        top_bw=top_bw,
        top_communities=sorted_communities,
        community_member_samples=community_member_samples,
        sanity_in_top3=sanity_in_top3,
        top3_ids=top3_ids,
        top_n_pagerank=top_n_pagerank,
        top_n_betweenness=top_n_betweenness,
        top_n_communities=top_n_communities,
    )
    _atomic_write(out_dir / "report.md", md_content)

    # --- Render JSON ---
    payload = _build_json_payload(
        G=G,
        metrics=metrics,
        edge_type_hist=edge_type_hist,
        source_layer_counts=source_layer_counts,
        top_pr=top_pr,
        top_bw=top_bw,
        top_communities=sorted_communities,
        community_member_samples=community_member_samples,
        sanity_in_top3=sanity_in_top3,
        top3_ids=top3_ids,
    )
    json_content = json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False)
    _atomic_write(out_dir / "report.json", json_content)
