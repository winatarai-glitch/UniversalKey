// tools/lib/detect-language.mjs
// Wraps franc-min for fast ISO-639-3 detection, maps to our taxonomy's 2-letter codes.

import fs from 'node:fs';
import { franc } from 'franc-min';

const ISO3_TO_TAG = {
  eng: 'en',
  nno: 'no', nob: 'no', // Nynorsk / Bokmål → both mapped to "no"
  ita: 'it',
  fra: 'fr',
  deu: 'de', ger: 'de',
  spa: 'es',
  por: 'pt',
  rus: 'ru',
  nld: 'nl',
  pol: 'pl',
  ces: 'cs', cze: 'cs',
};

const NO_HINTS = [/norsk/i, /norwegian/i, /nakke/i, /rygg/i, /smerter/i, /hodepine/i];
const IT_HINTS = [/italian/i, /italiano/i, /chiropratica/i, /chiropratico/i, /mondo del/i];
const FR_HINTS = [/french/i, /français/i, /neurologie/i, /vertèbre/i, /colonne/i];

export function detectFromText(text) {
  if (!text || text.length < 20) return { lang: 'und', confidence: 0, source: 'too-short' };
  const snippet = text.slice(0, 4096);
  const iso3 = franc(snippet, { minLength: 10 });
  const tag = ISO3_TO_TAG[iso3] || iso3;
  return { lang: tag, confidence: iso3 === 'und' ? 0 : 0.9, source: 'franc' };
}

export function detectFromFilename(filename) {
  if (NO_HINTS.some((r) => r.test(filename))) return { lang: 'no', confidence: 0.4, source: 'filename' };
  if (IT_HINTS.some((r) => r.test(filename))) return { lang: 'it', confidence: 0.4, source: 'filename' };
  if (FR_HINTS.some((r) => r.test(filename))) return { lang: 'fr', confidence: 0.4, source: 'filename' };
  return { lang: 'und', confidence: 0, source: 'filename' };
}

export function detectFromFile(mdPath, { filename } = {}) {
  try {
    const text = fs.readFileSync(mdPath, 'utf8');
    const head = text.slice(0, 8192);
    const got = detectFromText(head);
    if (got.lang !== 'und') return got;
  } catch {
    // fall through to filename
  }
  return detectFromFilename(filename || mdPath);
}

export function languageHistogram(results) {
  const h = {};
  for (const r of results) {
    h[r.lang] = (h[r.lang] || 0) + 1;
  }
  return h;
}
