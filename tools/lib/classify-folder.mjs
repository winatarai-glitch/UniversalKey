// tools/lib/classify-folder.mjs
// Heuristic classifier for top-level Mega Mind folder types.
//
// Returns: { type: 'technique' | 'faculty' | 'course' | 'book' | 'organization' | 'mixed',
//            confidence: 0-1,
//            hints: string[] }
//
// Pure function. Unit-testable. Does not read the filesystem itself —
// callers pass the folder name + an optional summary of its file mix.

const TECHNIQUE_KEYWORDS = [
  'technique', 'method', 'approach', 'system', 'protocol',
  'gonstead', 'activator', 'thompson', 'sot', 'dns', 'ak',
  'applied kinesiology', 'motion palpation', 'fascial manipulation',
  'mckenzie', 'mulligan', 'bppv', 'cranio', 'torque release',
  'network spinal', 'neuroimpulse', 'multi-layers', 'total body modification',
  'contact reflex', 'functional medicine', 'functional neurology',
  'dry needling', 'iastm', 'shockwave', 'bio energetic', 'bio-geometric',
  'neural organization', 'koren specific', '3dbios',
];

const COURSE_KEYWORDS = [
  'masterclass', 'summit', 'seminar', 'course', 'virtual', 'on demand',
  'level 1', 'level 2', 'level 3', 'module', 'workshop', 'conference',
  'mastersession', 'happy patient', 'apex chiro',
];

const BOOK_KEYWORDS = [
  'books and papers', 'textbook', 'book',
];

// Generic organization keywords. Extend per your domain pack — see
// _meta/domain-packs/<pack>.md for domain-specific org slugs.
const ORG_KEYWORDS = [
  'institute', 'college', 'association', 'federation', 'academy',
  'society', 'foundation', 'consortium', 'council',
];

// Faculty: a folder named after a person (FirstName LastName) with a
// personal-record file inventory (few files, mostly PDFs/articles). This is
// inferred from filename tokens — the caller still has final say.
const FACULTY_PATTERN = /^([A-Z][a-zÀ-ÿ'\-]+)(?:\s+[A-Z][a-zÀ-ÿ'\-]+){1,3}$/;

function hasAny(hay, needles) {
  const low = hay.toLowerCase();
  return needles.some((n) => low.includes(n));
}

export function classifyFolder(folderName, summary = null) {
  const hints = [];
  const scores = { technique: 0, faculty: 0, course: 0, book: 0, organization: 0 };
  const name = folderName.replace(/[\\/]+$/, '').trim();
  const low = name.toLowerCase();

  if (hasAny(name, TECHNIQUE_KEYWORDS)) { scores.technique += 0.5; hints.push('technique-keyword'); }
  if (hasAny(name, COURSE_KEYWORDS)) { scores.course += 0.5; hints.push('course-keyword'); }
  if (hasAny(name, BOOK_KEYWORDS)) { scores.book += 0.7; hints.push('book-keyword'); }
  if (hasAny(name, ORG_KEYWORDS)) { scores.organization += 0.5; hints.push('organization-keyword'); }

  // Acronym at start suggests technique or organization (e.g. "DNS -", "AK -", "MPI -").
  if (/^[A-Z]{2,5}\s*[-–]/.test(name)) {
    scores.technique += 0.25;
    scores.organization += 0.15;
    hints.push('leading-acronym');
  }

  // Person-like naming ("Heidi Haavik", "Jesper Dahl - series").
  if (FACULTY_PATTERN.test(name.split(/\s*[-–]\s*/)[0])) {
    scores.faculty += 0.5;
    hints.push('person-name-pattern');
  }

  if (summary && summary.perCategory) {
    const pc = summary.perCategory;
    const videoCount = pc.video?.count || 0;
    const docCount = (pc.pdf?.count || 0) + (pc.office?.count || 0) + (pc['office-legacy']?.count || 0);
    const imgCount = pc.image?.count || 0;
    const total = summary.fileCount || 1;

    // >= 60% video → course or technique-family
    if (videoCount / total >= 0.6) {
      scores.course += 0.3;
      scores.technique += 0.15;
      hints.push(`video-heavy(${videoCount}/${total})`);
    }
    // Lots of PDFs/images with few videos → technique family or book
    if (docCount >= 10 && videoCount <= 5) {
      scores.technique += 0.2;
      scores.book += 0.15;
      hints.push(`text-heavy(docs=${docCount}, vids=${videoCount})`);
    }
    // Imbalanced: >50 PDFs + few others and a personal name → book (treatise)
    if ((pc.pdf?.count || 0) > 40 && FACULTY_PATTERN.test(name)) {
      scores.book += 0.3;
      hints.push('probable-book-collection');
    }
  }

  // Pick best.
  let best = 'mixed';
  let bestScore = 0.2; // threshold
  for (const [t, s] of Object.entries(scores)) {
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }

  return {
    type: best,
    confidence: Math.min(bestScore, 1),
    hints,
    scores,
  };
}
