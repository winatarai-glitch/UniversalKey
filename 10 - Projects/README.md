# 10 - Projects

**Purpose:** Active, time-bounded work. One subdirectory per project. Move to `40 - Archive/` when done or paused indefinitely.

**Typical statuses:** `status/draft`, `status/published`, `status/archived`

**Frontmatter contract (per project root):**
```yaml
---
title: ""
type: project
status: ""           # active | paused | shipped | archived
started: ""          # ISO date
target: ""           # ISO date or "ongoing"
owner: ""
tags: []
---
```

**Suggested layout per project:**
```
10 - Projects/<project-slug>/
  README.md          # project context, links, status
  inbox/             # project-specific captures
  deliverables/      # outputs
  decisions/         # ADRs
  notes/             # working notes
```

**Example entry:** `10 - Projects/website-redesign/README.md`

**See also:** [`../20 - Areas/`](../20%20-%20Areas/), [`../40 - Archive/`](../40%20-%20Archive/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
