// netlify/functions/_shared/notion-apply.mjs
import {
  ClassSchema, DocumentSchema, LessonSchema, MEDIA_PLACEHOLDER_PREFIX, UnitSchema
} from './notion-import-core.mjs';
import { classKey, draftLessonKey, getJSON, setJSON, slugify, subjectKey, unitKey } from './teaching-blobs.mjs';
import { blobJsonStore, tryWriteCheckpoint } from './teaching-versions.mjs';
import { documentKey, NOTION_SOURCE_MAP_KEY, readSourceMap } from './notion-import-store.mjs';

const SCHEMA = { unit: UnitSchema, lesson: LessonSchema, class: ClassSchema, document: DocumentSchema };
const KEY = { unit: unitKey, lesson: draftLessonKey, class: classKey, document: documentKey };

export const MEDIA_FAILED_PREFIX = 'notion-media-failed:';

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
  // Notion is the source of truth for these: if it no longer has them, drop them.
  if (!('cover' in planned)) delete merged.cover;
  if (!('outcome_ids' in planned)) delete merged.outcome_ids;
  if (kind === 'unit' && !('kind' in planned)) delete merged.kind;
  // Binned or archived in the Teaching Hub stays that way.
  if (existing.status === 'trashed' || existing.status === 'archived') {
    for (const field of ['status', 'trashed_at', 'previous_status', 'trash_reason']) {
      if (field in existing) merged[field] = existing[field];
      else delete merged[field];
    }
  }
  if (kind === 'unit') {
    const keep = (existing.lesson_ids ?? []).filter((id) => !ownIds.has(id));
    merged.lesson_ids = [...planned.lesson_ids, ...keep.filter((id) => !planned.lesson_ids.includes(id))];
  }
  if (kind === 'class') {
    if (existing.code) merged.code = existing.code;
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

async function removeFromList(store, key, field, id) {
  const record = await getJSON(store, key);
  if (!record || !Array.isArray(record[field]) || !record[field].includes(id)) return;
  await setJSON(store, key, { ...record, [field]: record[field].filter((x) => x !== id) });
}

function hasSentinel(value) {
  if (typeof value === 'string') return value.startsWith(MEDIA_FAILED_PREFIX);
  if (Array.isArray(value)) return value.some(hasSentinel);
  if (value && typeof value === 'object') return Object.values(value).some(hasSentinel);
  return false;
}

function sentinelRefs(value, out = []) {
  if (typeof value === 'string') {
    if (value.startsWith(MEDIA_FAILED_PREFIX)) out.push(value.slice(MEDIA_FAILED_PREFIX.length));
  } else if (Array.isArray(value)) value.forEach((v) => sentinelRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => sentinelRefs(v, out));
  return out;
}

function failureCallout(block, failures, now) {
  const failure = failures.get(sentinelRefs(block.content)[0]);
  const name = failure?.name || 'A file';
  const message = failure?.message || 'the download failed';
  return {
    id: block.id, type: 'block', block_type: 'callout', variant: 'medium',
    visibility: block.visibility ?? 'student_teacher',
    content: { style: 'warning', body: `${name} couldn't be imported (${message}). Upload it again from Notion.` },
    layout: {}, print: {}, settings: {},
    created_at: block.created_at ?? now, updated_at: now, schema_version: block.schema_version ?? 1
  };
}

/** Replace blocks whose content holds a failed-media sentinel, at any nesting depth. */
function fixBlocks(blocks, failures, now) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return block;
    if (hasSentinel(block.content)) {
      const c = block.content;
      // Layout containers: only replace the failed children, not the container.
      if (block.block_type === 'section' && Array.isArray(c?.blocks)) {
        return { ...block, content: { ...c, blocks: fixBlocks(c.blocks, failures, now) } };
      }
      if (block.block_type === 'columns' && Array.isArray(c?.columns)) {
        return { ...block, content: { ...c, columns: c.columns.map((col) => ({ ...col, blocks: fixBlocks(col.blocks, failures, now) })) } };
      }
      if (block.block_type === 'tabs' && Array.isArray(c?.tabs)) {
        return { ...block, content: { ...c, tabs: c.tabs.map((tab) => ({ ...tab, blocks: fixBlocks(tab.blocks, failures, now) })) } };
      }
      return failureCallout(block, failures, now);
    }
    return block;
  });
}

function applyFailures(record, failures, now, warnings, entity) {
  if (record.cover && hasSentinel(record.cover)) {
    const failure = failures.get(sentinelRefs(record.cover)[0]);
    delete record.cover;
    warnings.push({
      page_id: entity.page_id, notion_block_id: null, rule: 'file_failed',
      message: `Cover wasn't imported: ${failure?.message ?? 'the download failed'}`
    });
  }
  if (Array.isArray(record.blocks)) record.blocks = fixBlocks(record.blocks, failures, now);
  if (record.homepage && Array.isArray(record.homepage.custom)) {
    record.homepage = { ...record.homepage, custom: fixBlocks(record.homepage.custom, failures, now) };
  }
  return record;
}

/**
 * @param rehost (store, mediaRef) => Promise<{ok, url?, text?, reason?, message?}>
 * @returns report { written, skipped, warnings }
 */
export async function applyPlan(store, plan, { now, rehost, onProgress = async () => {} }) {
  const warnings = [...plan.warnings];
  const skipped = [];
  const written = [];

  const urls = new Map();
  const failures = new Map();
  let done = 0;
  for (const ref of plan.media) {
    let result;
    try {
      result = await rehost(store, ref);
    } catch (error) {
      result = { ok: false, reason: 'failed', message: `Could not import ${ref.name}: ${error.message}` };
    }
    if (result.ok) urls.set(ref.ref, result.text ?? result.url);
    else {
      // Notion's signed URLs expire within about an hour, so never fall back to them.
      urls.set(ref.ref, `${MEDIA_FAILED_PREFIX}${ref.ref}`);
      failures.set(ref.ref, { name: ref.name, message: result.message });
      warnings.push({
        page_id: ref.page_id, notion_block_id: ref.notion_block_id,
        rule: result.reason === 'too_big' ? 'file_too_big' : 'file_failed',
        message: `${result.message} The block was replaced with a note to upload it again.`
      });
    }
    await onProgress({ phase: 'media', done: ++done, total: plan.media.length });
  }

  const skip = (entity, reason, message) => {
    skipped.push({ page_id: entity.page_id, parent_page_id: entity.parent_page_id ?? null, title: entity.title, reason });
    if (message) warnings.push({ page_id: entity.page_id, notion_block_id: null, rule: 'invalid', message });
  };

  // Validate everything first so parents can drop children that fail.
  let ready = [];
  for (const entity of plan.entities) {
    if (entity.needs.length) {
      skip(entity, `Needs a ${entity.needs.join(' and ')}.`);
      continue;
    }
    const record = applyFailures(replacePlaceholders(entity.record, urls), failures, now, warnings, entity);
    const parsed = SCHEMA[entity.kind].safeParse(record);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      skip(entity, 'Did not pass validation.', `“${entity.title}” was not imported: ${issue.path.join('.')} ${issue.message}`);
      continue;
    }
    ready.push({ entity, record });
  }

  // Drop entities whose parents are missing, until nothing changes.
  const newSubjectIds = new Set(plan.new_subjects.map((s) => s.id));
  const ownIds = new Set(plan.entities.map((e) => e.id));
  const exists = new Map();
  const stored = async (key) => {
    if (!exists.has(key)) exists.set(key, Boolean(await getJSON(store, key)));
    return exists.get(key);
  };
  const titleById = new Map(plan.entities.map((e) => [e.id, e.title]));
  for (let changed = true; changed;) {
    changed = false;
    const readyIds = new Set(ready.map((r) => r.entity.id));
    const next = [];
    for (const item of ready) {
      const { entity, record } = item;
      let problem = null;
      if (entity.kind === 'lesson') {
        const unitId = record.unit_id;
        if (ownIds.has(unitId) && !readyIds.has(unitId) && !(await stored(unitKey(unitId)))) {
          problem = `“${entity.title}” was not imported because its unit “${titleById.get(unitId)}” was not imported.`;
        } else if (!ownIds.has(unitId) && !(await stored(unitKey(unitId)))) {
          problem = `“${entity.title}” was not imported because its unit doesn't exist in the Teaching Hub.`;
        }
      } else if (record.subject_id && !newSubjectIds.has(record.subject_id) && !(await stored(subjectKey(record.subject_id)))) {
        problem = `“${entity.title}” was not imported because its subject doesn't exist in the Teaching Hub.`;
      }
      if (problem) { skip(entity, 'Its parent was not imported.', problem); changed = true; } else next.push(item);
    }
    ready = next;
  }

  const readyIds = new Set(ready.map((r) => r.entity.id));
  // Own entities that failed this run but already exist stay linked from their parents.
  const keepLinked = new Set();
  for (const entity of plan.entities) {
    if (readyIds.has(entity.id)) continue;
    if (await stored(KEY[entity.kind](entity.id))) keepLinked.add(entity.id);
  }
  const linkable = (id) => readyIds.has(id) || !ownIds.has(id) || keepLinked.has(id);
  for (const { entity, record } of ready) {
    if (entity.kind === 'unit') record.lesson_ids = record.lesson_ids.filter(linkable);
    if (entity.kind === 'class') record.active_unit_ids = record.active_unit_ids.filter(linkable);
  }

  const versions = blobJsonStore(store);
  const sourceMap = await readSourceMap(store);
  const createdSubjects = new Set();
  const ensureSubject = async (id) => {
    if (createdSubjects.has(id) || !newSubjectIds.has(id)) return;
    createdSubjects.add(id);
    if (await getJSON(store, subjectKey(id))) return;
    const subject = plan.new_subjects.find((s) => s.id === id);
    await setJSON(store, subjectKey(id), {
      id, type: 'subject', title: subject.title, display_title: subject.title, slug: slugify(subject.title),
      status: 'active', unit_ids: [], outcome_ids: [], class_ids: [], created_at: now, updated_at: now, schema_version: 1
    });
  };

  done = 0;
  for (const { entity, record } of ready) {
    const key = KEY[entity.kind](entity.id);
    const existing = await getJSON(store, key);
    let checkpoint = { ok: true };
    if (existing && (entity.kind === 'lesson' || entity.kind === 'unit')) {
      checkpoint = await tryWriteCheckpoint(versions, { kind: entity.kind, parentId: entity.id, snapshot: existing, reason: 'notion_import', now });
    }
    if (existing && entity.kind === 'class') {
      checkpoint = await tryWriteCheckpoint(versions, { kind: 'class_homepage', parentId: entity.id, snapshot: { homepage: existing.homepage }, reason: 'notion_import', now });
    }
    if (!checkpoint.ok) {
      skip(entity, 'Version history could not be saved.', `Version history couldn't be saved for “${entity.title}”, so it wasn't replaced. Try the import again.`);
      continue;
    }
    if (record.subject_id) await ensureSubject(record.subject_id);
    if (existing && (existing.status === 'trashed' || existing.status === 'archived')) {
      warnings.push({
        page_id: entity.page_id, notion_block_id: null, rule: 'invalid',
        message: `“${entity.title}” is ${existing.status === 'trashed' ? 'in the bin' : 'archived'} in the Teaching Hub; it was updated but left there.`
      });
    }
    await setJSON(store, key, merge(entity.kind, existing, record, ownIds));
    if (entity.kind === 'lesson') {
      if (existing?.unit_id && existing.unit_id !== record.unit_id) {
        await removeFromList(store, unitKey(existing.unit_id), 'lesson_ids', entity.id);
      }
      if (!ownIds.has(record.unit_id)) await addToList(store, unitKey(record.unit_id), 'lesson_ids', entity.id);
    }
    if (entity.kind === 'unit' || entity.kind === 'class') {
      const field = entity.kind === 'unit' ? 'unit_ids' : 'class_ids';
      if (existing?.subject_id && existing.subject_id !== record.subject_id) {
        await removeFromList(store, subjectKey(existing.subject_id), field, entity.id);
      }
      await addToList(store, subjectKey(record.subject_id), field, entity.id);
    }
    sourceMap[entity.page_id] = entity.id;
    written.push(entity.id);
    await onProgress({ phase: 'write', done: ++done, total: ready.length });
  }
  await setJSON(store, NOTION_SOURCE_MAP_KEY, sourceMap);
  return { written, skipped: [...plan.skipped, ...skipped], warnings };
}
