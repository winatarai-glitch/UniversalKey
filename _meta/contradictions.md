---
title: Contradictions Register
type: meta
tags: [meta, machinery]
created: 2026-04-25
---

# Contradictions Register

Active contradictions between sources you've ingested into the vault. For each
contradiction, capture the claim, both positions with their sources, and a
verdict (or `accepted-contested` if no verdict is possible).

Pages whose claims appear in this register should be tagged
`confidence/contested` per `_meta/confidence.md`.

## Format

```
## [YYYY-MM-DD] — claim-slug
**Topic:** [[page]]
**Claim A:** "..." — source: `path/to/source-a.md`, lang: en, date: <year>
**Claim B:** "..." — source: `path/to/source-b.md`, lang: en, date: <year>
**Status:** open | resolved | accepted-contested
**Resolution:** (if resolved — cite the deciding source or the rule applied)
**Affected entities:** [[entity-1]], [[entity-2]]
**Verdict author:** [reviewer initials, ISO date]
```

## Active

(none yet — populate as you encounter contradictions during ingest)

## Example (illustrative — replace with your own)

## [2026-04-25] — example-claim
**Topic:** [[example-concept]]
**Claim A:** "Effect X is causal" — source: `references/example-paper-author-a-2020.md`, lang: en, date: 2020
**Claim B:** "Effect X is confounded by Y" — source: `references/example-paper-author-b-2022.md`, lang: en, date: 2022
**Status:** accepted-contested
**Resolution:** (none — both positions remain in active circulation; reader should treat as contested)
**Affected entities:** [[example-concept]], [[example-method]]
**Verdict author:** reviewer initials, 2026-04-25
