/**
 * Shared entity search for Cmd+K / hub palettes.
 * MiniSearch provides prefix + fuzzy + BM25; substring remains the empty-query path.
 * Do not use this for Knowledge semantic/hybrid research retrieval.
 */

import MiniSearch from './vendor/minisearch.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   hint?: string,
 *   tags?: string,
 *   groupId?: string
 * }} HubEntityDoc
 */

/**
 * @param {HubEntityDoc[]} docs
 * @returns {MiniSearch}
 */
export function buildHubEntityIndex(docs) {
  const index = new MiniSearch({
    fields: ['label', 'hint', 'tags'],
    storeFields: ['id', 'label', 'hint', 'tags', 'groupId'],
    searchOptions: {
      boost: { label: 3, hint: 1.5, tags: 1 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND'
    }
  });
  index.addAll(
    (docs ?? []).map((doc) => ({
      id: String(doc.id),
      label: String(doc.label ?? ''),
      hint: String(doc.hint ?? ''),
      tags: String(doc.tags ?? ''),
      groupId: doc.groupId != null ? String(doc.groupId) : ''
    }))
  );
  return index;
}

/**
 * @param {MiniSearch} index
 * @param {string} query
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ id: string, label: string, hint?: string, tags?: string, groupId?: string, score: number }>}
 */
export function searchHubEntities(index, query, options = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const limit = Number.isFinite(options.limit) ? options.limit : 40;
  return index.search(q).slice(0, limit).map((hit) => ({
    id: String(hit.id),
    label: String(hit.label ?? ''),
    hint: hit.hint ? String(hit.hint) : undefined,
    tags: hit.tags ? String(hit.tags) : undefined,
    groupId: hit.groupId ? String(hit.groupId) : undefined,
    score: Number(hit.score) || 0
  }));
}

/**
 * Filter command-palette groups with MiniSearch (fallback: substring).
 * Empty query returns groups unchanged.
 *
 * @param {Array<{ heading: string, items: Array<{ id: string, label: string, hint?: string, onSelect?: () => void }> }>} groups
 * @param {string} query
 * @param {{ index?: MiniSearch | null }} [options]
 */
export function filterCommandGroups(groups, query, options = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return groups ?? [];

  const list = groups ?? [];
  /** @type {Map<string, { groupIndex: number, item: any }>} */
  const byId = new Map();
  const docs = [];
  list.forEach((group, groupIndex) => {
    (group.items ?? []).forEach((item, itemIndex) => {
      const id = String(item.id ?? `${groupIndex}:${itemIndex}`);
      byId.set(id, { groupIndex, item });
      docs.push({
        id,
        label: item.label,
        hint: item.hint,
        groupId: String(groupIndex)
      });
    });
  });

  let hits = [];
  try {
    const index = options.index ?? buildHubEntityIndex(docs);
    hits = searchHubEntities(index, query);
  } catch {
    hits = [];
  }

  if (!hits.length) {
    // Fallback: classic substring (also covers exotic unicode tokenizer misses).
    return list
      .map((group) => ({
        heading: group.heading,
        items: (group.items ?? []).filter(
          (item) =>
            String(item.label ?? '')
              .toLowerCase()
              .includes(needle) ||
            String(item.hint ?? '')
              .toLowerCase()
              .includes(needle)
        )
      }))
      .filter((group) => group.items.length > 0);
  }

  /** @type {Map<number, { heading: string, items: any[], seen: Set<string> }>} */
  const grouped = new Map();
  for (const hit of hits) {
    const ref = byId.get(hit.id);
    if (!ref) continue;
    let bucket = grouped.get(ref.groupIndex);
    if (!bucket) {
      bucket = { heading: list[ref.groupIndex].heading, items: [], seen: new Set() };
      grouped.set(ref.groupIndex, bucket);
    }
    if (bucket.seen.has(hit.id)) continue;
    bucket.seen.add(hit.id);
    bucket.items.push(ref.item);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => ({ heading: value.heading, items: value.items }));
}
