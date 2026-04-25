# _raw

**Purpose:** Staging area for rough notes during ingest sessions — outputs of `tools/extract-from-source.mjs sync`, translation pipeline outputs, deduplication queues. Episodic-tier content awaiting promotion or pruning.

**Typical statuses:** `status/raw`, `status/needs-review`, `status/pending-translation-review`, `status/pending-transcription`

**Gitignored by default.** This folder collects per-machine staging artifacts that bloat the repo. Production-ready content gets promoted into `concepts/`, `entities/`, `references/` etc.

**Suggested subfolders:**
- `_raw/translations/` — multilingual ingest staging (NO/EN/IT cross-language dedup)
- `_raw/ingest-queue/` — folder-scan reports awaiting processing
- `_raw/transcripts/` — audio/video transcription outputs

**Frontmatter contract:**
```yaml
---
title: ""
type: raw
source: ""           # original file path
status: ""
captured: ""         # ISO timestamp
tier: episodic
tags: []
---
```

**Promotion rules:** See `_meta/consolidation.md` for the working → episodic → semantic → procedural tier flow. `_raw/` is the episodic staging ground.

**See also:** [`../00 - Inbox/`](../00%20-%20Inbox/), [`../_meta/consolidation.md`](../_meta/consolidation.md), [`../_meta/lifecycle.md`](../_meta/lifecycle.md)
