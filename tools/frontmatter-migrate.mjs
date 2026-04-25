#!/usr/bin/env node
// tools/frontmatter-migrate.mjs
// One-shot v1 → v2 frontmatter upgrade for existing wiki pages.
// Walks concepts/, entities/ (excluding v2 subfolders), skills/, references/, synthesis/,
// runs frontmatter-v2.normalize() on each, writes in place.
//
// Usage:
//   node tools/frontmatter-migrate.mjs --dry-run
//   node tools/frontmatter-migrate.mjs --execute

import fs from 'node:fs';
import path from 'node:path';
import minimist from 'minimist';
import yaml from 'js-yaml';
import { normalize } from './lib/frontmatter-v2.mjs';
import { vaultPath, vaultRoot, guardCoordinatorFile } from './lib/paths.mjs';

const argv = minimist(process.argv.slice(2), {
  string: ['scope'],
  boolean: ['dry-run', 'execute', 'verbose', 'help'],
  alias: { h: 'help', v: 'verbose' },
});

if (argv.help || (!argv['dry-run'] && !argv.execute)) {
  console.error('frontmatter-migrate.mjs --dry-run | --execute [--scope DIR] [--verbose]');
  process.exit(argv.help ? 0 : 2);
}

// v2-native subfolders — don't migrate those, they're already v2.
const V2_EXCLUDED = new Set([
  'entities/faculty',
  'entities/techniques',
  'entities/courses',
  'entities/books',
  'entities/organizations',
  'entities/conditions',
  'entities/tools-and-instruments',
]);

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && full.toLowerCase().endsWith('.md')) yield full;
  }
}

function isV2Excluded(absPath) {
  const rel = path.relative(vaultRoot(), absPath).replace(/\\/g, '/');
  for (const ex of V2_EXCLUDED) if (rel.startsWith(ex + '/')) return true;
  return false;
}

function migrateOne(abs) {
  guardCoordinatorFile(abs);
  const text = fs.readFileSync(abs, 'utf8');
  const { frontmatter, content } = normalize(text);
  const y = yaml.dump(frontmatter, { lineWidth: 120, noRefs: true });
  const out = `---\n${y}---\n\n${content.replace(/^\n+/, '')}`;
  return { out, frontmatter };
}

async function main() {
  const scopeDirs = argv.scope ? [vaultPath(argv.scope)] : [
    vaultPath('concepts'),
    vaultPath('entities'),
    vaultPath('skills'),
    vaultPath('references'),
    vaultPath('synthesis'),
  ];

  const candidates = [];
  for (const d of scopeDirs) {
    for (const f of walk(d)) {
      if (!isV2Excluded(f)) candidates.push(f);
    }
  }

  console.log(`[frontmatter-migrate] scope=${candidates.length} candidate pages`);

  if (argv['dry-run']) {
    for (const c of candidates.slice(0, 50)) {
      try {
        const { frontmatter } = migrateOne(c);
        const rel = path.relative(vaultRoot(), c).replace(/\\/g, '/');
        if (argv.verbose) console.log(`${rel}: would set type=${frontmatter.type} tier=${frontmatter.tier} confidence=${frontmatter.confidence}`);
        else console.log(rel);
      } catch (err) {
        console.error(`[skip] ${c}: ${err.message}`);
      }
    }
    if (candidates.length > 50) console.log(`(${candidates.length - 50} more)`);
    return;
  }

  // --execute: backup + rewrite.
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const backupRoot = vaultPath('_archives', `frontmatter-migrate-${stamp}`);
  let done = 0;
  let skipped = 0;
  for (const c of candidates) {
    try {
      const { out } = migrateOne(c);
      const rel = path.relative(vaultRoot(), c);
      const backupPath = path.join(backupRoot, rel);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(c, backupPath);
      fs.writeFileSync(c, out, 'utf8');
      done++;
      if (argv.verbose) console.log(`migrated: ${rel.replace(/\\/g, '/')}`);
    } catch (err) {
      skipped++;
      console.error(`[skip] ${c}: ${err.message}`);
    }
  }
  console.log(`[frontmatter-migrate] migrated=${done} skipped=${skipped}; backups under ${path.relative(vaultRoot(), backupRoot)}`);
}

try {
  await main();
} catch (err) {
  console.error(`frontmatter-migrate: ${err.message}`);
  process.exit(1);
}
