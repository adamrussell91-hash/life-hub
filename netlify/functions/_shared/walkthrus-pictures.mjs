/**
 * Teaching WalkThrus step pictures, for the teacher only.
 *
 *   walkthrus_pictures/v1/<technique id>   { id, steps: [svg | null × 5], fetched_at }
 *
 * The five drawings for a technique live in the private data repository
 * (data/teaching/walkthrus/pictures/steps/<id>/step-<n>.svg). They are copied here on first
 * use and on refresh, and never land in a lesson, a published page or Display.
 */
import { techniqueById } from '../../../packages/walkthrus/catalogue.mjs';
import { readPrivateFileBytes } from './private-data-file.mjs';
import { reject } from './question-drop.mjs';

const KEY = (id) => `walkthrus_pictures/v1/${id}`;
const MAX_SVG = 200_000;
export const privatePicturePath = (id, n) => `data/teaching/walkthrus/pictures/steps/${id}/step-${n}.svg`;

/** Line art only: anything that could run or load something is refused, not cleaned. */
export function safeSvg(text) {
  if (typeof text !== 'string' || text.length > MAX_SVG) return null;
  const trimmed = text.trim();
  if (!/^<svg[\s>]/.test(trimmed) || !trimmed.endsWith('</svg>')) return null;
  if (/<script|<foreignObject|<iframe|<image|\son[a-z]+\s*=|javascript:|href\s*=/i.test(trimmed)) return null;
  return trimmed;
}

function checkId(id) {
  const entry = typeof id === 'string' ? techniqueById(id) : null;
  if (!entry || entry.kind !== 'technique') reject(400, 'bad_request', 'Unknown WalkThru.');
  return entry.id;
}

/** The five pictures from the private repo. A missing step is null, so a half-drawn set still shows. */
export async function readPrivatePictures(id, deps = {}) {
  const steps = [];
  for (let n = 1; n <= 5; n += 1) {
    try {
      const bytes = await readPrivateFileBytes(privatePicturePath(id, n), { ...deps, label: 'WalkThru picture' });
      steps.push(safeSvg(new TextDecoder().decode(bytes)));
    } catch (e) {
      if (e?.status === 404) { steps.push(null); continue; }
      throw e;
    }
  }
  return { id, steps, fetched_at: new Date().toISOString() };
}

export async function loadPictures(store, rawId, deps = {}) {
  const id = checkId(rawId);
  const stored = await store.get(KEY(id), { type: 'json', consistency: 'strong' });
  if (stored && Array.isArray(stored.steps) && stored.steps.length === 5) return stored;
  return refreshPictures(store, id, deps);
}

export async function refreshPictures(store, rawId, deps = {}) {
  const id = checkId(rawId);
  const fresh = await readPrivatePictures(id, deps);
  await store.setJSON(KEY(id), fresh);
  return fresh;
}
