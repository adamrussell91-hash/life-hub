import {
  THREAD_SCHEMA_VERSION,
  generateThreadId,
  isValidThreadId,
  parseThreadRecord,
  projectThread,
  validateThreadCreateInput,
  validateThreadPatchInput
} from './thread-schema.mjs';
import { getJSON, listThreadKeys, setJSON, threadKey } from './professional-blobs.mjs';

function notFound() {
  return Object.assign(new Error('Thread not found.'), { status: 404, code: 'thread_not_found' });
}

export function createThreadRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createThreadRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateThreadId;

  async function load(id) {
    if (!isValidThreadId(id)) throw notFound();
    const record = parseThreadRecord(await getJSON(store, threadKey(id)));
    if (!record) throw notFound();
    return record;
  }

  async function createThread(input) {
    const validated = validateThreadCreateInput(input);
    const timestamp = now();
    const record = {
      schema_version: THREAD_SCHEMA_VERSION,
      id: generateId(),
      ...validated,
      status: 'open',
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, threadKey(record.id), record);
    return projectThread(record);
  }

  async function getThread(id) {
    return projectThread(await load(id));
  }

  async function listThreads() {
    const out = [];
    for (const key of await listThreadKeys(store)) {
      const record = parseThreadRecord(await getJSON(store, key));
      if (record) out.push(projectThread(record));
    }
    out.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    return out;
  }

  async function patchThread(id, input) {
    const record = await load(id);
    const patch = validateThreadPatchInput(input, record.kind);
    const updated = { ...record, ...patch, updated_at: now() };
    await setJSON(store, threadKey(id), updated);
    return projectThread(updated);
  }

  return { createThread, getThread, listThreads, patchThread };
}
