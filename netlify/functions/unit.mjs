import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { CLASS_PREFIX, classKey, listJSON, setJSON, unitKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/units/:id' };

/** Permanent delete unhooks the unit from every class, so no class keeps it as current or active. */
export async function unhookUnitFromClasses(store, id) {
  const classes = await listJSON(store, CLASS_PREFIX);
  for (const cls of classes) {
    if (typeof cls?.id !== 'string') continue;
    const active = Array.isArray(cls.active_unit_ids) ? cls.active_unit_ids : [];
    if (cls.current_unit_id !== id && !active.includes(id)) continue;
    const rest = active.filter(unitId => unitId !== id);
    const next = { ...cls, active_unit_ids: rest, updated_at: new Date().toISOString() };
    if (cls.current_unit_id === id) {
      if (rest[0]) next.current_unit_id = rest[0];
      else delete next.current_unit_id;
    }
    await setJSON(store, classKey(cls.id), next);
  }
}

export function createUnitHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: unitKey,
    notFound: 'Unit not found',
    versionKind: 'unit',
    onDelete: unhookUnitFromClasses
  }, deps);
}

export default createUnitHandler();
