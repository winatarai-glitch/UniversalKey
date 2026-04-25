# _meta/domain-packs

**Purpose:** Domain-specific tag packs. Each `<pack>.md` extends `taxonomy-core.md` with vocabulary unique to one knowledge domain (clinical, legal, academic, financial, etc.).

## Inventory

| File | Domain | Status |
|------|--------|--------|
| `chiropractic.md` | Clinical chiropractic (bilingual NO+EN) | Example pack — illustrates the contract |
| `_template.md` | Blank skeleton | Starting point for new packs |

## Activation

Set `ACTIVE_PACK=<pack-name>` in `.env` (without the `.md` extension). Tools
read this at runtime to know which pack to load alongside `taxonomy-core.md`.

## Creating a New Pack

```bash
node tools/domain-pack-init.mjs <pack-name>
```

This:
1. Copies `_template.md` to `<pack-name>.md`
2. Updates `_meta/taxonomy.md` `active_pack:` frontmatter
3. Prints next-step instructions (fill in namespaces + values)

## Pack Contract

Every pack must declare:

- Domain-specific tag namespaces (e.g., `condition/`, `case-citation/`, `instrument/`)
- Domain-specific extensions to core namespaces (e.g., extra `type/` values, extra `status/` values)
- Domain-specific relation edges (e.g., clinical: `treats`, `assesses`; legal: `cites`, `overrules`)
- (Optional) Bilingual or multilingual aliases for keyword matching during ingest

What a pack must NOT redeclare (already in core):

- Core `status/`, `source/`, `confidence/`, `tier/`, `language/`, `media/`, `depth/`, `visibility/` namespaces
- Lineage relation edges (`extends`, `refines`, `contradicts`, `challenges`, `historical-basis-for`, `predates`, `reinforced-by`)

## Switching Packs

Edit `.env` (`ACTIVE_PACK=<new-pack>`), then re-run:

```bash
node tools/extract-from-source.mjs scaffold
```

Scaffolding re-validates frontmatter contracts against the new namespace
and warns about any tags that no longer resolve.

**See also:** [`../taxonomy.md`](../taxonomy.md), [`../taxonomy-core.md`](../taxonomy-core.md), [`_template.md`](_template.md), [`../../tools/domain-pack-init.mjs`](../../tools/domain-pack-init.mjs)
