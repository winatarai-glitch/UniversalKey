#!/usr/bin/env node
// tools/ingest-folder.mjs
// Prepare a Claude-ready ingest dossier for a single Mega Mind folder.
//
// Non-LLM: this tool does NOT call any model. It walks the folder, converts
// every convertible file to markdown via the existing shell wrappers, detects
// languages, and emits DOSSIER.md that the operator hands to a synthesis agent.
//
// Usage:
//   node tools/ingest-folder.mjs --worker 2 --folder "<SOURCE_PATH>/example-folder"
//                                 [--work /tmp/ingest-work] [--fast] [--verbose]
//                                 [--skip-convert] [--skip-translate]
//
// Exit 0 on success; prints the dossier path as the final stdout line.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import minimist from 'minimist';

import { rejectEDrive, slugify, vaultRoot } from './lib/paths.mjs';
import { enumerateFiles, summarizeByCategory } from './lib/enumerate-files.mjs';
import { classifyFolder } from './lib/classify-folder.mjs';
import { detectFromFile, detectFromFilename, languageHistogram } from './lib/detect-language.mjs';
import { buildIndex, findExistingTargets } from './lib/wikilink-index.mjs';

const argv = minimist(process.argv.slice(2), {
  string: ['worker', 'folder', 'work', 'root'],
  boolean: ['fast', 'verbose', 'skip-convert', 'skip-translate', 'help'],
  alias: { h: 'help', v: 'verbose', w: 'worker', f: 'folder' },
  default: {
    work: path.join(os.tmpdir(), 'ingest-work'),
  },
});

if (argv.help || !argv.worker || !argv.folder) {
  console.error(`
ingest-folder.mjs — build a synthesis dossier for one folder

Usage:
  node tools/ingest-folder.mjs --worker N --folder "<path>" [--work DIR] [--fast] [--verbose]

Outputs to <work>/worker-N/<slug>/DOSSIER.md plus one converted .md per source file.
`.trim());
  process.exit(argv.help ? 0 : 2);
}

const WORKER = String(argv.worker);
const SOURCE = argv.folder;
const FOLDER_NAME = path.basename(SOURCE.replace(/[\\/]+$/, ''));
const SLUG = slugify(FOLDER_NAME);
const WORK_ROOT = path.join(argv.work, `worker-${WORKER}`, SLUG);
const CONVERTED_DIR = path.join(WORK_ROOT, 'converted');
const DOSSIER_PATH = path.join(WORK_ROOT, 'DOSSIER.md');

rejectEDrive(WORK_ROOT);
rejectEDrive(CONVERTED_DIR);
rejectEDrive(DOSSIER_PATH);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function log(...args) {
  if (argv.verbose) console.error('[ingest]', ...args);
}

function convertOne(file) {
  const relNoExt = file.relPath.replace(/\.[^.]+$/, '');
  const outPath = path.join(CONVERTED_DIR, relNoExt + '.md');
  ensureDir(path.dirname(outPath));
  const script = file.category === 'pdf'
    ? path.join(vaultRoot(), 'tools', 'convert-pdf.sh')
    : file.category === 'office' || file.category === 'office-legacy'
      ? path.join(vaultRoot(), 'tools', 'convert-office.sh')
      : null;
  if (!script) return { status: 'skipped-no-converter', outPath: null };
  const args = [file.absPath, '-o', outPath];
  try {
    execFileSync('bash', [script, ...args], { stdio: argv.verbose ? 'inherit' : 'pipe' });
    return { status: 'ok', outPath };
  } catch (err) {
    log(`convert failed for ${file.relPath}: ${err.message}`);
    return { status: 'error', outPath: null, error: String(err.message).slice(0, 200) };
  }
}

function stubMedia(file, kind) {
  const relNoExt = file.relPath.replace(/\.[^.]+$/, '');
  const outPath = path.join(CONVERTED_DIR, relNoExt + '.stub.md');
  ensureDir(path.dirname(outPath));
  const body = [
    '---',
    `title: "${path.basename(file.relPath)}"`,
    'type: note',
    'tags:',
    `  - media/${kind}`,
    '  - status/pending-transcription',
    `  - source/mega-mind`,
    '---',
    '',
    `# ${path.basename(file.relPath)}`,
    '',
    `Source: \`${file.absPath}\``,
    `Size: ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    '',
    `## Summary (pending transcription)`,
    '',
    `_This ${kind} file has not yet been transcribed. Filename suggests: "${path.basename(file.relPath, file.ext)}". Full analysis requires Whisper pass._`,
    '',
  ].join('\n');
  fs.writeFileSync(outPath, body, 'utf8');
  return { status: 'stubbed', outPath };
}

// Extract candidate proper nouns from filenames + folder-name segments.
function extractCandidates(files, folderName) {
  const tokens = new Set();
  const splitRe = /[\s_\-\.\+\(\)\[\]\/\\,&]+/;
  const bad = /^(the|and|for|with|pdf|docx|pptx|video|audio|mp4|mov|scan|avi|mp3|vol|part|book|chapter|ch|week|module|level|day|en|no|it|fr|de|es|pt|session|full|final|raw|draft|v\d+)$/i;
  const add = (name) => {
    const parts = name.split(splitRe).filter(Boolean);
    for (const p of parts) {
      if (p.length < 4) continue;
      if (bad.test(p)) continue;
      if (/^\d+$/.test(p)) continue;
      if (p.length > 40) continue;
      tokens.add(p);
    }
  };
  add(folderName);
  for (const f of files) add(f.relPath);
  return Array.from(tokens).slice(0, 200);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source folder not found: ${SOURCE}`);
    process.exit(2);
  }
  ensureDir(WORK_ROOT);
  ensureDir(CONVERTED_DIR);
  log(`source: ${SOURCE}`);
  log(`slug:   ${SLUG}`);
  log(`work:   ${WORK_ROOT}`);

  const files = enumerateFiles(SOURCE, { verbose: argv.verbose });
  const summary = summarizeByCategory(files);
  const classification = classifyFolder(FOLDER_NAME, summary);
  log(`files=${files.length}, classification=${classification.type} (conf ${classification.confidence.toFixed(2)})`);

  // Convert / stub.
  const converted = [];
  if (!argv['skip-convert']) {
    for (const f of files) {
      if (f.category === 'video') converted.push({ file: f, ...stubMedia(f, 'video') });
      else if (f.category === 'audio') converted.push({ file: f, ...stubMedia(f, 'audio') });
      else if (f.category === 'pdf' || f.category === 'office' || f.category === 'office-legacy') {
        log(`converting ${f.relPath}`);
        converted.push({ file: f, ...convertOne(f) });
      } else {
        converted.push({ file: f, status: 'skipped-noncontent', outPath: null });
      }
    }
  } else {
    log('--skip-convert: no files converted');
  }

  // Detect languages on successfully converted text MDs.
  const langResults = [];
  for (const c of converted) {
    if (c.outPath && c.status !== 'stubbed' && c.status !== 'error') {
      const d = detectFromFile(c.outPath, { filename: c.file.relPath });
      langResults.push({ path: c.outPath, lang: d.lang, source: d.source });
    } else {
      const d = detectFromFilename(c.file.relPath);
      langResults.push({ path: c.outPath || c.file.absPath, lang: d.lang, source: d.source });
    }
  }
  const langHist = languageHistogram(langResults);

  // Wikilink cross-link candidates.
  buildIndex({ force: true });
  const candidates = extractCandidates(files, FOLDER_NAME);
  const existing = findExistingTargets(candidates.map(slugify));

  // Build DOSSIER.md.
  const now = new Date().toISOString().slice(0, 10);
  const totalSizeMB = (summary.sizeBytes / 1024 / 1024).toFixed(1);
  const convertedSummary = converted.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {},
  );

  const lines = [];
  lines.push('---');
  lines.push(`title: "Ingest Dossier — ${FOLDER_NAME}"`);
  lines.push('type: scan-report');
  lines.push(`slug: ${SLUG}`);
  lines.push('tags:');
  lines.push('  - wiki');
  lines.push('  - scan');
  lines.push('  - mega-mind');
  lines.push(`  - language/${Object.keys(langHist).sort((a, b) => langHist[b] - langHist[a])[0] || 'und'}`);
  lines.push('  - status/needs-review');
  lines.push(`worker: worker-${WORKER}`);
  lines.push(`scan_root: "${SOURCE.replace(/\\/g, '\\\\')}"`);
  lines.push(`created: ${now}`);
  lines.push(`updated: ${now}`);
  lines.push('---');
  lines.push('');
  lines.push(`# Ingest Dossier — ${FOLDER_NAME}`);
  lines.push('');
  lines.push(`Generated by \`tools/ingest-folder.mjs --worker ${WORKER}\`. This dossier is the prep material for the synthesis agent; it contains zero LLM-generated facts. Agent reads this plus a sample of the converted MDs and writes the entity pages.`);
  lines.push('');

  lines.push('## Folder classification');
  lines.push('');
  lines.push(`- **Type (heuristic):** \`${classification.type}\` (confidence ${classification.confidence.toFixed(2)})`);
  lines.push(`- **Hints:** ${classification.hints.length ? classification.hints.join(', ') : '_none_'}`);
  lines.push(`- **Score breakdown:** ${Object.entries(classification.scores).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ') || '_all zero_'}`);
  lines.push('');

  lines.push('## File inventory');
  lines.push('');
  lines.push(`**${summary.fileCount} files, ${totalSizeMB} MB total.**`);
  lines.push('');
  lines.push('| Category | Count | Size (MB) |');
  lines.push('|---|---|---|');
  for (const [cat, v] of Object.entries(summary.perCategory).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${cat} | ${v.count} | ${(v.sizeBytes / 1024 / 1024).toFixed(1)} |`);
  }
  lines.push('');

  // Per-file list (capped for readability).
  lines.push('### Per-file detail');
  lines.push('');
  lines.push('| File | Size (MB) | Category | Lang | Converted MD |');
  lines.push('|---|---|---|---|---|');
  const byPath = Object.fromEntries(converted.map((c) => [c.file.absPath, c]));
  const langByPath = Object.fromEntries(langResults.map((l) => [l.path, l.lang]));
  const MAX_ROWS = Math.min(files.length, 500);
  for (let i = 0; i < MAX_ROWS; i++) {
    const f = files[i];
    const c = byPath[f.absPath] || {};
    const outRel = c.outPath ? path.relative(WORK_ROOT, c.outPath).replace(/\\/g, '/') : '';
    const lang = c.outPath ? langByPath[c.outPath] || '' : langByPath[f.absPath] || '';
    const sizeMB = (f.size / 1024 / 1024).toFixed(2);
    const fileCell = f.relPath.length > 80 ? '…' + f.relPath.slice(-78) : f.relPath;
    lines.push(`| \`${fileCell}\` | ${sizeMB} | ${f.category} | ${lang || '-'} | ${c.status === 'ok' || c.status === 'stubbed' ? `\`${outRel}\`` : c.status || '-'} |`);
  }
  if (files.length > MAX_ROWS) {
    lines.push(`| … | | | | _${files.length - MAX_ROWS} more file(s) truncated_ |`);
  }
  lines.push('');

  lines.push('## Conversion summary');
  lines.push('');
  lines.push('| Outcome | Count |');
  lines.push('|---|---|');
  for (const [k, v] of Object.entries(convertedSummary)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');

  lines.push('## Language histogram');
  lines.push('');
  if (Object.keys(langHist).length === 0) {
    lines.push('_No detections (skip-convert mode?)._');
  } else {
    lines.push('| Language | Files |');
    lines.push('|---|---|');
    for (const [lang, n] of Object.entries(langHist).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${lang} | ${n} |`);
    }
  }
  lines.push('');

  lines.push('## Candidate proper nouns (from filenames + folder segments)');
  lines.push('');
  lines.push(`Extracted tokens (regex split, filtered). These are hints for the agent, not authoritative. Validate against the actual content of the converted MDs before claiming them in entity pages.`);
  lines.push('');
  lines.push('```');
  lines.push(candidates.slice(0, 60).join(', '));
  if (candidates.length > 60) lines.push(`... (${candidates.length - 60} more)`);
  lines.push('```');
  lines.push('');

  lines.push('## Existing wiki pages that match these tokens');
  lines.push('');
  if (existing.length === 0) {
    lines.push('_No matches — synthesis will create fresh entity pages._');
  } else {
    lines.push('| Token | Existing page(s) |');
    lines.push('|---|---|');
    for (const e of existing.slice(0, 40)) {
      lines.push(`| ${e.basename} | ${e.paths.map((p) => `\`${p}\``).join(', ')} |`);
    }
  }
  lines.push('');

  lines.push('## Synthesis instructions (agent — read this section)');
  lines.push('');
  lines.push(`You are a synthesis subagent working under worker-${WORKER}. Read this dossier, sample 3-5 of the converted MDs (lead with the largest / most authoritative text files), then produce:`);
  lines.push('');
  lines.push(`1. One or more entity pages under \`entities/<subtype>/<slug>.md\` where subtype ∈ faculty|techniques|courses|books|organizations|conditions|tools-and-instruments. Use the slug \`${SLUG}\` (or a variant matching the entity — surname-firstname for a person, kebab-case for a concept).`);
  lines.push(`2. A scan report at \`_raw/ingest-queue/scan-${SLUG}.md\` with the long-form narrative (matching the style of \`_raw/ingest-queue/scan-haavik-heidi.md\`).`);
  lines.push(`3. Stub pages for faculty / concepts / organizations you discover that don't yet exist (use \`confidence/low\`, \`source_count: 1\`).`);
  lines.push('');
  lines.push('Frontmatter schema (entity pages must satisfy this):');
  lines.push('');
  lines.push('```yaml');
  lines.push('---');
  lines.push('title: "<display name>"');
  lines.push('type: entity');
  lines.push('category: faculty | technique-family | course | book | organization | condition | tool');
  lines.push('slug: <kebab-case-slug>');
  lines.push('tags:');
  lines.push('  - <category>/<slug>');
  lines.push('  - language/<en|no|it|fr|de>');
  lines.push('  - confidence/<high|medium|low|contested>');
  lines.push('  - tier/semantic');
  lines.push('  - source/mega-mind');
  lines.push('aliases: []');
  lines.push('created: <YYYY-MM-DD>');
  lines.push('updated: <YYYY-MM-DD>');
  lines.push('confidence: <high|medium|low|contested>');
  lines.push('source_count: <integer ≥ 1>');
  lines.push('last_confirmed: <YYYY-MM-DD>');
  lines.push('sources:');
  lines.push('  - path: "<converted MD path OR ${SOURCE_PATH}/... for the original>"');
  lines.push('    date: <YYYY-MM-DD or year>');
  lines.push('    lang: <en|no|it|fr|...>');
  lines.push('language: <en|no|...>');
  lines.push('tier: semantic');
  lines.push('supersedes: null');
  lines.push('superseded_by: null');
  lines.push('relations: []');
  lines.push('---');
  lines.push('```');
  lines.push('');
  lines.push('**Cross-link rules:**');
  lines.push('');
  lines.push(`- Every mention of a faculty/technique/organization/concept that already has a page in "Existing wiki pages that match these tokens" above should become a \`[[wikilink]]\`.`);
  lines.push(`- Do NOT invent pages that aren't in the list and aren't being created in this ingest.`);
  lines.push(`- Backlinks to the scan report: add \`[[_raw/ingest-queue/scan-${SLUG}]]\` in the entity page's "Sources" section.`);
  lines.push('');
  lines.push('**Confidence rules** (per `_meta/confidence.md`):');
  lines.push('');
  lines.push('- First ingest → `confidence/low`, `source_count: 1`.');
  lines.push('- If two converted MDs independently support the same claim → `medium`, `source_count: 2`.');
  lines.push('- If ≥3 → `high`.');
  lines.push('- Conflicts between sources → `contested`, and append a record to `_meta/contradictions.md`.');
  lines.push('');
  lines.push('**Forbidden actions:**');
  lines.push('');
  lines.push('- Do NOT write to ${SOURCE_PATH} (the source archive is read-only).');
  lines.push(`- Do NOT modify \`_meta/taxonomy.md\`, \`_meta/confidence.md\`, \`_meta/lifecycle.md\`, \`_meta/consolidation.md\`, \`_meta/phase2-roadmap.md\`, \`CLAUDE.md\`, \`index.md\`.`);
  lines.push('- Do NOT invent facts. Every claim in the entity pages must trace to a converted MD in this dossier or an existing wiki page.');
  lines.push(`- Do NOT run \`tools/release-folder.mjs\` — that's the operator's job after commit.`);
  lines.push('');
  lines.push('When finished, return a JSON summary to the operator:');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "entity_pages": ["entities/.../slug.md", "..."],');
  lines.push(`  "scan_report": "_raw/ingest-queue/scan-${SLUG}.md",`);
  lines.push('  "new_stubs": ["entities/.../...", "..."],');
  lines.push('  "translations_needed": ["<converted MD path>", "..."],');
  lines.push('  "contradictions_logged": 0,');
  lines.push('  "one_line_summary": "…"');
  lines.push('}');
  lines.push('```');
  lines.push('');

  lines.push('## Provenance');
  lines.push('');
  lines.push('- Tool: `tools/ingest-folder.mjs`');
  lines.push(`- Invoked by: worker-${WORKER}`);
  lines.push(`- Timestamp: ${new Date().toISOString()}`);
  lines.push(`- Working dir: \`${WORK_ROOT}\``);
  lines.push(`- Source (read-only): \`${SOURCE}\``);
  lines.push('');

  fs.writeFileSync(DOSSIER_PATH, lines.join('\n'), 'utf8');
  console.log(DOSSIER_PATH);
}

try {
  await main();
} catch (err) {
  console.error(`ingest-folder: ${err.message}`);
  if (argv.verbose && err.stack) console.error(err.stack);
  process.exit(1);
}
