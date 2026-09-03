// tests/unit/recovery-versions.test.ts
import { describe, expect, it } from 'vitest';
import {
  emptyVersionIndex,
  nextRevision,
  appendCheckpointToIndex,
  pruneIndexEntries,
  unitContentChanged,
  VERSION_RETENTION
} from '@/recovery/versions';

describe('version index helpers', () => {
  it('appends checkpoints and prunes to retention', () => {
    let index = emptyVersionIndex('lesson', 'lesson_1');
    expect(VERSION_RETENTION).toBe(10);

    for (let i = 0; i < 11; i++) {
      const revision = nextRevision(index);
      const created_at = `2026-08-11T00:00:${String(i).padStart(2, '0')}.000Z`;
      const built = appendCheckpointToIndex(index, {
        id: `version_lesson_1_${revision}`,
        revision,
        created_at,
        reason: 'manual_checkpoint'
      });
      index = pruneIndexEntries(built, VERSION_RETENTION);
    }

    expect(index.entries).toHaveLength(10);
    expect(index.latest_revision).toBe(11);
    expect(index.entries[0]?.revision).toBe(11); // newest first
    expect(index.entries.at(-1)?.revision).toBe(2);
  });

  it('unitContentChanged ignores no-op patches of the same content fields', () => {
    const before = {
      title: 'Unit A',
      description: 'Desc',
      blocks: [],
      lesson_ids: ['lesson_1']
    };
    expect(unitContentChanged(before, { ...before })).toBe(false);
    expect(
      unitContentChanged(before, {
        ...before,
        description: undefined
      })
    ).toBe(true);
    expect(
      unitContentChanged(before, {
        ...before,
        title: 'Unit B'
      })
    ).toBe(true);
    expect(
      unitContentChanged(
        { ...before, description: undefined },
        { ...before, description: undefined }
      )
    ).toBe(false);
  });
});
