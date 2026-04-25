# tools

**Purpose:** Vault tooling — extraction, sync, anonymization, conversion, taxonomy management. All scripts assume Node 18+ on PATH; Python tools (`pdfmd/`) assume Python 3.11+ via `pip install -e tools/pdfmd` or `PYTHON_BIN` env override.

## Inventory

### NEW (this skeleton)
- `extract-from-source.mjs` — `scaffold` / `sync` / `verify` verbs. Wired to CI.
- `anonymize.mjs` — PII/PHI gate. Customize patterns for your domain.
- `domain-pack-init.mjs` — bootstrap a new pack from `_meta/domain-packs/_template.md`.

### Vault-management (verbatim from source vault)
- `tag-and-frontmatter.mjs` — bulk tag + frontmatter writes from controlled vocabulary.
- `cross-linker-batch.mjs` — wikilink graph construction across the vault.
- `ingest-folder.mjs` — manifest-based folder ingest with sequential I/O discipline.
- `frontmatter-migrate.mjs` — schema migrations on existing frontmatter.
- `wiki-lint-v2.mjs` — validate frontmatter against taxonomy + structural rules.
- `progress-report.mjs` — vault state dashboard.
- `concept-coverage-report.mjs` — coverage gaps in concept entities.

### lib (shared modules)
- `lib/classify-folder.mjs`, `lib/detect-language.mjs`, `lib/enumerate-files.mjs`
- `lib/frontmatter-v2.mjs`, `lib/manifest.mjs`, `lib/paths.mjs`, `lib/wikilink-index.mjs`

### PDF/Office conversion
- `pdfmd/` — PDF → Markdown converter (Python package, `pip install -e .`)
- `convert-pdf.sh`, `convert-pdf.bat` — safe wrappers (refuse writes outside vault root)

## Convention

- ESM-only (`.mjs`) for Node scripts.
- All tools read `VAULT_PATH`, `ACTIVE_PACK` from `.env`.
- Sequential I/O on USB/exFAT; no parallel writes.
- Respect `_meta/.ingest-lock` invariant (refuse to run while present).

**See also:** [`../_meta/portability.md`](../_meta/portability.md), [`../_meta/mega-mind-manifest.md`](../_meta/mega-mind-manifest.md), [`../setup.sh`](../setup.sh)
