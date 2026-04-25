#!/usr/bin/env node
// tools/concept-coverage-report.mjs
// Scans entities/concepts/ and emits a markdown coverage report.
// No external process calls; pure fs + gray-matter.
//
// Usage:
//   node tools/concept-coverage-report.mjs              # writes _meta/concept-coverage-report.md
//   node tools/concept-coverage-report.mjs <outfile>    # custom path
//   node tools/concept-coverage-report.mjs --stdout     # print to stdout

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const VAULT = path.resolve(process.cwd());
const ROOT = path.join(VAULT, 'entities', 'concepts');

if (!fs.existsSync(ROOT)) {
  console.error(`No entities/concepts/ found at ${ROOT}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...walk(p));
    else if (f.name.endsWith('.md') && f.name !== 'README.md') out.push(p);
  }
  return out;
}

function allVaultBasenames() {
  const set = new Set();
  const walk2 = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name.startsWith('.')) continue;
        if (f.name === 'node_modules' || f.name === '_raw') continue;
        walk2(p);
      } else if (f.name.endsWith('.md')) {
        set.add(f.name.replace(/\.md$/, ''));
      }
    }
  };
  walk2(VAULT);
  return set;
}

const pages = walk(ROOT);
const allBasenames = allVaultBasenames();

const byFolder = {};
const edgeHist = {};
const depthHist = {};
const confHist = {};
const audienceHist = {};
const tagFamilyHist = {};
let totalEdges = 0;
const danglingTargets = new Map();

const WIKI_RE = /\[\[([^\]|]+?)(\|[^\]]*)?\]\]/g;
const LINEAGE = new Set(['extends','refines','contradicts','challenges','historical-basis-for','predates','reinforced-by']);
const CONCEPT = new Set(['assesses','tests','treats','indicated-in','contraindicated-in','part-of','requires-prerequisite','innervated-by','opposes','synergist-with']);

for (const file of pages) {
  const rel = path.relative(VAULT, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  let data = {}, body = '';
  try { const p = matter(src); data = p.data || {}; body = p.content || ''; }
  catch (e) { console.error(`parse error on ${rel}: ${e.message}`); continue; }

  const folder = path.dirname(rel);
  byFolder[folder] = (byFolder[folder] || 0) + 1;

  const relations = Array.isArray(data.relations) ? data.relations : [];
  totalEdges += relations.length;
  for (const e of relations) {
    if (e && e.type) edgeHist[e.type] = (edgeHist[e.type] || 0) + 1;
    if (e && typeof e.target === 'string') {
      const m = e.target.match(/^\[\[([^\]|]+?)(\|[^\]]*)?\]\]$/);
      if (m) {
        const basename = m[1].split('/').pop().trim();
        if (!allBasenames.has(basename)) {
          danglingTargets.set(basename, (danglingTargets.get(basename) || 0) + 1);
        }
      }
    }
  }

  const tags = data.tags || [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const family = t.split('/')[0];
    tagFamilyHist[family] = (tagFamilyHist[family] || 0) + 1;
    if (t.startsWith('depth/')) depthHist[t] = (depthHist[t] || 0) + 1;
    if (t.startsWith('audience/')) audienceHist[t] = (audienceHist[t] || 0) + 1;
  }

  const conf = data.confidence || '(unset)';
  confHist[conf] = (confHist[conf] || 0) + 1;

  let m;
  while ((m = WIKI_RE.exec(body)) !== null) {
    const basename = m[1].split('/').pop().trim();
    if (!allBasenames.has(basename)) {
      danglingTargets.set(basename, (danglingTargets.get(basename) || 0) + 1);
    }
  }
}

const lines = [];
lines.push(`---`);
lines.push(`title: Concept Layer Coverage Report`);
lines.push(`type: meta`);
lines.push(`tags: [wiki, session-47, coverage-report]`);
lines.push(`generated_at: ${new Date().toISOString()}`);
lines.push(`---`);
lines.push(``);
lines.push(`# Concept Layer Coverage Report`);
lines.push(``);
lines.push(`**Generated**: ${new Date().toISOString()}`);
lines.push(``);
lines.push(`## Summary`);
lines.push(``);
lines.push(`| Metric | Value |`);
lines.push(`|---|---|`);
lines.push(`| Total concept pages | ${pages.length} |`);
lines.push(`| Total edges in relations[] | ${totalEdges} |`);
lines.push(`| Avg edges per page | ${(totalEdges / pages.length).toFixed(1)} |`);
lines.push(`| Distinct dangling wikilink targets | ${danglingTargets.size} |`);
lines.push(`| Total dangling references | ${[...danglingTargets.values()].reduce((a, b) => a + b, 0)} |`);
lines.push(``);
lines.push(`## Pages per subfolder`);
lines.push(``);
lines.push(`| Subfolder | Pages |`);
lines.push(`|---|---|`);
for (const [f, n] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) {
  lines.push(`| \`${f}\` | ${n} |`);
}
lines.push(``);
lines.push(`## Edge-type histogram`);
lines.push(``);
lines.push(`| Edge type | Count | Category |`);
lines.push(`|---|---|---|`);
for (const [t, n] of Object.entries(edgeHist).sort((a, b) => b[1] - a[1])) {
  const cat = LINEAGE.has(t) ? 'lineage' : CONCEPT.has(t) ? 'concept' : 'UNKNOWN';
  lines.push(`| \`${t}\` | ${n} | ${cat} |`);
}
lines.push(``);
lines.push(`## Depth distribution`);
lines.push(``);
for (const [t, n] of Object.entries(depthHist).sort((a, b) => b[1] - a[1])) { lines.push(`- \`${t}\`: ${n}`); }
lines.push(``);
lines.push(`## Confidence distribution`);
lines.push(``);
for (const [c, n] of Object.entries(confHist).sort((a, b) => b[1] - a[1])) { lines.push(`- \`${c}\`: ${n}`); }
lines.push(``);
lines.push(`## Audience-tag distribution`);
lines.push(``);
for (const [t, n] of Object.entries(audienceHist).sort((a, b) => b[1] - a[1])) { lines.push(`- \`${t}\`: ${n}`); }
lines.push(``);
lines.push(`## Tag-family histogram (top 20)`);
lines.push(``);
for (const [f, n] of Object.entries(tagFamilyHist).sort((a, b) => b[1] - a[1]).slice(0, 20)) { lines.push(`- \`${f}/\`: ${n}`); }
lines.push(``);
lines.push(`## Top 30 dangling wikilink targets (Wave 2 / stub-sweep candidates)`);
lines.push(``);
lines.push(`Targets that appear in edges or body text but have no authoring file. Highest counts first = highest-priority Wave 2 author candidates.`);
lines.push(``);
lines.push(`| Target | References |`);
lines.push(`|---|---|`);
for (const [t, n] of [...danglingTargets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  lines.push(`| \`${t}\` | ${n} |`);
}

const output = lines.join('\n');
if (process.argv.includes('--stdout')) { process.stdout.write(output + '\n'); }
else {
  const outFile = process.argv.find(a => a.endsWith('.md')) || '_meta/concept-coverage-report.md';
  const outPath = path.isAbsolute(outFile) ? outFile : path.join(VAULT, outFile);
  fs.writeFileSync(outPath, output, 'utf8');
  console.log(`Wrote ${path.relative(VAULT, outPath)}`);
  console.log(`Pages: ${pages.length}   Edges: ${totalEdges}   Dangling distinct: ${danglingTargets.size}`);
}
