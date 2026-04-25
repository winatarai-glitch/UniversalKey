---
title: Draft README (marketing positioning)
type: meta
tags: [meta, draft]
status: draft
created: 2026-04-25
---

# UniversalKey (draft positioning)

> **Note:** this file is the planned positioning narrative for the project's
> public README. It is NOT promoted to the repo root README until a future
> release (currently a private skeleton). Edit freely; the production README
> will be derived from this draft.

## What is it

UniversalKey is the schema-only skeleton of a personal knowledge graph,
designed for Obsidian. It ships ZERO content — only the type system, the
tag taxonomy, the file conventions, and the extraction tooling.

You hydrate it with your own corpus: medical research, legal filings,
academic bibliography, recipe collection, customer-call transcripts —
anything you want to organize as a wiki.

## Why

Personal knowledge graphs that grow organically tend to drift: tag
vocabularies fragment, frontmatter becomes inconsistent, notes pile up in
"Inbox" forever. UK provides the *backbone* — a tested, structured contract
that your notes can adhere to from day one.

By keeping the schema separate from the content, you can:

- Apply UK to multiple vaults (one per domain) without copy-pasting setup
- Switch domain packs without rebuilding the structure
- Onboard a new note-taker by handing them a UK clone, not your personal vault
- Open-source your schema while keeping your content private

## What's in the box

- **PARA + Wiki structure**: 5 PARA folders + 9 wiki folders + Templates
- **Tag taxonomy**: a core (generic) layer + swappable domain packs
- **Templates**: 5 starter templates for daily notes, books, conversations, training data, entities
- **Extraction tooling**: scaffold / sync / verify verbs + PII gate + pack initializer
- **PDF→Markdown**: the `pdfmd` Python package, ready to install
- **CI**: lint workflow that runs `verify` on every push

## What you bring

- Your own corpus (PDFs, transcripts, notes, links)
- A domain pack matching your knowledge area (or use the included example)
- 30 minutes to read CLAUDE.md and understand the conventions

## Anti-goals

- **Not a notes app.** Use Obsidian (or any markdown editor) to edit notes.
- **Not a CMS.** No web frontend, no auth, no realtime.
- **Not a graph database.** Wikilinks + Obsidian backlinks, not Neo4j.
- **Not a particular ontology.** Domain packs let you bring your own.

## When to use it

- You're starting a new knowledge graph from scratch
- You want a tested schema instead of inventing one
- You want to share your taxonomy without sharing your notes
- You want CI on your knowledge graph (lint, frontmatter validation)

## When NOT to use it

- You have an existing 5000-note vault — migration cost isn't worth it
- You don't use Obsidian (UK leans on Templater + frontmatter conventions)
- You want a turn-key knowledge product — UK is for builders
