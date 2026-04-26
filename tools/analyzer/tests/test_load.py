"""Unit tests for universalkey_analyzer.load module.

Wave 2 — M1 test suite.
Tests use pytest's tmp_path fixture to write small synthetic graph.json files.
"""

from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
import pytest

from universalkey_analyzer import load


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_graph(tmp_path: Path, data: dict) -> Path:
    """Write *data* as JSON to a temp file and return the path."""
    p = tmp_path / "graph.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def _tiny_graph_data(extra_nodes: list[dict] | None = None, links: list[dict] | None = None) -> dict:
    """Return a minimal valid B4-format graph dict."""
    nodes = [
        {"id": "d", "aliases": [], "tags": []},
        {"id": "b", "aliases": [], "tags": []},
        {"id": "a", "aliases": [], "tags": []},
        {"id": "c", "aliases": [], "tags": []},
    ]
    if extra_nodes:
        nodes.extend(extra_nodes)
    return {
        "meta": {"vault": "test", "tool": "graph-export.mjs", "version": 1},
        "nodes": nodes,
        "links": links or [
            {"source": "a", "target": "b"},
            {"source": "b", "target": "c"},
            {"source": "c", "target": "a"},
            {"source": "d", "target": "a"},
        ],
    }


# ---------------------------------------------------------------------------
# Test 1: valid graph loads correctly with sorted nodes and body edges
# ---------------------------------------------------------------------------

def test_load_valid_graph(tmp_path: Path) -> None:
    """load_graph returns a DiGraph with sorted node order and source_layer=body on edges."""
    graph_path = _write_graph(tmp_path, _tiny_graph_data())
    G = load.load_graph(graph_path)

    assert isinstance(G, nx.DiGraph)

    # Nodes must be in sorted order
    node_list = list(G.nodes())
    assert node_list == sorted(node_list), f"Nodes not sorted: {node_list}"

    # Expected sorted order: a, b, c, d
    assert node_list == ["a", "b", "c", "d"]

    # Every edge must carry source_layer="body"
    for s, t, attrs in G.edges(data=True):
        assert attrs.get("source_layer") == "body", (
            f"Edge ({s}, {t}) missing source_layer='body', got {attrs}"
        )

    # Edges without an explicit "type" must default to "links_to"
    for s, t, attrs in G.edges(data=True):
        assert "type" in attrs, f"Edge ({s}, {t}) missing 'type' attribute"
        assert attrs["type"] == "links_to", (
            f"Edge ({s}, {t}) expected type='links_to', got {attrs['type']}"
        )

    # Edge count preserved
    assert G.number_of_edges() == 4


# ---------------------------------------------------------------------------
# Test 2: missing 'nodes' key raises ValueError
# ---------------------------------------------------------------------------

def test_missing_nodes_key_raises_value_error(tmp_path: Path) -> None:
    """load_graph raises ValueError when the 'nodes' array is absent."""
    bad_data = {
        "meta": {},
        "links": [{"source": "a", "target": "b"}],
        # "nodes" intentionally omitted
    }
    graph_path = _write_graph(tmp_path, bad_data)

    with pytest.raises(ValueError, match="nodes"):
        load.load_graph(graph_path)


# ---------------------------------------------------------------------------
# Test 3: alias index keys are lowercased and equal-to-node-id aliases skipped
# ---------------------------------------------------------------------------

def test_alias_index_lowercase_keys(tmp_path: Path) -> None:
    """extract_alias_index maps alias.lower() -> node_id and skips self-aliases."""
    nodes = [
        {
            "id": "concepts/bppv",
            "aliases": ["BPPV", "Benign Paroxysmal Positional Vertigo", "concepts/bppv"],
            "tags": [],
        },
        {
            "id": "concepts/vertigo",
            "aliases": ["Vertigo", "Dizziness"],
            "tags": [],
        },
    ]
    graph_path = _write_graph(tmp_path, {"meta": {}, "nodes": nodes, "links": []})
    G = load.load_graph(graph_path)

    index = load.extract_alias_index(G)

    # All returned keys must be lowercase
    for key in index:
        assert key == key.lower(), f"Non-lowercase key in alias index: {key!r}"

    # Aliases from concepts/bppv
    assert index.get("bppv") == "concepts/bppv"
    assert index.get("benign paroxysmal positional vertigo") == "concepts/bppv"

    # Self-alias ("concepts/bppv" == node_id) must be skipped
    assert "concepts/bppv" not in index

    # Aliases from concepts/vertigo
    assert index.get("vertigo") == "concepts/vertigo"
    assert index.get("dizziness") == "concepts/vertigo"
