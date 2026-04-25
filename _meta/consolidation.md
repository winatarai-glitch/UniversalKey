---
title: Consolidation Tiers
type: meta
tags: [wiki, policy, v2]
created: 2026-04-17
updated: 2026-04-17
---

# Consolidation Tiers

Four tiers, each more compressed and higher-confidence than the last.

```
working  →  episodic  →  semantic  →  procedural
 <48h       <30d          confirmed      workflow
```

## Tier definitions

| Tier | Location | Lifetime | Content |
|---|---|---|---|
| `tier/working` | `journal/` | <48h | Raw session notes, scratch, in-flight thoughts. Not cross-referenced. |
| `tier/episodic` | `_raw/` | <30d | Session summaries. Compressed from working. Not yet promoted. |
| `tier/semantic` | `concepts/`, `entities/`, `skills/`, `references/` | indefinite | Confirmed knowledge. Cross-referenced. Has frontmatter, tags, backlinks. |
| `tier/procedural` | `synthesis/`, `skills/protocols/` | indefinite | Workflows, decision trees, clinical pathways. Extracted from ≥3 semantic pages. |

## Promotion rules

### working → episodic (automatic, 48h)
- Session-end hook or daily lint picks up journal entries older than 48h.
- Creates (or updates) `_raw/YYYY-MM-DD-{session-slug}.md` with compressed summary.
- Original journal entry stays (audit trail).

### episodic → semantic (≥2 reinforcements)
- Two independent mentions of the same concept/entity across sessions → promote.
- Write new page in `concepts/{slug}.md` (or appropriate folder).
- Tag `tier/semantic`, `confidence/low` initially (promoted per confidence rules).

### semantic → procedural (≥3 semantic, workflow emerges)
- When 3+ semantic pages describe steps of the same workflow, synthesize a protocol.
- Write in `synthesis/` (cross-cutting) or `skills/protocols/` (hands-on workflow).
- Tag `tier/procedural`, `confidence/medium` (requires reinforcement for `high`).

## Demotion

Rare but allowed:
- `semantic → episodic` if superseding source invalidates it AND kept for context.
- `procedural → semantic` if workflow fragments (decision tree becomes stale).

Demotion always leaves a redirect/pointer forward.

## What lives where

**Do not** write raw session thoughts directly into `concepts/` or `entities/`. Start in `journal/` or `_raw/`, let consolidation promote.

**Do not** write procedural workflows before the semantic pages exist. Procedural is synthesis across semantics.

**Do** keep all tiers — no tier is "lower quality," they serve different purposes.
