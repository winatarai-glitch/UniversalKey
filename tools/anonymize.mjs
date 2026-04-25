#!/usr/bin/env node
/**
 * tools/anonymize.mjs
 *
 * PII / PHI gate for UniversalKey ingest. Classifies file contents into:
 *   clean       — pass through unmodified
 *   suspicious  — quarantine, flag for human review (one or two soft hits)
 *   blocked     — refuse import (high-confidence PII/PHI hit, OR multiple soft hits)
 *
 * Customize the patterns below for your domain. The defaults below are a
 * starting kit covering common PII (email, phone, government IDs) and a
 * placeholder denylist of project-specific proper nouns. Replace the
 * denylist values with your own.
 *
 * Programmatic API:
 *   import { classify } from './anonymize.mjs';
 *   const verdict = classify(text, { sourcePath: '...' });
 *   // verdict = { class: 'clean'|'suspicious'|'blocked', hits: [...], reasons: [...] }
 *
 * CLI:
 *   echo "text" | node tools/anonymize.mjs            # stdin
 *   node tools/anonymize.mjs path/to/file.md          # file path
 *   node tools/anonymize.mjs --batch path/to/dir      # walk dir, report counts
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

// ── PROJECT-SPECIFIC DENYLIST ─────────────────────────────────────
// Replace these with names/identifiers you don't want leaving your vault.
// Patterns are case-insensitive and word-boundary-respecting where applicable.
const DENYLIST = [
  // Examples — replace with your own:
  // /\bAcmeCorp\b/i,
  // /\bjane\.doe@example\.com\b/i,
];

// ── HARD PII PATTERNS (always flagged or blocked) ─────────────────
// Each pattern: { name, regex, weight, action }
//   weight: 0..1 (likelihood of true positive)
//   action: 'block' | 'suspicious' (what to do on match)
const PII_PATTERNS = [
  // Email — most matches are PII
  {
    name: 'email-explicit',
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    weight: 0.7,
    action: 'suspicious',
    whitelist: [/example\.com$/i, /example\.org$/i, /\.anthropic\.com$/i, /noreply@/i, /\.github(?:usercontent)?\.com$/i],
  },

  // Phone — international format
  {
    name: 'phone-international',
    regex: /\+\d{1,3}[\s\-]?\d{2,4}([\s\-]?\d{2,4}){2,4}/g,
    weight: 0.6,
    action: 'suspicious',
  },

  // Norwegian fødselsnummer (11 digits, basic shape; mod-11 not enforced here — Wave 6 successor can wire phi-gate-patterns.mjs from EHR)
  {
    name: 'no-fnr-shape',
    regex: /\b\d{6}[\s\-]?\d{5}\b/g,
    weight: 0.85,
    action: 'block',
  },

  // Danish CPR (10 digits)
  {
    name: 'dk-cpr-shape',
    regex: /\b\d{6}[\s\-]?\d{4}\b/g,
    weight: 0.7,
    action: 'block',
  },

  // SSN (US) format
  {
    name: 'us-ssn-shape',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    weight: 0.85,
    action: 'block',
  },

  // Credit card (basic 13-19 digit)
  {
    name: 'credit-card-shape',
    regex: /\b(?:\d[ \-]*?){13,19}\b/g,
    weight: 0.5,
    action: 'suspicious',
  },

  // IBAN (basic shape)
  {
    name: 'iban-shape',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
    weight: 0.7,
    action: 'suspicious',
  },

  // IP address (private range often OK; public can be PII)
  {
    name: 'ip-address',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    weight: 0.3,
    action: 'suspicious',
    whitelist: [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\.0\.0\.0$/],
  },
];

// ── classify ──────────────────────────────────────────────────────
export function classify(text, opts = {}) {
  const hits = [];
  const reasons = [];

  // Denylist check (always block on hit)
  for (const re of DENYLIST) {
    const m = text.match(re);
    if (m) {
      hits.push({ name: 'denylist', match: m[0], action: 'block' });
      reasons.push(`denylist match: "${m[0]}"`);
    }
  }

  // PII pattern scan
  for (const p of PII_PATTERNS) {
    const matches = text.match(p.regex) || [];
    for (const m of matches) {
      // Whitelist filtering
      if (p.whitelist?.some((w) => w.test(m))) continue;
      hits.push({ name: p.name, match: m, action: p.action, weight: p.weight });
      reasons.push(`${p.name}: "${m.slice(0, 64)}"`);
    }
  }

  // Verdict logic
  let cls = 'clean';
  if (hits.some((h) => h.action === 'block')) {
    cls = 'blocked';
  } else if (hits.length >= 3) {
    // 3+ soft hits → block (cumulative risk)
    cls = 'blocked';
    reasons.push(`cumulative: ${hits.length} soft hits`);
  } else if (hits.length >= 1) {
    cls = 'suspicious';
  }

  return { class: cls, hits, reasons, sourcePath: opts.sourcePath };
}

// ── CLI ───────────────────────────────────────────────────────────
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function* walk(root) {
  const ents = await readdir(root, { withFileTypes: true });
  for (const e of ents) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.tmp-')) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

async function batchMode(dir) {
  const counts = { clean: 0, suspicious: 0, blocked: 0, scanned: 0 };
  for await (const p of walk(dir)) {
    if (extname(p) !== '.md' && extname(p) !== '.txt') continue;
    counts.scanned++;
    const text = await readFile(p, 'utf8');
    const v = classify(text, { sourcePath: p });
    counts[v.class]++;
    if (v.class !== 'clean') {
      console.log(`${v.class.toUpperCase()}: ${relative(dir, p)}`);
      for (const r of v.reasons) console.log(`  - ${r}`);
    }
  }
  console.log(`\nbatch summary: scanned=${counts.scanned} clean=${counts.clean} suspicious=${counts.suspicious} blocked=${counts.blocked}`);
  return counts.blocked > 0 ? 2 : 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--batch') {
    const dir = args[1];
    if (!dir || !existsSync(dir)) { console.error('Usage: node tools/anonymize.mjs --batch <dir>'); process.exit(1); }
    process.exit(await batchMode(dir));
  }
  let text;
  if (args.length === 0) text = await readStdin();
  else if (existsSync(args[0])) text = readFileSync(args[0], 'utf8');
  else { console.error(`Path not found: ${args[0]}`); process.exit(1); }

  const verdict = classify(text, { sourcePath: args[0] });
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.class === 'blocked' ? 2 : 0);
}

// Only run main() if invoked as a script (not when imported as a library)
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
}
