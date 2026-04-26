# UniversalKey

[![CI](https://github.com/Usefullatwork/UniversalKey/actions/workflows/lint.yml/badge.svg)](https://github.com/Usefullatwork/UniversalKey/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A schema-only skeleton for personal and team knowledge graphs.** Bring your
own corpus; UniversalKey provides the type system, tag taxonomy, file
conventions, and graph-analysis tooling — tested at 50,000+ nodes.

```
┌─────────────────────────────────────────────────────┐
│  Your corpus                                        │
│  (PDFs, transcripts, notes, research, contracts)    │
└────────────────────────┬────────────────────────────┘
                         │
                  ingest + extract
                         ▼
┌─────────────────────────────────────────────────────┐
│  UniversalKey                                       │
│  - PARA + wiki structure                            │
│  - typed tags (core + domain pack)                  │
│  - frontmatter contracts                            │
│  - PII gate, sync, verification                     │
└────────────────────────┬────────────────────────────┘
                         │
                 export + analyze
                         ▼
┌─────────────────────────────────────────────────────┐
│  Graph outputs                                      │
│  JSON · GraphML · Cypher · D3 viewer                │
│  PageRank · Louvain · betweenness                   │
└─────────────────────────────────────────────────────┘
```

---

## Why

Personal and team knowledge graphs that grow organically tend to drift: tag
vocabularies fragment, frontmatter becomes inconsistent, notes pile up in
"Inbox" forever. UniversalKey provides the **backbone** — a tested, structured
contract your notes can adhere to from day one.

By keeping schema separate from content, you can:

- Apply UK to multiple vaults (one per domain) without copy-pasting setup
- Swap domain packs without rebuilding the structure
- Onboard a new contributor by handing them a UK clone, not your private vault
- Open-source your taxonomy while keeping content private
- Run reproducible graph metrics (PageRank, Louvain, betweenness) against any
  vault that follows the convention

---

## What's in the box

| Component | Purpose |
| --- | --- |
| **PARA + wiki structure** | 5 PARA folders + 9 wiki folders + Templates |
| **Tag taxonomy** | Core (universal) layer + swappable domain packs |
| **5 templates** | Daily Note, Book Note, Conversation Import, Training Data Entry, Entity Note |
| **Extraction tooling** (`tools/`) | scaffold / sync / verify · PII gate · domain-pack initializer · ingestion |
| **Graph export** (`tools/graph-export.mjs`) | JSON · GraphML · Cypher · minimal D3 HTML viewer |
| **Python analyzer** (`tools/analyzer/`) | PageRank, Louvain, betweenness, frontmatter typed-edge extraction |
| **PDF→Markdown** (`tools/pdfmd/`) | Python package, ready to install |
| **CI** (`.github/workflows/lint.yml`) | Schema verification on every push |

---

## Validation at scale

UniversalKey's analyzer was benchmarked against two corpora to verify the
pipeline is corpus-agnostic and production-ready:

| Corpus | Nodes | Edges | Modularity | Wallclock | Sanity check |
| --- | --- | --- | --- | --- | --- |
| Personal vault (Obsidian, ~16k notes) | 16,010 | 23,605 | 0.5230 | 70 s | Top hubs match expected high-degree concepts (manual spot-check) |
| Founders-podcast transcripts (410 episodes) | 50,665 | 50,327 | 0.9963 | **3.06 s** | 10/10 canonical names in top-10 PageRank (Jobs · Ogilvy · Schwarzenegger · Munger · Musk · Gates · Lauder · Walton · Rockefeller · Land) |

The 50k-node corpus completes full PageRank + Louvain + betweenness in **3.06
seconds** on a laptop. Top-10 PageRank surfaces 10/10 recognizable canonical
names — sanity check pass without manual tuning.

The pipeline is deterministic: same vault → same `report.json`, byte-stable.
PageRank pinned `α=0.85, tol=1e-6`. Louvain pinned `random_state=42`. Top-N
comparisons use node-ID lists, not float strings (NumPy LSB drift across
versions is a known footgun).

---

## Quick start

**Prerequisites:** [Obsidian](https://obsidian.md), Node 20+, Python 3.11+ (only
needed for the analyzer / `pdfmd`).

```bash
git clone https://github.com/Usefullatwork/UniversalKey.git
cd UniversalKey
bash setup.sh        # prompts for VAULT_PATH and ACTIVE_PACK, writes .env
```

> **Windows users:** run `setup.sh` from Git Bash or WSL — the script uses POSIX shell features. PowerShell-native setup is on the roadmap.

After `setup.sh`, your vault is scaffolded with PARA + wiki folders, templates,
and the active domain pack's tag taxonomy.

### Use the analyzer (optional)

```bash
# Create a Python virtualenv (NTFS, not exFAT)
python3 -m venv .venv
source .venv/bin/activate           # Linux/macOS
# .venv\Scripts\activate.bat         # Windows

pip install -e "./tools/analyzer[dev]"

# Export your vault to graph.json + GraphML + Cypher
node tools/graph-export.mjs --vault "<path/to/your/vault>" --output-dir ./out

# Analyze
analyzer analyze \
    --graph ./out/graph.json \
    --vault "<path/to/your/vault>" \
    --out-dir ./out/report
```

Outputs: `report.md` (top PageRank + communities + edge-type histogram) and
`report.json` (`sort_keys=True`, byte-stable for diffing).

---

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — agent context, conventions, file layout
- [`_meta/portability.md`](_meta/portability.md) — cross-machine setup, env vars
- [`_meta/taxonomy.md`](_meta/taxonomy.md) — tag vocabulary (core + active pack)
- [`_meta/mega-mind-manifest.md`](_meta/mega-mind-manifest.md) — canonical ingestion pattern
- [`_meta/domain-packs/`](_meta/domain-packs/) — bundled packs + `_template.md` to author your own
- [`tools/README.md`](tools/README.md) — script inventory
- [`tools/analyzer/README.md`](tools/analyzer/README.md) — Python analyzer details, edge type vocabulary

---

## When to use it

- You're starting a new knowledge graph from scratch
- You want a tested schema instead of inventing one
- You want to share your taxonomy without sharing your notes
- You want CI on your knowledge graph (lint, frontmatter validation)
- You want reproducible graph metrics (PageRank, Louvain, betweenness) on Obsidian-style markdown

## When NOT to use it

- You have an existing 5,000-note vault — migration cost isn't worth it
- You don't use Obsidian (UK leans on Templater + frontmatter conventions)
- You want a turn-key knowledge product — UK is for builders

## Anti-goals

- **Not a notes app.** Use Obsidian (or any Markdown editor) to edit notes.
- **Not a CMS.** No web frontend, no auth, no realtime.
- **Not a graph database.** Wikilinks + Obsidian backlinks, not Neo4j (though `tools/graph-export.mjs` emits Cypher if you want to load into one).
- **Not a particular ontology.** Domain packs let you bring your own.

---

## Domain packs

UniversalKey separates universal taxonomy (`_meta/taxonomy-core.md`) from
domain-specific extensions (`_meta/domain-packs/<pack>.md`). The repo ships
with:

- `_template.md` — copy as a starting point for your own pack
- `chiropractic.md` — worked example pack with conditions, regions, techniques

Add your own pack and switch between packs without rebuilding the structure:

```bash
node tools/domain-pack-init.mjs --name <your-pack>
# edit _meta/domain-packs/<your-pack>.md
echo "ACTIVE_PACK=<your-pack>" >> .env
```

---

## Project status

**Schema skeleton release.** Production-tested tooling, zero content. The
analyzer is benchmarked against a 50,665-node external corpus with sub-second
graph metrics. CI runs `verify` on every push.

This repo is the **public schema artifact**. It is not an end-to-end product;
it is a foundation for building your own.

---

## Contributing

Issues and PRs welcome. Before opening a PR:

- Run `node tools/extract-from-source.mjs verify` locally
- For analyzer changes: `pytest tools/analyzer/tests/ -v`
- Keep schema-relevant changes (taxonomy, conventions) separate from
  tooling-only changes — UK's commit history is intentionally readable

---

## License

MIT — see [`LICENSE`](LICENSE).
