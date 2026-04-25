---
title: Domain Pack — <PACK_NAME>
type: meta
tags: [meta, taxonomy, domain-pack, <pack-name>]
domain: <pack-name>
language_primary: en
language_secondary: 
created: 
---

# Domain Pack — <PACK_NAME>

Replace `<PACK_NAME>` with your domain (e.g., `finance`, `legal`, `gardening`,
`literature`). Activate by setting `ACTIVE_PACK=<pack-name>` in `.env`.

This pack EXTENDS `_meta/taxonomy-core.md` — do NOT re-declare core
namespaces (`status/`, `source/`, `confidence/`, `tier/`, `language/`,
`media/`, `depth/`, `visibility/`, lineage relations). Add only the
domain-specific values that core does not cover.

## Domain-Specific Tag Namespaces

Add namespaces unique to your domain. Examples by domain:

- **Finance:** `instrument/`, `regulator/`, `jurisdiction/`, `filing-type/`
- **Legal:** `jurisdiction/`, `case-citation/`, `statute/`, `practice-area/`
- **Academic:** `discipline/`, `journal/`, `methodology/`, `funding-body/`
- **Software:** `language/` (programming), `framework/`, `pattern/`, `cve/`
- **Healthcare:** `condition/`, `region/`, `technique/`, `tool/`
- **Cooking:** `cuisine/`, `technique/`, `ingredient/`, `dietary/`

For each namespace, list the controlled vocabulary values:

```
- `<namespace>/<value-1>` — short description
- `<namespace>/<value-2>` — short description
```

## Domain Content Types (extend core `type/`)

If your domain has document types not covered by core:

- `type/<your-doc-type>` — description

## Domain Audience Values (extend core `audience/`)

If your domain has specific audience tiers:

- `audience/<your-audience>` — description

## Domain-Specific Status (extend core `status/`)

If your domain has workflow statuses not in core:

- `status/<your-status>` — description

## Domain-Specific Source (extend core `source/`)

If your domain has source types not in core:

- `source/<your-source>` — description

## Relation Edge Types — Domain-Specific

Live in `relations[]` alongside core lineage edges (`extends`, `refines`,
`contradicts`, `challenges`, `historical-basis-for`, `predates`, `reinforced-by`).

Group by semantic class:

**<Class A>:** `<edge-type-1>`, `<edge-type-2>`

**<Class B>:** `<edge-type-3>`, `<edge-type-4>`

Examples by domain:

- **Clinical:** `assesses`, `tests`, `treats`, `indicated-in`, `contraindicated-in`, `innervated-by`
- **Legal:** `cites`, `overrules`, `affirms`, `distinguishes`, `applies-to`
- **Academic:** `cites`, `replicates`, `extends-methodology-of`, `funded-by`, `affiliated-with`
- **Software:** `depends-on`, `implements`, `replaces`, `mitigates`, `exploited-by`
- **Finance:** `regulated-by`, `acquired`, `divested`, `rated-by`, `audited-by`

## Aliases (Optional, Machine-Readable, Multilingual)

If your domain has bilingual or multilingual aliases, add them in this format
for `tools/tag-and-frontmatter.mjs` to do keyword matching during ingest:

```
<!-- PARSER: Each line is tag|alias1,alias2,alias3 -->
<!-- Used by tools/tag-and-frontmatter.mjs for keyword matching -->

<namespace>/<value>|alias1,alias2,alias3
```

If your domain is monolingual English-only, this section can stay empty.

## Initialization

To create a new pack from this template:

```bash
node tools/domain-pack-init.mjs <pack-name>
```

This copies `_template.md` to `<pack-name>.md` and updates
`_meta/taxonomy.md` to point `active_pack:` at the new pack.
