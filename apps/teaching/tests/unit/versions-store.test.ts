import { describe, expect, it } from 'vitest';
import {
  createMemoryJsonStore,
  getVersion,
  listVersionIndex,
  restoreVersion,
  writeCheckpoint,
  type JsonStore
} from '../../netlify/functions/_shared/versions.mts';
import { draftLessonKey, unitKey, classKey, versionKey, versionIndexKey } from '@/storage/keys';
import type { VersionIndex, VersionRecord } from '@/schemas/version';

function lessonSnapshot(id: string, title: string) {
  return {
    id,
    type: 'lesson' as const,
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    status: 'active' as const,
    unit_id: 'unit_1',
    sequence: 1,
    blocks: [],
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    schema_version: 1
  };
}

function emptyHomepage() {
  return { announcements: [], resources: [], custom: [] };
}

describe('version blob store adapters', () => {
  it('writeCheckpoint creates index entry + revision blob', async () => {
    const store = createMemoryJsonStore();
    const snapshot = lessonSnapshot('lesson_1', 'Original');

    const record = await writeCheckpoint(store, {
      kind: 'lesson',
      parentId: 'lesson_1',
      snapshot,
      reason: 'manual_checkpoint',
      label: 'Before rewrite',
      now: '2026-08-11T01:00:00.000Z'
    });

    expect(record.revision).toBe(1);
    expect(record.id).toBe('version_lesson_lesson_1_1');
    expect(record.label).toBe('Before rewrite');

    const index = await store.getJSON<VersionIndex>(versionIndexKey('lesson', 'lesson_1'));
    expect(index?.latest_revision).toBe(1);
    expect(index?.entries).toHaveLength(1);
    expect(index?.entries[0]).toMatchObject({
      revision: 1,
      reason: 'manual_checkpoint',
      label: 'Before rewrite'
    });

    const blob = await store.getJSON<VersionRecord>(versionKey('lesson', 'lesson_1', 1));
    expect(blob?.snapshot).toEqual(snapshot);
  });

  it('retains 10 checkpoints and deletes revision 1 after the 11th', async () => {
    const store = createMemoryJsonStore();

    for (let i = 1; i <= 11; i++) {
      await writeCheckpoint(store, {
        kind: 'lesson',
        parentId: 'lesson_1',
        snapshot: lessonSnapshot('lesson_1', `v${i}`),
        reason: 'manual_checkpoint',
        now: `2026-08-11T00:${String(i).padStart(2, '0')}:00.000Z`
      });
    }

    const index = await listVersionIndex(store, 'lesson', 'lesson_1');
    expect(index.entries).toHaveLength(10);
    expect(index.latest_revision).toBe(11);
    expect(index.entries.map((e) => e.revision)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

    expect(await getVersion(store, 'lesson', 'lesson_1', 1)).toBeNull();
    expect(await store.getJSON(versionKey('lesson', 'lesson_1', 1))).toBeNull();
    expect((await getVersion(store, 'lesson', 'lesson_1', 2))?.revision).toBe(2);
  });

  it('restoreVersion checkpoints current live then applies the historical snapshot', async () => {
    const store = createMemoryJsonStore();
    const original = lessonSnapshot('lesson_1', 'Original');
    const current = lessonSnapshot('lesson_1', 'Current');

    await store.setJSON(draftLessonKey('lesson_1'), current);
    await writeCheckpoint(store, {
      kind: 'lesson',
      parentId: 'lesson_1',
      snapshot: original,
      reason: 'manual_checkpoint',
      now: '2026-08-11T01:00:00.000Z'
    });

    const live = await restoreVersion(store, {
      kind: 'lesson',
      parentId: 'lesson_1',
      revision: 1,
      now: '2026-08-11T02:00:00.000Z'
    });

    expect(live).toMatchObject({ id: 'lesson_1', title: 'Original' });
    expect(await store.getJSON(draftLessonKey('lesson_1'))).toMatchObject({ title: 'Original' });

    const index = await listVersionIndex(store, 'lesson', 'lesson_1');
    expect(index.entries[0]?.reason).toBe('restore');
    expect(index.entries[0]?.revision).toBe(2);

    const restoreCheckpoint = await getVersion(store, 'lesson', 'lesson_1', 2);
    expect(restoreCheckpoint?.snapshot).toMatchObject({ title: 'Current' });
  });

  it('class_homepage restore only changes homepage', async () => {
    const store = createMemoryJsonStore();
    const historicalHomepage = {
      announcements: [
        {
          id: 'b_hist',
          type: 'block' as const,
          block_type: 'heading' as const,
          variant: 'section' as const,
          visibility: 'student_teacher' as const,
          content: { text: 'Historical' },
          created_at: '2026-08-11T00:00:00.000Z',
          updated_at: '2026-08-11T00:00:00.000Z',
          schema_version: 1 as const
        }
      ],
      resources: [],
      custom: []
    };
    const currentHomepage = emptyHomepage();

    const classDoc = {
      id: 'class_1',
      type: 'class' as const,
      title: '7A Science',
      slug: '7a-science',
      code: '7A',
      academic_year: 2026,
      year_id: 'year_7',
      subject_id: 'subject_science',
      active_unit_ids: ['unit_1'],
      current_unit_id: 'unit_1',
      meeting_days: [1, 3, 5],
      homepage: currentHomepage,
      status: 'active' as const,
      created_at: '2026-08-11T00:00:00.000Z',
      updated_at: '2026-08-11T00:00:00.000Z',
      schema_version: 1
    };

    await store.setJSON(classKey('class_1'), classDoc);

    await writeCheckpoint(store, {
      kind: 'class_homepage',
      parentId: 'class_1',
      snapshot: { homepage: historicalHomepage },
      reason: 'manual_checkpoint',
      now: '2026-08-11T01:00:00.000Z'
    });

    const live = await restoreVersion(store, {
      kind: 'class_homepage',
      parentId: 'class_1',
      revision: 1,
      now: '2026-08-11T02:00:00.000Z'
    });

    const homepage = (live as { homepage?: { announcements: Array<{ id: string }> } }).homepage;
    expect(homepage?.announcements[0]?.id).toBe('b_hist');
    expect((live as typeof classDoc).meeting_days).toEqual([1, 3, 5]);
    expect((live as typeof classDoc).active_unit_ids).toEqual(['unit_1']);
    expect((live as typeof classDoc).current_unit_id).toBe('unit_1');
    expect((live as typeof classDoc).code).toBe('7A');
  });

  it('createMemoryJsonStore satisfies JsonStore', async () => {
    const store: JsonStore = createMemoryJsonStore();
    await store.setJSON(unitKey('unit_1'), { id: 'unit_1' });
    expect(await store.getJSON(unitKey('unit_1'))).toEqual({ id: 'unit_1' });
    await store.delete(unitKey('unit_1'));
    expect(await store.getJSON(unitKey('unit_1'))).toBeNull();
  });
});
