import { readKnowledgeFile } from './knowledge-data.mjs';
import { lexicalRetrieve } from './knowledge-alchemist.mjs';
import { withoutDeleted } from './record-liveness.mjs';
import { alchemyError } from './alchemy-budget.mjs';

/**
 * Unit notes: the Knowledge Hub notes Ann has found useful for one unit.
 * They accumulate across checks, so Ann reads the unit's own shelf first and
 * only skims the archive for what the shelf lacks. Teachers can prune them.
 */
const INDEX_KEY = 'alchemy/v1/knowledge-index';
const MAX_NOTES = 40;
export const unitNotesKey = unitId => 'alchemy/v1/unit-notes/' + unitId;
export const isSafeUnitId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id);

/** Manifest rows without deleted notes, cached for 15 minutes so a check never re-reads the whole archive. */
export async function knowledgeIndex({ store, env, fetchImpl, signal }) {
  const cached = await store.get(INDEX_KEY, { type: 'json', consistency: 'strong' });
  if (Array.isArray(cached?.rows) && cached.expires >= Date.now()) return cached.rows;
  const raw = await readKnowledgeFile('manifest.json', { env, fetchImpl });
  let rows = Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : Array.isArray(raw?.entries) ? raw.entries : null;
  if (!rows || rows.length > 10000) throw alchemyError(502, 'alchemy_retrieval', 'Knowledge Hub index is unavailable.');
  rows = withoutDeleted(rows).filter(r => typeof r?.id === 'string').map(r => ({ id: r.id, title: String(r.title || ''), tags: r.tags, excerpt: String(r.excerpt || '').slice(0, 1000) }));
  signal?.throwIfAborted();
  await store.setJSON(INDEX_KEY, { rows, expires: Date.now() + 900000 });
  return rows;
}

export async function readUnitNotes(store, unitId) {
  const data = await store.get(unitNotesKey(unitId), { type: 'json', consistency: 'strong' });
  return { notes: Array.isArray(data?.notes) ? data.notes : [], removed: Array.isArray(data?.removed) ? data.removed : [] };
}

async function changeUnitNotes(store, unitId, fn) {
  for (let i = 0; i < 6; i++) {
    const row = await store.getWithMetadata(unitNotesKey(unitId), { type: 'json', consistency: 'strong' });
    const current = { notes: Array.isArray(row?.data?.notes) ? row.data.notes : [], removed: Array.isArray(row?.data?.removed) ? row.data.removed : [] };
    const next = { ...fn(structuredClone(current)), updatedAt: new Date().toISOString() };
    const result = await store.setJSON(unitNotesKey(unitId), next, row ? { onlyIfMatch: row.etag } : { onlyIfNew: true });
    if (result?.modified) return next;
  }
  throw alchemyError(409, 'unit_notes_busy', 'Unit notes changed at the same time. Try again.');
}

/** Adds or refreshes notes. A note the teacher removed stays removed. */
export function addUnitNotes(store, unitId, entries) {
  const clean = entries.filter(e => typeof e?.id === 'string' && e.id).map(e => ({ id: e.id, title: String(e.title || '').slice(0, 200), excerpt: String(e.excerpt || '').slice(0, 400), why: String(e.why || '').slice(0, 300) }));
  if (!clean.length) return Promise.resolve(null);
  return changeUnitNotes(store, unitId, state => {
    const now = new Date().toISOString();
    for (const entry of clean) {
      if (state.removed.includes(entry.id)) continue;
      const existing = state.notes.find(n => n.id === entry.id);
      if (existing) { existing.uses = (existing.uses || 0) + 1; existing.usedAt = now; if (entry.why) existing.why = entry.why; existing.title = entry.title || existing.title; }
      else state.notes.push({ ...entry, uses: 1, addedAt: now, usedAt: now });
    }
    // Keep the shelf small enough to read in one check: least recently useful notes go first.
    state.notes.sort((a, b) => String(b.usedAt).localeCompare(String(a.usedAt)));
    state.notes = state.notes.slice(0, MAX_NOTES);
    return state;
  });
}

export function removeUnitNote(store, unitId, id) {
  return changeUnitNotes(store, unitId, state => ({ notes: state.notes.filter(n => n.id !== id), removed: [...new Set([...state.removed, id])].slice(-500) }));
}

/**
 * The notes Ann reads for one check: the unit's shelf (still live in the
 * index), then archive candidates ranked against the block and its lesson
 * and unit, so Ann can choose what improves the teaching rather than what
 * shares a word.
 */
export function shortlistNotes({ index, unitNotes, query, unitLimit = 12, archiveLimit = 12 }) {
  const live = new Map(index.map(row => [row.id, row]));
  const unit = unitNotes.notes.filter(n => live.has(n.id)).slice(0, unitLimit).map(n => ({ id: n.id, title: live.get(n.id).title || n.title, excerpt: String(n.excerpt || live.get(n.id).excerpt).slice(0, 300), shelf: 'unit', why: n.why || '' }));
  const skip = new Set([...unit.map(n => n.id), ...unitNotes.removed]);
  const archive = lexicalRetrieve(index.filter(row => !skip.has(row.id)), query, archiveLimit).map(row => ({ id: row.id, title: row.title, excerpt: String(row.excerpt || '').slice(0, 220), shelf: 'archive' }));
  return [...unit, ...archive];
}

/** Lesson and unit words that say what the teaching is for, so candidates match purpose as well as topic. */
export function contextQueryText(...entities) {
  return entities.filter(Boolean).map(e => [e.title, e.description, e.pedagogical_mode, ...(e.outcome_ids ?? e.syllabus_outcomes ?? [])].filter(v => typeof v === 'string').join(' ')).join(' ').slice(0, 1200);
}

/** Default source gathering for a check: the unit shelf plus purpose-ranked archive candidates, no page reads. */
export async function unitAwareSources({ store, env, fetchImpl, signal, unitId, query }) {
  const [index, unitNotes] = await Promise.all([
    knowledgeIndex({ store, env, fetchImpl, signal }),
    unitId ? readUnitNotes(store, unitId) : { notes: [], removed: [] }
  ]);
  return shortlistNotes({ index, unitNotes, query });
}
