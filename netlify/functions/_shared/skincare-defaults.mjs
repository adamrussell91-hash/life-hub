import { load } from 'js-yaml';
import { decodeBlob } from './decode-blob.mjs';
import { SKINCARE_ROUTINES, mergeSkincareRoutines } from '../../../apps/life/js/app/skincare-routines-data.js';

/** Private cold-start routine (same shape as the public template). Server side only. */
export const PRIVATE_SKINCARE_ROUTINES_PATH = 'config/skincare-routines.yml';

export function skincareRoutinesFromYaml(text) {
  if (typeof text !== 'string' || !text.trim()) return SKINCARE_ROUTINES;
  try {
    return mergeSkincareRoutines(load(text));
  } catch {
    return SKINCARE_ROUTINES;
  }
}

/**
 * The seed routine for an empty shelf: the private repo's config/skincare-routines.yml
 * when present, else the neutral template (no products). Never throws.
 */
export async function loadSkincareDefaults({ tree = [], readBlob } = {}) {
  const entry = Array.isArray(tree)
    ? tree.find(item => item?.type === 'blob' && item.path === PRIVATE_SKINCARE_ROUTINES_PATH)
    : null;
  if (!entry?.sha || typeof readBlob !== 'function') return SKINCARE_ROUTINES;
  try {
    return skincareRoutinesFromYaml(decodeBlob(await readBlob(entry.sha)));
  } catch {
    return SKINCARE_ROUTINES;
  }
}
