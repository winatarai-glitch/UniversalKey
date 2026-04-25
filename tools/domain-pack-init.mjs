#!/usr/bin/env node
/**
 * tools/domain-pack-init.mjs
 *
 * Bootstrap a new domain pack from _meta/domain-packs/_template.md.
 * Updates _meta/taxonomy.md to point active_pack: at the new pack.
 *
 * Usage:
 *   node tools/domain-pack-init.mjs <pack-name>
 *
 * Example:
 *   node tools/domain-pack-init.mjs finance
 *   # Creates _meta/domain-packs/finance.md (copy of _template.md)
 *   # Updates _meta/taxonomy.md frontmatter active_pack: finance
 *
 * The pack name must match: ^[a-z][a-z0-9-]*$ (lowercase, alphanumeric + hyphen).
 */

import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { existsSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UK_ROOT = dirname(__dirname);

const PACK_NAME_RE = /^[a-z][a-z0-9-]*$/;

async function main() {
  const packName = process.argv[2];
  if (!packName) {
    console.error('Usage: node tools/domain-pack-init.mjs <pack-name>');
    console.error('Example: node tools/domain-pack-init.mjs finance');
    process.exit(1);
  }
  if (!PACK_NAME_RE.test(packName)) {
    console.error(`ERROR: pack name must match ${PACK_NAME_RE} — got: "${packName}"`);
    process.exit(1);
  }
  if (packName === '_template' || packName === 'README') {
    console.error(`ERROR: "${packName}" is reserved.`);
    process.exit(1);
  }

  const templateFile = join(UK_ROOT, '_meta', 'domain-packs', '_template.md');
  const targetFile = join(UK_ROOT, '_meta', 'domain-packs', `${packName}.md`);
  const taxonomyFile = join(UK_ROOT, '_meta', 'taxonomy.md');

  // Pre-flight checks
  if (!existsSync(templateFile)) {
    console.error(`ERROR: template missing: ${templateFile}`);
    process.exit(1);
  }
  if (existsSync(targetFile)) {
    console.error(`ERROR: pack already exists: ${targetFile}`);
    console.error('Refusing to overwrite. Edit the existing file directly.');
    process.exit(1);
  }
  if (!existsSync(taxonomyFile)) {
    console.error(`ERROR: taxonomy file missing: ${taxonomyFile}`);
    process.exit(1);
  }

  // 1. Copy template → pack file
  await copyFile(templateFile, targetFile);
  console.log(`created  _meta/domain-packs/${packName}.md  (copied from _template.md)`);

  // 2. Substitute <PACK_NAME> + <pack-name> tokens in the new file's frontmatter
  let content = await readFile(targetFile, 'utf8');
  content = content
    .replace(/<PACK_NAME>/g, packName.charAt(0).toUpperCase() + packName.slice(1))
    .replace(/<pack-name>/g, packName);
  await writeFile(targetFile, content, 'utf8');
  console.log(`         token substitution applied (<PACK_NAME>, <pack-name>)`);

  // 3. Update _meta/taxonomy.md frontmatter active_pack: <packName>
  let tax = await readFile(taxonomyFile, 'utf8');
  const fmMatch = tax.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    console.error(`ERROR: taxonomy.md has no frontmatter — cannot update active_pack:`);
    process.exit(1);
  }
  let fm = fmMatch[1];
  if (/^active_pack:/m.test(fm)) {
    fm = fm.replace(/^active_pack:.*$/m, `active_pack: ${packName}`);
  } else {
    fm = fm + `\nactive_pack: ${packName}`;
  }
  tax = tax.replace(fmMatch[0], `---\n${fm}\n---`);
  await writeFile(taxonomyFile, tax, 'utf8');
  console.log(`updated  _meta/taxonomy.md  (active_pack: ${packName})`);

  // 4. Print next steps
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit _meta/domain-packs/${packName}.md and fill in:`);
  console.log('     - Domain-specific tag namespaces and values');
  console.log('     - Domain-specific extensions to core type/, audience/, status/, source/');
  console.log('     - Domain-specific relation edges (e.g. cites, treats, regulates)');
  console.log('     - (Optional) Multilingual aliases for keyword matching');
  console.log(`  2. Update .env: ACTIVE_PACK=${packName}`);
  console.log('  3. Run: node tools/extract-from-source.mjs verify');
  console.log('  4. (Optional) Run: node tools/extract-from-source.mjs scaffold');
}

main().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
