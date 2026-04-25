# entities/people

**Purpose:** Individual humans. One person per file. Slug pattern: `surname-firstname`, lowercased, ASCII (e.g., `turing-alan.md`).

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`, `status/superseded`

**Frontmatter contract:**
```yaml
---
title: ""            # full preferred name
type: entity
entity_class: person
domain: ""           # which domain pack
status: ""
confidence: ""
identifiers:
  orcid: ""          # if academic
  github: ""         # if developer
aliases: []          # other spellings, professional titles
born: ""             # ISO date if known
died: ""             # ISO date if applicable
nationality: ""
affiliations: []     # wikilinks to entities/organizations/
relations: []
sources: []
---
```

**Example entry:** `entities/people/turing-alan.md`

**Naming collisions:** If two people share `surname-firstname`, disambiguate with discipline or birth year: `surname-firstname-physicist`, `surname-firstname-1924`.

**See also:** [`../organizations/`](../organizations/), [`../things/`](../things/), [`../../_meta/taxonomy.md`](../../_meta/taxonomy.md)
