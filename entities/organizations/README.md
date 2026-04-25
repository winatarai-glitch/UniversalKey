# entities/organizations

**Purpose:** Companies, universities, professional bodies, NGOs, government agencies, research institutions. One org per file. Slug pattern: `acronym` if widely known, otherwise `name-slug`.

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`

**Frontmatter contract:**
```yaml
---
title: ""            # full preferred name
type: entity
entity_class: organization
domain: ""           # which domain pack
status: ""
confidence: ""
identifiers:
  ror: ""            # Research Org Registry ID
  legal_name: ""     # if differs from common name
aliases: []          # acronyms, alternative spellings
founded: ""          # ISO date or year
country: ""
city: ""
url: ""
relations: []        # parent_org, member_of, partners_with
sources: []
---
```

**Example entry:** `entities/organizations/anthropic.md`

**Disambiguation:** If two orgs share a common acronym, prefix with country/sector: `acm-usa`, `acm-academic-publishing`.

**See also:** [`../people/`](../people/), [`../things/`](../things/), [`../../_meta/taxonomy.md`](../../_meta/taxonomy.md)
