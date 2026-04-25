// tools/lib/frontmatter-v2.mjs
// Build, validate, and normalize v2 frontmatter per _meta/confidence.md + the
// patterns observed on haavik-heidi.md and gonstead.md.

import yaml from 'js-yaml';
import matter from 'gray-matter';
import fs from 'node:fs';

const ALLOWED_TYPES = new Set([
  'entity', 'concept', 'skill', 'reference', 'synthesis', 'journal',
  'meta', 'scan-report', 'note', 'book-chapter',
  'conversation', 'ai-conversation',
]);

const ALLOWED_CATEGORIES = new Set([
  'faculty', 'technique-family', 'course', 'book', 'organization',
  'condition', 'tool', 'concept', 'skill', 'reference',
]);

const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low', 'contested']);
const ALLOWED_TIER = new Set(['working', 'episodic', 'semantic', 'procedural', 'unverified']);

const REQUIRED_KEYS = ['title', 'type', 'created', 'updated'];
const REQUIRED_ENTITY_KEYS = ['category', 'tags'];

export function build(fields) {
  const today = new Date().toISOString().slice(0, 10);
  const out = {
    title: fields.title,
    type: fields.type || 'entity',
    ...(fields.category ? { category: fields.category } : {}),
    ...(fields.slug ? { slug: fields.slug } : {}),
    ...(fields.tags ? { tags: fields.tags } : {}),
    ...(fields.aliases ? { aliases: fields.aliases } : {}),
    ...(fields.affiliation ? { affiliation: fields.affiliation } : {}),
    ...(fields.role ? { role: fields.role } : {}),
    created: fields.created || today,
    updated: fields.updated || today,
    ...(fields.confidence ? { confidence: fields.confidence } : { confidence: 'low' }),
    ...(fields.source_count != null ? { source_count: fields.source_count } : { source_count: 1 }),
    ...(fields.last_confirmed ? { last_confirmed: fields.last_confirmed } : { last_confirmed: today }),
    ...(fields.sources ? { sources: fields.sources } : {}),
    ...(fields.language ? { language: fields.language } : {}),
    ...(fields.tier ? { tier: fields.tier } : { tier: 'semantic' }),
    ...(fields.supersedes !== undefined ? { supersedes: fields.supersedes } : { supersedes: null }),
    ...(fields.superseded_by !== undefined ? { superseded_by: fields.superseded_by } : { superseded_by: null }),
    ...(fields.relations ? { relations: fields.relations } : { relations: [] }),
    ...(fields.translated_from ? { translated_from: fields.translated_from } : {}),
    ...(fields.translated_by ? { translated_by: fields.translated_by } : {}),
    ...(fields.translated_at ? { translated_at: fields.translated_at } : {}),
    ...(fields.scan_root ? { scan_root: fields.scan_root } : {}),
    ...(fields.entity_page ? { entity_page: fields.entity_page } : {}),
  };
  return out;
}

export function toYamlBlock(fields) {
  return '---\n' + yaml.dump(build(fields), { lineWidth: 120, noRefs: true }) + '---\n';
}

// Parse + validate existing markdown page's frontmatter. Returns { ok, errors, data, content }.
export function validate(source) {
  const errors = [];
  const parsed = matter(source);
  const data = parsed.data || {};
  for (const k of REQUIRED_KEYS) if (!data[k]) errors.push(`missing required key: ${k}`);
  if (data.type && !ALLOWED_TYPES.has(data.type)) errors.push(`unknown type: ${data.type}`);
  if (data.type === 'entity') {
    for (const k of REQUIRED_ENTITY_KEYS) if (!data[k]) errors.push(`entity missing: ${k}`);
    if (data.category && !ALLOWED_CATEGORIES.has(data.category)) {
      errors.push(`unknown category: ${data.category}`);
    }
  }
  if (data.confidence && !ALLOWED_CONFIDENCE.has(data.confidence)) {
    errors.push(`unknown confidence: ${data.confidence}`);
  }
  if (data.tier && !ALLOWED_TIER.has(data.tier)) {
    errors.push(`unknown tier: ${data.tier}`);
  }
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('tags must be an array');
  }
  return { ok: errors.length === 0, errors, data, content: parsed.content };
}

// Best-effort v1 → v2 upgrade. Preserves extra keys. Fills defaults.
export function normalize(source) {
  const parsed = matter(source);
  const d = { ...parsed.data };
  if (!d.type) d.type = 'entity';
  if (!d.tier) d.tier = 'semantic';
  if (!d.confidence) d.confidence = d.tags && d.tags.find((t) => /confidence\//.test(t))
    ? d.tags.find((t) => /confidence\//.test(t)).replace('confidence/', '')
    : 'low';
  if (d.source_count == null) d.source_count = 1;
  const today = new Date().toISOString().slice(0, 10);
  if (!d.last_confirmed) d.last_confirmed = today;
  if (!d.created) d.created = today;
  if (!d.updated) d.updated = today;
  if (d.supersedes === undefined) d.supersedes = null;
  if (d.superseded_by === undefined) d.superseded_by = null;
  if (!d.relations) d.relations = [];
  return { frontmatter: d, content: parsed.content };
}

export function stringify(frontmatter, body) {
  const y = yaml.dump(frontmatter, { lineWidth: 120, noRefs: true });
  return `---\n${y}---\n\n${body.replace(/^\n+/, '')}`;
}

// --- M4.5 Lineage helpers -------------------------------------------------

export const LINEAGE_EDGE_TYPES = Object.freeze([
  'extends',
  'refines',
  'contradicts',
  'challenges',
  'historical-basis-for',
  'predates',
  'reinforced-by',
]);

export const LINEAGE_EDGE_TYPE_SET = new Set(LINEAGE_EDGE_TYPES);

// --- Session 47 concept-layer edges --------------------------------------
// Grafted onto relations[] alongside LINEAGE_EDGE_TYPES. Same {target, type,
// confidence, note?} shape; no explicit reverse edges (rely on Obsidian
// backlinks for reverse traversal).

export const CONCEPT_EDGE_TYPES = Object.freeze([
  // Clinical reasoning
  'assesses',              // technique/test assesses concept (gonstead assesses pelvic-torsion)
  'tests',                 // test-page tests concept (thomas-test tests hip-flexor-length)
  'treats',                // technique treats concept-or-condition
  'indicated-in',          // technique indicated-in condition-or-concept
  'contraindicated-in',    // technique contraindicated-in condition-or-concept
  // Structural
  'part-of',               // concept hierarchy (iliopsoas part-of deep-hip-flexors)
  'requires-prerequisite', // learning dependency (net requires-prerequisite applied-kinesiology)
  // Functional
  'innervated-by',         // anatomy edge (psoas innervated-by lumbar-plexus-l1-l3)
  'opposes',               // functional antagonism (psoas opposes glute-max)
  'synergist-with',        // functional cooperation
]);

export const CONCEPT_EDGE_TYPE_SET = new Set(CONCEPT_EDGE_TYPES);

export const ALL_RELATION_TYPES = Object.freeze([
  ...LINEAGE_EDGE_TYPES,
  ...CONCEPT_EDGE_TYPES,
]);

export const ALL_RELATION_TYPE_SET = new Set(ALL_RELATION_TYPES);

// Parse a wikilink string like "[[slug]]" or "[[slug|alias]]". Returns slug or null.
export function parseWikilink(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  return m ? m[1].trim() : null;
}

// Validate a single lineage edge. Returns { ok, reason } or { ok: true, target }.
export function validateEdge(edge) {
  if (!edge || typeof edge !== 'object') return { ok: false, reason: 'not-an-object' };
  const target = parseWikilink(edge.target);
  if (!target) return { ok: false, reason: 'target-not-wikilink' };
  if (!ALL_RELATION_TYPE_SET.has(edge.type)) return { ok: false, reason: `bad-type:${edge.type}` };
  const c = Number(edge.confidence);
  if (!Number.isFinite(c) || c < 0 || c > 1) return { ok: false, reason: 'confidence-out-of-range' };
  if (c < 0.5 && !edge.note) return { ok: false, reason: 'low-confidence-needs-note' };
  if (edge.note != null && String(edge.note).length > 200) return { ok: false, reason: 'note-too-long' };
  return { ok: true, target };
}

// Read the relations[] array from a page's frontmatter. Returns [] if missing or malformed.
// readRelations/writeRelations are the one I/O surface of this module — lineage tooling needs
// path-keyed ops and duplicating gray-matter plumbing across two tools would be worse.
export function readRelations(pageAbsPath) {
  const src = fs.readFileSync(pageAbsPath, 'utf8');
  const parsed = matter(src);
  const rels = Array.isArray(parsed.data?.relations) ? parsed.data.relations : [];
  return rels;
}

// Merge incoming edges into existing relations[], de-duping by (target, type).
// Returns { added, skipped, final }. Invalid incoming edges are skipped (not thrown).
export function mergeRelations(existing, incoming) {
  const key = (e) => `${parseWikilink(e.target)}|${e.type}`;
  const seen = new Map((existing || []).map((e) => [key(e), e]));
  const added = [];
  const skipped = [];
  for (const e of incoming || []) {
    const v = validateEdge(e);
    if (!v.ok) { skipped.push({ edge: e, reason: v.reason }); continue; }
    if (seen.has(key(e))) { skipped.push({ edge: e, reason: 'duplicate' }); continue; }
    seen.set(key(e), e);
    added.push(e);
  }
  return { added, skipped, final: [...seen.values()] };
}

// Write relations[] back to a page, preserving all other frontmatter keys and the body.
export function writeRelations(pageAbsPath, relations) {
  const src = fs.readFileSync(pageAbsPath, 'utf8');
  const parsed = matter(src);
  const data = { ...parsed.data, relations };
  fs.writeFileSync(pageAbsPath, stringify(data, parsed.content), 'utf8');
}

export {
  ALLOWED_TYPES, ALLOWED_CATEGORIES, ALLOWED_CONFIDENCE, ALLOWED_TIER,
  REQUIRED_KEYS, REQUIRED_ENTITY_KEYS,
};
