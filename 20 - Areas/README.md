# 20 - Areas

**Purpose:** Ongoing responsibilities and standards — areas you maintain indefinitely, not bounded by a deliverable. Examples: health, finances, a clinical practice, a research domain.

**Typical statuses:** `status/published`, `status/needs-review`

**Frontmatter contract (per area root):**
```yaml
---
title: ""
type: area
standard: ""         # the bar you maintain (1-2 sentences)
review_cadence: ""   # weekly | monthly | quarterly
tags: []
---
```

**Suggested layout per area:**
```
20 - Areas/<area-slug>/
  README.md          # standard + review cadence
  routines/          # repeating activities
  references/        # standing reference material
  reviews/           # periodic check-ins (dated)
```

**Example entry:** `20 - Areas/clinical-practice/README.md`

**Distinction from Projects:** an area has no end date. If you can complete it, it belongs in `10 - Projects/`.

**See also:** [`../10 - Projects/`](../10%20-%20Projects/), [`../30 - Resources/`](../30%20-%20Resources/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
