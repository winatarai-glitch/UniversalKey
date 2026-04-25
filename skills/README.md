# skills

**Purpose:** How-to knowledge. Procedures, techniques, workflows. The "how to do X" layer of the wiki. One skill per file. Subdirectory `protocols/` for procedural-tier (executable step lists).

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`

**Frontmatter contract:**
```yaml
---
title: ""
type: skill
domain: ""
status: ""
confidence: ""
tier: ""             # semantic (how-to knowledge) | procedural (executable protocol)
depth: ""
prerequisites: []    # wikilinks to skills or concepts
tools_required: []   # wikilinks to entities/things/
relations: []
sources: []
---
```

**Example entries:**
- `skills/<verb-object-slug>.md` (e.g. `skills/conduct-1on1-meeting.md`)
- `skills/protocols/<workflow-slug>.md` (e.g. `skills/protocols/code-review-checklist.md`)

**Distinction from `concepts/`:** a concept defines what something IS; a skill defines what to DO. If the page answers "what is X?" it's a concept; if it answers "how do I X?" it's a skill.

**Distinction from `synthesis/`:** synthesis is your own analysis across multiple skills/concepts; a skill is the canonical how-to itself.

**See also:** [`../concepts/`](../concepts/), [`../synthesis/`](../synthesis/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
