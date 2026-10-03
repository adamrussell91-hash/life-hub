// Bookshelf metadata for Knowledge Hub: facts about each book (pages, chapters,
// notebook, reading position) and where each book note sits inside its book
// (page, stance, gaps, themes, last opened). Notes themselves stay in the data
// repo; this store only places them.

export const KNOWLEDGE_SHELF_STORE = 'knowledge-shelf';
export const BOOKS_KEY = 'books';
export const PLACEMENTS_KEY = 'placements';

export const SHELF_STANCES = ['supports', 'complicates', 'extends'];
const MAX_PAGE = 5000;
const MAX_CHAPTERS = 120;
export const MAX_PLACEMENTS_PER_WRITE = 500;

export async function defaultGetShelfStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(KNOWLEDGE_SHELF_STORE);
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400, code: 'validation_error' });
}

async function getJSON(store, key) {
  return (await store.get(key, { type: 'json', consistency: 'strong' })) ?? {};
}

async function setJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  return store.set(key, JSON.stringify(value));
}

export function shelfBookKey(label) {
  const key = String(label ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key || key.length > 200) throw invalid('A book title is required.');
  return key;
}

function text(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw invalid('Expected text.');
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return trimmed || null;
}

function page(value, label = 'Page') {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE) throw invalid(`${label} must be a whole number from 1 to ${MAX_PAGE}.`);
  return n;
}

function chapters(value, pages) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_CHAPTERS) throw invalid(`Chapters must be a list of at most ${MAX_CHAPTERS}.`);
  const list = value.map((item, index) => {
    if (!item || typeof item !== 'object') throw invalid(`Chapter ${index + 1} is not an object.`);
    const title = text(item.title, 160);
    if (!title) throw invalid(`Chapter ${index + 1} needs a title.`);
    const start = page(item.start, `Chapter ${index + 1} start`);
    if (!start) throw invalid(`Chapter ${index + 1} needs a start page.`);
    if (pages && start > pages) throw invalid(`Chapter ${index + 1} starts after the last page.`);
    const label = text(item.label ?? (item.number != null ? String(item.number) : undefined), 24);
    return { title, start, ...(label ? { label } : {}) };
  });
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].start < list[i - 1].start) throw invalid('Chapters must be in page order.');
  }
  return list;
}

function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete target[key];
    else target[key] = value;
  }
  return target;
}

export function cleanBookPatch(raw) {
  if (!raw || typeof raw !== 'object') throw invalid('Book facts must be an object.');
  const label = text(raw.label, 200);
  if (!label) throw invalid('A book title is required.');
  const pages = page(raw.pages, 'Page count');
  const patch = {
    label,
    author: text(raw.author, 200),
    edition: text(raw.edition, 200),
    pages,
    chapters: chapters(raw.chapters, pages ?? undefined),
    notebook: text(raw.notebook, 120),
  };
  if (raw.reading !== undefined) {
    if (raw.reading === null || raw.reading === false) patch.reading = null;
    else if (typeof raw.reading === 'object') patch.reading = { page: page(raw.reading.page, 'Reading page') ?? null };
    else if (raw.reading === true) patch.reading = { page: null };
    else throw invalid('Reading must be an object, true, or null.');
  }
  return patch;
}

export function cleanPlacement(raw) {
  if (!raw || typeof raw !== 'object') throw invalid('Each placement must be an object.');
  const pageId = typeof raw.pageId === 'string' ? raw.pageId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(pageId)) throw invalid('A valid pageId is required.');
  const patch = { pageId, page: page(raw.page) };
  if (raw.guessed !== undefined) patch.guessed = raw.guessed === null ? null : Boolean(raw.guessed);
  if (raw.stance !== undefined) {
    if (raw.stance !== null && !SHELF_STANCES.includes(raw.stance)) throw invalid('Stance must be supports, complicates or extends.');
    patch.stance = raw.stance;
  }
  for (const field of ['gaps', 'themes']) {
    if (raw[field] === undefined) continue;
    if (raw[field] === null) { patch[field] = null; continue; }
    if (!Array.isArray(raw[field]) || raw[field].length > 12) throw invalid(`${field} must be a list of at most 12.`);
    patch[field] = raw[field].map(item => text(item, 300)).filter(Boolean);
  }
  if (raw.lastOpened !== undefined) {
    if (raw.lastOpened !== null && Number.isNaN(Date.parse(raw.lastOpened))) throw invalid('lastOpened must be a date.');
    patch.lastOpened = raw.lastOpened;
  }
  return patch;
}

export async function readShelf(store) {
  const [books, placements] = await Promise.all([getJSON(store, BOOKS_KEY), getJSON(store, PLACEMENTS_KEY)]);
  return { books: Object.values(books), placements: Object.values(placements) };
}

export async function saveBook(store, raw, { now = new Date().toISOString() } = {}) {
  const patch = cleanBookPatch(raw);
  const key = shelfBookKey(patch.label);
  const books = await getJSON(store, BOOKS_KEY);
  const current = books[key] ?? { label: patch.label };
  if (patch.reading && patch.reading.page === null && current.reading?.page) patch.reading = current.reading;
  const next = merge({ ...current }, patch);
  // Facts Adam pastes or types replace Claude's estimate, so it stops being marked as one.
  if (patch.pages !== undefined || patch.chapters !== undefined) delete next.estimated;
  if (next.reading) next.reading = { ...next.reading, updated_at: now };
  if (next.pages && Array.isArray(next.chapters) && next.chapters.some(ch => ch.start > next.pages)) {
    throw invalid('A chapter starts after the last page.');
  }
  next.updated_at = now;
  books[key] = next;
  await setJSON(store, BOOKS_KEY, books);
  return next;
}

export async function savePlacements(store, rawList, { now = new Date().toISOString() } = {}) {
  const list = Array.isArray(rawList) ? rawList : [rawList];
  if (!list.length || list.length > MAX_PLACEMENTS_PER_WRITE) {
    throw invalid(`Send between 1 and ${MAX_PLACEMENTS_PER_WRITE} placements.`);
  }
  const patches = list.map(cleanPlacement);
  const placements = await getJSON(store, PLACEMENTS_KEY);
  const saved = patches.map(patch => {
    const next = merge({ ...(placements[patch.pageId] ?? {}) }, patch);
    next.updated_at = now;
    placements[patch.pageId] = next;
    return next;
  });
  await setJSON(store, PLACEMENTS_KEY, placements);
  return saved;
}

/** Takes a book's own record off the shelf (facts, notebook, reading). Notes keep their placements. */
export async function deleteBook(store, label) {
  const key = shelfBookKey(text(label, 200) ?? '');
  const books = await getJSON(store, BOOKS_KEY);
  const existed = Boolean(books[key]);
  delete books[key];
  await setJSON(store, BOOKS_KEY, books);
  return { label, removed: existed };
}
