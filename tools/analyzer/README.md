# universalkey-analyzer

Python analyzer for the UniversalKey graph: PageRank, Louvain communities, betweenness centrality, plus a frontmatter typed-edge extraction pass that surfaces ~25k semantic edges (`extends`, `treats`, `contraindicated-in`, etc.) that body-wikilink graph exporters miss.

**Sprint:** B6 (lean) — see `C:\Users\UniversalKey-contributor\.claude\sprint-prompts\B6-analyzer.md`
**Predecessor:** B4 graph-export tooling (frozen, do not modify)
**Successor:** B-semantic (deferred ML scope: embeddings, parameter sweeps, external corpus)

## Install

```bash
# Venv on C: ONLY (not D: — exFAT + Python venv is unreliable)
"C:\Users\UniversalKey-contributor\AppData\Local\Programs\Python\Python313\python.exe" -m venv "C:\Users\UniversalKey-contributor\.venvs\universalkey-analyzer"

"C:\Users\UniversalKey-contributor\.venvs\universalkey-analyzer\Scripts\pip.exe" install -e "D:\UniversalKey\tools\analyzer[dev]"
```

## Usage

```bash
# Extract frontmatter typed edges from an Obsidian-style vault
analyzer extract-fm-edges \
    --vault "D:\My Second Brain" \
    --out "D:\sprint-work\B6-analyzer\samples\SB-supplemental-edges.json"

# Analyze a graph.json (from graph-export.mjs); optionally merge frontmatter edges from a vault
analyzer analyze \
    --graph "D:\sprint-work\B4-graph-export\samples\SB-wiki-export-full\graph.json" \
    --vault "D:\My Second Brain" \
    --out-dir "D:\sprint-work\B6-analyzer\samples\SB-report"
```

Outputs:
- `report.md` — top-10 PageRank, top-10 betweenness, top-N communities, edge-type histogram
- `report.json` — same data, JSON, `sort_keys=True` for byte-stable diffing

## Architecture

```
src/universalkey_analyzer/
├── cli.py                # click entry point (analyze, extract-fm-edges)
├── load.py               # JSON ingest + schema validation, sort nodes
├── frontmatter_edges.py  # walk vault, PyYAML parse, emit 17 typed edges
├── metrics.py            # PageRank + Louvain + betweenness
└── report.py             # markdown + JSON output
```

## Edge type vocabulary

17 valid types lifted from `D:\UniversalKey\tools\lib\frontmatter-v2.mjs` lines 113–146:

**Lineage (7):** `extends`, `refines`, `contradicts`, `challenges`, `historical-basis-for`, `predates`, `reinforced-by`

**Concept (10):** `assesses`, `tests`, `treats`, `indicated-in`, `contraindicated-in`, `part-of`, `requires-prerequisite`, `innervated-by`, `opposes`, `synergist-with`

Two YAML shapes are recognized:
- `relations: [{target: "[[X]]", type: "extends"}, ...]` — list of typed objects
- `supersedes: [[X]]` / `superseded_by: [[Y]]` — scalar lists with implicit edge type

## Determinism

PageRank pinned `tol=1e-6, max_iter=100, alpha=0.85`. Louvain pinned `random_state=42`. Nodes sorted post-load. JSON output `sort_keys=True`. Top-N comparisons use **node-ID lists**, not float strings.

## Tests

```bash
"C:\Users\UniversalKey-contributor\.venvs\universalkey-analyzer\Scripts\pytest.exe" tests/ -v
```
