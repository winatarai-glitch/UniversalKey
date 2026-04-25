// tools/lib/wikilink-index.mjs
// Build a basename → [path, ...] map of every .md file the wiki already tracks.
// Synthesis agents use this to decide which targets can be wikilinked.

import fs from 'node:fs';
import path from 'node:path';
import { vaultRoot, vaultPath } from './paths.mjs';

const INCLUDE_DIRS = [
  'concepts', 'entities', 'skills', 'references', 'synthesis',
  '_raw/ingest-queue', '_raw/translations',
];

const EXCLUDE_NAMES = new Set(['README.md', '_about.md', 'index.md']);

let cachedIndex = null;

export function buildIndex({ force = false } = {}) {
  if (cachedIndex && !force) return cachedIndex;
  const basenameMap = new Map();
  const allPages = [];
  for (const rel of INCLUDE_DIRS) {
    const root = vaultPath(rel);
    if (!fs.existsSync(root)) continue;
    walk(root, (absPath) => {
      if (!absPath.toLowerCase().endsWith('.md')) return;
      const base = path.basename(absPath);
      if (EXCLUDE_NAMES.has(base)) return;
      const relFromVault = path.relative(vaultRoot(), absPath).replace(/\\/g, '/');
      const baseNoExt = base.slice(0, -3);
      const entry = { path: relFromVault, basename: baseNoExt };
      allPages.push(entry);
      const key = baseNoExt.toLowerCase();
      if (!basenameMap.has(key)) basenameMap.set(key, []);
      basenameMap.get(key).push(entry);
    });
  }
  cachedIndex = { basenameMap, allPages, builtAt: Date.now() };
  return cachedIndex;
}

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, onFile);
    else if (e.isFile()) onFile(full);
  }
}

// Given a list of candidate basenames (lowercased, slug-style), return those
// that already exist in the wiki — useful for dossier cross-link hints.
export function findExistingTargets(candidates) {
  const idx = buildIndex();
  const hits = [];
  for (const c of candidates) {
    const k = String(c).toLowerCase();
    const rows = idx.basenameMap.get(k);
    if (rows && rows.length) hits.push({ basename: c, paths: rows.map((r) => r.path) });
  }
  return hits;
}

export function reset() {
  cachedIndex = null;
}
