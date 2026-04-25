// tools/lib/manifest.mjs
// Atomic read/write of _meta/mega-mind-manifest.md under a file lock.
// Row schema (v2, adds "Assigned-To" between Status and Entity page):
//   Folder | Type | Lang | Files | Status | Assigned-To | Entity page | Scan report | Notes
//
// Public API:
//   readManifest()                                -> { frontmatter, preamble, header, rows, trailing }
//   serializeManifest(doc)                        -> string
//   claimRow({ folder, worker, dryRun })          -> row object
//   claimNext({ worker })                         -> row object (first pending partitioned to worker)
//   releaseRow({ folder, worker, status, ... })   -> row object
//   upsertRows(rowUpdates[], { commit, message }) -> all rows
//
// All writes run inside proper-lockfile on the manifest file itself.
// Git invocations use execFileSync with argv arrays — no shell interpolation.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { vaultRoot, vaultPath } from './paths.mjs';

const MANIFEST_REL = '_meta/mega-mind-manifest.md';
export const MANIFEST_PATH = vaultPath(MANIFEST_REL);

const COLUMNS = [
  'folder',
  'type',
  'lang',
  'files',
  'status',
  'assignedTo',
  'entityPage',
  'scanReport',
  'notes',
];

const COLUMN_HEADERS = {
  folder: 'Folder',
  type: 'Type',
  lang: 'Lang',
  files: 'Files',
  status: 'Status',
  assignedTo: 'Assigned-To',
  entityPage: 'Entity page',
  scanReport: 'Scan report',
  notes: 'Notes',
};

export const STATUSES = ['pending', 'in-progress', 'needs-review', 'done', 'skipped', 'error'];
const MONOTONIC_ORDER = {
  pending: 0,
  'in-progress': 1,
  'needs-review': 2,
  done: 3,
  error: 3,
  skipped: 3,
};

function splitRow(line) {
  const trimmed = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function joinRow(cells) {
  return `| ${cells.map((c) => (c == null ? '' : String(c))).join(' | ')} |`;
}

function isTableDivider(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return false;
  const body = t.replace(/^\|/, '').replace(/\|$/, '');
  return body.split('|').every((c) => /^\s*:?-{2,}:?\s*$/.test(c));
}

function stripFolderMarkup(cell) {
  return cell.replace(/^`(.+)`$/s, '$1');
}

function wrapFolderMarkup(folder) {
  return '`' + folder + '`';
}

// Single-token columns we render wrapped in backticks. Entity page / scan report
// can contain multi-path expressions with inline backticks; for those we preserve
// the cell text verbatim.
const BACKTICKED_COLUMNS = new Set(['folder', 'status']);

function renderCell(key, value) {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  if (BACKTICKED_COLUMNS.has(key)) {
    if (raw.startsWith('`') && raw.endsWith('`')) return raw;
    return '`' + raw + '`';
  }
  return raw;
}

export function parseManifest(text) {
  const lines = text.split(/\r?\n/);

  let frontmatter = '';
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      frontmatter = lines.slice(0, end + 1).join('\n') + '\n';
      i = end + 1;
    }
  }

  let tableStart = -1;
  for (let j = i; j < lines.length; j++) {
    if (/^\|\s*folder\b/i.test(lines[j])) {
      tableStart = j;
      break;
    }
  }
  if (tableStart < 0) {
    return {
      frontmatter,
      preamble: lines.slice(i).join('\n'),
      header: null,
      divider: null,
      rows: [],
      trailing: '',
      columns: null,
    };
  }

  const preamble = lines.slice(i, tableStart).join('\n');
  const headerLine = lines[tableStart];
  const headerCells = splitRow(headerLine).map((c) => c.toLowerCase());

  const keyForIndex = headerCells.map((h) => {
    for (const [key, label] of Object.entries(COLUMN_HEADERS)) {
      if (h === label.toLowerCase()) return key;
    }
    return null;
  });

  const dividerLine = lines[tableStart + 1];
  let k = tableStart + 2;
  const rows = [];
  for (; k < lines.length; k++) {
    const line = lines[k];
    if (!line.trim().startsWith('|')) break;
    if (isTableDivider(line)) continue;
    const cells = splitRow(line);
    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
    for (let ci = 0; ci < cells.length && ci < keyForIndex.length; ci++) {
      const key = keyForIndex[ci];
      if (!key) continue;
      const raw = cells[ci];
      row[key] = BACKTICKED_COLUMNS.has(key) ? stripFolderMarkup(raw) : raw;
    }
    rows.push(row);
  }

  const trailing = lines.slice(k).join('\n');

  return {
    frontmatter,
    preamble,
    header: headerLine,
    divider: dividerLine,
    rows,
    trailing,
    columns: keyForIndex,
  };
}

export function serializeManifest(doc) {
  const header = joinRow(COLUMNS.map((k) => COLUMN_HEADERS[k]));
  // Match the no-space divider style the existing manifest uses: |---|---|...|
  const divider = '|' + COLUMNS.map(() => '---').join('|') + '|';
  const rowLines = doc.rows.map((row) =>
    joinRow(COLUMNS.map((k) => renderCell(k, row[k]))),
  );
  let out = '';
  if (doc.frontmatter) out += doc.frontmatter.endsWith('\n') ? doc.frontmatter : doc.frontmatter + '\n';
  if (doc.preamble) {
    const p = doc.preamble.replace(/\n+$/, '');
    if (p) out += p + '\n';
    // Always leave a blank line between preamble and the table header.
    out += '\n';
  }
  out += header + '\n';
  out += divider + '\n';
  for (const r of rowLines) out += r + '\n';
  if (doc.trailing) {
    // Trailing may start with an empty line (blank before next heading) — preserve.
    out += doc.trailing.startsWith('\n') ? doc.trailing : '\n' + doc.trailing;
  }
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

export function readManifest() {
  const text = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return parseManifest(text);
}

function git(args, { verbose = false } = {}) {
  return execFileSync('git', args, {
    cwd: vaultRoot(),
    stdio: verbose ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

function gitCommit(message, verbose = false) {
  git(['add', '--', MANIFEST_REL], { verbose });
  const staged = git(['diff', '--cached', '--name-only']).trim();
  if (!staged) return null;
  git(['commit', '-m', message], { verbose });
  return git(['rev-parse', '--short', 'HEAD']).trim();
}

async function withLock(fn, { verbose = false } = {}) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found: ${MANIFEST_PATH}`);
  }
  const release = await lockfile.lock(MANIFEST_PATH, {
    retries: { retries: 40, factor: 1.2, minTimeout: 200, maxTimeout: 2000 },
    stale: 20_000,
    realpath: false,
  });
  try {
    return await fn();
  } finally {
    try {
      await release();
    } catch (err) {
      if (verbose) console.error('[manifest] lock release warning:', err.message);
    }
  }
}

function findRow(doc, folder) {
  const needle = stripFolderMarkup(folder).toLowerCase();
  return doc.rows.find((r) => stripFolderMarkup(r.folder).toLowerCase() === needle);
}

export async function claimRow({ folder, worker, dryRun = false, verbose = false, allowInsert = false }) {
  if (!folder || !worker) throw new Error('claimRow requires --folder and --worker');
  const workerTag = `worker-${worker}`;
  return await withLock(async () => {
    const doc = readManifest();
    let row = findRow(doc, folder);
    if (!row) {
      if (!allowInsert) {
        throw Object.assign(new Error(`No manifest row for folder: ${folder}`), {
          code: 'E_NO_ROW',
        });
      }
      row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
      row.folder = folder;
      row.status = 'pending';
      row.assignedTo = workerTag;
      doc.rows.push(row);
    }
    if (row.status === 'in-progress' && row.assignedTo !== workerTag) {
      throw Object.assign(
        new Error(
          `Folder is in-progress by ${row.assignedTo || 'another worker'}; ${workerTag} cannot claim`,
        ),
        { code: 'E_ALREADY_CLAIMED', row },
      );
    }
    if (row.status === 'done' || row.status === 'skipped' || row.status === 'needs-review') {
      throw Object.assign(new Error(`Folder already ${row.status}; nothing to claim`), {
        code: 'E_TERMINAL_STATUS',
        row,
      });
    }
    if (row.assignedTo && row.assignedTo !== workerTag && row.status === 'pending') {
      throw Object.assign(
        new Error(
          `Folder is partitioned to ${row.assignedTo}; ${workerTag} is not allowed to claim.`,
        ),
        { code: 'E_WRONG_PARTITION', row },
      );
    }
    row.status = 'in-progress';
    row.assignedTo = workerTag;

    if (dryRun) {
      if (verbose) console.error('[manifest] dry-run claim:', row);
      return row;
    }
    fs.writeFileSync(MANIFEST_PATH, serializeManifest(doc), 'utf8');
    gitCommit(`chore(manifest): ${workerTag} claims ${stripFolderMarkup(folder)}`, verbose);
    return row;
  }, { verbose });
}

export async function claimNext({ worker, verbose = false }) {
  const workerTag = `worker-${worker}`;
  return await withLock(async () => {
    const doc = readManifest();
    const candidate = doc.rows.find(
      (r) => r.status === 'pending' && r.assignedTo === workerTag,
    );
    if (!candidate) {
      throw Object.assign(
        new Error(`No pending row partitioned to ${workerTag}`),
        { code: 'E_NO_WORK' },
      );
    }
    candidate.status = 'in-progress';
    fs.writeFileSync(MANIFEST_PATH, serializeManifest(doc), 'utf8');
    gitCommit(
      `chore(manifest): ${workerTag} claims ${stripFolderMarkup(candidate.folder)}`,
      verbose,
    );
    return candidate;
  }, { verbose });
}

export async function releaseRow({
  folder,
  worker,
  status,
  entityPage,
  scanReport,
  notes,
  dryRun = false,
  verbose = false,
}) {
  if (!folder || !worker || !status) {
    throw new Error('releaseRow requires --folder, --worker, --status');
  }
  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${STATUSES.join(', ')}`);
  }
  const workerTag = `worker-${worker}`;
  return await withLock(async () => {
    const doc = readManifest();
    const row = findRow(doc, folder);
    if (!row) {
      throw Object.assign(new Error(`No manifest row for folder: ${folder}`), {
        code: 'E_NO_ROW',
      });
    }
    if (row.assignedTo && row.assignedTo !== workerTag) {
      throw Object.assign(
        new Error(
          `Row is assigned to ${row.assignedTo}, not ${workerTag}; refusing to release`,
        ),
        { code: 'E_WRONG_WORKER', row },
      );
    }
    if (row.status !== 'in-progress' && row.status !== 'needs-review') {
      throw Object.assign(
        new Error(`Row is in status "${row.status}"; can only release in-progress or needs-review`),
        { code: 'E_WRONG_STATUS', row },
      );
    }
    row.status = status;
    if (entityPage) row.entityPage = entityPage;
    if (scanReport) row.scanReport = scanReport;
    if (notes) row.notes = notes;

    if (dryRun) {
      if (verbose) console.error('[manifest] dry-run release:', row);
      return row;
    }
    fs.writeFileSync(MANIFEST_PATH, serializeManifest(doc), 'utf8');
    gitCommit(
      `chore(manifest): ${workerTag} releases ${stripFolderMarkup(folder)} (${status})`,
      verbose,
    );
    return row;
  }, { verbose });
}

export async function upsertRows(rowUpdates, { commit = true, message, verbose = false } = {}) {
  return await withLock(async () => {
    const doc = readManifest();
    for (const upd of rowUpdates) {
      const existing = findRow(doc, upd.folder);
      if (existing) {
        for (const k of COLUMNS) {
          if (upd[k] !== undefined) existing[k] = upd[k];
        }
      } else {
        const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
        for (const k of COLUMNS) {
          if (upd[k] !== undefined) row[k] = upd[k];
        }
        row.folder = upd.folder;
        if (!row.status) row.status = 'pending';
        doc.rows.push(row);
      }
    }
    fs.writeFileSync(MANIFEST_PATH, serializeManifest(doc), 'utf8');
    if (commit) {
      gitCommit(message || `chore(manifest): upsert ${rowUpdates.length} row(s)`, verbose);
    }
    return doc.rows;
  }, { verbose });
}

export { MONOTONIC_ORDER, COLUMNS, COLUMN_HEADERS, stripFolderMarkup, wrapFolderMarkup };
