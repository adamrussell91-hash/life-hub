// Pure Studio document changes, shared by the Netlify function and the
// Knowledge app's local preview. No I/O here.
/** Mirror of STUDIO_STAGES in apps/knowledge/src/studio/schema.ts — keep in sync. */
export const STUDIO_STAGES = ['Just an Idea', 'Researching', 'Outlining', 'Writing', 'Completed'];
const PAGE_REF = /^(?:page_[A-Za-z0-9_-]{1,120}|notion:[0-9a-f]{32})$/;
const MAX_TITLE = 160;

function invalid(message, status = 400, code = 'validation_error') {
  return Object.assign(new Error(message), { status, code });
}

function cleanText(value, max, label) {
  if (typeof value !== 'string') throw invalid(`${label} is required.`);
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  if (!text) throw invalid(`${label} is required.`);
  return text;
}

export function emptyStudio() {
  return { schema_version: 1, books: [], notes: {}, decisions: {} };
}

export function parseStudioText(text) {
  if (!text) return emptyStudio();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw invalid('Studio data is not valid JSON.', 502, 'studio_corrupt');
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.books)) {
    throw invalid('Studio data is not in the expected shape.', 502, 'studio_corrupt');
  }
  return { ...doc, notes: doc.notes ?? {}, decisions: doc.decisions ?? {} };
}

function findBook(doc, bookId) {
  const book = doc.books.find(item => item.id === bookId);
  if (!book) throw invalid('That book idea is not on the shelf.', 404, 'not_found');
  return book;
}

function findChapter(book, index) {
  if (!Number.isInteger(index) || index < 0) throw invalid('Chapter must be a whole number.');
  let n = 0;
  for (const part of book.parts ?? []) {
    for (const chapter of part.chapters) {
      if (n === index) return chapter;
      n += 1;
    }
  }
  throw invalid('That chapter does not exist.', 404, 'not_found');
}

function slug(title, taken) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'idea';
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
  return id;
}

/** Apply one change to the Studio document. Pure: returns a new document. */
export function applyStudioOp(input, op, { now = new Date().toISOString() } = {}) {
  if (!op || typeof op !== 'object') throw invalid('A change is required.');
  const doc = structuredClone(input);
  switch (op.op) {
    case 'stage': {
      if (!STUDIO_STAGES.includes(op.stage)) throw invalid(`Stage must be one of ${STUDIO_STAGES.join(', ')}.`);
      findBook(doc, op.bookId).stage = op.stage;
      return doc;
    }
    case 'idea': {
      const title = cleanText(op.title, MAX_TITLE, 'A working title');
      const id = slug(title, new Set(doc.books.map(book => book.id)));
      doc.books.push({
        id,
        title,
        short: title.length > 40 ? `${title.slice(0, 39)}…` : title,
        subtitle: '',
        area: 'new',
        added: now.slice(0, 10),
        kind: 'blank',
        stage: 'Just an Idea',
        blurb: '',
        notes: []
      });
      return doc;
    }
    case 'link':
    case 'unlink': {
      const book = findBook(doc, op.bookId);
      const chapter = findChapter(book, op.chapter);
      const ref = typeof op.ref === 'string' ? op.ref.trim() : '';
      if (!PAGE_REF.test(ref)) throw invalid('A valid note id is required.');
      if (op.op === 'unlink') {
        chapter.notes = chapter.notes.filter(item => item !== ref);
        return doc;
      }
      if (!chapter.notes.includes(ref)) chapter.notes.push(ref);
      if (!book.notes.includes(ref)) book.notes.push(ref);
      const words = Number.isInteger(op.words) && op.words >= 0 ? Math.min(op.words, 500000) : 0;
      doc.notes[ref] = {
        ...(doc.notes[ref] ?? {}),
        title: cleanText(op.title ?? doc.notes[ref]?.title, 300, 'A note title'),
        words,
        in_knowledge: ref.startsWith('page_')
      };
      return doc;
    }
    case 'decide': {
      const id = cleanText(op.insightId, 300, 'An insight id');
      const choice = cleanText(op.choice, 40, 'A choice');
      doc.decisions[id] = { choice, at: now };
      return doc;
    }
    default:
      throw invalid('op must be "stage", "idea", "link", "unlink" or "decide".');
  }
}
