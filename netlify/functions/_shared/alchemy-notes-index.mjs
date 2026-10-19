import { gunzipSync } from 'node:zlib';
import { getKnowledgePage, knowledgeDataRepo, knowledgeDataToken, readKnowledgeFile } from './knowledge-data.mjs';
import { isDeletedRecord, withoutDeleted } from './record-liveness.mjs';
import { alchemyError } from './alchemy-budget.mjs';

/**
 * Full-text index of the Knowledge Hub for Ann. Search reads whole notes
 * (up to SEARCH_CHARS each), not the 157-character manifest excerpt. The
 * index lives in one Blob and refreshes from the manifest's updated_at:
 * a few changed notes are read one by one, a large change or a first build
 * reads the whole archive in one tarball download.
 */
export const NOTE_INDEX_KEY = 'alchemy/v2/note-text';
export const SEARCH_CHARS = 8000;
export const READ_CHARS = 12000;
const INDEX_VERSION = 1;
const SMALL_REFRESH = 40;

const STOP = new Set(('a an and are as at be but by can do for from has have how i if in into is it its of on or our so than that the their them then there these they this to was we were what when which who why will with you your not no all any more most also about').split(' '));

export function noteTokens(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(t => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/** Readable plain text from a note body (Markdown or HTML). */
export function plainText(body) {
  return String(body ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function docFromPage(page, row) {
  return {
    id: page.id,
    title: String(page.title || row?.title || page.id),
    area: typeof page.area === 'string' ? page.area : row?.area,
    tags: (Array.isArray(page.tags) ? page.tags : row?.tags ?? []).filter(t => typeof t === 'string'),
    origins: (Array.isArray(page.origins) ? page.origins : row?.origins ?? []).filter(o => o && typeof o.kind === 'string' && typeof o.label === 'string').map(o => ({ kind: o.kind, label: o.label })),
    updated_at: String(row?.updated_at ?? page.updated_at ?? ''),
    text: plainText(page.body).slice(0, SEARCH_CHARS)
  };
}

/** Files in a .tar.gz, as {path, data}; the archive's top folder is dropped. */
export function* tarEntries(gz) {
  const tar = gunzipSync(gz);
  let offset = 0, paxPath = null;
  const field = (start, length) => tar.subarray(offset + start, offset + start + length).toString('utf8').replace(/\0.*$/s, '');
  while (offset + 512 <= tar.length) {
    if (tar[offset] === 0) break;
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(tar[offset + 156] || 48);
    const prefix = field(345, 155);
    const name = paxPath ?? (prefix ? prefix + '/' : '') + field(0, 100);
    const data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const match = data.toString('utf8').match(/(?:^|\n)\d+ path=([^\n]*)\n/);
      paxPath = match ? match[1] : null;
      continue;
    }
    paxPath = null;
    if (type !== '0' && type !== '\0') continue;
    yield { path: name.split('/').slice(1).join('/'), data };
  }
}

async function readTarball({ env, fetchImpl, signal }) {
  const repo = knowledgeDataRepo(env), token = knowledgeDataToken(env);
  if (!token) throw alchemyError(503, 'knowledge_repo_unbound', 'Knowledge Hub is not connected.');
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/tarball/HEAD`, {
    signal, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'life-hub' }
  });
  if (!response.ok) throw alchemyError(502, 'alchemy_retrieval', 'Ann could not read the Knowledge Hub archive.');
  return Buffer.from(await response.arrayBuffer());
}

async function manifestRows({ env, fetchImpl }) {
  const raw = await readKnowledgeFile('manifest.json', { env, fetchImpl });
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : Array.isArray(raw?.entries) ? raw.entries : null;
  if (!rows) throw alchemyError(502, 'alchemy_retrieval', 'Knowledge Hub index is unavailable.');
  return withoutDeleted(rows).filter(r => typeof r?.id === 'string');
}

/**
 * The current index: notes changed since the last refresh are re-read and
 * deleted ones dropped. `onProgress` hears about a slow (archive) rebuild.
 */
export async function refreshNoteIndex({ store, env, fetchImpl = fetch, signal, onProgress = () => {} }) {
  const [stored, rows] = await Promise.all([
    store.get(NOTE_INDEX_KEY, { type: 'json', consistency: 'strong' }),
    manifestRows({ env, fetchImpl })
  ]);
  const previous = stored?.version === INDEX_VERSION && Array.isArray(stored.docs) ? stored.docs : [];
  const known = new Map(previous.map(doc => [doc.id, doc]));
  const changed = rows.filter(row => known.get(row.id)?.updated_at !== String(row.updated_at ?? ''));
  const liveIds = new Set(rows.map(r => r.id));
  if (!changed.length && previous.length === rows.length) return previous;
  let docs;
  if (changed.length > SMALL_REFRESH) {
    onProgress('Indexing your Knowledge Hub notes');
    const byId = new Map(rows.map(r => [r.id, r]));
    docs = [];
    for (const entry of tarEntries(await readTarball({ env, fetchImpl, signal }))) {
      const match = entry.path.match(/^pages\/([^/]+)\.json$/);
      if (!match || !byId.has(match[1])) continue;
      let page; try { page = JSON.parse(entry.data.toString('utf8')); } catch { continue; }
      if (!page || isDeletedRecord(page) || page.id !== match[1]) continue;
      docs.push(docFromPage(page, byId.get(page.id)));
    }
  } else {
    const fresh = new Map();
    for (let i = 0; i < changed.length; i += 8) {
      signal?.throwIfAborted();
      const pages = await Promise.all(changed.slice(i, i + 8).map(row => getKnowledgePage(row.id, { env, fetchImpl }).catch(() => null)));
      pages.forEach((page, j) => { const row = changed[i + j]; fresh.set(row.id, page && !isDeletedRecord(page) ? docFromPage(page, row) : null); });
    }
    docs = rows.map(row => (fresh.has(row.id) ? fresh.get(row.id) : known.get(row.id))).filter(Boolean);
  }
  docs = docs.filter(doc => liveIds.has(doc.id));
  signal?.throwIfAborted();
  await store.setJSON(NOTE_INDEX_KEY, { version: INDEX_VERSION, built_at: new Date().toISOString(), docs });
  return docs;
}

const prepared = new WeakMap();
function prepare(docs) {
  let ready = prepared.get(docs);
  if (ready) return ready;
  const entries = docs.map(doc => {
    const tf = new Map();
    const add = (tokens, weight) => { for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + weight); };
    add(noteTokens(doc.title), 4);
    add(noteTokens(doc.tags.join(' ')), 3);
    add(noteTokens(doc.origins.map(o => o.label).join(' ')), 2);
    const body = noteTokens(doc.text);
    add(body, 1);
    return { doc, tf, length: body.length + 10 };
  });
  const df = new Map();
  for (const entry of entries) for (const t of entry.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = entries.reduce((n, e) => n + e.length, 0) / Math.max(1, entries.length);
  ready = { entries, df, avg };
  prepared.set(docs, ready);
  return ready;
}

/** The ~300 characters of a note that hold the most query words. */
export function bestPassage(text, terms, width = 300) {
  const want = new Set(terms);
  const sentences = String(text).split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  if (!sentences.length) return '';
  let best = { score: -1, text: '' };
  for (let i = 0; i < sentences.length; i++) {
    let window = '', j = i;
    while (j < sentences.length && (window.length + sentences[j].length) <= width + 60) window += (window ? ' ' : '') + sentences[j++];
    if (!window) window = sentences[i].slice(0, width);
    const score = new Set(noteTokens(window).filter(t => want.has(t))).size;
    if (score > best.score) best = { score, text: window };
  }
  return best.text.length > width + 60 ? best.text.slice(0, width) + '…' : best.text;
}

function matchesFilters(doc, { tags, origin_kind, origin_label, area }) {
  if (area && doc.area !== area) return false;
  if (Array.isArray(tags) && tags.length) {
    const have = new Set(doc.tags.map(t => t.toLowerCase()));
    if (!tags.every(t => have.has(String(t).toLowerCase()))) return false;
  }
  if (origin_kind || origin_label) {
    const label = String(origin_label ?? '').toLowerCase();
    if (!doc.origins.some(o => (!origin_kind || o.kind === origin_kind) && (!label || o.label.toLowerCase().includes(label)))) return false;
  }
  return true;
}

/** BM25 over title, tags, origins and the note text, after exact filters. */
export function searchNotes(docs, { query = '', limit = 10, ...filters } = {}) {
  const { entries, df, avg } = prepare(docs);
  const terms = [...new Set(noteTokens(query))];
  const n = entries.length, k1 = 1.2, b = 0.75;
  const scored = [];
  for (const entry of entries) {
    if (!matchesFilters(entry.doc, filters)) continue;
    let score = 0;
    for (const t of terms) {
      const f = entry.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * entry.length / avg));
    }
    if (terms.length && score <= 0) continue;
    scored.push({ entry, score });
  }
  scored.sort((a, b2) => b2.score - a.score || a.entry.doc.title.localeCompare(b2.entry.doc.title));
  return scored.slice(0, Math.min(20, Math.max(1, limit))).map(({ entry }) => ({
    id: entry.doc.id,
    title: entry.doc.title,
    tags: entry.doc.tags,
    origins: entry.doc.origins,
    passage: terms.length ? bestPassage(entry.doc.text, terms) : entry.doc.text.slice(0, 300)
  }));
}

/** Tags and origins in the archive with counts, so Ann filters on real values. */
export function noteFilters(docs, limit = 80) {
  const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const tags = new Map(), origins = new Map(), areas = new Map();
  for (const doc of docs) {
    for (const t of doc.tags) count(tags, t);
    for (const o of doc.origins) count(origins, o.kind + ': ' + o.label);
    if (doc.area) count(areas, doc.area);
  }
  const top = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name, notes]) => ({ name, notes }));
  return { notes: docs.length, areas: top(areas), tags: top(tags), origins: top(origins) };
}

/** The whole live note as plain text, READ_CHARS at a time. Null when deleted or missing. */
export async function readNoteText(id, { env, fetchImpl, offset = 0 }) {
  const page = await getKnowledgePage(id, { env, fetchImpl });
  if (!page || isDeletedRecord(page)) return null;
  const text = plainText(page.body);
  const start = Math.max(0, Math.min(Number(offset) || 0, text.length));
  const end = Math.min(text.length, start + READ_CHARS);
  return {
    id: page.id,
    title: String(page.title || page.id),
    tags: Array.isArray(page.tags) ? page.tags : [],
    origins: Array.isArray(page.origins) ? page.origins : [],
    text: text.slice(start, end),
    offset: start,
    total: text.length,
    next: end < text.length ? end : null,
    full: text
  };
}
