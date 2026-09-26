import { randomUUID } from 'node:crypto';

// Groups PD events into a series (sessions weeks apart) or a program (a
// multi-day seminar, one event per day). Membership is an `in_pd_group` link.
// A one-off PD event has no group.

export const PD_GROUP_SCHEMA_VERSION = 1;
export const PD_GROUP_SHAPES = new Set(['series', 'program']);
const PD_GROUP_ID_PATTERN = /^pd_group_[0-9a-f-]{36}$/;

export function generatePdGroupId() {
  return `pd_group_${randomUUID()}`;
}

export function isValidPdGroupId(id) {
  return typeof id === 'string' && PD_GROUP_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function readTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > 200) throw validationError('invalid_title', 'title must be 1–200 characters.');
  return title;
}

function readProvider(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 200) throw validationError('invalid_provider', 'provider must be at most 200 characters.');
  return value.trim();
}

const STORED_KEYS = new Set(['schema_version', 'id', 'shape', 'title', 'provider', 'created_at', 'updated_at']);

export function parsePdGroupRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!STORED_KEYS.has(key)) return null;
  if (raw.schema_version !== PD_GROUP_SCHEMA_VERSION || !isValidPdGroupId(raw.id)) return null;
  if (!PD_GROUP_SHAPES.has(raw.shape) || typeof raw.title !== 'string') return null;
  return { ...raw, provider: raw.provider ?? null };
}

export function validatePdGroupCreateInput(input) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'PD group creation requires a body object.');
  if (!PD_GROUP_SHAPES.has(input.shape)) throw validationError('invalid_shape', 'shape must be series or program.');
  return { shape: input.shape, title: readTitle(input.title), provider: readProvider(input.provider) };
}

export function validatePdGroupPatchInput(input) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'PD group patch requires a body object.');
  const patch = {};
  if (input.shape !== undefined) {
    if (!PD_GROUP_SHAPES.has(input.shape)) throw validationError('invalid_shape', 'shape must be series or program.');
    patch.shape = input.shape;
  }
  if (input.title !== undefined) patch.title = readTitle(input.title);
  if (input.provider !== undefined) patch.provider = readProvider(input.provider);
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
  return patch;
}

export function pdGroupDisplayLabel(record) {
  return record?.title || 'PD';
}
