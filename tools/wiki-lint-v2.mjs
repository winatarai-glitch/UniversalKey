#!/usr/bin/env node
// tools/wiki-lint-v2.mjs
// Read-only wiki health check (M3). The --fix mode is added in M4.
//
// Checks:
//   (a) orphan pages — entities/concepts/skills/references not referenced by any other md
//   (b) broken wikilinks — [[target]] where no matching basename exists
//   (c) frontmatter v2 conformance — using frontmatter-v2.validate()
//   (d) in-progress claims — any manifest row still in-progress (operator verifies via git log)
//   (e) open contradictions — status: open in _meta/contradictions.md
//
// Exit codes: 0 clean, 1 warnings, 2 errors. Writes _meta/lint-report.md.

import fs from 'node:fs';
import path from 'node:path';
import minimist from 'minimist';
import matter from 'gray-matter';
import { readManifest } from './lib/manifest.mjs';
import { buildIndex } from './lib/wikilink-index.mjs';
import { validate, validateEdge, LINEAGE_EDGE_TYPE_SET } from './lib/frontmatter-v2.mjs';
import { vaultPath, vaultRoot } from './lib/paths.mjs';

const argv = minimist(process.argv.slice(2), {
  string: ['stale-hours'],
  boolean: ['verbose', 'help', 'json', 'fix', 'lineage', 'curriculum'],
  alias: { h: 'help', v: 'verbose', l: 'lineage', c: 'curriculum' },
  default: { 'stale-hours': '24' },
});

if (argv.help) {
  console.error('wiki-lint-v2.mjs [--stale-hours N] [--json] [--verbose] [--fix] [--lineage] [--curriculum]');
  process.exit(0);
}

const STALE_HOURS = parseFloat(argv['stale-hours']);

const report = {
  orphans: [],
  brokenLinks: [],
  frontmatterIssues: [],
  inProgressClaims: [],
  openContradictions: [],
  lineageIssues: [],
  lineageCoverage: null,
  curriculumIssues: [],
  curriculumChecked: 0,
};

function walkMd(dir, onFile) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(full, onFile);
    else if (e.isFile() && full.toLowerCase().endsWith('.md')) onFile(full);
  }
}

function collectAllMd() {
  const out = [];
  for (const rel of ['concepts', 'entities', 'skills', 'references', 'synthesis', '_raw/ingest-queue', '_raw/translations']) {
    walkMd(vaultPath(rel), (p) => out.push(p));
  }
  return out;
}

function extractWikilinks(body) {
  const links = [];
  const re = /\[\[([^\]|#]+?)(?:\|[^\]]+)?(?:#[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

function run() {
  // --lineage is a focused mode: only the lineage checks run. This lets the
  // M4.5 sanity test exit 0 on pre-enrichment state even while the broader
  // wiki has pre-existing broken links / frontmatter drift.
  if (argv.lineage) { runLineageCheck(); return; }
  // --curriculum is a focused mode: safety invariant audit on technique modules.
  if (argv.curriculum) { runCurriculumCheck(); return; }

  const idx = buildIndex({ force: true });
  const allMd = collectAllMd();
  const referencedBasenames = new Set();

  for (const abs of allMd) {
    const text = fs.readFileSync(abs, 'utf8');
    const rel = path.relative(vaultRoot(), abs).replace(/\\/g, '/');

    const links = extractWikilinks(text);
    for (const l of links) {
      const candidate = l.includes('/') ? path.basename(l) : l;
      const key = candidate.toLowerCase();
      referencedBasenames.add(key);
      if (!idx.basenameMap.has(key)) {
        report.brokenLinks.push({ from: rel, target: l });
      }
    }

    if (rel.startsWith('entities/') || rel.startsWith('concepts/') || rel.startsWith('skills/') || rel.startsWith('references/') || rel.startsWith('synthesis/')) {
      const v = validate(text);
      if (!v.ok) {
        for (const e of v.errors) report.frontmatterIssues.push({ file: rel, error: e });
      }
    }
  }

  for (const entry of idx.allPages) {
    if (!entry.path.startsWith('entities/') && !entry.path.startsWith('concepts/') && !entry.path.startsWith('skills/') && !entry.path.startsWith('references/') && !entry.path.startsWith('synthesis/')) continue;
    const key = entry.basename.toLowerCase();
    if (!referencedBasenames.has(key)) {
      report.orphans.push(entry.path);
    }
  }

  try {
    const doc = readManifest();
    for (const row of doc.rows) {
      if (row.status !== 'in-progress') continue;
      report.inProgressClaims.push({
        folder: row.folder,
        assignedTo: row.assignedTo,
        note: `Verify not older than ${STALE_HOURS}h via git log on _meta/mega-mind-manifest.md`,
      });
    }
  } catch (err) {
    if (argv.verbose) console.error('[lint] manifest check skipped:', err.message);
  }

  try {
    const contra = fs.readFileSync(vaultPath('_meta/contradictions.md'), 'utf8');
    const re = /\*\*Status:\*\*\s*open/gi;
    let count = 0;
    let m;
    while ((m = re.exec(contra)) !== null) count++;
    if (count > 0) report.openContradictions.push({ count, note: 'Resolve or mark accepted-contested.' });
  } catch {}
}

// --lineage: coverage + cycle + dangling + bad-shape over entity pages.
// Coverage below threshold is a warning that does NOT fail the run (Session 6 constraint:
// pre-enrichment state must exit 0). Bad-shape / dangling / cycle are errors.
function runLineageCheck() {
  const ENTITIES_ROOT = vaultPath('entities');
  const entities = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) entities.push(full);
    }
  };
  walk(ENTITIES_ROOT);

  const slugSet = new Set(entities.map((p) => path.basename(p, '.md')));
  const graph = new Map();
  let withEdges = 0;

  for (const p of entities) {
    const slug = path.basename(p, '.md');
    let rels;
    try {
      const parsed = matter(fs.readFileSync(p, 'utf8'));
      rels = parsed.data?.relations;
    } catch (err) {
      report.lineageIssues.push({ kind: 'bad-shape', page: slug, reason: `parse-failed: ${err.message}` });
      graph.set(slug, []);
      continue;
    }
    if (!Array.isArray(rels)) rels = [];
    const edges = [];
    let validLineage = 0;
    for (const edge of rels) {
      // Only apply lineage validation to entries that claim a lineage type.
      // Legacy relations (e.g. { kind: 'founded-by', ... } or plain strings) are
      // left alone — they're not lineage edges and predate the M4.5 vocabulary.
      if (!edge || typeof edge !== 'object' || !LINEAGE_EDGE_TYPE_SET.has(edge.type)) continue;
      const v = validateEdge(edge);
      if (!v.ok) {
        report.lineageIssues.push({ kind: 'bad-shape', page: slug, reason: v.reason });
        continue;
      }
      if (!slugSet.has(v.target)) {
        report.lineageIssues.push({ kind: 'dangling', page: slug, target: v.target });
        continue;
      }
      edges.push({ target: v.target, type: edge.type });
      validLineage++;
    }
    if (validLineage > 0) withEdges++;
    graph.set(slug, edges);
  }

  // Cycle detection over derivation edges only (extends + refines + historical-basis-for).
  const cycleEdgeTypes = new Set(['extends', 'refines', 'historical-basis-for']);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...graph.keys()].map((k) => [k, WHITE]));
  const stack = [];
  const dfs = (node) => {
    color.set(node, GRAY);
    stack.push(node);
    for (const { target, type } of graph.get(node) || []) {
      if (!cycleEdgeTypes.has(type)) continue;
      const c = color.get(target);
      if (c === GRAY) {
        const idx = stack.indexOf(target);
        const cycle = idx >= 0 ? [...stack.slice(idx), target] : [target, node, target];
        report.lineageIssues.push({ kind: 'cycle', nodes: cycle });
      } else if (c === WHITE) {
        dfs(target);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };
  for (const n of graph.keys()) if (color.get(n) === WHITE) dfs(n);

  const pct = entities.length ? (withEdges / entities.length) * 100 : 0;
  report.lineageCoverage = {
    total: entities.length,
    with_edges: withEdges,
    pct: Number(pct.toFixed(1)),
  };
  if (pct < 80) {
    report.lineageIssues.push({
      kind: 'coverage',
      severity: 'warning',
      message: `lineage coverage ${pct.toFixed(1)}% < 80% threshold`,
    });
  }
}

// Curriculum safety invariant audit. Every file under entities/curriculum/ tagged
// `type/technique-module` must carry four edges:
//   1. requires-prerequisite → [[vbi-pre-manipulation-screen]]
//   2. requires-prerequisite → [[informed-consent-manipulation]]
//   3. requires-prerequisite → [[red-flag-screening-cervico-cranial]] OR [[red-flag-screening-lumbar]]
//   4. at least one contraindicated-in edge
function runCurriculumCheck() {
  const CURR_ROOT = vaultPath('entities/curriculum');
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) files.push(full);
    }
  };
  walk(CURR_ROOT);

  const RED_FLAG_TARGETS = new Set(['red-flag-screening-cervico-cranial', 'red-flag-screening-lumbar']);
  const VBI_TARGET = 'vbi-pre-manipulation-screen';
  const CONSENT_TARGET = 'informed-consent-manipulation';

  for (const p of files) {
    let parsed;
    try { parsed = matter(fs.readFileSync(p, 'utf8')); }
    catch (err) {
      report.curriculumIssues.push({ kind: 'bad-shape', page: path.basename(p, '.md'), reason: `parse-failed: ${err.message}` });
      continue;
    }
    const data = parsed.data || {};
    const tags = Array.isArray(data.tags) ? data.tags : [];
    if (!tags.includes('type/technique-module')) continue;

    report.curriculumChecked++;
    const slug = path.basename(p, '.md');
    const rels = Array.isArray(data.relations) ? data.relations : [];

    const prereqTargets = new Set();
    let contraCount = 0;
    for (const edge of rels) {
      if (!edge || typeof edge !== 'object') continue;
      const target = (edge.target || '').toString().trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
      if (edge.type === 'requires-prerequisite') prereqTargets.add(target);
      if (edge.type === 'contraindicated-in') contraCount++;
    }

    if (!prereqTargets.has(VBI_TARGET)) {
      report.curriculumIssues.push({ kind: 'missing-vbi-screen', page: slug, expected: `requires-prerequisite → [[${VBI_TARGET}]]` });
    }
    if (!prereqTargets.has(CONSENT_TARGET)) {
      report.curriculumIssues.push({ kind: 'missing-consent', page: slug, expected: `requires-prerequisite → [[${CONSENT_TARGET}]]` });
    }
    const hasRedFlag = [...prereqTargets].some((t) => RED_FLAG_TARGETS.has(t));
    if (!hasRedFlag) {
      report.curriculumIssues.push({ kind: 'missing-red-flag-screen', page: slug, expected: `requires-prerequisite → one of [[${[...RED_FLAG_TARGETS].join(']], [[')}]]` });
    }
    if (contraCount < 1) {
      report.curriculumIssues.push({ kind: 'missing-contraindication', page: slug, expected: 'at least one contraindicated-in edge' });
    }
  }
}

run();

// --fix mode: attempt automated repairs for a subset of findings.
// Scope (intentionally narrow — only safe, mechanical fixes):
//   1. Broken wikilinks where exactly one existing page has a matching basename
//      (case-insensitive) → rewrite the link with the correct casing.
//   2. In-progress claims older than --stale-hours according to the last git
//      commit on the manifest → revert row to pending (requires git log access).
// (Orphan repair, frontmatter auto-fix, and cross-link inference are left to
// future passes; they are easy to get wrong automatically.)
function fix() {
  const idx = buildIndex();
  let rewrites = 0;
  const fileCache = new Map();
  const writeFileCached = (abs, text) => { fileCache.set(abs, text); };
  const readFileCached = (abs) => {
    if (fileCache.has(abs)) return fileCache.get(abs);
    const t = fs.readFileSync(abs, 'utf8');
    fileCache.set(abs, t);
    return t;
  };

  const byTarget = new Map();
  for (const b of report.brokenLinks) {
    if (!byTarget.has(b.target)) byTarget.set(b.target, []);
    byTarget.get(b.target).push(b);
  }
  for (const [target, occurrences] of byTarget.entries()) {
    const basename = target.includes('/') ? path.basename(target) : target;
    const hits = idx.basenameMap.get(basename.toLowerCase());
    if (!hits || hits.length !== 1) continue;
    const correct = hits[0].basename;
    if (correct === basename) continue;
    for (const occ of occurrences) {
      const abs = vaultPath(occ.from);
      let text = readFileCached(abs);
      const re = new RegExp('\\[\\[' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\]|#])', 'g');
      const newText = text.replace(re, '[[' + correct);
      if (newText !== text) {
        writeFileCached(abs, newText);
        rewrites += 1;
      }
    }
  }
  for (const [abs, text] of fileCache.entries()) fs.writeFileSync(abs, text, 'utf8');
  console.log(`[lint --fix] rewrote ${rewrites} broken wikilinks to correct casing`);
}

if (argv.fix) fix();

const lineageErrorCount = report.lineageIssues.filter((i) => i.kind !== 'coverage').length;
const curriculumErrorCount = report.curriculumIssues.length;
// Coverage warning is purely informational — does not bump warningCount — so pre-enrichment
// state (--lineage against relations:[] everywhere) exits 0.
const totalWarnings = report.orphans.length + report.inProgressClaims.length + report.openContradictions.length;
const totalErrors = report.brokenLinks.length + report.frontmatterIssues.length + lineageErrorCount + curriculumErrorCount;

const lines = [];
lines.push('---');
lines.push('title: Wiki Lint Report (v2)');
lines.push('type: meta');
lines.push('tags: [wiki, lint, v2, phase-2]');
lines.push(`generated_at: ${new Date().toISOString()}`);
lines.push('---');
lines.push('');
lines.push('# Wiki Lint Report (v2)');
lines.push('');
lines.push(`Errors: **${totalErrors}** · Warnings: **${totalWarnings}**`);
lines.push('');
lines.push(`## Broken wikilinks (${report.brokenLinks.length})`);
lines.push('');
for (const b of report.brokenLinks.slice(0, 200)) lines.push(`- \`${b.from}\` → \`[[${b.target}]]\``);
if (report.brokenLinks.length > 200) lines.push(`- _… ${report.brokenLinks.length - 200} more truncated_`);
lines.push('');
lines.push(`## Frontmatter issues (${report.frontmatterIssues.length})`);
lines.push('');
for (const f of report.frontmatterIssues.slice(0, 200)) lines.push(`- \`${f.file}\` — ${f.error}`);
if (report.frontmatterIssues.length > 200) lines.push(`- _… ${report.frontmatterIssues.length - 200} more truncated_`);
lines.push('');
lines.push(`## Orphan pages (${report.orphans.length})`);
lines.push('');
for (const o of report.orphans.slice(0, 100)) lines.push(`- \`${o}\``);
if (report.orphans.length > 100) lines.push(`- _… ${report.orphans.length - 100} more truncated_`);
lines.push('');
lines.push(`## In-progress claims (${report.inProgressClaims.length})`);
lines.push('');
for (const s of report.inProgressClaims) lines.push(`- \`${s.folder}\` (claimed by ${s.assignedTo || 'n/a'})`);
lines.push('');
lines.push(`## Open contradictions (${report.openContradictions.length})`);
lines.push('');
for (const c of report.openContradictions) lines.push(`- ${c.count} open — ${c.note}`);
lines.push('');

if (argv.lineage) {
  lines.push(`## Lineage`);
  lines.push('');
  if (report.lineageCoverage) {
    const c = report.lineageCoverage;
    lines.push(`- coverage: ${c.with_edges}/${c.total} = ${c.pct}%`);
  }
  lines.push(`- issues: ${report.lineageIssues.length} (${lineageErrorCount} error, ${report.lineageIssues.length - lineageErrorCount} warning)`);
  for (const i of report.lineageIssues.slice(0, 200)) lines.push(`  - ${i.kind}: ${JSON.stringify(i)}`);
  if (report.lineageIssues.length > 200) lines.push(`  - _… ${report.lineageIssues.length - 200} more truncated_`);
  lines.push('');
}

if (argv.curriculum) {
  lines.push(`## Curriculum safety invariant`);
  lines.push('');
  lines.push(`- technique modules checked: ${report.curriculumChecked}`);
  lines.push(`- violations: ${report.curriculumIssues.length}`);
  for (const i of report.curriculumIssues.slice(0, 200)) lines.push(`  - ${i.kind}: \`${i.page}\` — ${i.expected || i.reason}`);
  if (report.curriculumIssues.length > 200) lines.push(`  - _… ${report.curriculumIssues.length - 200} more truncated_`);
  lines.push('');
}

fs.writeFileSync(vaultPath('_meta/lint-report.md'), lines.join('\n'), 'utf8');

if (argv.json) {
  console.log(JSON.stringify({ errors: totalErrors, warnings: totalWarnings, ...report }, null, 2));
} else {
  console.log(`errors=${totalErrors} warnings=${totalWarnings} report=_meta/lint-report.md`);
  console.log(`broken-links=${report.brokenLinks.length} frontmatter-issues=${report.frontmatterIssues.length} orphans=${report.orphans.length} in-progress-claims=${report.inProgressClaims.length} open-contradictions=${report.openContradictions.length}`);
  if (argv.lineage) {
    const c = report.lineageCoverage;
    console.log(`lineage-coverage=${c ? c.pct + '%' : 'n/a'} lineage-errors=${lineageErrorCount} lineage-issues=${report.lineageIssues.length}`);
  }
  if (argv.curriculum) {
    console.log(`curriculum-checked=${report.curriculumChecked} curriculum-violations=${curriculumErrorCount}`);
  }
}

if (totalErrors > 0) process.exit(2);
if (totalWarnings > 0) process.exit(1);
process.exit(0);
