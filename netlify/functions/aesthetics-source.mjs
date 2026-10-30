/**
 * /api/aesthetics/source: the Life app's fragrance library (tracker records, map metadata and
 * the style note) and the watch tracker. Both live only in the private data repository, never
 * in the public bundle:
 *
 *   data/aesthetics/fragrances.json → map, fragrances, styleNote
 *   data/aesthetics/watches.json    → watches, watchSourceUrl, watchHunt (a trip plan)
 *
 * Each file loads on its own; `status` is "ready" when at least one did.
 */
import { methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readPrivateJsonFile } from './_shared/private-data-file.mjs';
import { WATCHES_PATH } from './_shared/watch-radar.mjs';

export const config = { path: '/api/aesthetics/source' };

export const AESTHETICS_SOURCE_PATH = 'data/aesthetics/fragrances.json';
const CACHE_MS = 5 * 60_000;
const NO_STORE = { 'cache-control': 'private, no-store' };

/** Keep only the three fields the app reads, each in the expected shape. */
export function shapeAestheticsSource(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    map: Array.isArray(source.map) ? source.map.filter(row => row && typeof row.name === 'string') : [],
    fragrances: Array.isArray(source.fragrances)
      ? source.fragrances.filter(r => r && typeof r.id === 'string' && r.properties && typeof r.properties === 'object')
      : [],
    styleNote: source.styleNote && typeof source.styleNote === 'object' ? source.styleNote : null
  };
}

/** Watch tracker records (untitled rows dropped) and the tracker link. */
export function shapeWatchSource(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    watches: Array.isArray(source.watches)
      ? source.watches.filter(r => r && typeof r.id === 'string' && r.properties && typeof r.properties.Watch === 'string' && r.properties.Watch.trim())
      : [],
    watchSourceUrl: typeof source.sourceUrl === 'string' ? source.sourceUrl : null,
    watchHunt: source.hunt && typeof source.hunt === 'object' && !Array.isArray(source.hunt) ? source.hunt : null
  };
}

const EMPTY_FRAGRANCES = { map: [], fragrances: [], styleNote: null };
const EMPTY_WATCHES = { watches: [], watchSourceUrl: null, watchHunt: null };

export function createAestheticsSourceHandler(deps = {}) {
  const read = deps.readPrivateJsonFile ?? readPrivateJsonFile;
  const now = deps.now ?? Date.now;
  let cache = null;

  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    if (cache && cache.expiresAt > now()) return withCors(okResponse(200, cache.data, NO_STORE), request, env);
    const options = { env, fetchImpl: deps.fetchImpl ?? fetch };
    const [fragrances, watches] = await Promise.allSettled([
      read(AESTHETICS_SOURCE_PATH, { ...options, label: 'fragrance library' }),
      read(WATCHES_PATH, { ...options, label: 'watch tracker' })
    ]);
    const f = fragrances.status === 'fulfilled' ? shapeAestheticsSource(fragrances.value) : EMPTY_FRAGRANCES;
    const w = watches.status === 'fulfilled' ? shapeWatchSource(watches.value) : EMPTY_WATCHES;
    const ready = f.fragrances.length > 0 || w.watches.length > 0;
    const data = { ...f, ...w, status: ready ? 'ready' : 'unavailable' };
    // Only a complete read is cached, so a file that failed is tried again on the next request.
    if (fragrances.status === 'fulfilled' && watches.status === 'fulfilled') cache = { data, expiresAt: now() + CACHE_MS };
    return withCors(okResponse(200, data, NO_STORE), request, env);
  }, deps);
}

export default createAestheticsSourceHandler();
