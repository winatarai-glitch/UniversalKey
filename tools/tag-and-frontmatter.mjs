#!/usr/bin/env node
/**
 * tag-and-frontmatter.mjs — Sprint 5B
 * Scan ~2,600 markdown files, add YAML frontmatter where missing,
 * and enrich tags on files that only have [ai-conversation].
 *
 * Usage:
 *   node tools/tag-and-frontmatter.mjs              # scan -> generates tools/tag-manifest.json
 *   node tools/tag-and-frontmatter.mjs --dry-run    # preview changes from manifest
 *   node tools/tag-and-frontmatter.mjs --execute    # apply changes + category-based git commits
 *
 * Run from vault root: <VAULT_PATH>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// --- Constants ---
const VAULT = process.cwd();
const MANIFEST_PATH = path.join(VAULT, 'tools', 'tag-manifest.json');
const TAXONOMY_PATH = path.join(VAULT, '_meta', 'taxonomy.md');
const TODAY = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const SCOPE_DIRS = [
  { name: 'ai-claude',        path: '30 - Resources/AI Conversations/Claude/conversations', type: 'conversation', source: 'claude' },
  { name: 'ai-gemini',        path: '30 - Resources/AI Conversations/Gemini',               type: 'conversation', source: 'gemini' },
  { name: 'ai-perplexity',    path: '30 - Resources/AI Conversations/Perplexity',           type: 'conversation', source: 'perplexity' },
  { name: 'clinical-letters', path: '20 - Areas/Chiropractic Practice/Clinical Letters',    type: 'clinical-letter', source: 'clinical-experience' },
  { name: 'blog-drafts',      path: '10 - Projects/example-project/Blog Drafts',                 type: 'blog-draft', source: null },
  { name: 'articles',         path: '10 - Projects/example-project/Articles',                    type: 'article', source: null },
  { name: 'research-papers',  path: '30 - Resources/Research Papers',                       type: 'research-paper', source: 'research-paper' },
  { name: 'books',            path: '30 - Resources/Books & Textbooks',                     type: 'book-note', source: 'textbook' },
  { name: 'clinical-conditions', path: '30 - Resources/Clinical Knowledge/Conditions',       type: 'clinical-guide', source: 'clinical-experience' },
  { name: 'clinical-techniques', path: '30 - Resources/Clinical Knowledge/Techniques',       type: 'clinical-guide', source: 'clinical-experience' },
  { name: 'clinical-ebp',        path: '30 - Resources/Clinical Knowledge/Evidence-Based Practice', type: 'clinical-guide', source: 'research-paper' },
];

const PATH_TO_TAGS = [
  { pattern: /korsrygg|lumbago/i, tags: ['condition/low-back-pain', 'region/lumbar'] },
  { pattern: /nakke|cervic/i, tags: ['condition/neck-pain', 'region/cervical'] },
  { pattern: /kjeve|tmj|tmd/i, tags: ['region/tmj'] },
  { pattern: /svimmelhet|vertigo|vestibul/i, tags: ['condition/vertigo', 'region/vestibular'] },
  { pattern: /hodepine|migrene|headache|migraine|cephalgi/i, tags: ['condition/headache'] },
  { pattern: /skulder|shoulder/i, tags: ['condition/shoulder', 'region/shoulder'] },
  { pattern: /hofte|hip|bekken/i, tags: ['condition/hip', 'region/hip'] },
  { pattern: /fot|foot|ankel|ankle/i, tags: ['condition/foot', 'region/foot'] },
  { pattern: /kne|knee|menisk/i, tags: ['condition/knee', 'region/knee'] },
  { pattern: /arm|albue|elbow|h\u00e5ndledd/i, tags: ['region/elbow'] },
  { pattern: /rygg|thorac|brystrygg/i, tags: ['region/thoracic'] },
  { pattern: /bppv|krystallsyke/i, tags: ['condition/bppv', 'region/vestibular'] },
  { pattern: /prolaps|disc.?herni/i, tags: ['condition/disc-herniation'] },
  { pattern: /tbi|hjernerystelse|concuss|commotio/i, tags: ['condition/tbi'] },
  { pattern: /skoliose|scoliosis/i, tags: ['condition/scoliosis'] },
  { pattern: /isjias|sciatica/i, tags: ['condition/sciatica'] },
  { pattern: /dry.?needl|t\u00f8rrn\u00e5l/i, tags: ['technique/dry-needling'] },
  { pattern: /manipul|adjustment|justering/i, tags: ['technique/manipulation'] },
  { pattern: /tendon|tendinopat/i, tags: ['technique/rehabilitation'] },
  { pattern: /shockwave|trykkb\u00f8lge|eswt/i, tags: ['technique/shockwave'] },
];

const COMMIT_MESSAGES = {
  'ai-claude':        'Sprint 5B: enrich tags on Claude conversations',
  'ai-gemini':        'Sprint 5B: enrich tags on Gemini conversations',
  'ai-perplexity':    'Sprint 5B: enrich tags on Perplexity conversations',
  'clinical-letters': 'Sprint 5B: add frontmatter to clinical letters',
  'blog-drafts':      'Sprint 5B: add frontmatter to blog drafts',
  'articles':         'Sprint 5B: add frontmatter to articles',
  'research-papers':  'Sprint 5B: add frontmatter to research papers',
  'books':            'Sprint 5B: enrich tags on book notes',
  'clinical-conditions': 'Sprint 6: enrich tags on clinical condition guides',
  'clinical-techniques': 'Sprint 6: enrich tags on clinical technique guides',
  'clinical-ebp':        'Sprint 6: enrich tags on evidence-based practice guides',
};


// --- Utility Functions ---

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeYaml(str) {
  if (!str) return '""';
  if (/[:#\[\]{}&*!|>'"%@`]/.test(str) || str.includes('\n')) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return '"' + str + '"';
}

function relPath(absPath) {
  return path.relative(VAULT, absPath).replace(/\\/g, '/');
}

function findFilesRecursive(dir, matchFn, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === '.obsidian' || entry.name === 'node_modules' || entry.name === 'tools') continue;
      findFilesRecursive(fullPath, matchFn, results);
    } else if (matchFn(entry.name, fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function gitAdd(dirPath) {
  const rel = path.relative(VAULT, dirPath).replace(/\\/g, '/');
  execSync(`git add "${rel}"`, { cwd: VAULT, stdio: 'pipe' });
}

function gitCommit(msg) {
  try {
    execSync(`git commit -m "${msg}"`, { cwd: VAULT, stdio: 'pipe' });
  } catch (e) {
    if (!e.stderr?.toString().includes('nothing to commit')) throw e;
  }
}


// --- Core Functions ---

/**
 * Parse taxonomy.md for alias lines (format: tag|alias1,alias2,alias3).
 * If no aliases section exists, build a default alias map from
 * the taxonomy tags and PATH_TO_TAGS patterns.
 */
function loadTaxonomyAliases(taxonomyPath) {
  const aliasMap = new Map();

  if (fs.existsSync(taxonomyPath)) {
    const content = fs.readFileSync(taxonomyPath, 'utf-8');
    const lines = content.split('\n');
    let inAliases = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes('## aliases') || trimmed.toLowerCase().includes('## keyword aliases')) {
        inAliases = true;
        continue;
      }
      if (inAliases) {
        if (trimmed.startsWith('##')) break; // next section
        if (!trimmed || trimmed.startsWith('<!--')) continue;
        // Format: tag|alias1,alias2,alias3
        const pipeIdx = trimmed.indexOf('|');
        if (pipeIdx === -1) continue;
        const tag = trimmed.substring(0, pipeIdx).trim();
        const aliases = trimmed.substring(pipeIdx + 1).split(',').map(a => a.trim()).filter(Boolean);
        if (tag && aliases.length > 0) {
          aliasMap.set(tag, aliases);
        }
      }
    }
  }

  // Build default aliases from known clinical vocabulary
  if (aliasMap.size === 0) {
    aliasMap.set('condition/bppv', ['bppv', 'krystallsyke', 'benign paroxysmal', 'canalith']);
    aliasMap.set('condition/vertigo', ['vertigo', 'svimmelhet', 'dizziness', 'svimmel']);
    aliasMap.set('condition/neck-pain', ['nakkesmerter', 'nakke', 'cervical', 'nakkeplager', 'cervicogenic', 'neck pain']);
    aliasMap.set('condition/low-back-pain', ['korsrygg', 'lumbago', 'low back pain', 'ryggsmerter', 'lumbalgia']);
    aliasMap.set('condition/sciatica', ['isjias', 'sciatica', 'radikulopati', 'radiculopathy']);
    aliasMap.set('condition/shoulder', ['skulder', 'shoulder', 'skuldersmerter', 'rotator cuff', 'impingement']);
    aliasMap.set('condition/frozen-shoulder', ['frozen shoulder', 'frossen skulder', 'adhesive capsulitis']);
    aliasMap.set('condition/knee', ['kne', 'knee', 'menisk', 'meniscus', 'patellofemoral']);
    aliasMap.set('condition/hip', ['hofte', 'hip', 'hoftesmerter', 'hip pain']);
    aliasMap.set('condition/foot', ['fot', 'foot', 'ankel', 'ankle', 'plantar fasciitis', 'plantarfasciitt']);
    aliasMap.set('condition/headache', ['hodepine', 'headache', 'migrene', 'migraine', 'cephalgia', 'cephalalgia', 'spenningshodepine', 'tension headache']);
    aliasMap.set('condition/migraine', ['migrene', 'migraine', 'aura migraine']);
    aliasMap.set('condition/disc-herniation', ['prolaps', 'disc herniation', 'skiveprolaps', 'herniated disc', 'diskusprolaps']);
    aliasMap.set('condition/tbi', ['hjernerystelse', 'concussion', 'commotio', 'tbi', 'traumatic brain', 'post-commotio']);
    aliasMap.set('condition/scoliosis', ['skoliose', 'scoliosis']);
    aliasMap.set('condition/thoracic-kyphosis', ['kyfose', 'kyphosis', 'thoracic kyphosis']);
    aliasMap.set('region/cervical', ['cervical', 'nakke', 'cervicale']);
    aliasMap.set('region/thoracic', ['thoracal', 'thoracic', 'brystrygg', 'midtrygg']);
    aliasMap.set('region/lumbar', ['lumbal', 'lumbar', 'korsrygg', 'nedre rygg']);
    aliasMap.set('region/shoulder', ['skulder', 'shoulder']);
    aliasMap.set('region/elbow', ['albue', 'elbow', 'epicondylitt', 'epicondylitis']);
    aliasMap.set('region/wrist', ['h\u00e5ndledd', 'wrist', 'karpaltunnel', 'carpal tunnel']);
    aliasMap.set('region/hip', ['hofte', 'hip', 'bekken', 'pelvis']);
    aliasMap.set('region/knee', ['kne', 'knee']);
    aliasMap.set('region/ankle', ['ankel', 'ankle']);
    aliasMap.set('region/foot', ['fot', 'foot']);
    aliasMap.set('region/tmj', ['kjeve', 'tmj', 'tmd', 'temporomandibul', 'kjevesmerter']);
    aliasMap.set('region/vestibular', ['vestibul\u00e6r', 'vestibular', 'vestibularis', 'balanseorgan']);
    aliasMap.set('technique/manipulation', ['manipulasjon', 'manipulation', 'justering', 'adjustment', 'spinal manipulation', 'hvla']);
    aliasMap.set('technique/mobilization', ['mobilisering', 'mobilization', 'mobilisation']);
    aliasMap.set('technique/rehabilitation', ['rehabilitering', 'rehabilitation', 'rehab', '\u00f8velser', 'exercises', 'trening']);
    aliasMap.set('technique/dry-needling', ['dry needling', 't\u00f8rrn\u00e5ling', 'n\u00e5lebehandling', 'intramuskul\u00e6r']);
    aliasMap.set('technique/bppv-maneuver', ['epley', 'semont', 'reposisjon', 'canalith repositioning']);
    aliasMap.set('technique/exercise-prescription', ['treningsprogram', 'exercise prescription', '\u00f8velsesprogram']);
    aliasMap.set('technique/shockwave', ['shockwave', 'trykkb\u00f8lge', 'eswt', 'radial shockwave']);
    aliasMap.set('technique/soft-tissue', ['bløtvevsbehandling', 'soft tissue', 'myofascial', 'trigger point', 'triggerpunkt']);
    aliasMap.set('technique/traction', ['traksjon', 'traction', 'dekompresjon', 'decompression']);
  }

  return aliasMap;
}

/**
 * Parse YAML frontmatter from file content.
 * Returns { fields: {key: value}, bodyStart: lineIndex, rawBlock: string }
 */
function parseFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { fields: {}, bodyStart: 0, rawBlock: '' };
  }
  const endIdx = content.indexOf('\n---\n', 4);
  const endIdxR = content.indexOf('\r\n---\r\n', 4);
  let actualEnd, blockEnd;

  if (endIdx !== -1 && (endIdxR === -1 || endIdx < endIdxR)) {
    actualEnd = endIdx;
    blockEnd = endIdx + 5; // skip past \n---\n
  } else if (endIdxR !== -1) {
    actualEnd = endIdxR;
    blockEnd = endIdxR + 7; // skip past \r\n---\r\n
  } else {
    return { fields: {}, bodyStart: 0, rawBlock: '' };
  }

  const fmBlock = content.substring(content.indexOf('\n') + 1, actualEnd);
  const fields = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    let val = line.substring(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fields[key] = val;
  }
  return { fields, bodyStart: blockEnd, rawBlock: content.substring(0, blockEnd) };
}

/**
 * Parse tags from the tags field value.
 * Handles: [tag1, tag2] or YAML list.
 */
function parseTags(tagsValue) {
  if (!tagsValue) return [];
  let val = tagsValue.trim();
  // Flow style: [tag1, tag2, tag3]
  if (val.startsWith('[') && val.endsWith(']')) {
    val = val.slice(1, -1);
  }
  return val.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

/**
 * Classify a file based on its frontmatter.
 */
function classifyFile(filePath, content) {
  const { fields } = parseFrontmatter(content);

  // No frontmatter at all
  if (!fields || Object.keys(fields).length === 0) {
    return { action: 'add-frontmatter' };
  }

  const tagsRaw = fields.tags || '';
  const tags = parseTags(tagsRaw);

  // Has domain tags already — skip
  const hasDomainTags = tags.some(t =>
    t.startsWith('condition/') || t.startsWith('region/') || t.startsWith('technique/')
  );
  if (hasDomainTags) {
    return { action: 'skip' };
  }

  // Has frontmatter but only generic tags (e.g. [ai-conversation]) — enrich
  if (tags.length > 0) {
    return { action: 'enrich-tags', existingTags: tags };
  }

  // Has frontmatter but empty tags — enrich
  return { action: 'enrich-tags', existingTags: [] };
}

/**
 * Match content text against alias map to find relevant tags.
 * Returns top maxTags tags sorted by score.
 */
function matchKeywords(text, aliasMap, maxTags = 2) {
  const lower = text.toLowerCase();
  const scored = [];

  for (const [tag, aliases] of aliasMap) {
    // Skip non-domain tags
    if (tag.startsWith('source/') || tag.startsWith('project/') ||
        tag.startsWith('status/') || tag.startsWith('visibility/')) {
      continue;
    }

    let totalScore = 0;
    for (const alias of aliases) {
      try {
        const re = new RegExp('\\b' + escapeRegex(alias) + '\\b', 'gi');
        const matches = lower.match(re);
        if (matches) {
          const weight = alias.length > 5 ? 2 : 1;
          totalScore += matches.length * weight;
        }
      } catch {
        // Skip invalid regex
        continue;
      }
    }

    if (totalScore > 0) {
      scored.push({ tag, score: totalScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxTags).map(s => s.tag);
}

/**
 * Derive tags from the relative file path (for research papers).
 * Checks each path segment against PATH_TO_TAGS patterns.
 */
function derivePathTags(relativePath) {
  const segments = relativePath.replace(/\\/g, '/').split('/');
  const matched = new Set();

  for (const segment of segments) {
    for (const { pattern, tags } of PATH_TO_TAGS) {
      if (pattern.test(segment)) {
        for (const t of tags) matched.add(t);
      }
    }
  }

  return [...matched];
}

/**
 * Derive a title from file path and content.
 * 1. If content has H1 heading (# Title), use it
 * 2. Else derive from filename
 */
function deriveTitle(filePath, content) {
  // Check for H1 in body (skip frontmatter)
  const { bodyStart } = parseFrontmatter(content);
  const body = content.substring(bodyStart);
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Derive from filename
  const basename = path.basename(filePath, '.md');
  return basename
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Build YAML frontmatter string for a given file type.
 */
function buildFrontmatter(filePath, dirConfig, allTags, title) {
  const tagLine = `[${allTags.join(', ')}]`;
  const safeTitle = escapeYaml(title);

  switch (dirConfig.type) {
    case 'clinical-letter':
      return `---\ntitle: ${safeTitle}\ndate: ${TODAY}\ntype: clinical-letter\nsource: clinical-experience\ntags: ${tagLine}\nstatus: raw\nvisibility: pii\n---\n`;

    case 'blog-draft':
      return `---\ntitle: ${safeTitle}\ndate: ${TODAY}\ntype: blog-draft\ntags: ${tagLine}\nstatus: draft\n---\n`;

    case 'article':
      return `---\ntitle: ${safeTitle}\ndate: ${TODAY}\ntype: article\ntags: ${tagLine}\nstatus: raw\n---\n`;

    case 'research-paper':
      return `---\ntitle: ${safeTitle}\ndate: ${TODAY}\ntype: research-paper\nsource: research-paper\ntags: ${tagLine}\nstatus: raw\n---\n`;

    case 'book-note':
      return `---\ntitle: ${safeTitle}\ndate: ${TODAY}\ntype: book-note\nsource: textbook\ntags: ${tagLine}\nstatus: raw\n---\n`;

    case 'conversation':
    default:
      return `---\ntitle: ${safeTitle}\ndate: ${TODAY}\ntype: conversation\nsource: ${dirConfig.source || 'unknown'}\ntags: ${tagLine}\nstatus: raw\n---\n`;
  }
}

/**
 * Enrich tags in existing frontmatter.
 * Parse existing frontmatter, find the tags line, merge in new tags, rewrite.
 */
function enrichTags(content, newTags) {
  const { bodyStart, rawBlock } = parseFrontmatter(content);
  if (!rawBlock) return content;

  const body = content.substring(bodyStart);
  const lines = rawBlock.split(/\r?\n/);
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

  let tagLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^tags\s*:/)) {
      tagLineIdx = i;
      break;
    }
  }

  if (tagLineIdx === -1) {
    // No tags line found — insert before closing ---
    const closingIdx = lines.lastIndexOf('---');
    const tagLine = `tags: [${newTags.join(', ')}]`;
    lines.splice(closingIdx, 0, tagLine);
  } else {
    // Parse existing tags, merge, deduplicate
    const existing = parseTags(lines[tagLineIdx].substring(lines[tagLineIdx].indexOf(':') + 1));
    const merged = [...new Set([...existing, ...newTags])];
    lines[tagLineIdx] = `tags: [${merged.join(', ')}]`;
  }

  return lines.join(lineEnding) + body;
}

/**
 * Derive project tag from file path.
 *
 * Extend with your own project keywords. Each line maps a path-fragment
 * (case-insensitive) to a `project/<slug>` tag. Return null when no project
 * keyword matches.
 */
function deriveProjectTag(relativePath) {
  const lower = relativePath.toLowerCase().replace(/\\/g, '/');
  // Example mappings — replace with your own:
  // if (lower.includes('your-project-keyword')) return 'project/your-project-slug';
  void lower;
  return null;
}


// --- Scan Phase ---

function buildManifest() {
  console.log('=== Sprint 5B -- Tag & Frontmatter Scan ===');
  console.log(`Vault: ${VAULT}`);
  console.log(`Date:  ${TODAY}`);
  console.log('');

  const aliasMap = loadTaxonomyAliases(TAXONOMY_PATH);
  console.log(`Loaded ${aliasMap.size} taxonomy aliases`);
  console.log('');

  const summary = { total: { enrich: 0, add: 0, skip: 0 } };
  const operations = [];

  for (const dirConfig of SCOPE_DIRS) {
    const dirAbs = path.join(VAULT, dirConfig.path);
    const catSummary = { enrich: 0, add: 0, skip: 0 };
    console.log(`Scanning: ${dirConfig.name} (${dirConfig.path})`);

    if (!fs.existsSync(dirAbs)) {
      console.log('  Directory not found, skipping');
      summary[dirConfig.name] = catSummary;
      continue;
    }

    const files = findFilesRecursive(dirAbs, (name) => name.endsWith('.md'));
    console.log(`  Found ${files.length} .md files`);

    for (const filePath of files) {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const classification = classifyFile(filePath, content);

      if (classification.action === 'skip') {
        catSummary.skip++;
        continue;
      }

      const rel = relPath(filePath);
      const title = deriveTitle(filePath, content);

      // Collect tags
      const tagSet = new Set();

      // Type tag
      tagSet.add(`type/${dirConfig.type}`);

      // Source tag
      if (dirConfig.source) {
        tagSet.add(`source/${dirConfig.source}`);
      }

      // Preserve existing tags for enrich action
      if (classification.action === 'enrich-tags' && classification.existingTags) {
        for (const t of classification.existingTags) {
          tagSet.add(t);
        }
      }

      // Project tag from path
      const projectTag = deriveProjectTag(rel);
      if (projectTag) tagSet.add(projectTag);

      // Path-based tags (especially useful for research papers)
      const pathTags = derivePathTags(rel);
      for (const t of pathTags) tagSet.add(t);

      // Keyword-matched tags from content
      const keywordTags = matchKeywords(content, aliasMap, 2);
      for (const t of keywordTags) tagSet.add(t);

      // Cap domain tags at 5
      const allTags = [...tagSet];
      const domainTags = allTags.filter(t =>
        t.startsWith('condition/') || t.startsWith('region/') || t.startsWith('technique/')
      );
      const nonDomainTags = allTags.filter(t =>
        !t.startsWith('condition/') && !t.startsWith('region/') && !t.startsWith('technique/')
      );
      const cappedDomain = domainTags.slice(0, 5);
      const finalTags = [...nonDomainTags, ...cappedDomain];

      const op = {
        category: dirConfig.name,
        action: classification.action,
        path: rel,
        title,
      };

      if (classification.action === 'enrich-tags') {
        op.existingTags = classification.existingTags || [];
        // newTags = tags to add that are not already in existing
        op.newTags = finalTags;
        catSummary.enrich++;
      } else {
        // add-frontmatter
        op.newTags = finalTags;
        catSummary.add++;
      }

      operations.push(op);
    }

    summary[dirConfig.name] = catSummary;
    summary.total.enrich += catSummary.enrich;
    summary.total.add += catSummary.add;
    summary.total.skip += catSummary.skip;
    console.log(`  enrich: ${catSummary.enrich} | add: ${catSummary.add} | skip: ${catSummary.skip}`);
  }

  const manifest = {
    version: 1,
    sprint: '5B',
    generated: new Date().toISOString(),
    vault: VAULT,
    summary,
    operations,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('');
  console.log(`Manifest written to ${MANIFEST_PATH}`);
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Total enrich:  ${summary.total.enrich}`);
  console.log(`  Total add:     ${summary.total.add}`);
  console.log(`  Total skip:    ${summary.total.skip}`);
  console.log(`  Total ops:     ${operations.length}`);
  return manifest;
}


// --- Execute / Dry-Run Phase ---

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`No manifest found at ${MANIFEST_PATH}. Run scan mode first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  if (manifest.version !== 1) {
    console.error(`Unsupported manifest version: ${manifest.version}. Expected 1.`);
    process.exit(1);
  }
  return manifest;
}

function executeManifest(manifest, { dryRun = false } = {}) {
  const mode = dryRun ? 'DRY RUN' : 'EXECUTE';
  console.log(`=== Sprint 5B -- Tag & Frontmatter ${mode} ===`);
  console.log(`Total operations: ${manifest.operations.length}`);
  console.log('');

  // Load alias map for enrichment (needed to rebuild frontmatter)
  const aliasMap = loadTaxonomyAliases(TAXONOMY_PATH);

  // Group operations by category
  const groups = new Map();
  for (const op of manifest.operations) {
    if (!groups.has(op.category)) groups.set(op.category, []);
    groups.get(op.category).push(op);
  }

  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Process each category in SCOPE_DIRS order
  for (const dirConfig of SCOPE_DIRS) {
    const ops = groups.get(dirConfig.name);
    if (!ops || ops.length === 0) {
      console.log(`--- ${dirConfig.name} (0 operations, skipping) ---`);
      console.log('');
      continue;
    }

    console.log(`--- ${dirConfig.name} (${ops.length} operations) ---`);
    let success = 0;
    let errors = 0;

    for (const op of ops) {
      const absPath = path.join(VAULT, op.path);

      if (!fs.existsSync(absPath)) {
        console.log(`  SKIP (missing): ${op.path}`);
        totalSkipped++;
        continue;
      }

      try {
        if (dryRun) {
          // Preview
          if (op.action === 'add-frontmatter') {
            console.log(`  ADD FM: ${op.path}`);
            console.log(`    title: ${op.title}`);
            console.log(`    tags:  [${op.newTags.join(', ')}]`);
          } else if (op.action === 'enrich-tags') {
            const added = (op.newTags || []).filter(t => !(op.existingTags || []).includes(t));
            console.log(`  ENRICH: ${op.path}`);
            console.log(`    existing: [${(op.existingTags || []).join(', ')}]`);
            console.log(`    adding:   [${added.join(', ')}]`);
          }
          success++;
          continue;
        }

        // Execute
        let content = fs.readFileSync(absPath, 'utf-8');

        if (op.action === 'add-frontmatter') {
          const fm = buildFrontmatter(op.path, dirConfig, op.newTags, op.title);
          content = fm + content;
          fs.writeFileSync(absPath, content, 'utf-8');
          console.log(`  Added frontmatter: ${path.basename(op.path)}`);
        } else if (op.action === 'enrich-tags') {
          content = enrichTags(content, op.newTags);
          fs.writeFileSync(absPath, content, 'utf-8');
          console.log(`  Enriched tags: ${path.basename(op.path)}`);
        }

        success++;
      } catch (err) {
        console.error(`  ERROR: ${op.path} -- ${err.message}`);
        errors++;
        totalErrors++;
      }
    }

    totalSuccess += success;

    // Git commit per category (stage entire directory at once for HDD safety)
    if (!dryRun && success > 0) {
      const dirAbs = path.join(VAULT, dirConfig.path);
      try {
        gitAdd(dirAbs);
        const commitMsg = COMMIT_MESSAGES[dirConfig.name] || `Sprint 5B: update ${dirConfig.name}`;
        gitCommit(commitMsg);
        console.log(`  Committed: ${commitMsg}`);
      } catch (err) {
        console.log(`  Git commit skipped for ${dirConfig.name}: ${err.message}`);
      }
    }

    console.log(`  Results: ${success} ok, ${errors} errors`);
    console.log('');
  }

  console.log('=== Final Summary ===');
  console.log(`Success: ${totalSuccess}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Errors:  ${totalErrors}`);
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
