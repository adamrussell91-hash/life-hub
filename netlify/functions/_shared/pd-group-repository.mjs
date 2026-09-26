import {
  PD_GROUP_SCHEMA_VERSION,
  generatePdGroupId,
  isValidPdGroupId,
  parsePdGroupRecord,
  validatePdGroupCreateInput,
  validatePdGroupPatchInput
} from './pd-group-schema.mjs';
import { getJSON, listPdGroupKeys, pdGroupKey, setJSON } from './professional-blobs.mjs';

function notFound() {
  return Object.assign(new Error('PD group not found.'), { status: 404, code: 'pd_group_not_found' });
}

export function createPdGroupRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createPdGroupRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generatePdGroupId;

  async function load(id) {
    if (!isValidPdGroupId(id)) throw notFound();
    const record = parsePdGroupRecord(await getJSON(store, pdGroupKey(id)));
    if (!record) throw notFound();
    return record;
  }

  async function createGroup(input) {
    const validated = validatePdGroupCreateInput(input);
    const timestamp = now();
    const record = { schema_version: PD_GROUP_SCHEMA_VERSION, id: generateId(), ...validated, created_at: timestamp, updated_at: timestamp };
    await setJSON(store, pdGroupKey(record.id), record);
    return record;
  }

  async function listGroups() {
    const out = [];
    for (const key of await listPdGroupKeys(store)) {
      const record = parsePdGroupRecord(await getJSON(store, key));
      if (record) out.push(record);
    }
    return out.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }

  async function patchGroup(id, input) {
    const record = await load(id);
    const updated = { ...record, ...validatePdGroupPatchInput(input), updated_at: now() };
    await setJSON(store, pdGroupKey(id), updated);
    return updated;
  }

  return { createGroup, getGroup: load, listGroups, patchGroup };
}
