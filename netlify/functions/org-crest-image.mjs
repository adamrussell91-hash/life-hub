/**
 * /api/organisations/crest-image: researched organisation crests. Which organisations have one
 * reflects Adam's network, so the mapping and the PNGs live only in the private data repository
 * (data/professional/organisation-crests/). An uploaded crest (/api/organisations/crest) still
 * takes precedence in the app.
 *
 *   GET                 → { refs: [...] }  organisations that have a researched crest
 *   GET ?ref=<org ref>  → the PNG
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readPrivateFileBytes, readPrivateJsonFile } from './_shared/private-data-file.mjs';

export const config = { path: '/api/organisations/crest-image' };

export const CREST_DIR = 'data/professional/organisation-crests';
const REF_RE = /^shared:organisation:organisation_[a-f0-9-]{8,64}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,120}\.png$/;
const MANIFEST_MS = 5 * 60_000;
const NO_STORE = { 'cache-control': 'private, no-store' };

/** `{ "<org ref>": "<file>.png" }` with anything malformed dropped. */
export function crestManifest(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [ref, file] of Object.entries(raw)) {
    if (REF_RE.test(ref) && typeof file === 'string' && FILE_RE.test(file)) out[ref] = file;
  }
  return out;
}

export function createOrgCrestImageHandler(deps = {}) {
  const readJson = deps.readPrivateJsonFile ?? readPrivateJsonFile;
  const readBytes = deps.readPrivateFileBytes ?? readPrivateFileBytes;
  const now = deps.now ?? Date.now;
  let cached = null;

  async function manifest(options) {
    if (cached && cached.expiresAt > now()) return cached.map;
    const map = crestManifest(await readJson(`${CREST_DIR}/manifest.json`, options));
    cached = { map, expiresAt: now() + MANIFEST_MS };
    return map;
  }

  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const ref = new URL(request.url).searchParams.get('ref');
    const options = { env, fetchImpl: deps.fetchImpl ?? fetch, label: 'organisation crests' };
    let map;
    try {
      map = await manifest(options);
    } catch (error) {
      if (ref === null) return withCors(okResponse(200, { refs: [], status: 'unavailable' }, NO_STORE), request, env);
      const missing = error?.status === 404;
      return withCors(errorResponse(missing ? 404 : 503, missing ? 'not_found' : 'unavailable', 'Crests are unavailable.', !missing, NO_STORE), request, env);
    }
    if (ref === null) {
      return withCors(okResponse(200, { refs: Object.keys(map), status: 'ready' }, NO_STORE), request, env);
    }
    const file = Object.hasOwn(map, ref) ? map[ref] : null;
    if (!file) return withCors(errorResponse(404, 'not_found', 'No crest for that organisation.', false, NO_STORE), request, env);
    try {
      const bytes = await readBytes(`${CREST_DIR}/${file}`, options);
      return withCors(new Response(bytes, {
        status: 200,
        headers: {
          'cache-control': 'private, max-age=86400',
          'content-type': 'image/png',
          'x-content-type-options': 'nosniff'
        }
      }), request, env);
    } catch (error) {
      const missing = error?.status === 404;
      return withCors(errorResponse(missing ? 404 : 503, missing ? 'not_found' : 'unavailable', 'That crest is unavailable.', !missing, NO_STORE), request, env);
    }
  }, deps);
}

export default createOrgCrestImageHandler();
