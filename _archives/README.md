# _archives

**Purpose:** Wiki rebuild snapshots. Periodic full-vault snapshots taken before major schema migrations, taxonomy reshuffles, or bulk re-ingestion. Distinct from `40 - Archive/` (which is per-note archive of completed PARA work).

**Typical statuses:** `status/archived`

**Frontmatter contract (per snapshot manifest):**
```yaml
---
title: "Snapshot YYYY-MM-DD"
type: meta
snapshot_date: ""
snapshot_reason: ""  # pre-taxonomy-migration | pre-bulk-reingest | pre-pack-switch | scheduled
files_count: 0
size_bytes: 0
git_sha_at_snapshot: ""
---
```

**Suggested layout:**
```
_archives/
  YYYY-MM-DD-<reason>/
    manifest.md
    snapshot/        # full vault tree at that moment
```

**Tooling:** `tools/extract-from-source.mjs` exposes a `snapshot` verb (verify it on first use; behavior is implementation-defined per UK release).

**Distinction from `40 - Archive/`:** Per-note archive lives in `40 - Archive/`. Whole-vault snapshots live here. If your vault grows, prune oldest snapshots — git history covers normal recovery; `_archives/` is for catastrophic schema-error recovery only.

**See also:** [`../40 - Archive/`](../40%20-%20Archive/), [`../_meta/lifecycle.md`](../_meta/lifecycle.md)
