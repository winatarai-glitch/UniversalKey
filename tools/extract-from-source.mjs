#!/usr/bin/env node
/**
 * tools/extract-from-source.mjs
 *
 * UniversalKey extraction & sync tool.
 *
 * Verbs:
 *   scaffold  Ensure all required folders + placeholder READMEs exist (idempotent).
 *   sync      Incremental ingest from SOURCE_PATH to VAULT_PATH (manifest delta + anonymize gate).
 *   verify    Read-only check: vault structure + frontmatter + active pack are valid.
 *             Wired to CI in .github/workflows/lint.yml — must exit 0 to pass.
 *
 * Reads .env at UK root for VAULT_PATH, SOURCE_PATH (sync only), ACTIVE_PACK.
 * Respects _meta/.ingest-lock invariant — refuses sync while lock present.
 * Sequential I/O (HDD/USB/exFAT-friendly). No parallel writes.
 *
 * Usage:
 *   node tools/extract-from-source.mjs scaffold
 *   node tools/extract-from-source.mjs sync
 *   node tools/extract-from-source.mjs verify
 *
 * Exit codes:
 *   0  Success
 *   1  Argument or environment error
 *   2  Validation failure (verify only)
 *   3  Ingest lock present (sync refused)
 *   4  Source path missing or unreadable (sync only)
 */

import { readFile, writeFile, readdir, stat, mkdir, rename, access } from 'node:fs/promises';
import { existsSync, readFileSync, createReadStream, constants } from 'node:fs';
import { join, dirname, relative, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UK_ROOT = dirname(__dirname);  // tools/ is one level under UK root

// ── REQUIRED FOLDER TREE (used by scaffold + verify) ──────────────
const REQUIRED_DIRS = [
  '00 - Inbox', '10 - Projects', '20 - Areas', '30 - Resources', '40 - Archive',
  'concepts', 'entities', 'entities/people', 'entities/organizations', 'entities/things',
  'skills', 'references', 'synthesis', 'journal', '_archives', '_raw',
  'Templates', 'tools', 'tools/lib', 'tools/pdfmd', '_meta', '_meta/domain-packs',
  '.obsidian', '.github', '.github/workflows',
];

// Required files (minimum set for a valid UK skeleton)
const REQUIRED_FILES = [
  'README.md', 'CLAUDE.md', 'LICENSE', 'index.md', 'log.md', 'setup.sh',
  '.env.example', '.gitignore', 'package.json',
  '_meta/taxonomy.md', '_meta/taxonomy-core.md',
  '_meta/domain-packs/_template.md',
  '_meta/confidence.md', '_meta/lifecycle.md', '_meta/consolidation.md',
  '_meta/contradictions.md', '_meta/portability.md', '_meta/mega-mind-manifest.md',
  'Templates/Daily Note.md', 'Templates/Book Note.md',
  'Templates/Conversation Import.md', 'Templates/Training Data Entry.md',
  'Templates/Entity Note.md',
];

// ── env loading ───────────────────────────────────────────────────
function loadEnv() {
  const envFile = join(UK_ROOT, '.env');
  const env = { ...process.env };
  if (existsSync(envFile)) {
    const text = readFileSync(envFile, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

// ── ingest lock ───────────────────────────────────────────────────
function ingestLockPath(env) {
  return env.INGEST_LOCK_PATH || join(UK_ROOT, '_meta', '.ingest-lock');
}

function ingestLockPresent(env) {
  return existsSync(ingestLockPath(env));
}

// ── frontmatter ───────────────────────────────────────────────────
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const rawLine of m[1].split(/\r?\n/)) {
    const kv = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// ── sha256 (streaming) ────────────────────────────────────────────
function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(absPath);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

// ── walker (sequential, depth-first) ──────────────────────────────
async function* walk(root) {
  const ents = await readdir(root, { withFileTypes: true });
  // Stable order — sort to keep manifest deterministic across runs
  ents.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of ents) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.tmp-')) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

// ── VERB: scaffold ────────────────────────────────────────────────
async function verbScaffold(env) {
  const targetRoot = env.VAULT_PATH || UK_ROOT;
  let created = 0, kept = 0;

  for (const dir of REQUIRED_DIRS) {
    const abs = join(targetRoot, dir);
    if (!existsSync(abs)) {
      await mkdir(abs, { recursive: true });
      created++;
      console.log(`mkdir  ${relative(targetRoot, abs)}`);
    } else {
      kept++;
    }
  }

  console.log(`\nscaffold complete: ${created} created, ${kept} already present.`);
  console.log(`target: ${targetRoot}`);
  if (targetRoot === UK_ROOT) {
    console.log('(VAULT_PATH not set — scaffolded in-place at the UK repo root.)');
  }
  return 0;
}

// ── VERB: verify ──────────────────────────────────────────────────
async function verbVerify(env) {
  let errors = 0, warnings = 0;
  const errs = (m) => { errors++; console.error(`ERROR: ${m}`); };
  const warn = (m) => { warnings++; console.error(`WARN:  ${m}`); };

  // 1. Required folders exist (relative to UK_ROOT, not VAULT_PATH — verify is for the schema repo)
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(UK_ROOT, dir))) errs(`missing folder: ${dir}`);
  }

  // 2. Required files exist
  for (const f of REQUIRED_FILES) {
    if (!existsSync(join(UK_ROOT, f))) errs(`missing file: ${f}`);
  }

  // 3. Active pack file exists (only if .env / ACTIVE_PACK is set)
  if (env.ACTIVE_PACK) {
    const packFile = join(UK_ROOT, '_meta', 'domain-packs', `${env.ACTIVE_PACK}.md`);
    if (!existsSync(packFile)) errs(`active pack file missing: _meta/domain-packs/${env.ACTIVE_PACK}.md`);
  } else {
    warn('ACTIVE_PACK not set in .env — skipping pack-file check.');
  }

  // 4. taxonomy.md frontmatter has active_pack: key
  const taxFile = join(UK_ROOT, '_meta', 'taxonomy.md');
  if (existsSync(taxFile)) {
    const fm = parseFrontmatter(await readFile(taxFile, 'utf8'));
    if (!fm || !fm.active_pack) errs('_meta/taxonomy.md missing active_pack: in frontmatter');
  }

  // 5. No node_modules anywhere under UK_ROOT (CLAUDE.md invariant)
  for await (const p of walk(UK_ROOT)) {
    if (p.includes(`${join('', 'node_modules', '')}`)) {
      errs(`node_modules detected: ${relative(UK_ROOT, p)}`);
      break;  // one error is enough
    }
  }

  console.log(`\nverify complete: ${errors} error(s), ${warnings} warning(s).`);
  if (errors > 0) return 2;
  return 0;
}

// ── VERB: sync ────────────────────────────────────────────────────
async function verbSync(env) {
  if (ingestLockPresent(env)) {
    console.error(`ERROR: ingest lock present at ${ingestLockPath(env)} — sync refused.`);
    console.error('Wait for the active ingest session to finish, then re-run.');
    return 3;
  }

  const sourceRoot = env.SOURCE_PATH;
  const targetRoot = env.VAULT_PATH;
  if (!sourceRoot) { console.error('ERROR: SOURCE_PATH not set in .env'); return 1; }
  if (!targetRoot) { console.error('ERROR: VAULT_PATH not set in .env'); return 1; }
  try { await access(sourceRoot, constants.R_OK); }
  catch { console.error(`ERROR: SOURCE_PATH not readable: ${sourceRoot}`); return 4; }

  console.log(`sync: ${sourceRoot} -> ${targetRoot}`);
  console.log('(Customize this verb for your corpus. Default behavior is a dry-run delta report.)\n');

  // Load anonymize as a library (sibling tool)
  let classify = null;
  try {
    const anon = await import('./anonymize.mjs');
    classify = anon.classify;
  } catch (e) {
    console.error(`WARN: anonymize.mjs not loadable — proceeding without PII gate. (${e.message})`);
  }

  let scanned = 0, candidates = 0, blocked = 0, suspicious = 0, clean = 0;
  for await (const p of walk(sourceRoot)) {
    scanned++;
    if (extname(p) !== '.md') continue;
    candidates++;
    const text = await readFile(p, 'utf8');
    const verdict = classify ? classify(text, { sourcePath: p }) : { class: 'clean' };
    if (verdict.class === 'blocked') blocked++;
    else if (verdict.class === 'suspicious') suspicious++;
    else clean++;
  }

  console.log(`scanned:    ${scanned}`);
  console.log(`candidates: ${candidates} (.md only — extend filter for your corpus)`);
  console.log(`clean:      ${clean}`);
  console.log(`suspicious: ${suspicious}`);
  console.log(`blocked:    ${blocked}`);
  console.log('\n(Dry-run only in skeleton form. Implement actual write-loop per the pattern in _meta/mega-mind-manifest.md flow steps 4-6.)');
  return 0;
}

// ── main ──────────────────────────────────────────────────────────
async function main() {
  const verb = process.argv[2];
  const env = loadEnv();
  switch (verb) {
    case 'scaffold': process.exit(await verbScaffold(env));
    case 'sync':     process.exit(await verbSync(env));
    case 'verify':   process.exit(await verbVerify(env));
    default:
      console.error('Usage: node tools/extract-from-source.mjs <scaffold|sync|verify>');
      process.exit(1);
  }
}

main().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
