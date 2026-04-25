# 30 - Resources

**Purpose:** Reference material organized by topic. Things you may want to consult later but aren't tied to a specific project or area. Books, articles, podcasts, datasets.

**Typical statuses:** `status/raw`, `status/published`, `status/archived`

**Frontmatter contract:**
```yaml
---
title: ""
type: resource
source: ""           # URL, citation, or original location
format: ""           # article | book | podcast | dataset | video
tags: []
captured: ""
---
```

**Suggested layout:** Organize by topic-slug, not by source type:
```
30 - Resources/
  ai-and-ml/
  philosophy/
  history/
  ...
```

**Example entry:** `30 - Resources/ai-and-ml/transformer-architecture-overview.md`

**Promotion path:** When a resource becomes a recurring reference for a concept or skill, distill the content into `concepts/<slug>.md` or `skills/<slug>.md` and link back to the resource as the source.

**See also:** [`../concepts/`](../concepts/), [`../references/`](../references/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
