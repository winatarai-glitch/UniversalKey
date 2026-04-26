"""Tests for universalkey_analyzer.report — Wave 2 M4.

Three required tests:
    1. test_render_empty_graph_emits_zero_row_report
    2. test_render_markdown_tables_well_formed
    3. test_render_json_validates_schema
"""

from __future__ import annotations

import json
import re

import networkx as nx
import pytest

from universalkey_analyzer.metrics import MetricsResult
from universalkey_analyzer import report


def _zero_metrics() -> MetricsResult:
    """Synthetic zero-valued MetricsResult for empty-graph tests.

    This is the canonical shape cli.py must produce when metrics.compute()
    raises ValueError (empty graph).
    """
    return MetricsResult(
        pagerank={},
        louvain_partition={},
        betweenness={},
        modularity=0.0,
        community_sizes={},
        config={
            "alpha": 0.85,
            "betweenness_k": None,
            "louvain_seed": 42,
            "max_iter": 100,
            "tol": 1e-6,
            "weight_scheme": "uniform",
        },
    )


def _four_node_graph() -> nx.DiGraph:
    """Small directed graph: a->b->c->a, d->a.

    Matches the shared fixture spec from interface-stubs.md.
    """
    G = nx.DiGraph()
    for node in sorted(["a", "b", "c", "d"]):
        G.add_node(node)
    G.add_edge("a", "b", type="links_to", source_layer="body")
    G.add_edge("b", "c", type="links_to", source_layer="body")
    G.add_edge("c", "a", type="extends", source_layer="frontmatter")
    G.add_edge("d", "a", type="links_to", source_layer="body")
    return G


def _four_node_metrics(G: nx.DiGraph) -> MetricsResult:
    """Synthetic MetricsResult for the 4-node graph with sensible values."""
    # Manually constructed — avoids requiring python-louvain in this test.
    return MetricsResult(
        pagerank={"a": 0.35, "b": 0.25, "c": 0.25, "d": 0.15},
        louvain_partition={"a": 0, "b": 0, "c": 1, "d": 1},
        betweenness={"a": 0.5, "b": 0.3, "c": 0.2, "d": 0.0},
        modularity=0.125,
        community_sizes={0: 2, 1: 2},
        config={
            "alpha": 0.85,
            "betweenness_k": None,
            "louvain_seed": 42,
            "max_iter": 100,
            "tol": 1e-6,
            "weight_scheme": "uniform",
        },
    )


def _empty_provenance() -> dict[tuple[str, str], str]:
    return {}


def _four_node_provenance(G: nx.DiGraph) -> dict[tuple[str, str], str]:
    return {
        ("a", "b"): "body",
        ("b", "c"): "body",
        ("c", "a"): "frontmatter",
        ("d", "a"): "body",
    }


# ---------------------------------------------------------------------------
# Test 1: Empty graph emits zero-row report
# ---------------------------------------------------------------------------

def test_render_empty_graph_emits_zero_row_report(tmp_path: pytest.TempPathFactory) -> None:
    """Empty nx.DiGraph + zero MetricsResult -> report.md + report.json with node_count==0."""
    G = nx.DiGraph()
    m = _zero_metrics()
    out_dir = tmp_path / "empty_out"

    report.render(G, m, _empty_provenance(), out_dir)

    # Both files must exist
    md_path = out_dir / "report.md"
    json_path = out_dir / "report.json"
    assert md_path.exists(), "report.md not created for empty graph"
    assert json_path.exists(), "report.json not created for empty graph"

    # JSON: graph_summary.node_count == 0
    with json_path.open(encoding="utf-8") as f:
        payload = json.load(f)

    assert payload["graph_summary"]["node_count"] == 0
    assert payload["graph_summary"]["edge_count"] == 0

    # Markdown must not crash and must contain the title
    md_text = md_path.read_text(encoding="utf-8")
    assert "# UniversalKey Analyzer Report" in md_text

    # Edge type histogram table must still appear with zero counts
    assert "## Edge type histogram" in md_text

    # All 20 edge types must appear (even at zero)
    from universalkey_analyzer.frontmatter_edges import ALL_EDGE_TYPES
    expected_types = ALL_EDGE_TYPES | frozenset({"links_to", "supersedes", "superseded_by"})
    for et in expected_types:
        assert et in md_text, f"Edge type '{et}' missing from histogram section"

    # Source layer rows must appear
    assert "frontmatter" in md_text
    assert "body" in md_text
    assert "both" in md_text


# ---------------------------------------------------------------------------
# Test 2: Markdown tables well-formed (4-node graph)
# ---------------------------------------------------------------------------

def test_render_markdown_tables_well_formed(tmp_path: pytest.TempPathFactory) -> None:
    """4-node graph produces well-formed GitHub markdown tables in report.md."""
    G = _four_node_graph()
    m = _four_node_metrics(G)
    out_dir = tmp_path / "md_out"

    report.render(G, m, _four_node_provenance(G), out_dir, top_n_pagerank=10)

    md_path = out_dir / "report.md"
    assert md_path.exists()
    md_text = md_path.read_text(encoding="utf-8")

    # Must contain the PageRank section header exactly as specified
    assert "## Top 10 by PageRank" in md_text

    # Must contain a valid markdown table line (pipe-delimited)
    table_line_re = re.compile(r"^\|[^|]+\|[^|]+\|", re.MULTILINE)
    assert table_line_re.search(md_text), "No markdown table row (| col | col |) found in report.md"

    # Must contain the separator row (--- style)
    assert "| ---" in md_text

    # PageRank section must contain node IDs from graph
    pr_section_start = md_text.index("## Top 10 by PageRank")
    pr_section = md_text[pr_section_start:pr_section_start + 500]
    assert "a" in pr_section, "Node 'a' not in PageRank table section"

    # Scores must be formatted to 6 decimal places
    score_re = re.compile(r"\d+\.\d{6}")
    assert score_re.search(md_text), "Scores not formatted to 6 decimal places"

    # Must contain betweenness section
    assert "## Top 10 by Betweenness Centrality" in md_text

    # Must contain communities section
    assert "## Top 20 Communities by Size" in md_text

    # Must contain sanity anchor section
    assert "## Sanity anchor" in md_text

    # No 'index' node in 4-node graph -> ℹ️ message
    assert "index" in md_text.lower() or "ℹ️" in md_text


# ---------------------------------------------------------------------------
# Test 3: JSON validates against expected schema (4-node graph)
# ---------------------------------------------------------------------------

def test_render_json_validates_schema(tmp_path: pytest.TempPathFactory) -> None:
    """report.json must have all required top-level keys and correct value shapes."""
    G = _four_node_graph()
    m = _four_node_metrics(G)
    out_dir = tmp_path / "json_out"

    report.render(G, m, _four_node_provenance(G), out_dir)

    json_path = out_dir / "report.json"
    assert json_path.exists()

    with json_path.open(encoding="utf-8") as f:
        payload = json.load(f)

    # Required top-level keys
    required_keys = {
        "graph_summary",
        "config",
        "modularity",
        "top_pagerank",
        "top_betweenness",
        "top_communities",
        "sanity_anchor",
    }
    missing = required_keys - set(payload.keys())
    assert not missing, f"Missing top-level keys in report.json: {missing}"

    # graph_summary sub-structure
    gs = payload["graph_summary"]
    assert gs["node_count"] == 4
    assert gs["edge_count"] == 4
    assert "edge_type_histogram" in gs
    assert "source_layer_counts" in gs

    # top_pagerank: list of dicts with node_id (str) and score (float)
    top_pr = payload["top_pagerank"]
    assert isinstance(top_pr, list), "top_pagerank must be a list"
    assert len(top_pr) > 0, "top_pagerank must not be empty for 4-node graph"
    for entry in top_pr:
        assert isinstance(entry, dict), "Each top_pagerank entry must be a dict"
        assert "node_id" in entry, "top_pagerank entry missing 'node_id'"
        assert "score" in entry, "top_pagerank entry missing 'score'"
        assert isinstance(entry["node_id"], str), "node_id must be a str"
        assert isinstance(entry["score"], float), "score must be a float"

    # top_betweenness: same shape
    top_bw = payload["top_betweenness"]
    assert isinstance(top_bw, list)
    for entry in top_bw:
        assert "node_id" in entry and "score" in entry
        assert isinstance(entry["node_id"], str)
        assert isinstance(entry["score"], float)

    # top_communities: list of dicts with community_id, size, members_sample
    top_comm = payload["top_communities"]
    assert isinstance(top_comm, list)
    for entry in top_comm:
        assert "community_id" in entry
        assert "size" in entry
        assert "members_sample" in entry
        assert isinstance(entry["members_sample"], list)

    # sanity_anchor structure
    sa = payload["sanity_anchor"]
    assert "index_in_top_3" in sa
    assert "top_3_pagerank_ids" in sa
    assert isinstance(sa["top_3_pagerank_ids"], list)
    # 'index' not in 4-node graph -> index_in_top_3 must be None
    assert sa["index_in_top_3"] is None

    # modularity is float
    assert isinstance(payload["modularity"], float)

    # edge_type_histogram: all 20 edge types present
    hist = gs["edge_type_histogram"]
    from universalkey_analyzer.frontmatter_edges import ALL_EDGE_TYPES
    expected_types = ALL_EDGE_TYPES | frozenset({"links_to", "supersedes", "superseded_by"})
    for et in expected_types:
        assert et in hist, f"Edge type '{et}' missing from edge_type_histogram"

    # source_layer_counts: 3 fixed rows
    slc = gs["source_layer_counts"]
    assert "body" in slc
    assert "frontmatter" in slc
    assert "both" in slc
    # 4-node graph: 3 body edges + 1 frontmatter edge
    assert slc["body"] == 3
    assert slc["frontmatter"] == 1
    assert slc["both"] == 0

    # JSON is sort_keys=True — verify alphabetical order of top-level keys
    raw = json_path.read_text(encoding="utf-8")
    parsed_keys = list(json.loads(raw).keys())
    assert parsed_keys == sorted(parsed_keys), "JSON top-level keys not in sorted order"
