"""Graph loading + schema validation.

Loads a graph.json emitted by graph-export.mjs (B4 format: node-link JSON).
Returns a `networkx.DiGraph` with nodes sorted by ID (determinism rule).

Schema expected (B4 graph-export.mjs):
    {
      "meta": {...},
      "nodes": [{"id": "<node-id>", <flat-attrs...>}, ...],
      "links": [{"source": "...", "target": "...", ...}, ...]
    }

Note: B4 format uses "links" (not "edges") and node attributes are flat
on the node object (not nested under a "data" key).

Public API:
    load_graph(path) -> nx.DiGraph
    extract_node_ids(G) -> set[str]
    extract_alias_index(G) -> dict[str, str]   # alias.lower() -> node_id

Wave 1.5 stub. Wave 2 fills bodies.
"""

from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
from networkx.readwrite.json_graph import node_link_graph


def load_graph(path: Path) -> nx.DiGraph:
    """Load a graph.json (node-link format) into a sorted-node DiGraph.

    Args:
        path: Path to graph.json file (B4 graph-export.mjs format).

    Returns:
        networkx.DiGraph with:
          - Nodes inserted in sorted node-ID order (determinism guarantee).
          - Node attributes preserved verbatim from flat node fields.
          - Edge attributes preserved verbatim; missing `type` defaults to "links_to".
          - `source_layer="body"` set on every loaded edge (frontmatter merge happens later in cli.py).

    Raises:
        FileNotFoundError: If the path does not exist.
        ValueError: If JSON is malformed or required arrays (`nodes`, `links`) are missing.
        json.JSONDecodeError: If the file is not valid JSON.

    Example:
        >>> G = load_graph(Path("D:/UniversalKey/wiki-export/graph.json"))
        >>> isinstance(G, nx.DiGraph)
        True
        >>> list(G.nodes)[:3] == sorted(list(G.nodes)[:3])
        True
    """
    if not path.exists():
        raise FileNotFoundError(f"Graph file not found: {path}")

    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)  # raises json.JSONDecodeError on bad JSON

    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object at top level, got {type(data).__name__}")
    if "nodes" not in data or not isinstance(data["nodes"], list):
        raise ValueError("Graph JSON missing required 'nodes' array")
    if "links" not in data or not isinstance(data["links"], list):
        raise ValueError("Graph JSON missing required 'links' array")

    # node_link_graph expects "directed"/"multigraph" flags; B4 format omits them.
    # Pass directed=True + edges="links" to handle the B4 "links" key.
    G = node_link_graph(data, directed=True, multigraph=False, edges="links")

    # Rebuild in sorted node-ID order for determinism (contract requirement).
    G_sorted = nx.DiGraph()
    for node_id in sorted(G.nodes()):
        G_sorted.add_node(node_id, **G.nodes[node_id])
    for s, t in sorted(G.edges()):
        attrs = dict(G[s][t])
        attrs.setdefault("type", "links_to")
        attrs["source_layer"] = "body"
        G_sorted.add_edge(s, t, **attrs)

    return G_sorted


def extract_node_ids(G: nx.DiGraph) -> set[str]:
    """Return the set of node IDs in the graph (for frontmatter wikilink resolution).

    Args:
        G: Loaded graph.

    Returns:
        frozenset-comparable set of node ID strings (lowercased).
    """
    return set(G.nodes())


def extract_alias_index(G: nx.DiGraph) -> dict[str, str]:
    """Build a lowercase-alias -> node-ID map from node attribute `aliases`.

    The B4 graph-export.mjs emits `aliases` as a flat JSON array on each node.
    This index is used by frontmatter_edges.py to resolve `[[X]]` wikilinks to
    node IDs when the literal target text doesn't match a node ID directly.

    Args:
        G: Loaded graph (nodes must already be in sorted order for determinism).

    Returns:
        dict mapping `alias.lower()` -> `node_id`. Aliases that collide silently
        keep the first node (sorted insertion order makes this deterministic).
    """
    index: dict[str, str] = {}
    for node_id, data in G.nodes(data=True):
        aliases: list[str] = data.get("aliases", [])
        for alias in aliases:
            key = alias.lower()
            if key == node_id:
                continue  # skip aliases that equal the node ID
            if key not in index:  # first node in sorted order wins
                index[key] = node_id
    return index
