# 40 - Archive

**Purpose:** Completed or inactive content from PARA folders. Preserve for retrieval, not for active work. Never delete — vault is append-only by convention.

**Typical statuses:** `status/archived`, `status/superseded`

**Frontmatter contract:** Preserved from original location. Add:
```yaml
archived: ""         # ISO date archived
archive_reason: ""   # completed | paused-indefinitely | superseded | obsolete
supersedes: []       # wikilinks to replacement notes (if applicable)
```

**Suggested layout:** Mirror the source folder structure to preserve provenance:
```
40 - Archive/
  10 - Projects/<archived-project-slug>/
  20 - Areas/<paused-area-slug>/
  ...
```

**Example entry:** `40 - Archive/10 - Projects/website-redesign-v1/README.md`

**Distinction from deletion:** archive preserves history; deletion is irreversible. Prefer archive unless the content is genuinely incorrect (in which case mark `status: superseded` and link to the corrected version, then archive).

**See also:** [`../10 - Projects/`](../10%20-%20Projects/), [`../_meta/lifecycle.md`](../_meta/lifecycle.md)
