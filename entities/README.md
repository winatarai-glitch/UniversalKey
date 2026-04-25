# entities

**Purpose:** Concrete things in the world — people, organizations, physical/abstract objects. One entity per file. Subfolders distinguish entity class.

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`

**Subfolders:**
- [`people/`](people/) — individual humans (slug pattern: `surname-firstname`)
- [`organizations/`](organizations/) — companies, schools, professional bodies
- [`things/`](things/) — tools, books, products, places, abstract objects (techniques, methods, instruments)

**Frontmatter contract (entity-class agnostic):**
```yaml
---
title: ""
type: entity
entity_class: ""     # person | organization | thing
domain: ""           # which domain pack this belongs to
status: ""
confidence: ""
identifiers: []      # external IDs (ORCID, DOI, ISBN, ROR, etc.)
aliases: []          # alternative spellings, abbreviations
relations: []
sources: []
---
```

**Example entries:**
- `entities/people/<surname-firstname>.md`
- `entities/organizations/<org-slug>.md`
- `entities/things/<thing-slug>.md`

**Distinction from `concepts/`:** see `concepts/README.md` — entities are concrete and citable; concepts are abstract.

**See also:** [`../concepts/`](../concepts/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
