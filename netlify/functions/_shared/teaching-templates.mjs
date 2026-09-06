import {
  LESSON_TEMPLATE_PREFIX,
  UNIT_TEMPLATE_PREFIX,
  listJSON,
  newId,
  setJSON,
  slugify
} from './teaching-blobs.mjs';
import { teachingWriteError } from './teaching-create.mjs';

export function templateSummary(entry) {
  return {
    id: entry.id,
    title: entry.title,
    updated_at: entry.updated_at
  };
}

export async function listActiveTemplateSummaries(store, prefix) {
  const items = await listJSON(store, prefix);
  return items
    .filter(item => item && item.status === 'active' && typeof item.id === 'string' && typeof item.title === 'string')
    .map(templateSummary)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

export async function createTemplateRecord(store, body, { type, idPrefix, prefix }) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    throw teachingWriteError(400, 'validation_error', 'title is required');
  }
  if (body.blocks !== undefined && !Array.isArray(body.blocks)) {
    throw teachingWriteError(400, 'validation_error', 'blocks must be an array when provided');
  }
  const timestamp = new Date().toISOString();
  const id = newId(idPrefix);
  const record = {
    id,
    type,
    title,
    slug: slugify(title),
    status: 'active',
    ...(type === 'unit_template' && typeof body.description === 'string'
      ? { description: body.description }
      : {}),
    blocks: Array.isArray(body.blocks) ? body.blocks : [],
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };
  await setJSON(store, `${prefix}${id}`, record);
  return record;
}

export function createLessonTemplateRecord(store, body) {
  return createTemplateRecord(store, body, {
    type: 'lesson_template',
    idPrefix: 'lesson_template',
    prefix: LESSON_TEMPLATE_PREFIX
  });
}

export function createUnitTemplateRecord(store, body) {
  return createTemplateRecord(store, body, {
    type: 'unit_template',
    idPrefix: 'unit_template',
    prefix: UNIT_TEMPLATE_PREFIX
  });
}
