# _meta

**Purpose:** Vault-level metadata, taxonomy, machinery configuration. Read by tools and humans; never holds primary content.

## Inventory

| File | Purpose |
|------|---------|
| `taxonomy.md` | Active-pack pointer + composition rules (core + pack) |
| `taxonomy-core.md` | Generic, domain-agnostic vocabulary (always loaded) |
| `domain-packs/<pack>.md` | Domain-specific extension (one per domain) |
| `domain-packs/_template.md` | Blank pack skeleton for new packs |
| `confidence.md` | Confidence scoring rules |
| `lifecycle.md` | Supersession + retention decay rules |
| `consolidation.md` | Tier promotion rules (working → episodic → semantic → procedural) |
| `contradictions.md` | Contested claims register |
| `portability.md` | Cross-machine setup, env-var reference |
| `mega-mind-manifest.md` | Canonical ingest pattern reference |
| `draft-readme.md` | Marketing/positioning draft (NOT promoted to repo root README) |

## Sentinel files (gitignored, runtime-only)

| File | Purpose |
|------|---------|
| `.ingest-lock` | Sync consumers refuse to run while present (set during bulk ingest) |
| `.ingest-log.ndjson` | Per-file audit trail (one JSON line per processed file) |
| `.ingest-manifest.json` | Per-file sha256 + timestamp for delta sync |
| `.sync-vault.lock` | PID lockfile to prevent concurrent sync runs |
| `active-projects.md` | Personal project list (gitignored — not for the schema repo) |

## Convention

Files here are **read-only by content tools** and **write-only by meta tools**.
Don't author concepts/entities/skills here — those go in their respective wiki
folders.

**See also:** [`domain-packs/README.md`](domain-packs/README.md), [`../tools/README.md`](../tools/README.md), [`../CLAUDE.md`](../CLAUDE.md)
