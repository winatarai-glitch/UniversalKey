"""Unit tests for frontmatter_edges.py — Wave 2 M2."""

from __future__ import annotations

from pathlib import Path

import pytest

from universalkey_analyzer.frontmatter_edges import (
    ALL_EDGE_TYPES,
    Edge,
    ExtractStats,
    extract,
    normalize_id,
    resolve_wikilink,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_md(tmp_path: Path, rel: str, content: str) -> Path:
    """Write a markdown file inside tmp_path and return its Path."""
    target = tmp_path / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return target


# ---------------------------------------------------------------------------
# Test 1: relations block with two valid typed edges
# ---------------------------------------------------------------------------

def test_extract_relations_block(tmp_path: Path) -> None:
    """Vault with one .md containing a `relations:` block with two valid edges."""
    content = """\
---
title: Condition BPPV
relations:
  - target: "[[vestibular-neuritis]]"
    type: contradicts
  - target: "[[labyrinth-anatomy]]"
    type: part-of
---
Body text.
"""
    _make_md(tmp_path, "condition-bppv.md", content)

    existing = {"vestibular-neuritis", "labyrinth-anatomy"}

    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    assert len(edges) == 2, f"Expected 2 edges, got {len(edges)}: {edges}"

    # Sorted by (source, target, type)
    types = {e["type"] for e in edges}
    targets = {e["target"] for e in edges}

    assert types == {"contradicts", "part-of"}
    assert targets == {"vestibular-neuritis", "labyrinth-anatomy"}

    for e in edges:
        assert e["source"] == "condition-bppv"
        assert e["source_file"] == "condition-bppv.md"

    assert stats["edges_emitted"] == 2
    assert stats["files_with_frontmatter"] == 1
    assert stats["type_histogram"]["contradicts"] == 1
    assert stats["type_histogram"]["part-of"] == 1
    assert stats["unresolved_targets"] == 0
    assert stats["invalid_types_dropped"] == 0


# ---------------------------------------------------------------------------
# Test 2: supersedes and superseded_by keys with scalar lists
# ---------------------------------------------------------------------------

def test_extract_supersedes_and_superseded_by(tmp_path: Path) -> None:
    """Both supersedes and superseded_by keys present; edge types must be literals."""
    content = """\
---
title: New Protocol
supersedes:
  - "[[old-protocol-2003]]"
superseded_by:
  - "[[newer-protocol-2026]]"
---
"""
    _make_md(tmp_path, "new-protocol.md", content)

    existing = {"old-protocol-2003", "newer-protocol-2026"}

    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    assert len(edges) == 2

    edge_types = {e["type"] for e in edges}
    assert edge_types == {"supersedes", "superseded_by"}

    # Verify the type strings are exactly the literal values (not in ALL_EDGE_TYPES)
    assert "supersedes" not in ALL_EDGE_TYPES
    assert "superseded_by" not in ALL_EDGE_TYPES

    assert stats["edges_emitted"] == 2
    assert stats["type_histogram"]["supersedes"] == 1
    assert stats["type_histogram"]["superseded_by"] == 1
    assert stats["invalid_types_dropped"] == 0
    assert stats["unresolved_targets"] == 0


# ---------------------------------------------------------------------------
# Test 3: invalid type in relations block is dropped
# ---------------------------------------------------------------------------

def test_invalid_type_dropped(tmp_path: Path) -> None:
    """`relations` block with one valid + one invalid type: only 1 edge emitted."""
    content = """\
---
title: Mixed Types
relations:
  - target: "[[lumbar-spine]]"
    type: extends
  - target: "[[thoracic-spine]]"
    type: nonexistent-type-xyz
---
"""
    _make_md(tmp_path, "mixed-types.md", content)

    existing = {"lumbar-spine", "thoracic-spine"}

    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    assert len(edges) == 1
    assert edges[0]["type"] == "extends"
    assert edges[0]["target"] == "lumbar-spine"

    assert stats["edges_emitted"] == 1
    assert stats["invalid_types_dropped"] == 1
    assert stats["unresolved_targets"] == 0


# ---------------------------------------------------------------------------
# Test 4: YAML parse error is tolerated — no crash, counter incremented
# ---------------------------------------------------------------------------

def test_yaml_parse_error_tolerated(tmp_path: Path) -> None:
    """Broken YAML must not crash extract(); stats reflect the parse failure."""
    # Use an unquoted flow-sequence that PyYAML cannot close — this is genuine
    # broken YAML that survives our pre-normalizer (it's not a wikilink pattern).
    broken_content = """\
---
title: Broken File
bad_key: [unclosed flow sequence
relations:
  - target: "[[some-target]]"
    type: extends
---
Body.
"""
    _make_md(tmp_path, "bad-yaml.md", broken_content)

    # A second file with valid content to confirm the walk continues
    valid_content = """\
---
title: Good File
relations:
  - target: "[[target-node]]"
    type: refines
---
"""
    _make_md(tmp_path, "good-file.md", valid_content)

    existing = {"target-node"}

    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    # The broken file must be counted as a YAML error
    assert stats["files_with_yaml_errors"] == 1
    assert len(stats["yaml_error_paths"]) == 1
    assert "bad-yaml.md" in stats["yaml_error_paths"][0]

    # The good file must still emit its edge
    assert stats["edges_emitted"] == 1
    assert len(edges) == 1
    assert edges[0]["target"] == "target-node"


# ---------------------------------------------------------------------------
# Test 4b: normalize_id converts paths correctly
# ---------------------------------------------------------------------------

def test_normalize_id_basic() -> None:
    """normalize_id strips .md, lowercases, returns POSIX-style vault-relative path."""
    vault = Path("D:/vault")
    abs_path = Path("D:/vault/Subdir/Foo.md")
    result = normalize_id(abs_path, vault)
    assert result == "subdir/foo"


def test_normalize_id_no_md_suffix() -> None:
    """normalize_id leaves non-.md suffixes intact."""
    vault = Path("D:/vault")
    abs_path = Path("D:/vault/data/chart.png")
    result = normalize_id(abs_path, vault)
    assert result == "data/chart.png"


def test_normalize_id_not_under_vault() -> None:
    """normalize_id raises ValueError when abs_path is not under vault_root."""
    vault = Path("D:/vault")
    outside = Path("C:/other/file.md")
    with pytest.raises(ValueError):
        normalize_id(outside, vault)


# ---------------------------------------------------------------------------
# Test 5: resolve_wikilink resolution order
# ---------------------------------------------------------------------------

def test_resolve_wikilink_direct_match() -> None:
    """Direct lowercase match takes priority."""
    result = resolve_wikilink(
        "Clinical/BPPV",
        existing_node_ids={"clinical/bppv", "bppv"},
        alias_index={},
    )
    assert result == "clinical/bppv"


def test_resolve_wikilink_basename_match() -> None:
    """Basename (last segment) match when no direct match exists."""
    result = resolve_wikilink(
        "BPPV",
        existing_node_ids={"conditions/bppv"},
        alias_index={},
    )
    assert result == "conditions/bppv"


def test_resolve_wikilink_alias_match() -> None:
    """Alias index consulted when direct and basename fail."""
    result = resolve_wikilink(
        "Benign Paroxysmal Positional Vertigo",
        existing_node_ids={"conditions/bppv"},
        alias_index={"benign paroxysmal positional vertigo": "conditions/bppv"},
    )
    assert result == "conditions/bppv"


def test_resolve_wikilink_no_match() -> None:
    """Returns None when all resolution strategies fail."""
    result = resolve_wikilink(
        "unknown-page",
        existing_node_ids={"some/other"},
        alias_index={},
    )
    assert result is None


def test_resolve_wikilink_strips_anchor_and_alias() -> None:
    """Defensive stripping of #anchor and |alias before matching."""
    result = resolve_wikilink(
        "BPPV#diagnosis|BPPV Display",
        existing_node_ids={"bppv"},
        alias_index={},
    )
    assert result == "bppv"


# ---------------------------------------------------------------------------
# Test 6: skip_dirs are honoured
# ---------------------------------------------------------------------------

def test_skip_dirs_honoured(tmp_path: Path) -> None:
    """Files inside skipped directories must not be walked."""
    # Valid file outside skipped dir
    content = """\
---
title: Valid
relations:
  - target: "[[target-x]]"
    type: extends
---
"""
    _make_md(tmp_path, "valid.md", content)

    # File inside a dir that should be skipped
    skipped_content = """\
---
title: Should Be Ignored
relations:
  - target: "[[target-x]]"
    type: refines
---
"""
    _make_md(tmp_path, ".git/HEAD.md", skipped_content)

    existing = {"target-x"}
    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    # Only 1 file walked (the one outside .git)
    assert stats["edges_emitted"] == 1
    assert stats["files_walked"] == 1


# ---------------------------------------------------------------------------
# Test 7: unresolved target increments counter and drops edge
# ---------------------------------------------------------------------------

def test_unresolved_target_dropped(tmp_path: Path) -> None:
    """Edges whose target cannot be resolved are dropped with counter incremented."""
    content = """\
---
title: Has Unresolved
relations:
  - target: "[[does-not-exist]]"
    type: extends
  - target: "[[real-node]]"
    type: refines
---
"""
    _make_md(tmp_path, "node.md", content)

    existing = {"real-node"}  # does-not-exist is absent
    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    assert stats["edges_emitted"] == 1
    assert stats["unresolved_targets"] == 1
    assert edges[0]["target"] == "real-node"


# ---------------------------------------------------------------------------
# Test 8: BOM is stripped before parsing
# ---------------------------------------------------------------------------

def test_bom_stripped(tmp_path: Path) -> None:
    """Files beginning with a UTF-8 BOM are parsed correctly."""
    content = "﻿---\ntitle: BOM File\nrelations:\n  - target: \"[[bom-target]]\"\n    type: extends\n---\n"
    path = tmp_path / "bom-file.md"
    path.write_bytes(content.encode("utf-8"))

    existing = {"bom-target"}
    edges, stats = extract(
        tmp_path,
        existing_node_ids=existing,
        alias_index={},
    )

    assert stats["edges_emitted"] == 1
    assert edges[0]["target"] == "bom-target"


# ---------------------------------------------------------------------------
# Test 9: file without frontmatter emits no edges but is counted in files_walked
# ---------------------------------------------------------------------------

def test_no_frontmatter_file(tmp_path: Path) -> None:
    """A .md file with no frontmatter fence is walked but emits 0 edges."""
    _make_md(tmp_path, "no-fm.md", "Just plain content.\n")

    edges, stats = extract(
        tmp_path,
        existing_node_ids=set(),
        alias_index={},
    )

    assert stats["files_walked"] == 1
    assert stats["files_with_frontmatter"] == 0
    assert stats["edges_emitted"] == 0
    assert len(edges) == 0
