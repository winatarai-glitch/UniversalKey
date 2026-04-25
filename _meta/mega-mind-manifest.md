---
title: Ingest Pattern Reference
type: meta
tags: [meta, ingest, pattern]
created: 2026-04-25
---

# Ingest Pattern Reference

This file documents the canonical ingest pattern used to hydrate this vault
from an external corpus. Implementation lives in `tools/extract-from-source.mjs`
(scaffold/sync/verify verbs) and `tools/anonymize.mjs` (PII/PHI scrub).

The pattern itself is generic — it works for any corpus, in any language,
across any domain. Replace the example active pack (`chiropractic`) with your
own domain.

## Overview

Sequential, manifest-based ingest with PHI/PII gate, atomic writes, and
ndjson audit trail. Designed for HDD/USB/exFAT-friendly I/O — no parallel
writes, no in-place mutation, no fsync skipping.

## Ingest-Lock Invariant

Before starting any bulk ingest session, create `_meta/.ingest-lock`:

```bash
touch _meta/.ingest-lock
# ... run ingest ...
rm _meta/.ingest-lock
```

Sync consumers (`tools/extract-from-source.mjs sync`, derived-vault chunkers,
RAG indexers, downstream domain-vault sync engines) refuse to run while this
file exists. This prevents non-idempotent syncs when vault content is
mid-change.

The lock is **gitignored**. It is a runtime sentinel, not durable state.

If a session crashes mid-ingest, manually delete the stale lock before
re-running.

## Flow

1. Create `_meta/.ingest-lock`.
2. Walk source tree sequentially (no parallel I/O on USB/exFAT).
3. For each candidate file:
   a. Compute sha256 of source.
   b. Check manifest — skip if `sha256_unchanged`.
   c. Run `anonymize.mjs` PHI/PII gate.
   d. Skip if BLOCKED; quarantine if SUSPICIOUS; proceed if CLEAN.
4. Write atomically: `<target>.tmp` → `rename` → `<target>`.
5. Append one audit line to `_meta/.ingest-log.ndjson`.
6. Update `_meta/.ingest-manifest.json` (per-file sha256 + timestamp).
7. Delete `_meta/.ingest-lock`.

## Anonymization Hook

`tools/anonymize.mjs` is the gate. It must classify every file as one of:

- `clean` — pass through unmodified
- `suspicious` — quarantine, flag for human review
- `blocked` — refuse to import (PII/PHI detected with high confidence)

Customize the patterns in `anonymize.mjs` for your domain (e.g. medical
identifiers, financial PII, legal privilege markers, regulatory marks).

## Per-Domain Configuration

Set `ACTIVE_PACK` in `.env`. The active pack lives in
`_meta/domain-packs/<pack>.md` and declares:

- Namespace tag values specific to the domain
- Bilingual aliases (if your corpus is multilingual)
- Relations[] edge types specific to the domain (e.g., `treats`, `assesses`,
  `indicated-in` for clinical packs; `cites`, `funded-by`, `affiliated-with`
  for academic packs; `regulates`, `supersedes`, `enacts` for legal packs)

Create new packs with `node tools/domain-pack-init.mjs <pack-name>`.

## Audit Trail

`_meta/.ingest-log.ndjson` (gitignored) accumulates one JSON line per
processed file:

```json
{"ts":"2026-04-25T10:00:00Z","src":"<path>","tgt":"<path>","sha256":"<hash>","verdict":"clean","bytes":1234}
```

Use this for incremental re-runs (delta sync), audit / compliance review,
and rollback (every output is reproducible from the audit trail + source).
