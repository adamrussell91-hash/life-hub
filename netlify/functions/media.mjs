import {
  MEDIA_PREFIX,
  mediaKey,
  newId,
  setJSON,
  slugify
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/media' };

const PROVIDERS = new Set(['external', 'google_drive']);
const MEDIA_TYPES = new Set(['pdf', 'image', 'video', 'link', 'other']);

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function createMediaRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const media_type = typeof body.media_type === 'string' ? body.media_type : '';

  if (!title) throw teachingWriteError(400, 'validation_error', 'title is required');
  if (!PROVIDERS.has(provider)) {
    throw teachingWriteError(400, 'validation_error', 'provider must be external or google_drive');
  }
  if (!MEDIA_TYPES.has(media_type)) {
    throw teachingWriteError(400, 'validation_error', 'media_type is required');
  }

  const timestamp = new Date().toISOString();
  const id = newId('media');
  const record = {
    id,
    type: 'media',
    title,
    slug: slugify(title),
    status: 'active',
    provider,
    media_type,
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  for (const key of ['preview_url', 'download_url', 'thumbnail_url', 'provider_file_id', 'mime_type', 'file_name']) {
    const value = optionalText(body[key]);
    if (value) record[key] = value;
  }

  await setJSON(store, mediaKey(id), record);
  return record;
}

export function createMediaHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createMediaRecord,
    listPrefix: MEDIA_PREFIX,
    listKey: 'media'
  }, deps);
}

export default createMediaHandler();
