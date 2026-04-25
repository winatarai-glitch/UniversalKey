---
title: Lifecycle (Supersession & Retention Decay)
type: meta
tags: [wiki, policy, v2]
created: 2026-04-17
updated: 2026-04-17
---

# Lifecycle

Knowledge changes. Old claims shouldn't silently sit alongside newer ones. This file encodes how the wiki ages, what retires, and what supersedes what.

## Supersession

When a newer authoritative source replaces an older claim:

```yaml
# In the NEW page
supersedes: [[old-page-slug]]

# In the OLD page (added automatically by lint)
superseded_by: [[new-page-slug]]
status/superseded
```

**Rules:**
- Never delete superseded pages. They're the archaeological record.
- Obsidian search treats `status/superseded` as de-prioritized.
- Supersession chains must be acyclic (`wiki-lint-v2` checks).
- A supersession is a human decision or automated ≥95% overlap merge. Below 95% → flag, don't auto-supersede.

## Retention decay (Ebbinghaus-inspired)

Not everything ages the same. Decay rates by type:

| Type | Half-life | Policy |
|---|---|---|
| `type/clinical-guide` — anatomy, mechanics | 10+ years | effectively permanent |
| `type/research-paper` — established findings | 5 years | flag if not reinforced in 5y |
| `type/research-paper` — recent findings (<2y) | 2 years | require 2nd source within 2y |
| `type/conversation` — LLM Q&A | 6 months | demote to `_archives/` if not referenced |
| `type/blog-draft` | 3 months | either promote to publish or archive |
| `type/training-data` | evergreen | keep unless superseded |
| `journal/*` (working memory) | 48h | auto-move to `_raw/` if no promotion |

## Retention actions

Each claim / page has:
- `last_accessed` (Obsidian doesn't track; use git-log timestamps as proxy)
- `last_confirmed` (frontmatter, updated on reinforcement)
- `access_count` (approximate via backlink count)

Decay chain (ran monthly by `wiki-lint-v2 --retention`):
1. Check `updated` vs type half-life.
2. If stale AND low backlink count → demote one confidence level.
3. If already `low` AND stale → flag `status/candidate-archive`.
4. Human reviews `status/candidate-archive` queue and moves or keeps.
5. Never auto-delete. Move to `_archives/{year}/`.

## Working memory

`journal/{date}-*.md` is ephemeral. The session-end hook (see `.claude/hooks/on-session-end.sh`):
1. Reads today's journal entries.
2. Extracts insights ≥ quality threshold.
3. Writes/updates semantic pages in `concepts/`, `entities/`, `skills/`.
4. Keeps the journal entry for audit trail, tags `tier/episodic`.

## Crystallization (explorations → pages)

After a substantive exploration (research thread, debugging session, deep read), run the crystallize routine:
1. Extract: question, findings, files/entities involved, lessons.
2. Write a page in the appropriate wiki subfolder.
3. Tag `confidence/medium`, `source_count: 1` (single session).
4. Link from the explored entities back to the new page.

The exploration itself is now a source — just like an ingested article. Reinforcement comes when future sessions confirm the lesson.
