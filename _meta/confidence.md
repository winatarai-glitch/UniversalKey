---
title: Confidence Scoring Rules
type: meta
tags: [wiki, policy, v2]
created: 2026-04-17
updated: 2026-04-17
---

# Confidence Scoring

Every factual claim in the vault should be able to answer: *how much do we trust it, and how do we know?*

## Frontmatter fields

```yaml
confidence: high | medium | low | contested
source_count: <integer>
last_confirmed: YYYY-MM-DD
sources:
  - path: "30 - Resources/Research Papers/..."
    date: 2024-03-15
    lang: en
```

## Tier rules

| Tier | Sources | Recency | Use |
|---|---|---|---|
| `confidence/high` | ≥3 independent sources agree | last confirmed ≤6 months | cite freely; default for patient-facing content |
| `confidence/medium` | 2 sources agree, OR 3+ with >6mo confirmation | — | cite with caveat; suitable for clinical notes |
| `confidence/low` | single source, OR ≥2 that partially agree | — | use for reasoning, not patient-facing claims |
| `confidence/contested` | sources actively disagree | — | write both views, link to `_meta/contradictions.md` |

## Lifecycle

- **On first ingest:** new claim starts at `confidence/low`, `source_count: 1`.
- **On reinforcement** (another source agrees during ingest or lint): `source_count++`, `last_confirmed` → today.
  - Promote `low → medium` at `source_count ≥ 2`.
  - Promote `medium → high` at `source_count ≥ 3`.
- **On contradiction** (xlang-dedup detects semantic conflict): flag `contested`, keep both claims, register in `_meta/contradictions.md`.
- **On staleness** (no reinforcement in ≥12 months AND no recent access): demote one level.

## When confidence must be flagged

- Clinical protocols → minimum `medium` before patient-facing use.
- Diagnostic criteria → minimum `high` before being the sole basis for a recommendation.
- Experimental / emerging concepts → can sit at `low` indefinitely; label with `tag: experimental`.

## Inspection

Run `tools/wiki-lint-v2.mjs --confidence-audit` to list:
- `low` claims older than 30d (candidates for reinforcement or demotion)
- `contested` claims with no resolution tracked
- `high` claims whose sources have all staled past 12 months
