# entities/things

**Purpose:** Concrete or abstract objects that aren't people or organizations: tools, books, products, places, methods, techniques, instruments, datasets.

**Typical statuses:** `status/draft`, `status/published`, `status/needs-review`, `status/archived`

**Frontmatter contract:**
```yaml
---
title: ""
type: entity
entity_class: thing
thing_subtype: ""    # tool | book | product | place | method | technique | instrument | dataset
domain: ""           # which domain pack
status: ""
confidence: ""
identifiers:
  isbn: ""           # if book
  doi: ""            # if academic artifact
  url: ""
aliases: []
created_by: []       # wikilinks to entities/people/ or entities/organizations/
relations: []
sources: []
---
```

**Example entries:**
- `entities/things/the-pragmatic-programmer.md` (book)
- `entities/things/jupyter-notebook.md` (tool)
- `entities/things/socratic-method.md` (method)

**Subfolder convention:** Optionally split by `thing_subtype` into subdirectories (`entities/things/books/`, `entities/things/tools/`) when a single class dominates. Keep flat if mixed.

**See also:** [`../people/`](../people/), [`../organizations/`](../organizations/), [`../../skills/`](../../skills/), [`../../_meta/taxonomy.md`](../../_meta/taxonomy.md)
