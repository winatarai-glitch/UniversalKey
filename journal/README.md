# journal

**Purpose:** Dated entries and reflections. Time-stamped scratch space — daily/weekly notes, retrospectives, decision diaries. NOT a project log (those go in `10 - Projects/<project>/decisions/`).

**Typical statuses:** `status/raw`, `status/archived`

**Frontmatter contract:**
```yaml
---
title: ""            # YYYY-MM-DD or "Week N — YYYY"
type: journal
date: ""             # ISO date
status: raw          # journal entries usually stay raw
mood: ""             # optional, for personal review patterns
tags: []
---
```

**Example entries:**
- `journal/2026-04-25.md` (daily)
- `journal/2026-W17.md` (weekly retrospective)
- `journal/2026-Q2-review.md` (quarterly)

**Templater integration:** Use `Templates/Daily Note.md` to auto-create today's entry with the date pre-filled.

**Promotion path:** If a journal entry contains a durable insight (concept, framework, decision), extract that insight into the appropriate wiki section (`concepts/`, `synthesis/`, project decisions) and link back to the journal as the source.

**See also:** [`../Templates/Daily Note.md`](../Templates/Daily%20Note.md), [`../synthesis/`](../synthesis/), [`../_meta/taxonomy.md`](../_meta/taxonomy.md)
