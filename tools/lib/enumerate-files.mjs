// tools/lib/enumerate-files.mjs
// Recursive file enumeration for a Mega Mind folder.
//
// Returns: [{ relPath, absPath, size, mtimeMs, ext, category }]
//   category ∈ 'pdf' | 'office' | 'office-legacy' | 'video' | 'audio' |
//              'image' | 'archive' | 'dicom' | 'text' | 'binary' | 'skip'

import fs from 'node:fs';
import path from 'node:path';

const EXT_CATEGORIES = {
  '.pdf': 'pdf',
  '.pptx': 'office', '.docx': 'office', '.odt': 'office', '.odp': 'office',
  '.rtf': 'office', '.epub': 'office', '.html': 'office',
  '.ppt': 'office-legacy', '.doc': 'office-legacy',
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.avi': 'video',
  '.wmv': 'video', '.m4v': 'video', '.webm': 'video',
  '.mod': 'video', '.mpg': 'video', '.mpeg': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.flac': 'audio',
  '.ogg': 'audio', '.aac': 'audio', '.wma': 'audio',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image',
  '.gif': 'image', '.bmp': 'image', '.tif': 'image', '.tiff': 'image', '.svg': 'image',
  '.zip': 'archive', '.7z': 'archive', '.rar': 'archive', '.tar': 'archive', '.gz': 'archive',
  '.dcm': 'dicom', '.dicom': 'dicom',
  '.txt': 'text', '.md': 'text', '.csv': 'text', '.json': 'text', '.yml': 'text', '.yaml': 'text',
};

const SKIP_NAMES = new Set([
  'desktop.ini', '.DS_Store', 'Thumbs.db', '.gitkeep', '.git',
]);

function isSkippable(name) {
  if (SKIP_NAMES.has(name)) return true;
  if (name.startsWith('~$')) return true;
  if (name.startsWith('.~lock.')) return true;
  return false;
}

export function categorize(ext) {
  const key = ext.toLowerCase();
  return EXT_CATEGORIES[key] || 'binary';
}

export function enumerateFiles(root, { maxDepth = Infinity, verbose = false } = {}) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  const rootResolved = path.resolve(root);
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (verbose) console.error(`[enumerate] cannot read ${dir}: ${err.message}`);
      continue;
    }
    for (const ent of entries) {
      if (isSkippable(ent.name)) continue;
      const absPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (depth + 1 <= maxDepth) stack.push({ dir: absPath, depth: depth + 1 });
      } else if (ent.isFile()) {
        let st;
        try { st = fs.statSync(absPath); } catch { continue; }
        const ext = path.extname(ent.name).toLowerCase();
        out.push({
          relPath: path.relative(rootResolved, absPath),
          absPath,
          size: st.size,
          mtimeMs: st.mtimeMs,
          ext,
          category: categorize(ext),
        });
      }
    }
  }
  return out;
}

export function summarizeByCategory(files) {
  const totals = {
    fileCount: files.length,
    sizeBytes: 0,
    perCategory: {},
  };
  for (const f of files) {
    totals.sizeBytes += f.size;
    if (!totals.perCategory[f.category]) {
      totals.perCategory[f.category] = { count: 0, sizeBytes: 0 };
    }
    totals.perCategory[f.category].count += 1;
    totals.perCategory[f.category].sizeBytes += f.size;
  }
  return totals;
}

export { SKIP_NAMES, EXT_CATEGORIES };
