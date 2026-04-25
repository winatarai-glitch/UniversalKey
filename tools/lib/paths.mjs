// tools/lib/paths.mjs
// Invariant guards for all Phase 2 tools.
//  - rejectEDrive(p): throw if an output path lands on the read-only source archive
//  - guardCoordinatorFile(p): throw if a write target is one of the coordinator-only files
//  - slugify(str): consistent folder/page slug
//  - vaultRoot(): resolve the vault root from this file's location

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// paths.mjs lives at `<vault>/tools/lib/paths.mjs` → vault is two up.
const VAULT_ROOT = path.resolve(__dirname, '..', '..');

export function vaultRoot() {
  return VAULT_ROOT;
}

// Reject writes to the configured read-only source archive.
// Source path comes from SOURCE_PATH env var (set in .env). If unset,
// this is a no-op (no protection enforced).
// Function name is kept for backwards compatibility with existing tool callers.
export function rejectEDrive(outputPath) {
  if (!outputPath) return;
  const sourcePath = process.env.SOURCE_PATH;
  if (!sourcePath) return;  // no source configured = nothing to protect
  const lowerOut = String(outputPath).replace(/\\/g, '/').toLowerCase();
  const lowerSrc = sourcePath.replace(/\\/g, '/').toLowerCase();
  if (lowerOut.startsWith(lowerSrc)) {
    const err = new Error(`Source archive is read-only — output path forbidden: ${outputPath}`);
    err.code = 'E_READONLY_SOURCE';
    throw err;
  }
}

// Coordinator-only files. Workers must never write to these.
const COORDINATOR_FILES = new Set([
  '_meta/taxonomy.md',
  '_meta/confidence.md',
  '_meta/lifecycle.md',
  '_meta/consolidation.md',
  '_meta/phase2-roadmap.md',
  'CLAUDE.md',
  'index.md',
].map((p) => p.toLowerCase()));

export function guardCoordinatorFile(absOrRelPath) {
  if (!absOrRelPath) return;
  let rel = absOrRelPath;
  if (path.isAbsolute(rel)) {
    rel = path.relative(VAULT_ROOT, rel);
  }
  rel = rel.replace(/\\/g, '/').toLowerCase();
  if (COORDINATOR_FILES.has(rel)) {
    const err = new Error(`Coordinator-only file, writes forbidden from worker tools: ${absOrRelPath}`);
    err.code = 'E_COORDINATOR_WRITE';
    throw err;
  }
}

// Produce a filesystem-safe slug. Matches the style of existing entity filenames
// (lowercase, hyphens, ASCII only).
export function slugify(str) {
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-zA-Z0-9\s\-_/]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Best-effort check that a file exists without throwing.
export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

// Absolute path to a file under the vault.
export function vaultPath(...parts) {
  return path.resolve(VAULT_ROOT, ...parts);
}
