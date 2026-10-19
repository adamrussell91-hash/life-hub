import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { getKnowledgePage, knowledgeDataRepo, knowledgeDataToken, readKnowledgeFile } from './knowledge-data.mjs';
import { knowledgeKernelFetch, knowledgeKernelSecret } from './knowledge-kernel.mjs';
import { isDeletedRecord, withoutDeleted } from './record-liveness.mjs';
import { alchemyError } from './alchemy-budget.mjs';

/**
 * Full-text index of the Knowledge Hub for Ann. Search reads whole notes
 * (up to SEARCH_CHARS each), not the 157-character manifest excerpt. The
 * index lives in one Blob and refreshes from the manifest's updated_at:
 * a few changed notes are read one by one, a large change or a first build
 * reads the whole archive in one tarball download.
 *
 * PDF attachments are searched too. Their text comes from the knowledge
 * kernel's /capture (Workers AI reads the file in R2) and is kept in its own
 * Blob per file, so it is extracted once: the first refresh after an upload
 * fills it in, a few files per refresh, and read_note fetches it on demand.
 */
export const NOTE_INDEX_KEY = 'alchemy/v2/note-text';
export const ATTACHMENT_TEXT_PREFIX = 'alchemy/v2/attachment-text/';
export const SEARCH_CHARS = 8000;
export const ATTACHMENT_SEARCH_CHARS = 20000;
export const READ_CHARS = 12000;
export const EXTRACT_PER_REFRESH = 12;
export const RETRY_FAILED_MS = 24 * 60 * 60 * 1000;
const INDEX_VERSION = 2;
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

/** A page's live PDF attachments, as {id, filename, r2_key}. */
export function pdfAttachments(page) {
  return (Array.isArray(page?.attachments) ? page.attachments : [])
    .filter(a => a && typeof a.r2_key === 'string' && typeof a.id === 'string' && !isDeletedRecord(a))
    .filter(a => a.kind === 'pdf' || a.content_type === 'application/pdf' || /\.pdf$/i.test(String(a.filename ?? a.r2_key)))
    .map(a => ({ id: a.id, filename: String(a.filename || a.r2_key.split('/').pop()), r2_key: a.r2_key }));
}

const textKey = attachment => ATTACHMENT_TEXT_PREFIX + createHash('sha256').update(attachment.r2_key).digest('hex').slice(0, 32);

async function kernelText(attachment, { env, fetchImpl }) {
  const response = await knowledgeKernelFetch('/capture', { env, fetchImpl, method: 'POST', body: { r2_key: attachment.r2_key }, timeoutMs: 60_000 });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(typeof payload?.error === 'string' ? payload.error : 'PDF text extraction failed'), { status: response.status });
  return plainText(typeof payload?.text === 'string' ? payload.text : '');
}

/**
 * One attachment's text: from its Blob, or extracted now and stored there
 * when `extract` is allowed. {state: 'ok', text} | {state: 'failed', retry_after} | {state: 'pending'}.
 * A failed file is tried again after RETRY_FAILED_MS.
 */
export async function attachmentText(attachment, { store, env, fetchImpl = fetch, extract = true, now = Date.now() }) {
  const key = textKey(attachment);
  const saved = await store.get(key, { type: 'json', consistency: 'strong' });
  if (saved?.r2_key === attachment.r2_key) {
    if (typeof saved.text === 'string') return { state: 'ok', text: saved.text };
    const retryAfter = Date.parse(saved.failed_at) + RETRY_FAILED_MS;
    if (retryAfter > now) return { state: 'failed', retry_after: new Date(retryAfter).toISOString() };
  }
  if (!extract || !knowledgeKernelSecret(env)) return { state: 'pending' };
  try {
    const text = await kernelText(attachment, { env, fetchImpl });
    await store.setJSON(key, { r2_key: attachment.r2_key, filename: attachment.filename, text, extracted_at: new Date(now).toISOString() });
    return { state: 'ok', text };
  } catch (error) {
    if (error?.status === 503 || error?.code === 'knowledge_kernel_unbound') return { state: 'pending' };
    await store.setJSON(key, { r2_key: attachment.r2_key, filename: attachment.filename, error: String(error?.message ?? 'failed').slice(0, 200), failed_at: new Date(now).toISOString() });
    return { state: 'failed', retry_after: new Date(now + RETRY_FAILED_MS).toISOString() };
  }
}

const needsText = (attachment, now) => attachment.state === 'pending' || (attachment.state === 'failed' && Date.parse(attachment.retry_after) <= now);

/**
 * Fills in the text of index attachments still waiting for it: stored text
 * first, then up to EXTRACT_PER_REFRESH new extractions. True when anything changed.
 */
async function fillAttachmentText(docs, { store, env, fetchImpl, signal, onProgress, now }) {
  if (!knowledgeKernelSecret(env)) return false;
  const waiting = docs.flatMap(doc => (doc.attachments ?? []).filter(a => needsText(a, now)));
  if (!waiting.length) return false;
  let extractions = 0, changed = false, announced = false;
  for (let i = 0; i < waiting.length; i += 4) {
    signal?.throwIfAborted();
    await Promise.all(waiting.slice(i, i + 4).map(async attachment => {
      const extract = extractions < EXTRACT_PER_REFRESH;
      if (extract) extractions++;
      if (extract && !announced) { announced = true; onProgress('Reading the PDFs attached to your notes'); }
      const result = await attachmentText(attachment, { store, env, fetchImpl, extract, now }).catch(() => ({ state: 'pending' }));
      if (result.state === 'pending') return;
      changed = true;
      attachment.state = result.state;
      if (result.state === 'ok') { attachment.text = result.text.slice(0, ATTACHMENT_SEARCH_CHARS); delete attachment.retry_after; }
      else attachment.retry_after = result.retry_after;
    }));
  }
  return changed;
}

function docFromPage(page, row) {
  return {
    id: page.id,
    title: String(page.title || row?.title || page.id),
    area: typeof page.area === 'string' ? page.area : row?.area,
    tags: (Array.isArray(page.tags) ? page.tags : row?.tags ?? []).filter(t => typeof t === 'string'),
    origins: (Array.isArray(page.origins) ? page.origins : row?.origins ?? []).filter(o => o && typeof o.kind === 'string' && typeof o.label === 'string').map(o => ({ kind: o.kind, label: o.label })),
    updated_at: String(row?.updated_at ?? page.updated_at ?? ''),
    text: plainText(page.body).slice(0, SEARCH_CHARS),
    attachments: pdfAttachments(page).map(a => ({ ...a, state: 'pending' }))
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
export async function refreshNoteIndex({ store, env, fetchImpl = fetch, signal, onProgress = () => {}, now = Date.now() }) {
  const [stored, rows] = await Promise.all([
    store.get(NOTE_INDEX_KEY, { type: 'json', consistency: 'strong' }),
    manifestRows({ env, fetchImpl })
  ]);
  const previous = stored?.version === INDEX_VERSION && Array.isArray(stored.docs) ? stored.docs : [];
  const known = new Map(previous.map(doc => [doc.id, doc]));
  const changed = rows.filter(row => known.get(row.id)?.updated_at !== String(row.updated_at ?? ''));
  const liveIds = new Set(rows.map(r => r.id));
  if (!changed.length && previous.length === rows.length) {
    if (!(await fillAttachmentText(previous, { store, env, fetchImpl, signal, onProgress, now }))) return previous;
    await store.setJSON(NOTE_INDEX_KEY, { version: INDEX_VERSION, built_at: new Date(now).toISOString(), docs: previous });
    return previous;
  }
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
  // A re-read note keeps the text already found for its unchanged attachments.
  for (const doc of docs) {
    const before = known.get(doc.id)?.attachments ?? [];
    doc.attachments = doc.attachments.map(a => before.find(b => b.r2_key === a.r2_key && b.state !== 'pending') ?? a);
  }
  await fillAttachmentText(docs, { store, env, fetchImpl, signal, onProgress, now });
  signal?.throwIfAborted();
  await store.setJSON(NOTE_INDEX_KEY, { version: INDEX_VERSION, built_at: new Date(now).toISOString(), docs });
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
    for (const a of doc.attachments ?? []) {
      add(noteTokens(a.filename.replace(/\.pdf$/i, '')), 2);
      if (a.text) body.push(...noteTokens(a.text));
    }
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
  return scoredPassage(text, terms, width).text;
}

function scoredPassage(text, terms, width = 300) {
  const want = new Set(terms);
  const sentences = String(text).split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  if (!sentences.length) return { score: -1, text: '' };
  let best = { score: -1, text: '' };
  for (let i = 0; i < sentences.length; i++) {
    let window = '', j = i;
    while (j < sentences.length && (window.length + sentences[j].length) <= width + 60) window += (window ? ' ' : '') + sentences[j++];
    if (!window) window = sentences[i].slice(0, width);
    const score = new Set(noteTokens(window).filter(t => want.has(t))).size;
    if (score > best.score) best = { score, text: window };
  }
  return { score: best.score, text: best.text.length > width + 60 ? best.text.slice(0, width) + '…' : best.text };
}

/** The best passage across a note and its PDFs, and the PDF it came from. */
function notePassage(doc, terms) {
  const sources = [{ text: doc.text, attachment: null }, ...(doc.attachments ?? []).filter(a => a.text).map(a => ({ text: a.text, attachment: a }))];
  if (!terms.length) {
    const first = sources.find(s => s.text.trim()) ?? sources[0];
    return { text: first.text.slice(0, 300), attachment: first.attachment };
  }
  let best = { score: -1, text: '', attachment: null };
  for (const source of sources) {
    const passage = scoredPassage(source.text, terms);
    if (passage.score > best.score) best = { ...passage, attachment: source.attachment };
  }
  return best;
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
  return scored.slice(0, Math.min(20, Math.max(1, limit))).map(({ entry }) => {
    const passage = notePassage(entry.doc, terms);
    const pdfs = (entry.doc.attachments ?? []).map(a => ({ id: a.id, filename: a.filename, readable: a.state === 'ok' && Boolean(a.text) }));
    return {
      id: entry.doc.id,
      title: entry.doc.title,
      tags: entry.doc.tags,
      origins: entry.doc.origins,
      passage: passage.text,
      ...(passage.attachment ? { passage_from: { attachment: passage.attachment.id, filename: passage.attachment.filename } } : {}),
      ...(pdfs.length ? { attachments: pdfs } : {})
    };
  });
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
    ...(pdfAttachments(page).length ? { attachments: pdfAttachments(page).map(a => ({ id: a.id, filename: a.filename })) } : {}),
    full: text
  };
}

/**
 * The text of one PDF attached to a live note, READ_CHARS at a time,
 * extracted now if no refresh has reached it yet. Null when the note is gone;
 * {error} when the PDF is not on the note or has no readable text.
 */
export async function readAttachmentText(noteId, attachmentId, { store, env, fetchImpl = fetch, offset = 0, now = Date.now() }) {
  const page = await getKnowledgePage(noteId, { env, fetchImpl });
  if (!page || isDeletedRecord(page)) return null;
  const attachment = pdfAttachments(page).find(a => a.id === attachmentId || a.filename === attachmentId);
  if (!attachment) return { error: 'That note has no PDF with this id. read_note on the note lists its PDFs.' };
  const result = await attachmentText(attachment, { store, env, fetchImpl, now });
  if (result.state === 'pending') return { error: 'The text of this PDF is not available yet.' };
  if (result.state === 'failed') return { error: 'This PDF could not be read.' };
  if (!result.text.trim()) return { error: 'This PDF has no readable text (it may be a scanned image).' };
  const text = result.text;
  const start = Math.max(0, Math.min(Number(offset) || 0, text.length));
  const end = Math.min(text.length, start + READ_CHARS);
  return {
    id: page.id,
    title: String(page.title || page.id),
    attachment: { id: attachment.id, filename: attachment.filename },
    text: text.slice(start, end),
    offset: start,
    total: text.length,
    next: end < text.length ? end : null,
    full: text
  };
}
