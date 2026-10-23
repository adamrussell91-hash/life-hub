import { createTravelOperatorHandler, errorResponse, PRIVATE_CACHE } from './_shared/travel-http.mjs';
import { readPrivateFileBytes, readPrivateJsonFile } from './_shared/private-data-file.mjs';

export const config = { path: '/api/travel-atlas-asset' };

/** Logos and artwork live only in the private data repository, never in this one. */
export const ATLAS_ASSET_DIR = 'assets/arches-atlas';
const SLOT_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,80}\.(png|jpe?g|webp|gif|svg)$/i;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

/** The manifest maps slot names to files in the asset folder: `{ "slots": { "badge": "badge.png" } }`. */
export function slotFile(manifest, slot) {
  if (!SLOT_RE.test(slot)) return null;
  const slots = manifest?.slots && typeof manifest.slots === 'object' ? manifest.slots : manifest;
  if (!slots || typeof slots !== 'object' || !Object.hasOwn(slots, slot)) return null;
  const file = slots[slot];
  return typeof file === 'string' && FILE_RE.test(file) ? file : null;
}

export function createTravelAtlasAssetHandler(deps = {}) {
  const readJson = deps.readPrivateJsonFile ?? readPrivateJsonFile;
  const readBytes = deps.readPrivateFileBytes ?? readPrivateFileBytes;

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, PRIVATE_CACHE);
    }
    const slot = new URL(request.url).searchParams.get('slot') ?? '';
    const options = { env: ctx.env, fetchImpl: deps.fetchImpl ?? fetch, label: 'Atlas artwork' };
    try {
      const manifest = await readJson(`${ATLAS_ASSET_DIR}/manifest.json`, options);
      const file = slotFile(manifest, slot);
      if (!file) return errorResponse(404, 'not_found', 'No artwork for that slot.', false, PRIVATE_CACHE);
      const bytes = await readBytes(`${ATLAS_ASSET_DIR}/${file}`, options);
      const ext = file.split('.').pop().toLowerCase();
      return new Response(bytes, {
        status: 200,
        headers: {
          ...PRIVATE_CACHE,
          'content-type': TYPES[ext],
          'x-content-type-options': 'nosniff',
          // SVG is served as an image; no scripts even if opened directly.
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        }
      });
    } catch (error) {
      const status = error?.status === 404 ? 404 : 503;
      return errorResponse(status, status === 404 ? 'not_found' : 'unavailable', 'Atlas artwork is unavailable.', status !== 404, PRIVATE_CACHE);
    }
  }, deps);
}

export default createTravelAtlasAssetHandler();
