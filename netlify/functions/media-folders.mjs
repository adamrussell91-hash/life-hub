import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { getJSON, mediaFoldersKey, setJSON } from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/media-folders' };

const MAX_FOLDERS = 500;
const MAX_NAME = 80;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** The Resource Library folder tree: one record holding every folder, nested by parent_id. */
export async function readMediaFolders(store) {
  const record = await getJSON(store, mediaFoldersKey(), { consistency: 'strong' });
  return Array.isArray(record?.folders) ? record.folders : [];
}

export function validateMediaFolders(input) {
  if (!Array.isArray(input)) throw new Error('folders must be a list');
  if (input.length > MAX_FOLDERS) throw new Error(`At most ${MAX_FOLDERS} folders`);
  const folders = [];
  const ids = new Set();
  for (const row of input) {
    if (!row || typeof row !== 'object') throw new Error('Each folder must be an object');
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const parent_id = typeof row.parent_id === 'string' && row.parent_id ? row.parent_id : null;
    if (!ID_PATTERN.test(id)) throw new Error('Folder id is invalid');
    if (ids.has(id)) throw new Error(`Duplicate folder id ${id}`);
    if (!name) throw new Error('Folder name is required');
    if (name.length > MAX_NAME) throw new Error(`Folder names are at most ${MAX_NAME} characters`);
    ids.add(id);
    folders.push({ id, name, parent_id });
  }
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  for (const folder of folders) {
    if (folder.parent_id && !byId.has(folder.parent_id)) {
      throw new Error(`Folder ${folder.name} points at a missing parent`);
    }
    const seen = new Set([folder.id]);
    let parent = folder.parent_id;
    while (parent) {
      if (seen.has(parent)) throw new Error(`Folder ${folder.name} is inside itself`);
      seen.add(parent);
      parent = byId.get(parent)?.parent_id ?? null;
    }
  }
  return folders;
}

export function createMediaFoldersHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      return withCors(okResponse(200, { folders: await readMediaFolders(store) }), request, env);
    }
    if (request.method !== 'PUT') {
      return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    let folders;
    try {
      folders = validateMediaFolders(parsed.value.folders);
    } catch (error) {
      return withCors(errorResponse(400, 'validation_error', error.message, false), request, env);
    }
    await setJSON(store, mediaFoldersKey(), { folders, updated_at: new Date().toISOString() });
    return withCors(okResponse(200, { folders }), request, env);
  }, deps);
}

export default createMediaFoldersHandler();
