# synthesis

**Purpose:** Your own cross-cutting analysis — essays, frameworks, theories that combine multiple concepts/skills/references. The "so what" layer of the wiki.

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`, `status/superseded`

**Frontmatter contract:**
```yaml
---
title: ""
type: synthesis
domain: ""
status: ""
confidence: ""
tier: procedural     # default tier for synthesis
depth: ""            # often deep
draws_on: []         # wikilinks to concepts/, skills/, references/, entities/
relations: []
contradicts_authority: false  # true if you're disagreeing with established consensus
tags: []
---
```

**Example entry:** `synthesis/<thesis-slug>.md` (e.g. `synthesis/why-test-first-works-for-ai-features.md`)

**When to write a synthesis:** You notice a pattern across 3+ sources, or you've changed your mind about a concept, or you're building an argument that doesn't fit in any existing concept page.

**Promotion path:** If a synthesis becomes the canonical view, refactor its claims back into `concepts/` and `skills/` pages, then mark the synthesis `status/superseded` with a `supersedes` chain.

**See also:** [`../concepts/`](../concepts/), [`../references/`](../references/), [`../_meta/contradictions.md`](../_meta/contradictions.md)
