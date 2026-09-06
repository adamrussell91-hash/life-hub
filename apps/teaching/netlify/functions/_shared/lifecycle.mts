import { applyArchive, applyRestoreFromTrash, applyTrash } from '../../../src/recovery/lifecycle';
import {
  collectMediaIdsFromBlocks,
  scanClassDependencies,
  scanLessonDependencies,
  scanMediaDependencies,
  scanUnitDependencies,
  type DependencyHit
} from '../../../src/recovery/dependencies';
import {
  classKey,
  compositionKey,
  draftLessonKey,
  lessonTemplateKey,
  mediaKey,
  publishedLessonKey,
  scheduledLessonKey,
  unitKey,
  unitTemplateKey,
  versionsPrefix
} from '../../../src/storage/keys';
import type { JsonStore } from './versions.mts';

export type LifecycleEntityType =
  | 'lesson'
  | 'unit'
  | 'class'
  | 'media'
  | 'lesson_template'
  | 'unit_template'
  | 'composition';

const COLLECTIONS: Record<string, LifecycleEntityType> = {
  lessons: 'lesson',
  units: 'unit',
  classes: 'class',
  media: 'media',
  'lesson-templates': 'lesson_template',
  'unit-templates': 'unit_template',
  compositions: 'composition'
};

const PREFIXES: Array<{ prefix: string; type: LifecycleEntityType }> = [
  { prefix: 'lessons/', type: 'lesson' },
  { prefix: 'units/', type: 'unit' },
  { prefix: 'classes/', type: 'class' },
  { prefix: 'media/', type: 'media' },
  { prefix: 'templates/lessons/', type: 'lesson_template' },
  { prefix: 'templates/units/', type: 'unit_template' },
  { prefix: 'templates/compositions/', type: 'composition' }
];

export class LifecycleError extends Error {
  code: string;
  dependencies?: DependencyHit[];

  constructor(code: string, message: string, dependencies?: DependencyHit[]) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.dependencies = dependencies;
  }
}

export function collectionToType(collection: string): LifecycleEntityType | null {
  return COLLECTIONS[collection] ?? null;
}

export function applyStatusTransition<T extends { status: string }>(
  obj: T,
  status: 'active' | 'archived' | 'trashed',
  timestamp: string,
  trashReason?: string
) {
  if (status === 'trashed') return applyTrash(obj as T & { status: 'active' | 'archived' | 'trashed' }, timestamp, trashReason);
  if (status === 'archived') return applyArchive(obj as T & { status: 'active' | 'archived' | 'trashed' });
  if ((obj as { status?: string }).status === 'trashed') {
    return applyRestoreFromTrash(obj as T & { status: 'trashed' });
  }
  const {
    trashed_at: _t,
    previous_status: _p,
    trash_reason: _r,
    ...rest
  } = obj as T & { trashed_at?: string; previous_status?: string; trash_reason?: string };
  return { ...rest, status: 'active' };
}

function keyFor(type: LifecycleEntityType, id: string) {
  if (type === 'lesson') return draftLessonKey(id);
  if (type === 'unit') return unitKey(id);
  if (type === 'class') return classKey(id);
  if (type === 'media') return mediaKey(id);
  if (type === 'lesson_template') return lessonTemplateKey(id);
  if (type === 'unit_template') return unitTemplateKey(id);
  return compositionKey(id);
}

function versionKindFor(type: LifecycleEntityType) {
  if (type === 'lesson') return 'lesson';
  if (type === 'unit') return 'unit';
  if (type === 'class') return 'class_homepage';
  return null;
}

async function listPrefix(store: JsonStore, prefix: string) {
  if (typeof store.listKeys === 'function') return store.listKeys(prefix);
  return [];
}

async function readWorld(store: JsonStore) {
  const [lessonKeys, unitKeys, classKeys, scheduleKeys] = await Promise.all([
    listPrefix(store, 'lessons/'),
    listPrefix(store, 'units/'),
    listPrefix(store, 'classes/'),
    listPrefix(store, 'scheduled_lessons/')
  ]);
  const lessons = (await Promise.all(lessonKeys.map(key => store.getJSON(key)))).filter(Boolean) as Array<Record<string, unknown>>;
  const units = (await Promise.all(unitKeys.map(key => store.getJSON(key)))).filter(Boolean) as Array<Record<string, unknown>>;
  const classes = (await Promise.all(classKeys.map(key => store.getJSON(key)))).filter(Boolean) as Array<Record<string, unknown>>;
  const scheduled = (await Promise.all(scheduleKeys.map(key => store.getJSON(key)))).filter(Boolean) as Array<Record<string, unknown>>;
  return { lessons, units, classes, scheduled };
}

export async function listTrash(store: JsonStore) {
  const summaries = [];
  for (const { prefix, type } of PREFIXES) {
    const keys = await listPrefix(store, prefix);
    for (const key of keys) {
      if (key.endsWith('/_index') || key.includes('/versions/')) continue;
      const record = await store.getJSON<Record<string, unknown>>(key);
      if (!record || record.status !== 'trashed') continue;
      summaries.push({
        type,
        id: String(record.id ?? key.split('/').pop()),
        title: typeof record.title === 'string' ? record.title : String(record.id ?? ''),
        trashed_at: typeof record.trashed_at === 'string' ? record.trashed_at : undefined,
        previous_status: typeof record.previous_status === 'string' ? record.previous_status : undefined
      });
    }
  }
  return summaries;
}

export async function restoreEntityFromTrash(store: JsonStore, type: LifecycleEntityType, id: string) {
  const key = keyFor(type, id);
  const record = await store.getJSON<Record<string, unknown>>(key);
  if (!record) throw new LifecycleError('not_found', 'Not found');
  if (record.status !== 'trashed') throw new LifecycleError('validation_error', 'Entity is not in trash');
  const next = applyRestoreFromTrash(record as { status: 'trashed'; previous_status?: 'active' | 'archived' });
  await store.setJSON(key, next);
  return next;
}

export async function scanDependencies(store: JsonStore, type: LifecycleEntityType, id: string): Promise<DependencyHit[]> {
  const world = await readWorld(store);
  if (type === 'lesson') {
    return scanLessonDependencies(id, {
      units: world.units.map(unit => ({
        id: String(unit.id),
        title: String(unit.title ?? unit.id),
        lesson_ids: Array.isArray(unit.lesson_ids) ? unit.lesson_ids.map(String) : []
      })),
      scheduled_lessons: world.scheduled.map(item => ({
        id: String(item.id),
        lesson_id: String(item.lesson_id),
        class_id: String(item.class_id)
      }))
    });
  }
  if (type === 'unit') {
    return scanUnitDependencies(id, {
      classes: world.classes.map(cls => ({
        id: String(cls.id),
        title: String(cls.title ?? cls.id),
        active_unit_ids: Array.isArray(cls.active_unit_ids) ? cls.active_unit_ids.map(String) : [],
        current_unit_id: typeof cls.current_unit_id === 'string' ? cls.current_unit_id : undefined
      }))
    });
  }
  if (type === 'class') {
    return scanClassDependencies(id, {
      scheduled_lessons: world.scheduled.map(item => ({
        id: String(item.id),
        class_id: String(item.class_id)
      }))
    });
  }
  if (type === 'media') {
    const documents = world.lessons.map(lesson => ({
      type: 'lesson',
      id: String(lesson.id),
      title: typeof lesson.title === 'string' ? lesson.title : undefined,
      mediaIds: collectMediaIdsFromBlocks(Array.isArray(lesson.blocks) ? lesson.blocks as never : [])
    }));
    return scanMediaDependencies(id, { documents });
  }
  return [];
}

export async function permanentDelete(store: JsonStore, type: LifecycleEntityType, id: string) {
  const key = keyFor(type, id);
  const record = await store.getJSON<Record<string, unknown>>(key);
  if (!record) throw new LifecycleError('not_found', 'Not found');
  if (record.status !== 'trashed') {
    throw new LifecycleError('validation_error', 'Trash the entity before permanent delete');
  }
  const dependencies = await scanDependencies(store, type, id);
  if (dependencies.length) {
    throw new LifecycleError('has_dependencies', 'Still referenced', dependencies);
  }
  await store.delete(key);
  if (type === 'lesson') await store.delete(publishedLessonKey(id));
  const kind = versionKindFor(type);
  if (kind && store.listKeys) {
    const versionKeys = await store.listKeys(versionsPrefix(kind, id));
    await Promise.all(versionKeys.map(versionKey => store.delete(versionKey)));
  }
}
