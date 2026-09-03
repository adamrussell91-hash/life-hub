// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createMemoryJsonStore,
  restoreVersion,
  VersionStoreError,
  writeCheckpoint
} from '../../netlify/functions/_shared/versions.mts';
import { draftLessonKey, versionIndexKey, versionKey } from '@/storage/keys';
import type { VersionIndex } from '@/schemas';

const TIMESTAMP = '2026-08-11T12:00:00.000Z';

function validLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson_1',
    title: 'Test Lesson',
    slug: 'test-lesson',
    status: 'active',
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    schema_version: 1,
    type: 'lesson',
    unit_id: 'unit_1',
    sequence: 1,
    blocks: [],
    ...overrides
  };
}

describe('restoreVersion', () => {
  it('restores a valid historical snapshot and checkpoints current live state first', async () => {
    const live = validLesson({ title: 'Current title' });
    const historical = validLesson({ title: 'Historical title' });
    const store = createMemoryJsonStore({
      [draftLessonKey('lesson_1')]: live
    });

    await writeCheckpoint(store, {
      kind: 'lesson',
      parentId: 'lesson_1',
      snapshot: historical,
      reason: 'manual_checkpoint',
      now: TIMESTAMP
    });

    const restored = await restoreVersion(store, {
      kind: 'lesson',
      parentId: 'lesson_1',
      revision: 1,
      now: TIMESTAMP
    });

    expect(restored.title).toBe('Historical title');
    expect(await store.getJSON(draftLessonKey('lesson_1'))).toMatchObject({
      title: 'Historical title'
    });

    const index = (await store.getJSON(versionIndexKey('lesson', 'lesson_1'))) as VersionIndex;
    expect(index.entries[0]?.reason).toBe('restore');
    expect(await store.getJSON(versionKey('lesson', 'lesson_1', 2))).toMatchObject({
      reason: 'restore',
      snapshot: live
    });
  });

  it('does not create a restore checkpoint when the historical snapshot is invalid', async () => {
    const live = validLesson({ title: 'Current title' });
    const store = createMemoryJsonStore({
      [draftLessonKey('lesson_1')]: live,
      [versionKey('lesson', 'lesson_1', 1)]: {
        id: 'version_lesson_lesson_1_1',
        type: 'lesson_version',
        kind: 'lesson',
        parent_id: 'lesson_1',
        revision: 1,
        created_at: TIMESTAMP,
        reason: 'manual_checkpoint',
        label: null,
        snapshot: { not_a_lesson: true }
      },
      [versionIndexKey('lesson', 'lesson_1')]: {
        parent_id: 'lesson_1',
        kind: 'lesson',
        latest_revision: 1,
        entries: [
          {
            id: 'version_lesson_lesson_1_1',
            revision: 1,
            created_at: TIMESTAMP,
            reason: 'manual_checkpoint'
          }
        ]
      }
    });

    await expect(
      restoreVersion(store, {
        kind: 'lesson',
        parentId: 'lesson_1',
        revision: 1,
        now: TIMESTAMP
      })
    ).rejects.toMatchObject({
      code: 'validation_error'
    } satisfies Partial<VersionStoreError>);

    expect(await store.getJSON(draftLessonKey('lesson_1'))).toMatchObject({
      title: 'Current title'
    });
    expect(await store.getJSON(versionKey('lesson', 'lesson_1', 2))).toBeNull();

    const index = (await store.getJSON(versionIndexKey('lesson', 'lesson_1'))) as VersionIndex;
    expect(index.latest_revision).toBe(1);
    expect(index.entries.some((entry) => entry.reason === 'restore')).toBe(false);
  });
});
