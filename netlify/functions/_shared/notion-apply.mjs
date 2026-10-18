// netlify/functions/_shared/notion-apply.mjs
import {
  ClassSchema, DocumentSchema, LessonSchema, MEDIA_PLACEHOLDER_PREFIX, UnitSchema
} from './notion-import-core.mjs';
import { classKey, draftLessonKey, getJSON, setJSON, slugify, subjectKey, unitKey } from './teaching-blobs.mjs';
import { blobJsonStore, tryWriteCheckpoint } from './teaching-versions.mjs';
import { documentKey, NOTION_SOURCE_MAP_KEY, readSourceMap } from './notion-import-store.mjs';

const SCHEMA = { unit: UnitSchema, lesson: LessonSchema, class: ClassSchema, document: DocumentSchema };
const KEY = { unit: unitKey, lesson: draftLessonKey, class: classKey, document: documentKey };

export function replacePlaceholders(value, urls) {
  if (typeof value === 'string' && value.startsWith(MEDIA_PLACEHOLDER_PREFIX)) {
    return urls.get(value.slice(MEDIA_PLACEHOLDER_PREFIX.length)) ?? value;
  }
  if (Array.isArray(value)) return value.map((v) => replacePlaceholders(v, urls));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replacePlaceholders(v, urls)]));
  }
  return value;
}

function merge(kind, existing, planned, ownIds) {
  if (!existing) return planned;
  const merged = { ...existing, ...planned, created_at: existing.created_at ?? planned.created_at };
  if (kind === 'unit') {
    const keep = (existing.lesson_ids ?? []).filter((id) => !ownIds.has(id));
    merged.lesson_ids = [...planned.lesson_ids, ...keep.filter((id) => !planned.lesson_ids.includes(id))];
  }
  if (kind === 'class') {
    const keep = (existing.active_unit_ids ?? []).filter((id) => !planned.active_unit_ids.includes(id));
    merged.active_unit_ids = [...planned.active_unit_ids, ...keep];
    merged.homepage = { ...(existing.homepage ?? {}), custom: planned.homepage.custom };
    if (!merged.homepage.announcements) merged.homepage.announcements = [];
    if (!merged.homepage.resources) merged.homepage.resources = [];
  }
  return merged;
}

async function addToList(store, key, field, id) {
  const record = await getJSON(store, key);
  if (!record) return;
  const list = Array.isArray(record[field]) ? record[field] : [];
  if (list.includes(id)) return;
  await setJSON(store, key, { ...record, [field]: [...list, id] });
}

/**
 * @param rehost (store, mediaRef) => Promise<{ok, url?, text?, reason?, message?}>
 * @returns report { written, skipped, warnings }
 */
export async function applyPlan(store, plan, { now, rehost, onProgress = async () => {} }) {
  const warnings = [...plan.warnings];
  const skipped = [];
  const written = [];

  for (const subject of plan.new_subjects) {
    if (await getJSON(store, subjectKey(subject.id))) continue;
    await setJSON(store, subjectKey(subject.id), {
      id: subject.id, type: 'subject', title: subject.title, display_title: subject.title, slug: slugify(subject.title),
      status: 'active', unit_ids: [], outcome_ids: [], class_ids: [], created_at: now, updated_at: now, schema_version: 1
    });
  }

  const urls = new Map();
  let done = 0;
  for (const ref of plan.media) {
    const result = await rehost(store, ref);
    if (result.ok) urls.set(ref.ref, result.text ?? result.url);
    else {
      urls.set(ref.ref, ref.purpose === 'html' ? `<!-- ${ref.name} could not be imported -->` : ref.url);
      warnings.push({
        page_id: ref.page_id, notion_block_id: ref.notion_block_id,
        rule: result.reason === 'too_big' ? 'file_too_big' : 'file_failed',
        message: `${result.message} The block links to the original file instead.`
      });
    }
    await onProgress({ phase: 'media', done: ++done, total: plan.media.length });
  }

  // Validate everything first so parents can drop children that fail.
  const ready = [];
  for (const entity of plan.entities) {
    if (entity.needs.length) {
      skipped.push({ page_id: entity.page_id, reason: `Needs a ${entity.needs.join(' and ')}.` });
      continue;
    }
    const record = replacePlaceholders(entity.record, urls);
    const parsed = SCHEMA[entity.kind].safeParse(record);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      skipped.push({ page_id: entity.page_id, reason: 'Did not pass validation.' });
      warnings.push({ page_id: entity.page_id, notion_block_id: null, rule: 'invalid', message: `“${entity.title}” was not imported: ${issue.path.join('.')} ${issue.message}` });
      continue;
    }
    ready.push({ entity, record });
  }
  const readyIds = new Set(ready.map((r) => r.entity.id));
  const ownIds = new Set(plan.entities.map((e) => e.id));
  for (const { entity, record } of ready) {
    if (entity.kind === 'unit') record.lesson_ids = record.lesson_ids.filter((id) => readyIds.has(id) || !ownIds.has(id));
    if (entity.kind === 'class') record.active_unit_ids = record.active_unit_ids.filter((id) => readyIds.has(id) || !ownIds.has(id));
  }

  const versions = blobJsonStore(store);
  const sourceMap = await readSourceMap(store);
  done = 0;
  for (const { entity, record } of ready) {
    const key = KEY[entity.kind](entity.id);
    const existing = await getJSON(store, key);
    if (existing && (entity.kind === 'lesson' || entity.kind === 'unit')) {
      await tryWriteCheckpoint(versions, { kind: entity.kind, parentId: entity.id, snapshot: existing, reason: 'notion_import', now });
    }
    if (existing && entity.kind === 'class') {
      await tryWriteCheckpoint(versions, { kind: 'class_homepage', parentId: entity.id, snapshot: { homepage: existing.homepage }, reason: 'notion_import', now });
    }
    await setJSON(store, key, merge(entity.kind, existing, record, ownIds));
    if (entity.kind === 'lesson' && !ownIds.has(record.unit_id)) {
      await addToList(store, unitKey(record.unit_id), 'lesson_ids', entity.id);
    }
    if (entity.kind === 'unit') await addToList(store, subjectKey(record.subject_id), 'unit_ids', entity.id);
    if (entity.kind === 'class') await addToList(store, subjectKey(record.subject_id), 'class_ids', entity.id);
    sourceMap[entity.page_id] = entity.id;
    written.push(entity.id);
    await onProgress({ phase: 'write', done: ++done, total: ready.length });
  }
  await setJSON(store, NOTION_SOURCE_MAP_KEY, sourceMap);
  return { written, skipped: [...plan.skipped, ...skipped], warnings };
}
