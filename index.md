<!-- SKELETON v1 — unhydrated UniversalKey vault -->
---
title: Vault Index
vault: UniversalKey
type: index
status: skeleton
tags: [meta, navigation]
created: 2026-04-25
updated: ""
---

# Welcome to your UniversalKey vault

This vault is empty. Run setup to populate it from an external source.

```bash
bash setup.sh                              # one-time interactive bootstrap
node tools/extract-from-source.mjs sync    # incremental updates afterward
```

See:
- [`CLAUDE.md`](CLAUDE.md) — agent context + conventions
- [`_meta/portability.md`](_meta/portability.md) — cross-machine setup
- [`_meta/taxonomy.md`](_meta/taxonomy.md) — tag vocabulary (core + active pack)
- [`_meta/mega-mind-manifest.md`](_meta/mega-mind-manifest.md) — ingest pattern reference

---

## PARA Structure (raw sources)

| Folder | Purpose |
|--------|---------|
| `00 - Inbox/` | Unprocessed captures awaiting triage |
| `10 - Projects/` | Active, time-bounded work |
| `20 - Areas/` | Ongoing responsibilities and standards |
| `30 - Resources/` | Reference material organized by topic |
| `40 - Archive/` | Completed or inactive items |

## Wiki Structure (distilled knowledge)

| Folder | Purpose |
|--------|---------|
| `concepts/` | Definitions, theories, mental models |
| `entities/people/` | People |
| `entities/organizations/` | Companies, schools, professional bodies |
| `entities/things/` | Tools, books, products, places |
| `skills/` | How-to knowledge and protocols |
| `references/` | Source summaries (papers, articles) |
| `synthesis/` | Your own cross-cutting analysis |
| `journal/` | Dated entries and reflections |

## Frontmatter Contract (template)

```yaml
---
title: ""
type: ""             # concept | entity | skill | reference | synthesis | journal
status: ""           # draft | active | archived | deprecated
source: ""           # where this came from
tags: []
created: ""
confidence: ""       # see _meta/confidence.md
visibility: ""       # internal | public
---
```

---

*Hydrate this vault by running `node tools/extract-from-source.mjs sync` after
configuring `VAULT_PATH` in `.env`.*
