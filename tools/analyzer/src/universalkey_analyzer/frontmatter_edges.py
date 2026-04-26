"""Frontmatter typed-edge extraction.

Walks an Obsidian-style vault, parses YAML frontmatter, extracts typed edges
from two YAML shapes:

    1. `relations:` — list of objects with `target` + `type` fields:
           relations:
             - target: "[[Muscle Testing]]"
               type: extends
             - target: "[[Chiropractic Technique]]"
               type: reinforced-by

    2. `supersedes:` / `superseded_by:` — scalar lists of `[[X]]`:
           supersedes:
             - "[[AK Manual Edition 2003]]"

The 17 valid edge types are lifted from
`D:\\UniversalKey\\tools\\lib\\frontmatter-v2.mjs` lines 113-146.
The wikilink regex is lifted from `graph-export.mjs` line 32.

KEY DIVERGENCE FROM B4:
    `graph-export.mjs::parseFrontmatter` deliberately SKIPS object-shaped
    list items (line 134's regex `!/^\\w[\\w-]*\\s*:/`). B6 must capture
    exactly those — this module uses PyYAML to parse natively.

Public API:
    extract(vault, allowed_types, existing_node_ids, alias_index, skip_dirs) -> (edges, stats)

Wave 1.5 stub. Wave 2 fills bodies.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import TypedDict

import yaml

# === Constants lifted from B4 (do NOT modify) ===

LINEAGE_EDGE_TYPES: frozenset[str] = frozenset({
    "extends",
    "refines",
    "contradicts",
    "challenges",
    "historical-basis-for",
    "predates",
    "reinforced-by",
})
"""Lineage relations between concepts/entities. From frontmatter-v2.mjs lines 113-121."""

CONCEPT_EDGE_TYPES: frozenset[str] = frozenset({
    # Clinical reasoning
    "assesses",
    "tests",
    "treats",
    "indicated-in",
    "contraindicated-in",
    # Structural
    "part-of",
    "requires-prerequisite",
    # Functional
    "innervated-by",
    "opposes",
    "synergist-with",
})
"""Concept-level relations. From frontmatter-v2.mjs lines 130-144."""

ALL_EDGE_TYPES: frozenset[str] = LINEAGE_EDGE_TYPES | CONCEPT_EDGE_TYPES
"""All 17 valid edge types. Implicit `supersedes`/`superseded_by` are NOT in this set —
they are emitted with edge type literally `supersedes` / `superseded_by`, which the
report layer treats as a separate category from the 17."""

WIKILINK_RE: re.Pattern[str] = re.compile(
    r"\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]"
)
"""3-group wikilink regex lifted verbatim from graph-export.mjs line 32.

Groups:
    1. target   — required, non-greedy, stops at `]`, `|`, `#`
    2. heading  — optional, non-greedy, stops at `]`, `|`
    3. alias    — optional, non-greedy, stops at `]`
"""

GRAPH_SKIP_DIRS: frozenset[str] = frozenset({
    ".git",
    ".obsidian",
    ".trash",
    "node_modules",
    "_attachments",
    ".github",
    ".vscode",
    "__pycache__",
})
"""Directory names to skip during vault walk. Lifted from B4 graph-export.mjs."""

# Pre-compiled regexes for frontmatter pre-normalisation
_FM_FENCE_RE: re.Pattern[str] = re.compile(
    r"^---\r?\n([\s\S]*?)\r?\n---\r?\n", re.MULTILINE
)
_UNQUOTED_WIKILINK_VALUE_RE: re.Pattern[str] = re.compile(
    r"(:\s*)(\[\[[^\]]+\]\])(\s*$)", re.MULTILINE
)
_UNQUOTED_WIKILINK_ITEM_RE: re.Pattern[str] = re.compile(
    r"(-\s+)(\[\[[^\]]+\]\])(\s*$)", re.MULTILINE
)

BOM = "﻿"


# === Public types ===

class Edge(TypedDict):
    """A typed frontmatter edge."""
    source: str          # source node ID (vault-relative, lowercased, .md stripped)
    target: str          # resolved target node ID
    type: str            # one of ALL_EDGE_TYPES, plus "supersedes" / "superseded_by"
    source_file: str     # vault-relative path of the source markdown file


class ExtractStats(TypedDict):
    """Aggregate statistics from a vault walk."""
    files_walked: int
    files_with_frontmatter: int
    files_with_yaml_errors: int
    edges_emitted: int
    unresolved_targets: int
    invalid_types_dropped: int
    type_histogram: dict[str, int]
    yaml_error_paths: list[str]


# === Public API ===

def normalize_id(abs_path: Path, vault_root: Path) -> str:
    """Mirror of graph-export.mjs::normalizeId.

    Rule: vault-relative, forward-slash separated, .md stripped, lowercased.

    Example:
        normalize_id(
            Path("D:/My Second Brain/Clinical/BPPV.md"),
            Path("D:/My Second Brain")
        ) -> "clinical/bppv"

    Raises:
        ValueError: if abs_path is not under vault_root.
    """
    rel = abs_path.resolve().relative_to(vault_root.resolve())
    posix = rel.as_posix()
    if posix.endswith(".md"):
        posix = posix[:-3]
    return posix.lower()


def resolve_wikilink(
    raw_target: str,
    *,
    existing_node_ids: set[str],
    alias_index: dict[str, str],
) -> str | None:
    """Resolve a wikilink target text to a node ID.

    Resolution order (mirrors B4 graph-export.mjs):
        1. Direct lowercase match against existing_node_ids.
        2. Basename (stem) match — try the last path segment.
        3. Alias index lookup.

    Args:
        raw_target: The text inside `[[...]]` (group 1 of WIKILINK_RE).
            Heading suffix (#section) and alias pipe (|display) are stripped
            defensively before matching.
        existing_node_ids: Set of all known node IDs (lowercase).
        alias_index: Map of `alias.lower()` -> `node_id`.

    Returns:
        Resolved node ID, or None if unresolved (caller increments stat).
    """
    # Defensive strip of #anchor and |alias (caller normally passes group 1 only)
    target = raw_target.split("#")[0].split("|")[0].strip()
    lower = target.lower()

    # 1. Direct match
    if lower in existing_node_ids:
        return lower

    # 2. Basename (stem) match — last segment of the path
    basename = lower.split("/")[-1]
    for node_id in existing_node_ids:
        if node_id.split("/")[-1] == basename:
            return node_id

    # 3. Alias index lookup
    alias_result = alias_index.get(lower)
    if alias_result is not None:
        return alias_result

    return None


def extract(
    vault: Path,
    *,
    allowed_types: frozenset[str] = ALL_EDGE_TYPES,
    existing_node_ids: set[str],
    alias_index: dict[str, str] | None = None,
    skip_dirs: frozenset[str] = GRAPH_SKIP_DIRS,
) -> tuple[list[Edge], ExtractStats]:
    """Walk a vault, parse frontmatter, emit typed edges.

    Process per file:
        1. Read file as UTF-8 with errors="replace" (handles latin-1 imports).
        2. Detect `---\\n...\\n---\\n` fence; skip if absent.
        3. Pre-normalize: strip BOM, normalize line endings, quote-wrap unquoted
           `[[...]]` rvalues so PyYAML doesn't mis-parse them as flow sequences.
        4. `yaml.safe_load` the fenced block.
        5. Extract edges from `relations`, `supersedes`, `superseded_by` keys.
        6. Validate `type` against `allowed_types`; drop invalid (count in stats).
        7. Resolve wikilink target to node ID; drop unresolved (count in stats).

    Determinism:
        - `os.scandir` results sorted alphabetically (mirrors B4 walkMarkdown).
        - Skip dirs honored exactly as B4.
        - YAML parse errors logged + counted, never abort the run (parse-error
          budget enforced by caller, default <= 1% of files).

    Args:
        vault: Vault root directory (e.g., Path("D:/My Second Brain")).
        allowed_types: Whitelist of edge type strings. Defaults to ALL_EDGE_TYPES.
            `supersedes`/`superseded_by` are added implicitly when caller passes
            the default; pass an explicit superset to include them.
        existing_node_ids: Set of node IDs from the loaded body graph
            (used for wikilink resolution).
        alias_index: Optional alias -> node_id map (from load.extract_alias_index).
            If None, only direct + stem matching is used.
        skip_dirs: Directory names to skip during walk.

    Returns:
        Tuple of (edges, stats) where:
            - edges: list of Edge dicts (sorted by (source, target, type) for determinism).
            - stats: ExtractStats dict with file/edge/error counters.
    """
    if alias_index is None:
        alias_index = {}

    # supersedes/superseded_by are always accepted regardless of allowed_types
    effective_allowed: frozenset[str] = allowed_types | {"supersedes", "superseded_by"}

    stats: ExtractStats = {
        "files_walked": 0,
        "files_with_frontmatter": 0,
        "files_with_yaml_errors": 0,
        "edges_emitted": 0,
        "unresolved_targets": 0,
        "invalid_types_dropped": 0,
        "type_histogram": {},
        "yaml_error_paths": [],
    }

    edges: list[Edge] = []

    _walk(
        vault,
        vault,
        skip_dirs=skip_dirs,
        effective_allowed=effective_allowed,
        existing_node_ids=existing_node_ids,
        alias_index=alias_index,
        edges=edges,
        stats=stats,
    )

    edges.sort(key=lambda e: (e["source"], e["target"], e["type"]))
    return edges, stats


# === Internal helpers ===

def _walk(
    directory: Path,
    vault: Path,
    *,
    skip_dirs: frozenset[str],
    effective_allowed: frozenset[str],
    existing_node_ids: set[str],
    alias_index: dict[str, str],
    edges: list[Edge],
    stats: ExtractStats,
) -> None:
    """Recursive vault walker using sorted os.scandir for determinism."""
    try:
        entries = sorted(os.scandir(directory), key=lambda e: e.name)
    except PermissionError:
        return

    for entry in entries:
        if entry.is_dir(follow_symlinks=False):
            if entry.name not in skip_dirs:
                _walk(
                    Path(entry.path),
                    vault,
                    skip_dirs=skip_dirs,
                    effective_allowed=effective_allowed,
                    existing_node_ids=existing_node_ids,
                    alias_index=alias_index,
                    edges=edges,
                    stats=stats,
                )
        elif entry.is_file(follow_symlinks=False) and entry.name.endswith(".md"):
            _process_file(
                Path(entry.path),
                vault=vault,
                effective_allowed=effective_allowed,
                existing_node_ids=existing_node_ids,
                alias_index=alias_index,
                edges=edges,
                stats=stats,
            )


def _process_file(
    file_path: Path,
    *,
    vault: Path,
    effective_allowed: frozenset[str],
    existing_node_ids: set[str],
    alias_index: dict[str, str],
    edges: list[Edge],
    stats: ExtractStats,
) -> None:
    """Parse one markdown file and append any valid edges to the shared list."""
    stats["files_walked"] += 1

    try:
        raw = file_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return

    # Strip BOM
    if raw.startswith(BOM):
        raw = raw[len(BOM):]

    # Detect frontmatter fence
    fm_match = _FM_FENCE_RE.match(raw)
    if fm_match is None:
        return

    stats["files_with_frontmatter"] += 1

    fm_block = fm_match.group(1)

    # Pre-normalize: quote-wrap unquoted [[...]] so PyYAML parses them as strings
    fm_block = _UNQUOTED_WIKILINK_VALUE_RE.sub(r'\1"\2"\3', fm_block)
    fm_block = _UNQUOTED_WIKILINK_ITEM_RE.sub(r'\1"\2"\3', fm_block)

    try:
        data = yaml.safe_load(fm_block)
    except yaml.YAMLError:
        stats["files_with_yaml_errors"] += 1
        rel_str = _rel_path_str(file_path, vault)
        stats["yaml_error_paths"].append(rel_str)
        return

    if not isinstance(data, dict):
        return

    # Compute source identifiers once
    source_id = normalize_id(file_path, vault)
    source_file = _rel_path_str(file_path, vault)

    # --- relations key: list of dicts with target + type ---
    relations = data.get("relations")
    if isinstance(relations, list):
        for item in relations:
            if not isinstance(item, dict):
                continue
            target_text = item.get("target")
            edge_type = item.get("type")
            if target_text is None or edge_type is None:
                continue
            _emit_candidate(
                str(target_text),
                str(edge_type),
                source_id=source_id,
                source_file=source_file,
                file_path=file_path,
                vault=vault,
                effective_allowed=effective_allowed,
                existing_node_ids=existing_node_ids,
                alias_index=alias_index,
                edges=edges,
                stats=stats,
            )

    # --- supersedes key: list of strings (or scalar string per A3 audit) ---
    supersedes = data.get("supersedes")
    if isinstance(supersedes, str):
        supersedes = [supersedes]  # wrap scalar — Wave 7 A3 patch
    if isinstance(supersedes, list):
        for item in supersedes:
            if item is None:
                continue
            _emit_candidate(
                str(item),
                "supersedes",
                source_id=source_id,
                source_file=source_file,
                file_path=file_path,
                vault=vault,
                effective_allowed=effective_allowed,
                existing_node_ids=existing_node_ids,
                alias_index=alias_index,
                edges=edges,
                stats=stats,
            )

    # --- superseded_by key: list of strings (or scalar string per A3 audit) ---
    superseded_by = data.get("superseded_by")
    if isinstance(superseded_by, str):
        superseded_by = [superseded_by]  # wrap scalar — Wave 7 A3 patch
    if isinstance(superseded_by, list):
        for item in superseded_by:
            if item is None:
                continue
            _emit_candidate(
                str(item),
                "superseded_by",
                source_id=source_id,
                source_file=source_file,
                file_path=file_path,
                vault=vault,
                effective_allowed=effective_allowed,
                existing_node_ids=existing_node_ids,
                alias_index=alias_index,
                edges=edges,
                stats=stats,
            )


def _emit_candidate(
    target_text: str,
    edge_type: str,
    *,
    source_id: str,
    source_file: str,
    file_path: Path,
    vault: Path,
    effective_allowed: frozenset[str],
    existing_node_ids: set[str],
    alias_index: dict[str, str],
    edges: list[Edge],
    stats: ExtractStats,
) -> None:
    """Validate one edge candidate and append to edges if it passes all checks."""
    # Must contain a wikilink
    wl_match = WIKILINK_RE.search(target_text)
    if wl_match is None:
        stats["invalid_types_dropped"] += 1
        return

    # Validate edge type
    if edge_type not in effective_allowed:
        stats["invalid_types_dropped"] += 1
        return

    # Resolve target
    raw_target = wl_match.group(1)
    resolved = resolve_wikilink(
        raw_target,
        existing_node_ids=existing_node_ids,
        alias_index=alias_index,
    )
    if resolved is None:
        stats["unresolved_targets"] += 1
        return

    # Emit edge
    edge: Edge = {
        "source": source_id,
        "target": resolved,
        "type": edge_type,
        "source_file": source_file,
    }
    edges.append(edge)
    stats["edges_emitted"] += 1
    stats["type_histogram"][edge_type] = stats["type_histogram"].get(edge_type, 0) + 1


def _rel_path_str(file_path: Path, vault: Path) -> str:
    """Return vault-relative POSIX path string (with .md suffix retained)."""
    try:
        return file_path.resolve().relative_to(vault.resolve()).as_posix()
    except ValueError:
        return str(file_path)
