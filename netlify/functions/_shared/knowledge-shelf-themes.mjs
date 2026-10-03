// Atlas regions: up to three closed-vocabulary themes per book note, written as
// placement.themes. A field that already has a value is left alone.

import { normalizeTopicTags } from './knowledge-tidy-tags.mjs';
import { withoutDeleted } from './record-liveness.mjs';
import { MAX_PLACEMENTS_PER_WRITE } from './knowledge-shelf.mjs';

const PAGE_ID = /^[A-Za-z0-9_-]{1,120}$/;

export function bookLabelKey(label) {
  return String(label ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function bookLabels(page) {
  const seen = new Set();
  const labels = [];
  for (const origin of page?.origins ?? []) {
    if (origin?.kind !== 'book') continue;
    const label = String(origin.label ?? '').replace(/\s+/g, ' ').trim();
    const key = bookLabelKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function filledThemes(placement) {
  if (!Array.isArray(placement?.themes)) return [];
  return placement.themes.map(item => String(item ?? '').trim()).filter(Boolean);
}

/** Canonical topic tags already on the note, first-seen order, at most three. */
export function themesFromTags(tags) {
  return normalizeTopicTags(tags);
}

/**
 * Themes-only placement for one note. Null when the note already has themes,
 * has no closed-vocabulary tag, or has an id the shelf would reject.
 * Other fields are omitted so a later merge cannot clear them.
 */
export function themePlacement(note, current) {
  const pageId = typeof note?.id === 'string' ? note.id.trim() : '';
  if (!PAGE_ID.test(pageId)) return null;
  if (filledThemes(current).length) return null;
  const themes = themesFromTags(note?.tags);
  if (!themes.length) return null;
  return { pageId, themes };
}

function preferredLabel(spellings) {
  return [...spellings.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
}

/**
 * One pass over the archive manifest. `books` is the per-title count.
 * `patches` is what POST {op:"place"} should send, and only for notes whose
 * themes field is still empty.
 */
export function planShelfThemes(pages, placements = []) {
  const byId = new Map();
  for (const item of placements) {
    if (item?.pageId) byId.set(item.pageId, item);
  }
  const bucket = new Map();
  const patches = [];
  const patched = new Set();
  for (const page of withoutDeleted(pages)) {
    const labels = bookLabels(page);
    if (!labels.length) continue;
    const current = byId.get(page.id);
    const already = filledThemes(current).length > 0;
    const patch = themePlacement(page, current);
    for (const label of labels) {
      const key = bookLabelKey(label);
      const row = bucket.get(key) ?? { spellings: new Map(), notes: 0, themed: 0, already: 0, untagged: 0 };
      row.spellings.set(label, (row.spellings.get(label) ?? 0) + 1);
      row.notes += 1;
      if (already) row.already += 1;
      else if (patch) row.themed += 1;
      else row.untagged += 1;
      bucket.set(key, row);
    }
    if (patch && !patched.has(patch.pageId)) {
      patches.push(patch);
      patched.add(patch.pageId);
    }
  }
  const books = [...bucket.values()]
    .map(row => ({
      label: preferredLabel(row.spellings),
      notes: row.notes,
      themed: row.themed,
      already: row.already,
      untagged: row.untagged
    }))
    .sort((a, b) => b.notes - a.notes || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { patches, books };
}

/** Bodies for POST /api/knowledge/shelf, split at the shelf write limit. */
export function placeBodies(patches) {
  const bodies = [];
  for (let index = 0; index < patches.length; index += MAX_PLACEMENTS_PER_WRITE) {
    bodies.push({ op: 'place', placements: patches.slice(index, index + MAX_PLACEMENTS_PER_WRITE) });
  }
  return bodies;
}
