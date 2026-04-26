#!/usr/bin/env node
/**
 * cross-linker-batch.mjs — Sprint 5 Part C
 * Scans all markdown files, builds a term registry from taxonomy tags
 * and wiki page titles, then inserts [[wikilinks]] for the first
 * unlinked mention of each term per page.
 *
 * Usage:
 *   node tools/cross-linker-batch.mjs              # scan → generates tools/link-manifest.json
 *   node tools/cross-linker-batch.mjs --dry-run    # preview changes from manifest
 *   node tools/cross-linker-batch.mjs --execute    # apply changes + git commits
 *
 * Run from vault root: <VAULT_PATH>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// --- Constants ---
const VAULT = process.cwd();
const MANIFEST_PATH = path.join(VAULT, 'tools', 'link-manifest.json');
const TAXONOMY_PATH = path.join(VAULT, '_meta', 'taxonomy.md');
const MAX_LINKS_PER_FILE = 10;
const MIN_TERM_LENGTH = 4;

// Directories to scan for linkable content
const SCOPE_DIRS = [
  '30 - Resources/AI Conversations',
  '20 - Areas/Chiropractic Practice/Clinical Letters',
  '10 - Projects/<your-project>/Blog Drafts',
  '10 - Projects/<your-project>/Articles',
  '30 - Resources/Research Papers',
  '30 - Resources/Books & Textbooks',
  '30 - Resources/Clinical Knowledge/Conditions',
  '30 - Resources/Clinical Knowledge/Techniques',
  '30 - Resources/Clinical Knowledge/Evidence-Based Practice',
  'concepts',
  'entities',
  'skills',
  'references',
  'synthesis',
];

// Directories to skip during recursive traversal
const SKIP_DIRS = new Set([
  '_meta', 'Templates', '.obsidian', 'tools', '.git',
  'node_modules', '_raw', '_archives', '00 - Inbox', '40 - Archive',
]);

// Wiki directories whose page titles become registry terms
const WIKI_DIRS = ['concepts', 'entities', 'skills', 'references', 'synthesis'];

// (Aliases loaded dynamically from _meta/taxonomy.md — no hardcoded aliases)

// Git commit messages per scope area
const COMMIT_AREAS = [
  { pattern: '30 - Resources/AI Conversations',                      msg: 'Sprint 5C: insert cross-links in AI conversations' },
  { pattern: '20 - Areas/Chiropractic Practice/Clinical Letters',     msg: 'Sprint 5C: insert cross-links in clinical letters' },
  { pattern: '10 - Projects/<your-project>/Blog Drafts',                  msg: 'Sprint 5C: insert cross-links in blog drafts' },
  { pattern: '10 - Projects/<your-project>/Articles',                     msg: 'Sprint 5C: insert cross-links in articles' },
  { pattern: '30 - Resources/Research Papers',                        msg: 'Sprint 5C: insert cross-links in research papers' },
  { pattern: '30 - Resources/Books',                                  msg: 'Sprint 5C: insert cross-links in books' },
  { pattern: '30 - Resources/Clinical Knowledge',                     msg: 'Sprint 6: insert cross-links in clinical knowledge' },
];


// --- Utility Functions ---

/**
 * Recursively find files matching a predicate.
 */
function findFilesRecursive(dir, matchFn, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findFilesRecursive(fullPath, matchFn, results);
    } else if (matchFn(entry.name, fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parse frontmatter from markdown content.
 */
function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return { fields: {}, bodyStart: 0 };
  const endIdx = content.indexOf('\n---\n', 4);
  if (endIdx === -1) return { fields: {}, bodyStart: 0 };

  const fmBlock = content.substring(4, endIdx);
  const fields = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    let val = line.substring(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fields[key] = val;
  }
  return { fields, bodyStart: endIdx + 5 };
}

function gitAdd(filePath) {
  const cmd = `git add "${filePath.replace(/\\/g, '/')}"`;
  execSync(cmd, { cwd: VAULT, stdio: 'pipe' });
}

function gitCommit(message) {
  execSync(`git commit -m "${message}"`, { cwd: VAULT, stdio: 'pipe' });
}

function relPath(absPath) {
  return path.relative(VAULT, absPath).replace(/\\/g, '/');
}


// --- Phase 1: Build Term Registry ---

/**
 * Parse taxonomy aliases from _meta/taxonomy.md.
 * Format: tag|alias1,alias2,alias3 in the ## Aliases section.
 * Only returns condition/* and technique/* tags (for cross-linking).
 */
function loadTaxonomyAliases(taxonomyPath) {
  const aliasMap = new Map();

  if (!fs.existsSync(taxonomyPath)) {
    console.log('  Warning: taxonomy.md not found');
    return aliasMap;
  }

  const content = fs.readFileSync(taxonomyPath, 'utf-8');
  const lines = content.split('\n');
  let inAliases = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().includes('## aliases')) {
      inAliases = true;
      continue;
    }
    if (inAliases) {
      if (trimmed.startsWith('##')) break; // next section
      if (!trimmed || trimmed.startsWith('<!--')) continue;
      const pipeIdx = trimmed.indexOf('|');
      if (pipeIdx === -1) continue;
      const tag = trimmed.substring(0, pipeIdx).trim();
      const aliases = trimmed.substring(pipeIdx + 1).split(',').map(a => a.trim()).filter(Boolean);
      // Only include condition and technique tags for cross-linking
      if (tag && aliases.length > 0 && (tag.startsWith('condition/') || tag.startsWith('technique/'))) {
        aliasMap.set(tag, aliases);
      }
    }
  }

  return aliasMap;
}

/**
 * Build the term→target registry from taxonomy aliases and wiki page titles.
 * Returns Array<{term, target, display}> sorted longest-first.
 */
function buildRegistry(vaultPath, aliasMap) {
  const registry = [];
  const seen = new Set(); // prevent duplicate terms (lowercase)

  // 1. Add taxonomy-derived terms (conditions + techniques)
  for (const [tagPath, aliases] of aliasMap) {
    // tagPath like "condition/bppv" or "technique/manipulation"
    const slug = tagPath.split('/').pop();

    // Check if a concepts/ page exists for this slug
    const conceptFile = path.join(vaultPath, 'concepts', `${slug}.md`);
    const target = fs.existsSync(conceptFile) ? `concepts/${slug}` : slug;

    for (const alias of aliases) {
      const termLower = alias.toLowerCase();
      if (termLower.length < MIN_TERM_LENGTH) continue;
      if (seen.has(termLower)) continue;
      seen.add(termLower);

      registry.push({
        term: termLower,
        target,
        display: alias,
      });
    }
  }

  // 2. Add wiki page titles from wiki directories
  for (const wikiDir of WIKI_DIRS) {
    const dirPath = path.join(vaultPath, wikiDir);
    if (!fs.existsSync(dirPath)) continue;

    const files = findFilesRecursive(dirPath, (name) => {
      return name.endsWith('.md') && name !== '_about.md';
    });

    for (const filePath of files) {
      const rel = relPath(filePath);
      const stem = path.basename(filePath, '.md');
      const termLower = stem.toLowerCase();

      if (termLower.length < MIN_TERM_LENGTH) continue;
      if (seen.has(termLower)) continue;
      seen.add(termLower);

      // Target is the relative path without .md extension
      const target = rel.replace(/\.md$/, '');

      registry.push({
        term: termLower,
        target,
        display: stem,
      });
    }
  }

  // Sort longest-first to prevent partial matches
  registry.sort((a, b) => b.term.length - a.term.length);

  return registry;
}


// --- Phase 2: Find Skip Zones & Linkable Mentions ---

/**
 * Find zones in content that should NOT receive wikilinks.
 * Returns Array<{start, end}> sorted by start position.
 */
function findSkipZones(content) {
  const zones = [];

  // 1. Frontmatter (--- to ---) — handle both LF and CRLF
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const endLF = content.indexOf('\n---\n', 4);
    const endCRLF = content.indexOf('\r\n---\r\n', 4);
    let endIdx = -1;
    let endLen = 0;
    if (endLF !== -1 && (endCRLF === -1 || endLF < endCRLF)) {
      endIdx = endLF; endLen = 5; // \n---\n
    } else if (endCRLF !== -1) {
      endIdx = endCRLF; endLen = 7; // \r\n---\r\n
    }
    if (endIdx !== -1) {
      zones.push({ start: 0, end: endIdx + endLen });
    }
  }

  // 2. Code blocks (``` to ```)
  const codeBlockRe = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRe.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // 3. Inline code (`...`)
  const inlineCodeRe = /`[^`\n]+`/g;
  while ((match = inlineCodeRe.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // 4. Existing wikilinks [[...]]
  const wikilinkRe = /\[\[[^\]]+\]\]/g;
  while ((match = wikilinkRe.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // 5. Heading lines (# ...)
  const headingRe = /^#{1,6}\s+.+$/gm;
  while ((match = headingRe.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // 6. HTML comments (<!-- ... -->)
  const htmlCommentRe = /<!--[\s\S]*?-->/g;
  while ((match = htmlCommentRe.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // 7. Markdown links [text](url)
  const mdLinkRe = /\[[^\]]*\]\([^)]*\)/g;
  while ((match = mdLinkRe.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // Sort by start position
  zones.sort((a, b) => a.start - b.start);

  return zones;
}

/**
 * Check if an offset falls within any skip zone.
 * Uses binary search for performance.
 */
function isInSkipZone(offset, length, skipZones) {
  const end = offset + length;
  for (const zone of skipZones) {
    if (zone.start > end) break; // zones are sorted, no overlap possible
    if (offset >= zone.start && offset < zone.end) return true;
    if (end > zone.start && end <= zone.end) return true;
    if (offset <= zone.start && end >= zone.end) return true;
  }
  return false;
}

/**
 * Find first linkable mention of each registry term in content.
 * Returns Array<{offset, length, term, target, display}> (max MAX_LINKS_PER_FILE).
 */
function findMentions(content, registry, skipZones, selfTitle) {
  if (!registry.length) return [];

  const contentLower = content.toLowerCase();
  const mentions = [];
  const linkedTerms = new Set(); // track which terms we've already linked

  // Build one big regex from all terms (sorted longest-first already)
  // Escape special regex characters in terms
  const escapedTerms = registry.map(r =>
    r.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  // Join with | and wrap in word boundaries
  // Use Unicode-aware word boundary for Norwegian chars
  const pattern = new RegExp(
    `(?<![\\wæøåÆØÅ])(${escapedTerms.join('|')})(?![\\wæøåÆØÅ])`,
    'gi'
  );

  let match;
  while ((match = pattern.exec(contentLower)) !== null) {
    if (mentions.length >= MAX_LINKS_PER_FILE) break;

    const matchedText = match[1];
    const matchedLower = matchedText.toLowerCase();
    const offset = match.index + (match[0].length - match[1].length); // adjust for lookbehind chars
    const length = matchedText.length;

    // Skip if already linked this term
    if (linkedTerms.has(matchedLower)) continue;

    // Skip if in a skip zone
    if (isInSkipZone(offset, length, skipZones)) continue;

    // Find the registry entry for this term
    const entry = registry.find(r => r.term === matchedLower);
    if (!entry) continue;

    // Don't link a page to itself
    if (selfTitle && selfTitle.toLowerCase() === matchedLower) continue;
    if (selfTitle && entry.target.toLowerCase().endsWith('/' + selfTitle.toLowerCase())) continue;

    // Get the original-case text from the actual content
    const originalText = content.substring(offset, offset + length);

    linkedTerms.add(matchedLower);
    mentions.push({
      offset,
      length,
      term: matchedLower,
      target: entry.target,
      display: originalText, // preserve original case from document
    });
  }

  return mentions;
}


// --- Phase 3: Insert Wikilinks ---

/**
 * Insert wikilinks into content at the specified mention offsets.
 * Processes in REVERSE order to maintain offset validity.
 */
function insertLinks(content, mentions) {
  // Sort by offset descending
  const sorted = [...mentions].sort((a, b) => b.offset - a.offset);

  let result = content;
  for (const m of sorted) {
    const before = result.substring(0, m.offset);
    const after = result.substring(m.offset + m.length);

    // If display matches target filename (case-insensitive), use simple [[target]]
    const targetBase = m.target.split('/').pop();
    let wikilink;
    if (m.display.toLowerCase() === targetBase.toLowerCase()) {
      wikilink = `[[${m.target}]]`;
    } else {
      wikilink = `[[${m.target}|${m.display}]]`;
    }

    result = before + wikilink + after;
  }

  return result;
}


// --- Scan & Manifest ---

function buildManifest() {
  console.log('=== Sprint 5C — Cross-Linker Scan ===');
  console.log(`Vault: ${VAULT}`);
  console.log('');

  // Phase 1: Build registry
  console.log('Phase 1: Building term registry...');
  const aliasMap = loadTaxonomyAliases(TAXONOMY_PATH);
  const registry = buildRegistry(VAULT, aliasMap);
  console.log(`  Registry: ${registry.length} terms`);
  console.log('');

  // Phase 2: Scan files
  console.log('Phase 2: Scanning files for linkable mentions...');
  const operations = [];
  let filesScanned = 0;
  let totalLinks = 0;

  for (const scopeDir of SCOPE_DIRS) {
    const dirPath = path.join(VAULT, scopeDir);
    if (!fs.existsSync(dirPath)) {
      console.log(`  SKIP (not found): ${scopeDir}`);
      continue;
    }

    const files = findFilesRecursive(dirPath, (name) => name.endsWith('.md'));
    console.log(`  ${scopeDir}: ${files.length} files`);

    for (const filePath of files) {
      filesScanned++;
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        continue;
      }

      if (!content.trim()) continue;

      // Derive self-title from filename
      const selfTitle = path.basename(filePath, '.md');

      const skipZones = findSkipZones(content);
      const mentions = findMentions(content, registry, skipZones, selfTitle);

      if (mentions.length > 0) {
        const rel = relPath(filePath);
        operations.push({
          path: rel,
          links: mentions.map(m => ({
            term: m.term,
            target: m.target,
            display: m.display,
            offset: m.offset,
          })),
        });
        totalLinks += mentions.length;
      }
    }
  }

  console.log('');

  const manifest = {
    version: 1,
    sprint: '5C',
    generated: new Date().toISOString(),
    vault: VAULT,
    registrySize: registry.length,
    summary: {
      filesScanned,
      filesWithLinks: operations.length,
      totalLinksToInsert: totalLinks,
    },
    operations,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Manifest written to ${MANIFEST_PATH}`);
  console.log('Summary:');
  console.log(`  Files scanned:     ${manifest.summary.filesScanned}`);
  console.log(`  Files with links:  ${manifest.summary.filesWithLinks}`);
  console.log(`  Total links:       ${manifest.summary.totalLinksToInsert}`);

  return manifest;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`No manifest found at ${MANIFEST_PATH}. Run scan mode first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== 1) {
    console.error(`Unsupported manifest version: ${manifest.version}. Expected 1.`);
    process.exit(1);
  }
  return manifest;
}


// --- Execute ---

function executeManifest(manifest, { dryRun = false } = {}) {
  const mode = dryRun ? 'DRY RUN' : 'EXECUTE';
  console.log(`=== Sprint 5C — Cross-Linker ${mode} ===`);
  console.log(`Total files: ${manifest.summary.filesWithLinks}`);
  console.log(`Total links: ${manifest.summary.totalLinksToInsert}`);
  console.log('');

  let success = 0;
  let skipped = 0;
  let errors = 0;
  const modifiedByArea = new Map(); // area → list of modified file paths

  for (const op of manifest.operations) {
    const absPath = path.join(VAULT, op.path);

    if (!fs.existsSync(absPath)) {
      console.log(`  SKIP (missing): ${op.path}`);
      skipped++;
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch (err) {
      console.error(`  ERROR reading: ${op.path} — ${err.message}`);
      errors++;
      continue;
    }

    // Re-verify offsets: check that the content at each offset still matches
    let valid = true;
    for (const link of op.links) {
      const actual = content.substring(link.offset, link.offset + link.display.length);
      if (actual.toLowerCase() !== link.term.toLowerCase()) {
        console.log(`  SKIP (content changed): ${op.path} — expected "${link.term}" at offset ${link.offset}, found "${actual}"`);
        valid = false;
        break;
      }
    }

    if (!valid) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  ${op.path} (${op.links.length} links):`);
      for (const link of op.links) {
        const targetBase = link.target.split('/').pop();
        const wikilink = link.display.toLowerCase() === targetBase.toLowerCase()
          ? `[[${link.target}]]`
          : `[[${link.target}|${link.display}]]`;
        console.log(`    @${link.offset}: "${link.display}" → ${wikilink}`);
      }
      success++;
      continue;
    }

    // Build mentions array for insertLinks
    const mentions = op.links.map(l => ({
      offset: l.offset,
      length: l.display.length,
      term: l.term,
      target: l.target,
      display: l.display,
    }));

    try {
      const newContent = insertLinks(content, mentions);
      fs.writeFileSync(absPath, newContent, 'utf8');

      // Track which area this file belongs to
      const normalizedPath = op.path.replace(/\\/g, '/');
      let area = 'other';
      for (const ca of COMMIT_AREAS) {
        if (normalizedPath.startsWith(ca.pattern)) {
          area = ca.pattern;
          break;
        }
      }
      if (!modifiedByArea.has(area)) modifiedByArea.set(area, []);
      modifiedByArea.get(area).push(absPath);

      console.log(`  OK: ${op.path} (${op.links.length} links)`);
      success++;
    } catch (err) {
      console.error(`  ERROR writing: ${op.path} — ${err.message}`);
      errors++;
    }
  }

  // Git commits per area
  if (!dryRun && success > 0) {
    console.log('');
    console.log('Committing changes...');

    for (const [area, files] of modifiedByArea) {
      // Stage entire area directory at once (HDD-safe, avoids index.lock)
      try {
        const areaDir = path.relative(VAULT, path.join(VAULT, area)).replace(/\\/g, '/');
        gitAdd(path.join(VAULT, area));
      } catch (err) {
        // Fallback: stage files individually if directory staging fails
        for (const f of files) {
          try { gitAdd(f); } catch { /* skip */ }
        }
      }

      // Find commit message for this area
      const commitArea = COMMIT_AREAS.find(ca => ca.pattern === area);
      const commitMsg = commitArea ? commitArea.msg : `Sprint 5C: insert cross-links in ${area}`;

      try {
        gitCommit(commitMsg);
        console.log(`  Committed: ${commitMsg} (${files.length} files)`);
      } catch (err) {
        console.log(`  No changes to commit for ${area} (${err.message})`);
      }
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Success: ${success}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
}


// --- Main ---

const args = process.argv.slice(2);
const mode = args.includes('--execute') ? 'execute'
  : args.includes('--dry-run') ? 'dry-run'
  : 'scan';

switch (mode) {
  case 'scan':
    buildManifest();
    break;
  case 'dry-run': {
    const manifest = loadManifest();
    executeManifest(manifest, { dryRun: true });
    break;
  }
  case 'execute': {
    const manifest = loadManifest();
    executeManifest(manifest, { dryRun: false });
    break;
  }
}
