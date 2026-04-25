# 00 - Inbox

**Purpose:** Triage queue. Drop captures here when you don't yet know where they belong. Process and route into PARA + wiki within ~7 days.

**Typical statuses:** `status/raw`, `status/needs-review`

**Frontmatter contract:**
```yaml
---
title: ""
type: ""             # leave blank until classified
source: ""           # where this came from
captured: ""         # ISO timestamp
status: raw
tags: []
---
```

**Example entry:** `2026-04-25-podcast-snippet-on-flow.md`

**Routing rules:**
- Active project material → `10 - Projects/<project>/`
- Ongoing area material → `20 - Areas/<area>/`
- Reference material → `30 - Resources/<topic>/`
- Distilled concept → `concepts/<slug>.md`
- Person/org/thing → `entities/<type>/<slug>.md`

**See also:** [`../10 - Projects/`](../10%20-%20Projects/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
