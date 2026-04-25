---
title: Tag Taxonomy
type: meta
tags: [meta, taxonomy]
active_pack: chiropractic
created: 2026-04-25
---

# Tag Taxonomy

Controlled vocabulary for vault-wide tagging. Composed of two layers:

1. **Core** (always loaded): `_meta/taxonomy-core.md` — generic
   namespaces (status, source, confidence, tier, language, media, depth,
   visibility, project, audience) + lineage relation edges.

2. **Active pack** (selected via `active_pack` in this file's frontmatter
   AND/OR `ACTIVE_PACK` env var in `.env`): `_meta/domain-packs/<pack>.md` —
   domain-specific namespaces (e.g. clinical conditions, technique families,
   faculty), domain-specific extensions to core namespaces, and
   domain-specific relation edges.

## Resolution Order

1. Tools read `ACTIVE_PACK` from `.env` first (runtime override).
2. If unset, fall back to `active_pack:` in this file's frontmatter.
3. If still unset, fail with a clear error pointing to `.env.example`.

## Adding a New Pack

```bash
node tools/domain-pack-init.mjs <pack-name>
```

Creates `_meta/domain-packs/<pack-name>.md` from `_template.md` and updates
`active_pack:` here.

## Switching Packs

Edit `.env` and change `ACTIVE_PACK=<new-pack>`, then re-run:

```bash
node tools/extract-from-source.mjs scaffold
```

The scaffold step re-validates frontmatter contracts against the new
namespace and flags any tags that are no longer recognized.

## Validation

`tools/wiki-lint-v2.mjs` validates every tag in vault frontmatter against
core + active-pack namespaces. Unknown tags trigger lint warnings.

## See Also

- [`taxonomy-core.md`](taxonomy-core.md) — generic namespaces and lineage edges
- [`domain-packs/chiropractic.md`](domain-packs/chiropractic.md) — example pack (clinical, bilingual NO+EN)
- [`domain-packs/_template.md`](domain-packs/_template.md) — blank pack skeleton
- [`confidence.md`](confidence.md), [`lifecycle.md`](lifecycle.md), [`consolidation.md`](consolidation.md), [`contradictions.md`](contradictions.md) — supporting machinery
