# UniversalKey — Agent Context

Hybrid PARA + Wiki vault skeleton. PARA directories hold raw sources. Wiki
directories hold distilled knowledge. UK ships ZERO content — only the type
system + extraction tooling. Hydrate it with your own corpus.

## Structure

### PARA (raw sources)
- `00 - Inbox/` — triage queue
- `10 - Projects/` — active projects
- `20 - Areas/` — ongoing areas
- `30 - Resources/` — raw reference material
- `40 - Archive/` — completed/inactive
- `Templates/` — note templates (Daily, Book, Conversation Import, Training Data, Entity)

### Wiki (distilled knowledge)
- `concepts/` — ideas, theories, mental models
- `entities/` — people, organizations, things
  - `entities/people/`
  - `entities/organizations/`
  - `entities/things/`
- `skills/` — how-to knowledge (`skills/protocols/` = procedural tier)
- `references/` — source summaries
- `synthesis/` — cross-cutting analysis
- `journal/` — timestamped entries
- `_meta/` — taxonomy, portability docs, domain packs
- `_raw/` — staging for rough notes
- `_archives/` — wiki rebuild snapshots

## Key Files
- `index.md` — vault navigation
- `log.md` — activity log
- `_meta/taxonomy.md` — controlled tag vocabulary (imports core + active pack)
- `_meta/taxonomy-core.md` — generic namespaces (status, source, confidence, etc.)
- `_meta/domain-packs/` — domain-specific tag packs (one per knowledge domain)
- `.env.example` — runtime config template (`VAULT_PATH`, `ACTIVE_PACK`)
- `.gitignore` — tracks markdown + config; ignores binaries, node_modules, _raw/*

## Tools
- `tools/extract-from-source.mjs` — scaffold/sync/verify verbs
- `tools/anonymize.mjs` — PII/PHI scrubbing
- `tools/domain-pack-init.mjs` — bootstrap a new domain pack
- `tools/tag-and-frontmatter.mjs` — bulk tag + frontmatter writes
- `tools/cross-linker-batch.mjs` — wikilink graph construction
- `tools/ingest-folder.mjs` — manifest-based folder ingest
- `tools/pdfmd/` — PDF → Markdown converter (Python package)
- `tools/convert-pdf.sh` / `.bat` — safe pandoc/pdfmd wrappers

Install platform tools (`pandoc`, `tesseract`, `soffice`) via your package
manager (winget / brew / apt). They must be on PATH, or set `PANDOC_BIN`,
`TESSERACT_BIN`, `SOFFICE_BIN`, `PYTHON_BIN` in your `.env`.

## Critical invariants

- **`VAULT_PATH` source is READ-ONLY when ingesting from external corpora.**
  Never write, move, or delete in the source tree. All conversions output
  to your own vault, never overwriting source files.
- **`tools/convert-pdf.sh` and ingest tooling REFUSE writes outside the
  configured vault root.** Do not bypass.
- **`_meta/.ingest-lock` invariant:** any sync consumer of this vault
  (e.g. derived domain-vault sync engines, RAG chunkers) MUST refuse to
  run while `_meta/.ingest-lock` exists. Bulk ingest sessions create this
  file at session start (`touch _meta/.ingest-lock`) and delete it at
  session end. Prevents non-idempotent syncs when vault content is
  mid-change. Lock file is gitignored.

## Wiki Skills (optional, external bundle)

If you clone an obsidian-wiki skill bundle into `tools/<wiki-bundle>/`,
slash-commands like `/wiki-update`, `/wiki-query`, `/wiki-lint`, `/cross-linker`,
`/tag-taxonomy`, etc. become available. See the bundle's own README for setup.
UK does not ship a wiki bundle — it is optional add-on tooling.

## Git
- Tracks: `.md`, `.canvas`, `.base`, `.obsidian/*.json`, tool scripts
- Ignores: PDFs, DOCX, images, audio, video, JSON dumps, `node_modules/`,
  nested repos, `.claude/`, `_raw/*`
- Remote: configurable (private GitHub repo recommended for personal vaults)

## After Moving Vault
1. Update `.env` with new `VAULT_PATH`
2. Run `bash setup.sh` to re-prompt and rerun scaffolding
3. On Windows, run `git config --global core.longpaths true` before re-clone
4. On exFAT (USB/portable drives), add a safe.directory exception:
   `git config --global --add safe.directory <path-to-repo>`
5. See `_meta/portability.md` for full instructions

## Active Projects

(none yet — add your projects here, or maintain a separate
`_meta/active-projects.md` outside git for personal context)

## Domain Packs

UK ships with one example pack: `_meta/domain-packs/chiropractic.md`. Inspect
it for the contract a pack must satisfy: namespace declarations, value lists,
bilingual aliases (if applicable), relations[] edge types. To create your own:

```bash
node tools/domain-pack-init.mjs <pack-name>
```

This copies `_meta/domain-packs/_template.md` to `<pack-name>.md` and updates
`_meta/taxonomy.md` to point `active_pack:` at the new pack.

## Ingest Pattern

See `_meta/mega-mind-manifest.md` for the canonical ingest pattern:
sequential walker, manifest-based delta, anonymize hook, ingest-lock invariant,
audit ndjson trail. The pattern is implemented in `tools/extract-from-source.mjs`
and respected by all sync consumers.

## LLM Wiki Machinery

- `_meta/confidence.md` — confidence scoring rules
- `_meta/lifecycle.md` — supersession + retention decay
- `_meta/consolidation.md` — working → episodic → semantic → procedural tier promotion
- `_meta/contradictions.md` — contested claims register
