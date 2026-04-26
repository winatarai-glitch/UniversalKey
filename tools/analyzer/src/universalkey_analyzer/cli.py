"""CLI entry point for universalkey-analyzer.

Subcommands:
    analyzer extract-fm-edges --vault PATH --out PATH
    analyzer analyze --graph PATH [--vault PATH] --out-dir PATH
                     [--edge-weight-scheme {uniform,typed-bonus}]
                     [--betweenness-k INT]

Edge-merge logic (in `analyze`): typed-frontmatter wins on type label;
body wins on degree; `source_layer` annotation tracks provenance per edge.
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from typing import Literal

import click
import networkx as nx

from universalkey_analyzer import frontmatter_edges, load, metrics, report
from universalkey_analyzer.frontmatter_edges import (
    ALL_EDGE_TYPES,
    GRAPH_SKIP_DIRS,
    Edge,
    ExtractStats,
    normalize_id,
)


# ---------------------------------------------------------------------------
# Vault walker — used by extract-fm-edges to enumerate node IDs without a graph
# ---------------------------------------------------------------------------

def _collect_vault_node_ids(
    vault: Path, skip_dirs: frozenset[str] = GRAPH_SKIP_DIRS
) -> set[str]:
    """Walk `vault` and return the set of normalized node IDs.

    Used by extract-fm-edges so the standalone subcommand can resolve wikilinks
    without requiring a pre-built graph.json. This is a lightweight first-pass
    walk; M2's extract() runs the full second-pass walk that actually parses
    frontmatter.

    Determinism: sorted scandir, mirrors B4 walkMarkdown.
    """
    vault = vault.resolve()
    node_ids: set[str] = set()

    def _walk(directory: Path) -> None:
        try:
            entries = sorted(os.scandir(directory), key=lambda e: e.name)
        except OSError:
            return
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                if entry.name in skip_dirs:
                    continue
                _walk(Path(entry.path))
            elif entry.is_file(follow_symlinks=False) and entry.name.endswith(".md"):
                node_ids.add(normalize_id(Path(entry.path), vault))

    _walk(vault)
    return node_ids


# ---------------------------------------------------------------------------
# Edge merge — typed-frontmatter wins on type label; body wins on degree;
# `source_layer` tracks provenance.
# ---------------------------------------------------------------------------

def _merge_edges(
    G: nx.DiGraph, fm_edges: list[Edge]
) -> tuple[nx.DiGraph, dict[tuple[str, str], str]]:
    """Merge frontmatter typed edges into a body-loaded graph.

    Rules:
        - If (s, t) edge already exists (body), update its `type` to the
          frontmatter's typed value and set `source_layer="both"`.
        - If (s, t) edge doesn't exist, add it with `source_layer="frontmatter"`.
        - Body-only edges keep `source_layer="body"` (already set by load.load_graph).
        - Edges referencing nodes not in G are skipped (frontmatter_edges.extract
          already drops unresolved targets, but this is belt-and-suspenders).

    Returns:
        (G_merged, edge_provenance) where edge_provenance maps (source, target)
        to one of "frontmatter" | "body" | "both".
    """
    edge_provenance: dict[tuple[str, str], str] = {
        (s, t): "body" for s, t in G.edges()
    }

    for e in fm_edges:
        s, t = e["source"], e["target"]
        # Defensive: skip if either endpoint is missing from G
        if s not in G or t not in G:
            continue
        if G.has_edge(s, t):
            G[s][t]["type"] = e["type"]
            G[s][t]["source_layer"] = "both"
            edge_provenance[(s, t)] = "both"
        else:
            G.add_edge(s, t, type=e["type"], source_layer="frontmatter")
            edge_provenance[(s, t)] = "frontmatter"

    return G, edge_provenance


def _zero_metrics_result() -> metrics.MetricsResult:
    """Build a zero-valued MetricsResult for the empty-graph case."""
    return metrics.MetricsResult(
        pagerank={},
        louvain_partition={},
        betweenness={},
        modularity=0.0,
        community_sizes={},
        config={
            "alpha": 0.85,
            "tol": 1e-6,
            "max_iter": 100,
            "weight_scheme": "uniform",
            "louvain_seed": 42,
            "betweenness_k": None,
        },
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.group()
@click.version_option()
def main() -> None:
    """UniversalKey analyzer — graph metrics + frontmatter typed edges."""


@main.command("extract-fm-edges")
@click.option(
    "--vault",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    required=True,
    help="Vault root directory (e.g., 'D:/My Second Brain').",
)
@click.option(
    "--out",
    type=click.Path(dir_okay=False, path_type=Path),
    required=True,
    help="Output JSON path for supplemental edges.",
)
def extract_fm_edges(vault: Path, out: Path) -> None:
    """Extract frontmatter typed edges from VAULT, write to OUT."""
    click.echo(f"Walking vault to collect node IDs: {vault}")
    t0 = time.perf_counter()
    node_ids = _collect_vault_node_ids(vault)
    click.echo(f"  {len(node_ids):,} markdown files indexed in {time.perf_counter() - t0:.2f}s")

    click.echo("Extracting frontmatter typed edges...")
    t1 = time.perf_counter()
    edges, stats = frontmatter_edges.extract(
        vault,
        existing_node_ids=node_ids,
        alias_index=None,  # standalone mode: no alias index, only direct + stem matching
    )
    click.echo(f"  done in {time.perf_counter() - t1:.2f}s")

    payload = {
        "vault": str(vault.resolve()).replace("\\", "/"),
        "stats": dict(stats),
        "edges": list(edges),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False),
        encoding="utf-8",
        newline="\n",
    )
    tmp.replace(out)

    click.echo(f"Wrote {stats['edges_emitted']:,} typed edges to {out}")
    click.echo(
        f"  files_walked={stats['files_walked']:,} "
        f"files_with_frontmatter={stats['files_with_frontmatter']:,} "
        f"yaml_errors={stats['files_with_yaml_errors']:,} "
        f"unresolved={stats['unresolved_targets']:,} "
        f"invalid_types={stats['invalid_types_dropped']:,}"
    )


@main.command("analyze")
@click.option(
    "--graph",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=True,
    help="Input graph.json (B4 graph-export.mjs format).",
)
@click.option(
    "--vault",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    default=None,
    help="Optional vault for frontmatter typed-edge merge. If omitted, body-edges only.",
)
@click.option(
    "--out-dir",
    type=click.Path(file_okay=False, path_type=Path),
    required=True,
    help="Output directory for report.md + report.json.",
)
@click.option(
    "--edge-weight-scheme",
    type=click.Choice(["uniform", "typed-bonus"]),
    default="uniform",
    show_default=True,
    help="PageRank edge weighting. 'uniform' preserves B4 sanity anchor.",
)
@click.option(
    "--betweenness-k",
    type=int,
    default=None,
    help="Sample k pivot nodes for betweenness (runtime escape hatch).",
)
def analyze(
    graph: Path,
    vault: Path | None,
    out_dir: Path,
    edge_weight_scheme: Literal["uniform", "typed-bonus"],
    betweenness_k: int | None,
) -> None:
    """Analyze GRAPH (optionally merged with VAULT frontmatter edges); emit report."""
    click.echo(f"Loading graph: {graph}")
    t0 = time.perf_counter()
    G = load.load_graph(graph)
    click.echo(
        f"  {G.number_of_nodes():,} nodes, {G.number_of_edges():,} body edges "
        f"loaded in {time.perf_counter() - t0:.2f}s"
    )

    fm_stats: ExtractStats | None = None
    if vault is not None:
        click.echo(f"Extracting frontmatter typed edges from {vault}")
        t1 = time.perf_counter()
        node_ids = load.extract_node_ids(G)
        alias_index = load.extract_alias_index(G)
        fm_edges, fm_stats = frontmatter_edges.extract(
            vault,
            existing_node_ids=node_ids,
            alias_index=alias_index,
        )
        click.echo(
            f"  {fm_stats['edges_emitted']:,} typed edges extracted "
            f"in {time.perf_counter() - t1:.2f}s"
        )
        click.echo(f"  merging into graph...")
        t2 = time.perf_counter()
        G, edge_provenance = _merge_edges(G, fm_edges)
        click.echo(
            f"  merged: {G.number_of_edges():,} total edges "
            f"(in {time.perf_counter() - t2:.2f}s)"
        )
        # Source-layer breakdown
        layer_counts = Counter(edge_provenance.values())
        click.echo(
            f"  source_layer: body={layer_counts.get('body', 0):,} "
            f"frontmatter={layer_counts.get('frontmatter', 0):,} "
            f"both={layer_counts.get('both', 0):,}"
        )
    else:
        edge_provenance = {(s, t): "body" for s, t in G.edges()}

    # Compute metrics (or zero-result for empty graph)
    if G.number_of_nodes() == 0:
        click.echo("Empty graph — emitting zero-row report.")
        m = _zero_metrics_result()
    else:
        click.echo(
            f"Computing metrics (weight={edge_weight_scheme}, "
            f"betweenness_k={betweenness_k})..."
        )
        t3 = time.perf_counter()
        try:
            m = metrics.compute(
                G,
                edge_weight_scheme=edge_weight_scheme,
                betweenness_k=betweenness_k,
            )
            click.echo(
                f"  PageRank + Louvain + betweenness done in "
                f"{time.perf_counter() - t3:.2f}s; "
                f"modularity={m.modularity:.4f}, "
                f"communities={len(m.community_sizes)}"
            )
        except ValueError as e:
            click.echo(f"  metrics.compute() failed: {e}; emitting zero-row report.")
            m = _zero_metrics_result()

    # Render report
    click.echo(f"Rendering report to {out_dir}")
    t4 = time.perf_counter()
    report.render(G, m, edge_provenance, out_dir)
    click.echo(f"  done in {time.perf_counter() - t4:.2f}s")

    # If frontmatter was used, also dump fm_stats alongside
    if fm_stats is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        stats_path = out_dir / "frontmatter-stats.json"
        tmp = stats_path.with_suffix(stats_path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(dict(fm_stats), sort_keys=True, indent=2, ensure_ascii=False),
            encoding="utf-8",
            newline="\n",
        )
        tmp.replace(stats_path)
        click.echo(f"  wrote {stats_path}")

    click.echo(
        f"\nDone. Report: {out_dir / 'report.md'} | JSON: {out_dir / 'report.json'}"
    )


if __name__ == "__main__":  # pragma: no cover
    main()
