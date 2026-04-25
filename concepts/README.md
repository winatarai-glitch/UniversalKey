# concepts

**Purpose:** Definitions, theories, mental models. The "what is X" layer of the wiki. One concept per file. Cross-link aggressively.

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`

**Frontmatter contract:**
```yaml
---
title: ""
type: concept
domain: ""           # which domain pack this belongs to
status: ""
confidence: ""       # see _meta/confidence.md
tier: semantic       # default tier for concepts
depth: ""            # deep | mid | stub
tags: []
relations: []        # extends, refines, contradicts, etc.
sources: []          # citations / wikilinks to references
created: ""
---
```

**Example entry:** `concepts/<topic-slug>.md` (e.g. `concepts/dependency-injection.md`)

**Subfolder convention:** If your domain pack defines `concept/<subfolder>/<slug>` namespace tags (see `_meta/domain-packs/<pack>.md`), mirror them as subdirectories: `concepts/<subfolder>/<slug>.md`.

**Distinction from `entities/`:** concepts are abstract (ideas, theories); entities are concrete (people, organizations, things). When in doubt: a concept can be tested or applied; an entity can be photographed.

**See also:** [`../entities/`](../entities/), [`../skills/`](../skills/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md), [`../_meta/confidence.md`](../_meta/confidence.md)
