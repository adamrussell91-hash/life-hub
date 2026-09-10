import { describe, expect, it } from 'vitest';
import { applyTrash, applyRestoreFromTrash, applyArchive } from '@/recovery/lifecycle';
import {
  collectMediaIdsFromBlocks,
  scanLessonDependencies,
  scanUnitDependencies
} from '@/recovery/dependencies';
import type { Block } from '@/schemas/block';

describe('lifecycle transitions', () => {
  it('trashes and restores previous_status', () => {
    const archived = { status: 'archived' as const };
    const trashed = applyTrash(archived, '2026-08-11T00:00:00.000Z');
    expect(trashed.status).toBe('trashed');
    expect(trashed.previous_status).toBe('archived');
    expect(trashed.trashed_at).toBe('2026-08-11T00:00:00.000Z');
    const restored = applyRestoreFromTrash(trashed);
    expect(restored.status).toBe('archived');
    expect(restored.trashed_at).toBeUndefined();
    expect(restored.previous_status).toBeUndefined();
  });

  it('archives active content', () => {
    expect(applyArchive({ status: 'active' }).status).toBe('archived');
  });

  it('re-trash without reason clears trash_reason', () => {
    const withReason = applyTrash({ status: 'active' as const }, '2026-08-11T00:00:00.000Z', 'duplicate');
    expect(withReason.trash_reason).toBe('duplicate');
    const retrashed = applyTrash(withReason, '2026-08-12T00:00:00.000Z');
    expect(retrashed.status).toBe('trashed');
    expect(retrashed.trash_reason).toBeUndefined();
    expect(retrashed.trashed_at).toBe('2026-08-12T00:00:00.000Z');
  });

  it('applyArchive clears trash fields', () => {
    const archived = applyArchive({
      status: 'trashed' as const,
      trashed_at: '2026-08-11T00:00:00.000Z',
      previous_status: 'active' as const,
      trash_reason: 'oops'
    });
    expect(archived.status).toBe('archived');
    expect(archived.trashed_at).toBeUndefined();
    expect(archived.previous_status).toBeUndefined();
    expect(archived.trash_reason).toBeUndefined();
  });
});

describe('dependency scan', () => {
  it('finds class and schedule refs for units/lessons', () => {
    const unitDeps = scanUnitDependencies('unit_1', {
      classes: [{ id: 'class_1', title: '12ENG', active_unit_ids: ['unit_1'], current_unit_id: 'unit_1' }]
    });
    expect(unitDeps.some((d) => d.type === 'class' && d.id === 'class_1')).toBe(true);

    const lessonDeps = scanLessonDependencies('lesson_1', {
      units: [{ id: 'unit_1', title: 'Unit', lesson_ids: ['lesson_1'] }],
      scheduled_lessons: [{ id: 'sched_1', lesson_id: 'lesson_1', class_id: 'class_1' }]
    });
    expect(lessonDeps.length).toBeGreaterThanOrEqual(2);
  });

  it('collectMediaIdsFromBlocks finds nested media_id', () => {
    const blocks = [
      {
        id: 'sec_1',
        type: 'block',
        block_type: 'section',
        variant: 'default',
        visibility: 'all',
        content: {
          title: 'Nested',
          blocks: [
            {
              id: 'img_1',
              type: 'block',
              block_type: 'image',
              variant: 'large',
              visibility: 'all',
              content: {
                url: 'https://example.com/a.png',
                alt_text: 'A',
                media_id: 'media_nested'
              },
              created_at: '2026-08-11T00:00:00.000Z',
              updated_at: '2026-08-11T00:00:00.000Z'
            }
          ]
        },
        created_at: '2026-08-11T00:00:00.000Z',
        updated_at: '2026-08-11T00:00:00.000Z'
      }
    ] as unknown as Block[];

    expect(collectMediaIdsFromBlocks(blocks)).toEqual(['media_nested']);
  });
});
