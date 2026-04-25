---
title: Tag Taxonomy — Core
type: meta
tags: [meta, taxonomy, core]
created: 2026-04-25
---

# Tag Taxonomy — Core

Generic, domain-agnostic vocabulary. Loaded by every UniversalKey vault
regardless of `ACTIVE_PACK`. Domain-specific tags live in
`_meta/domain-packs/<pack>.md` (selected via `ACTIVE_PACK` env var).

The taxonomy is consumed by `tools/tag-and-frontmatter.mjs` for keyword
matching and by `tools/wiki-lint-v2.mjs` for tag-set validation.

## Status
- `status/raw` — captured, no processing
- `status/draft` — partial structure, not yet reviewed
- `status/published` — finalized for current consumer
- `status/archived` — historically preserved, not active
- `status/needs-review` — flagged for human inspection
- `status/superseded` — replaced by a newer note (with `supersedes` relation)

Packs may extend with workflow-specific statuses (e.g. clinical packs add
`status/pending-translation-review` for multilingual queues).

## Source
- `source/perplexity`, `source/gemini`, `source/claude`, `source/notebooklm` — LLM-generated
- `source/research-paper`, `source/textbook`, `source/article` — published material
- `source/personal-experience` — first-hand notes
- `source/external-import` — imported from another tool/system

## Content Type
Generic content types. Domain-specific types (e.g. `type/clinical-letter`,
`type/treatment-protocol`) live in domain packs.
- `type/research-paper` — academic paper summary
- `type/blog-draft` — article in progress
- `type/article` — published article
- `type/seo-content` — content optimized for search
- `type/conversation` — captured dialogue
- `type/book-note` — book reading notes
- `type/training-data` — annotated for ML training

## Project
Namespace declared here; values are user-specific and live in
`_meta/active-projects.md` (gitignored) or in the active domain pack.

## Visibility
- `visibility/public` — safe to share externally
- `visibility/internal` — for vault owner / team only
- `visibility/sensitive` — contains PII / restricted information

## Confidence
See `_meta/confidence.md` for scoring rules.
- `confidence/high` — ≥3 sources agree, last confirmed within 6 months
- `confidence/medium` — 2 sources, or 3+ with staler confirmation
- `confidence/low` — single source, or conflicting
- `confidence/contested` — active contradiction; see `_meta/contradictions.md`

## Tier
See `_meta/consolidation.md` for promotion rules.
- `tier/working` — raw session notes, <48h old
- `tier/episodic` — session summaries, pre-distillation
- `tier/semantic` — confirmed cross-referenced knowledge (default for concepts/entities/skills)
- `tier/procedural` — workflows and decision trees (synthesis/, skills/protocols/)

## Depth
Authoring depth tier. Drives agent prompt choice, expected word count,
and citation burden.
- `depth/deep` — 1500+ words, textbook-grade, source-grounded citations
- `depth/mid` — 300-500 words, structured sections, where-possible citations
- `depth/stub` — title + 1 paragraph + wikilinks; deepen later

## Audience
Namespace declared here; specific audience values live in the active domain
pack (e.g. clinical packs may declare `audience/curriculum-anchor`,
`audience/contested`).

## Language
Source language of the underlying material. Distinct from the wiki page's
written language.
- `language/no` (Norwegian)
- `language/en` (English)
- `language/it` (Italian)
- `language/fr`, `language/de`, `language/es` (as encountered)
- `language/mixed` (multi-lingual original)

## Media
Source media type.
- `media/pdf`, `media/scanned-pdf` (no text layer, OCR needed)
- `media/ppt`, `media/docx`, `media/odp`
- `media/video` (defer transcription)
- `media/audio`, `media/text`, `media/image`
- `media/notion-export`, `media/slack-export`

## Relation Edge Types — Lineage (generic)

Declared in `tools/lib/frontmatter-v2.mjs`. Live in `relations[]`.

These edges describe how a piece of knowledge relates to its predecessors —
generic across all domains:

- `extends` — adds new claims on top of an existing concept
- `refines` — clarifies / disambiguates a prior claim
- `contradicts` — claims the opposite of another note
- `challenges` — raises questions about another note's claims
- `historical-basis-for` — historical predecessor of a current concept
- `predates` — chronologically earlier (no logical dependency claim)
- `reinforced-by` — strengthened by independent corroboration

Domain-specific edges (e.g. clinical: `assesses`, `treats`, `indicated-in`)
live in domain packs.

Reverse edges are NOT stored. Rely on Obsidian backlinks + Dataview inline
inversion for "what extends me" queries.
