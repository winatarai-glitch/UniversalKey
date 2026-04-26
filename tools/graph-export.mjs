#!/usr/bin/env node
// tools/graph-export.mjs — Sprint B4
// Walk an Obsidian-style vault, extract wikilinks + frontmatter, emit graph
// data as JSON (D3 node-link with stable edge IDs), GraphML (pure dialect,
// no yEd extensions), Cypher (idempotent MERGE), and optional HTML viewer.
//
// Built-ins only — no npm. exFAT-safe sequential I/O.
//
// Usage:
//   node tools/graph-export.mjs --vault <path> [--output-dir <path>]
//                               [--output-formats json,graphml,cypher,html]
//                               [--subset N] [--link-weight frequency|unweighted]
//                               [--quiet]
//
// Default --output-dir is <vault>/wiki-export/.
// Default --output-formats is json,graphml,cypher (no html — opt in).

import fs from 'node:fs';
import path from 'node:path';

// ───────────────────────────── constants ──────────────────────────────

const VERSION = 1;
const GRAPH_SKIP_DIRS = new Set(['.git', '.obsidian', 'node_modules', '_archives']);
const VALID_FORMATS = new Set(['json', 'graphml', 'cypher', 'html']);
const VALID_WEIGHTS = new Set(['frequency', 'unweighted']);
const DEFAULT_FORMATS = ['json', 'graphml', 'cypher'];

// 3-group regex: [[target#heading|alias]] → {target, heading, alias}
// Non-greedy quantifiers prevent cross-group bleed. Captures the canonical
// piece of each segment without consuming the closing brackets.
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;

// ───────────────────────────── CLI parsing ────────────────────────────

function parseArgs(argv) {
  const args = { vault: null, outputDir: null, formats: null, subset: null, linkWeight: 'frequency', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--vault': args.vault = argv[++i]; break;
      case '--output-dir': args.outputDir = argv[++i]; break;
      case '--output-formats': args.formats = argv[++i].split(',').map(s => s.trim()).filter(Boolean); break;
      case '--subset': args.subset = parseInt(argv[++i], 10); break;
      case '--link-weight': args.linkWeight = argv[++i]; break;
      case '--quiet': args.quiet = true; break;
      case '--help': case '-h':
        printHelp(); process.exit(0); break;
      default:
        if (a.startsWith('--')) { console.error(`Unknown flag: ${a}`); process.exit(2); }
    }
  }
  if (!args.vault) { console.error('Required: --vault <path>'); process.exit(2); }
  if (!fs.existsSync(args.vault) || !fs.statSync(args.vault).isDirectory()) {
    console.error(`Vault path not a directory: ${args.vault}`); process.exit(2);
  }
  args.formats = args.formats || DEFAULT_FORMATS;
  for (const f of args.formats) {
    if (!VALID_FORMATS.has(f)) { console.error(`Unknown format: ${f}`); process.exit(2); }
  }
  if (!VALID_WEIGHTS.has(args.linkWeight)) { console.error(`Unknown weight: ${args.linkWeight}`); process.exit(2); }
  args.outputDir = args.outputDir || path.join(args.vault, 'wiki-export');
  args.vault = path.resolve(args.vault);
  args.outputDir = path.resolve(args.outputDir);
  return args;
}

function printHelp() {
  console.log(`graph-export.mjs — Sprint B4
Usage: node tools/graph-export.mjs --vault <path> [options]
  --vault <path>           Required. Vault root.
  --output-dir <path>      Default: <vault>/wiki-export/.
  --output-formats LIST    Default: json,graphml,cypher (add ,html to include viewer).
  --subset N               Walk first N .md files only (alphabetical, for benchmarking).
  --link-weight MODE       frequency (default) | unweighted.
  --quiet                  Suppress progress logs.`);
}

// ───────────────────────────── walker (.md only) ──────────────────────

function walkMarkdown(root, { subset = null, skipDirs = GRAPH_SKIP_DIRS } = {}) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name)); // determinism
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue;
        stack.push(abs);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        out.push(abs);
        if (subset !== null && out.length >= subset) return out.sort();
      }
    }
  }
  return out.sort();
}

// ───────────────────────────── frontmatter parser (built-ins only) ────

function parseFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { fields: {}, bodyStart: 0 };
  }
  const endLF = content.indexOf('\n---\n', 4);
  const endCRLF = content.indexOf('\r\n---\r\n', 4);
  let endIdx, bodyStart;
  if (endLF !== -1 && (endCRLF === -1 || endLF < endCRLF)) {
    endIdx = endLF; bodyStart = endLF + 5;
  } else if (endCRLF !== -1) {
    endIdx = endCRLF; bodyStart = endCRLF + 7;
  } else {
    return { fields: {}, bodyStart: 0 };
  }
  const fmBlock = content.substring(content.indexOf('\n') + 1, endIdx);
  const fields = {};
  let pendingListKey = null;
  for (const line of fmBlock.split(/\r?\n/)) {
    // Indented lines belong to the current list / nested object. They MUST
    // NOT overwrite top-level fields (this was a v1 bug that misread
    // `relations: [{type: extends}]` as the page's `type`).
    if (/^\s/.test(line)) {
      if (pendingListKey) {
        const listMatch = line.match(/^\s+-\s*(.*)$/);
        if (listMatch) {
          let v = listMatch[1].trim();
          // Skip object-shaped list items (e.g., `- target: "[[x]]"`).
          // We only capture scalar list values for now.
          if (v && !/^\w[\w-]*\s*:/.test(v)) {
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            fields[pendingListKey].push(v);
          }
        }
      }
      continue;
    }
    pendingListKey = null;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    let val = line.substring(colonIdx + 1).trim();
    if (!val) { fields[key] = []; pendingListKey = key; continue; }
    if (val.startsWith('[') && val.endsWith(']')) {
      fields[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    fields[key] = val;
  }
  return { fields, bodyStart };
}

// ───────────────────────────── helpers ────────────────────────────────

function normalizeId(absPath, vaultRoot) {
  const rel = path.relative(vaultRoot, absPath).replace(/\\/g, '/');
  return rel.replace(/\.md$/i, '').toLowerCase();
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')   // MUST be first
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCypherString(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/`/g, '_');      // strip backticks (no portable Cypher escape)
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return [v];
}

// ───────────────────────────── graph builder ──────────────────────────

function buildGraph(args) {
  const { vault, subset, linkWeight, quiet } = args;
  const log = quiet ? () => {} : (...a) => console.error(...a);

  log(`[graph-export] walking ${vault}…`);
  const files = walkMarkdown(vault, { subset });
  log(`[graph-export] found ${files.length} .md files`);

  // Pass 1: build node table keyed by canonical id.
  const nodes = new Map(); // id → node object
  const aliasIndex = new Map(); // alias-or-basename (lowercased) → id
  const stems = new Map(); // basename stem (lowercased) → id (for [[bppv]] resolution)

  for (const abs of files) {
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const { fields } = parseFrontmatter(content);
    const id = normalizeId(abs, vault);
    const stem = path.basename(abs, '.md').toLowerCase();
    const tags = asArray(fields.tags);
    const aliases = asArray(fields.aliases);

    let mtime = '';
    try { mtime = fs.statSync(abs).mtime.toISOString(); } catch {}

    const node = {
      id,
      title: fields.title || path.basename(abs, '.md'),
      date: fields.date || '',
      type: fields.type || 'unknown',
      source: fields.source || '',
      status: fields.status || 'raw',
      visibility: fields.visibility || 'private',
      confidence: fields.confidence || '',
      tags, aliases,
      tag_count: tags.length,
      alias_count: aliases.length,
      mtime,
    };
    nodes.set(id, node);
    stems.set(stem, id);
    for (const a of aliases) aliasIndex.set(String(a).toLowerCase(), id);
  }

  // Pass 2: extract wikilinks per file body, build edges, dedupe + count.
  const edgeMap = new Map(); // `${source}|${target}|${heading||''}` → edge object
  let unresolved = 0;

  for (const abs of files) {
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const { bodyStart } = parseFrontmatter(content);
    const body = content.substring(bodyStart);
    const sourceId = normalizeId(abs, vault);

    WIKILINK_RE.lastIndex = 0;
    let m;
    while ((m = WIKILINK_RE.exec(body)) !== null) {
      const rawTarget = m[1].trim();
      const heading = m[2] ? m[2].trim() : null;
      const alias = m[3] ? m[3].trim() : null;
      const targetId = resolveTarget(rawTarget, nodes, stems, aliasIndex);
      if (!targetId) { unresolved++; continue; }
      const k = `${sourceId}|${targetId}|${heading || ''}`;
      if (edgeMap.has(k)) {
        edgeMap.get(k).weight += 1;
      } else {
        edgeMap.set(k, { source: sourceId, target: targetId, heading, alias, weight: 1 });
      }
    }
  }

  // Apply link-weight policy.
  if (linkWeight === 'unweighted') {
    for (const e of edgeMap.values()) e.weight = 1;
  }

  // Sort for determinism + assign stable edge IDs.
  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edgeMap.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    return String(a.heading || '').localeCompare(String(b.heading || ''));
  });
  sortedEdges.forEach((e, i) => { e.id = `e_${String(i + 1).padStart(6, '0')}`; });

  log(`[graph-export] nodes=${sortedNodes.length} edges=${sortedEdges.length} unresolved-targets=${unresolved}`);
  return { nodes: sortedNodes, edges: sortedEdges, unresolved };
}

function resolveTarget(raw, nodes, stems, aliasIndex) {
  // Try canonical id (slash-separated, lowercased), then bare basename, then alias.
  const lc = raw.toLowerCase();
  if (nodes.has(lc)) return lc;
  if (stems.has(lc)) return stems.get(lc);
  if (aliasIndex.has(lc)) return aliasIndex.get(lc);
  // Last resort: try basename of the raw path (handles [[concepts/BPPV]] variations).
  const base = lc.split('/').pop();
  if (stems.has(base)) return stems.get(base);
  return null;
}

// ───────────────────────────── emitters ───────────────────────────────

function emitJson(graph, vault) {
  // No `exported_at` — would break determinism (I15 round-trip). Run-time
  // archaeology lives in file mtime / git history, not in the artifact.
  const meta = { vault: vault.replace(/\\/g, '/'), tool: 'graph-export.mjs', version: VERSION };
  // Match D3 node-link convention: nodes[].id, links[].source/.target.
  const links = graph.edges.map(e => ({ id: e.id, source: e.source, target: e.target, alias: e.alias, heading: e.heading, weight: e.weight }));
  return JSON.stringify({ meta, nodes: graph.nodes, links }, null, 2) + '\n';
}

function emitGraphML(graph) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="d_title" for="node" attr.name="title" attr.type="string"/>',
    '  <key id="d_date" for="node" attr.name="date" attr.type="string"/>',
    '  <key id="d_type" for="node" attr.name="type" attr.type="string"/>',
    '  <key id="d_source" for="node" attr.name="source" attr.type="string"/>',
    '  <key id="d_status" for="node" attr.name="status" attr.type="string"/>',
    '  <key id="d_visibility" for="node" attr.name="visibility" attr.type="string"/>',
    '  <key id="d_confidence" for="node" attr.name="confidence" attr.type="string"/>',
    '  <key id="d_tags" for="node" attr.name="tags" attr.type="string"/>',
    '  <key id="d_aliases" for="node" attr.name="aliases" attr.type="string"/>',
    '  <key id="d_tag_count" for="node" attr.name="tag_count" attr.type="int"/>',
    '  <key id="d_alias_count" for="node" attr.name="alias_count" attr.type="int"/>',
    '  <key id="d_mtime" for="node" attr.name="mtime" attr.type="string"/>',
    '  <key id="d_weight" for="edge" attr.name="weight" attr.type="int"/>',
    '  <key id="d_alias" for="edge" attr.name="alias" attr.type="string"/>',
    '  <key id="d_heading" for="edge" attr.name="heading" attr.type="string"/>',
    '  <graph id="G" edgedefault="directed">',
  ];
  for (const n of graph.nodes) {
    lines.push(`    <node id="${escapeXml(n.id)}">`);
    lines.push(`      <data key="d_title">${escapeXml(n.title)}</data>`);
    if (n.date) lines.push(`      <data key="d_date">${escapeXml(n.date)}</data>`);
    lines.push(`      <data key="d_type">${escapeXml(n.type)}</data>`);
    if (n.source) lines.push(`      <data key="d_source">${escapeXml(n.source)}</data>`);
    lines.push(`      <data key="d_status">${escapeXml(n.status)}</data>`);
    lines.push(`      <data key="d_visibility">${escapeXml(n.visibility)}</data>`);
    if (n.confidence) lines.push(`      <data key="d_confidence">${escapeXml(n.confidence)}</data>`);
    lines.push(`      <data key="d_tags">${escapeXml(JSON.stringify(n.tags))}</data>`);
    lines.push(`      <data key="d_aliases">${escapeXml(JSON.stringify(n.aliases))}</data>`);
    lines.push(`      <data key="d_tag_count">${n.tag_count}</data>`);
    lines.push(`      <data key="d_alias_count">${n.alias_count}</data>`);
    if (n.mtime) lines.push(`      <data key="d_mtime">${escapeXml(n.mtime)}</data>`);
    lines.push('    </node>');
  }
  for (const e of graph.edges) {
    lines.push(`    <edge id="${escapeXml(e.id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">`);
    lines.push(`      <data key="d_weight">${e.weight}</data>`);
    if (e.alias) lines.push(`      <data key="d_alias">${escapeXml(e.alias)}</data>`);
    if (e.heading) lines.push(`      <data key="d_heading">${escapeXml(e.heading)}</data>`);
    lines.push('    </edge>');
  }
  lines.push('  </graph>');
  lines.push('</graphml>');
  lines.push('');
  return lines.join('\n');
}

function emitCypher(graph) {
  const lines = [];
  lines.push('// graph-export.mjs Cypher emission — Sprint B4');
  lines.push('// Idempotent: safe to re-run (MERGE updates in place).');
  lines.push('');
  for (const n of graph.nodes) {
    const setProps = [
      `title: '${escapeCypherString(n.title)}'`,
      `type: '${escapeCypherString(n.type)}'`,
      `status: '${escapeCypherString(n.status)}'`,
      `visibility: '${escapeCypherString(n.visibility)}'`,
      `tags: [${n.tags.map(t => `'${escapeCypherString(t)}'`).join(', ')}]`,
      `aliases: [${n.aliases.map(a => `'${escapeCypherString(a)}'`).join(', ')}]`,
      `tag_count: ${n.tag_count}`,
      `alias_count: ${n.alias_count}`,
    ];
    if (n.date) setProps.push(`date: '${escapeCypherString(n.date)}'`);
    if (n.source) setProps.push(`source: '${escapeCypherString(n.source)}'`);
    if (n.confidence) setProps.push(`confidence: '${escapeCypherString(n.confidence)}'`);
    if (n.mtime) setProps.push(`mtime: '${escapeCypherString(n.mtime)}'`);
    lines.push(`MERGE (n:Note {key: '${escapeCypherString(n.id)}'}) SET n += {${setProps.join(', ')}};`);
  }
  for (const e of graph.edges) {
    const eProps = [`weight: ${e.weight}`];
    if (e.alias) eProps.push(`alias: '${escapeCypherString(e.alias)}'`);
    if (e.heading) eProps.push(`heading: '${escapeCypherString(e.heading)}'`);
    lines.push(`MATCH (a:Note {key: '${escapeCypherString(e.source)}'}), (b:Note {key: '${escapeCypherString(e.target)}'}) MERGE (a)-[r:LINKS_TO {edge_id: '${e.id}'}]->(b) SET r += {${eProps.join(', ')}};`);
  }
  lines.push('');
  return lines.join('\n');
}

function emitHtml(graph) {
  // Minimal vis-network viewer. Self-contained except for the CDN script.
  // Escape `<` in the JSON literal so a node title containing `</script>`
  // can't break out of the embedding script tag.
  const dataLiteral = JSON.stringify({
    nodes: graph.nodes.map(n => ({ id: n.id, label: n.title, group: n.type, title: `${n.title}\n${n.tags.join(', ')}` })),
    edges: graph.edges.map(e => ({ from: e.source, to: e.target, value: e.weight, title: e.alias || '' })),
  }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Vault graph (${graph.nodes.length} nodes, ${graph.edges.length} edges)</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>html,body,#net{height:100%;margin:0;font-family:sans-serif} #hud{position:fixed;top:0;left:0;background:#fff8;padding:6px;font-size:12px;}</style>
</head>
<body>
<div id="hud">${graph.nodes.length} nodes · ${graph.edges.length} edges · Sprint B4</div>
<div id="net"></div>
<script>
const data = ${dataLiteral};
const container = document.getElementById('net');
const network = new vis.Network(container, data, {
  nodes: { shape: 'dot', size: 8, font: { size: 10 } },
  edges: { arrows: 'to', smooth: false, color: { opacity: 0.4 } },
  physics: { stabilization: { iterations: 100 }, barnesHut: { gravitationalConstant: -2000 } },
  interaction: { hover: true, tooltipDelay: 100 },
});
</script>
</body>
</html>
`;
}

// ───────────────────────────── orchestration ──────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => {} : (...a) => console.error(...a);

  if (!fs.existsSync(args.outputDir)) fs.mkdirSync(args.outputDir, { recursive: true });

  const t0 = Date.now();
  const graph = buildGraph(args);
  const tBuild = Date.now() - t0;

  const writeAtomic = (filename, body) => {
    const dest = path.join(args.outputDir, filename);
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, dest);
    log(`[graph-export] wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KiB)`);
  };

  for (const fmt of args.formats) {
    if (fmt === 'json') writeAtomic('graph.json', emitJson(graph, args.vault));
    if (fmt === 'graphml') writeAtomic('graph.graphml', emitGraphML(graph));
    if (fmt === 'cypher') writeAtomic('cypher.txt', emitCypher(graph));
    if (fmt === 'html') writeAtomic('graph.html', emitHtml(graph));
  }

  const tTotal = Date.now() - t0;
  log(`[graph-export] done in ${tTotal}ms (build=${tBuild}ms write=${tTotal - tBuild}ms)`);
}

main();
