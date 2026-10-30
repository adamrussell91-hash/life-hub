/**
 * /api/knowledge/private-sources: the Knowledge hub's personal reference data, read from the
 * private data repository so the public bundle ships none of it.
 *
 *   data/knowledge/university-timeline.json → catalogue (degrees, units, grades),
 *                                             unitDegrees (unit code → degree title),
 *                                             originLabels (degree-label aliases and drops)
 *   data/knowledge/notes-place.json         → notesPlace (Notion page → notebook / book / PD)
 *
 * Each file loads on its own; `status` is "ready" when at least one did.
 */
import { methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readPrivateJsonFile } from './_shared/private-data-file.mjs';

export const config = { path: '/api/knowledge/private-sources' };

export const UNIVERSITY_TIMELINE_PATH = 'data/knowledge/university-timeline.json';
export const NOTES_PLACE_PATH = 'data/knowledge/notes-place.json';
const CACHE_MS = 5 * 60_000;
const NO_STORE = { 'cache-control': 'private, no-store' };
const PLACE_KINDS = ['notebook', 'book', 'pd'];

const emptyUniversity = () => ({ catalogue: null, unitDegrees: {}, originLabels: { aliases: {}, dropped: [] } });

/** The catalogue, unit map and label rules in the shapes the app reads; anything else is dropped. */
export function shapeUniversitySource(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const catalogue = source.catalogue && Array.isArray(source.catalogue.degrees)
    ? { generated: String(source.catalogue.generated ?? ''), degrees: source.catalogue.degrees.filter(d => d && typeof d.id === 'string' && Array.isArray(d.units)) }
    : null;
  const unitDegrees = {};
  if (source.unitDegrees && typeof source.unitDegrees === 'object') {
    for (const [code, degree] of Object.entries(source.unitDegrees)) {
      if (typeof degree === 'string' && degree.trim()) unitDegrees[code.toUpperCase()] = degree;
    }
  }
  const labels = source.originLabels && typeof source.originLabels === 'object' ? source.originLabels : {};
  const aliases = {};
  if (labels.aliases && typeof labels.aliases === 'object') {
    for (const [from, to] of Object.entries(labels.aliases)) if (typeof to === 'string' && to.trim()) aliases[from] = to;
  }
  const dropped = Array.isArray(labels.dropped) ? labels.dropped.filter(label => typeof label === 'string' && label.trim()) : [];
  return { catalogue, unitDegrees, originLabels: { aliases, dropped } };
}

/** `{ notebook, book, pd }`, each label → string ids; null when nothing usable is there. */
export function shapeNotesPlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let any = false;
  for (const kind of PLACE_KINDS) {
    out[kind] = {};
    const group = raw[kind];
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    for (const [label, ids] of Object.entries(group)) {
      if (!Array.isArray(ids)) continue;
      out[kind][label] = ids.filter(id => typeof id === 'string');
      any = true;
    }
  }
  return any ? out : null;
}

export function createKnowledgePrivateSourcesHandler(deps = {}) {
  const read = deps.readPrivateJsonFile ?? readPrivateJsonFile;
  const now = deps.now ?? Date.now;
  let cache = null;

  async function load(options) {
    const [university, place] = await Promise.allSettled([
      read(UNIVERSITY_TIMELINE_PATH, { ...options, label: 'university timeline' }),
      read(NOTES_PLACE_PATH, { ...options, label: 'notebook and PD map' })
    ]);
    const data = {
      ...(university.status === 'fulfilled' ? shapeUniversitySource(university.value) : emptyUniversity()),
      notesPlace: place.status === 'fulfilled' ? shapeNotesPlace(place.value) : null
    };
    const ready = Boolean(data.catalogue || data.notesPlace);
    return { ...data, status: ready ? 'ready' : 'unavailable' };
  }

  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    if (cache && cache.expiresAt > now()) return withCors(okResponse(200, cache.data, NO_STORE), request, env);
    const data = await load({ env, fetchImpl: deps.fetchImpl ?? fetch });
    // Only a complete read is cached, so a file that failed is tried again on the next request.
    if (data.catalogue && data.notesPlace) cache = { data, expiresAt: now() + CACHE_MS };
    return withCors(okResponse(200, data, NO_STORE), request, env);
  }, deps);
}

export default createKnowledgePrivateSourcesHandler();
