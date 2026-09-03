import type { Block } from '@/schemas/block';

export type DependencyHit = {
  type: 'class' | 'unit' | 'scheduled_lesson' | 'lesson' | 'media_ref';
  id: string;
  title?: string;
  detail: string;
};

export function scanUnitDependencies(
  unitId: string,
  world: {
    classes: Array<{
      id: string;
      title: string;
      active_unit_ids?: string[];
      current_unit_id?: string;
    }>;
  }
): DependencyHit[] {
  const hits: DependencyHit[] = [];
  for (const c of world.classes) {
    if (c.active_unit_ids?.includes(unitId) || c.current_unit_id === unitId) {
      hits.push({
        type: 'class',
        id: c.id,
        title: c.title,
        detail: 'Class references this unit'
      });
    }
  }
  return hits;
}

export function scanLessonDependencies(
  lessonId: string,
  world: {
    units: Array<{ id: string; title: string; lesson_ids: string[] }>;
    scheduled_lessons: Array<{ id: string; lesson_id: string; class_id: string }>;
  }
): DependencyHit[] {
  const hits: DependencyHit[] = [];
  for (const u of world.units) {
    if (u.lesson_ids.includes(lessonId)) {
      hits.push({ type: 'unit', id: u.id, title: u.title, detail: 'Unit lesson_ids includes lesson' });
    }
  }
  for (const s of world.scheduled_lessons) {
    if (s.lesson_id === lessonId) {
      hits.push({
        type: 'scheduled_lesson',
        id: s.id,
        detail: `Scheduled on class ${s.class_id}`
      });
    }
  }
  return hits;
}

export function scanClassDependencies(
  classId: string,
  world: { scheduled_lessons: Array<{ id: string; class_id: string }> }
): DependencyHit[] {
  return world.scheduled_lessons
    .filter((s) => s.class_id === classId)
    .map((s) => ({
      type: 'scheduled_lesson' as const,
      id: s.id,
      detail: 'Scheduled lesson belongs to class'
    }));
}

/** Walk block trees for media_id references — implement against Block type in repo. */
export function scanMediaDependencies(
  mediaId: string,
  world: { documents: Array<{ type: string; id: string; title?: string; mediaIds: string[] }> }
): DependencyHit[] {
  return world.documents
    .filter((d) => d.mediaIds.includes(mediaId))
    .map((d) => ({
      type: 'media_ref' as const,
      id: d.id,
      title: d.title,
      detail: `Referenced from ${d.type}`
    }));
}

/**
 * Collect unique media_id values from a block tree (section / columns / tabs / gallery items).
 * Mirrors deep walkers like search-text's walkStrings — media_id may appear on content or nested items.
 */
export function collectMediaIdsFromBlocks(blocks: Block[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function walk(value: unknown, depth = 0): void {
    if (depth > 40 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (typeof obj.media_id === 'string' && obj.media_id.length > 0 && !seen.has(obj.media_id)) {
      seen.add(obj.media_id);
      ids.push(obj.media_id);
    }
    for (const v of Object.values(obj)) walk(v, depth + 1);
  }

  walk(blocks);
  return ids;
}
