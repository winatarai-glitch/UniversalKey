# references

**Purpose:** Source summaries — distilled notes on papers, books, articles, talks. Distinct from `30 - Resources/` (raw material) and `concepts/` (your synthesis). One source per file.

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`

**Frontmatter contract:**
```yaml
---
title: ""            # source's own title
type: reference
domain: ""
status: ""
confidence: ""
source_type: ""      # paper | book | article | talk | podcast
authors: []          # wikilinks to entities/people/
year: ""
identifiers:
  doi: ""
  isbn: ""
  url: ""
key_claims: []       # bullet list of testable claims
methodology: ""      # for papers: study design summary
relations: []        # cites, replicates, extends-methodology-of
tags: []
---
```

**Example entry:** `references/<source-slug>.md` (e.g. `references/attention-is-all-you-need-vaswani-2017.md`)

**Suggested slug:** `<short-title-or-keyword>-<lead-author-surname>-<year>` for academic; `<title-slug>-<author>` for books/articles.

**Distinction from `30 - Resources/`:** resources are the raw artifact (PDF, link); references are your distillation of what the source says.

**See also:** [`../30 - Resources/`](../30%20-%20Resources/), [`../concepts/`](../concepts/), [`../synthesis/`](../synthesis/), [`../_meta/confidence.md`](../_meta/confidence.md)
