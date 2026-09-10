import { describe, expect, it } from 'vitest';
import {
  versionCollectionPath,
  versionItemPath,
  versionRestorePath
} from '@/teacher/version-api';
import {
  formatReasonLabel,
  formatVersionTime,
  RESTORE_CONFIRM_MESSAGE,
  summarizeVersionSnapshot
} from '@/teacher/history-panel';

describe('version-api paths', () => {
  it('builds lesson / unit / class version URLs', () => {
    expect(versionCollectionPath('lesson', 'lesson_1')).toBe('/api/lessons/lesson_1/versions');
    expect(versionItemPath('lesson', 'lesson_1', 3)).toBe('/api/lessons/lesson_1/versions/3');
    expect(versionRestorePath('lesson', 'lesson_1', 3)).toBe(
      '/api/lessons/lesson_1/versions/3/restore'
    );

    expect(versionCollectionPath('unit', 'unit_1')).toBe('/api/units/unit_1/versions');
    expect(versionItemPath('unit', 'unit_1', 2)).toBe('/api/units/unit_1/versions/2');
    expect(versionRestorePath('unit', 'unit_1', 2)).toBe('/api/units/unit_1/versions/2/restore');

    expect(versionCollectionPath('class_homepage', 'class_1')).toBe(
      '/api/classes/class_1/versions'
    );
    expect(versionItemPath('class_homepage', 'class_1', 1)).toBe(
      '/api/classes/class_1/versions/1'
    );
    expect(versionRestorePath('class_homepage', 'class_1', 1)).toBe(
      '/api/classes/class_1/versions/1/restore'
    );
  });
});

describe('history-panel helpers', () => {
  it('labels reasons and keeps the restore confirm copy stable', () => {
    expect(formatReasonLabel('manual_checkpoint')).toBe('Checkpoint');
    expect(formatReasonLabel('ai_accepted')).toBe('AI accept');
    expect(formatReasonLabel('publish')).toBe('Publish');
    expect(RESTORE_CONFIRM_MESSAGE).toContain('editable content only');
  });

  it('formats same-day times without a date prefix', () => {
    const now = new Date('2026-08-11T15:00:00.000Z');
    const sameDay = formatVersionTime('2026-08-11T14:30:00.000Z', now);
    expect(sameDay).not.toMatch(/Aug|2026/);
    expect(sameDay.length).toBeGreaterThan(0);
  });

  it('summarizes lesson / unit / homepage snapshots', () => {
    expect(
      summarizeVersionSnapshot('lesson', {
        title: 'Essay workshop',
        blocks: [{}, {}]
      })
    ).toEqual({ title: 'Essay workshop', detail: '2 blocks' });

    expect(
      summarizeVersionSnapshot('unit', {
        title: 'Unit A',
        blocks: [{}]
      })
    ).toEqual({ title: 'Unit A', detail: '1 block' });

    expect(
      summarizeVersionSnapshot('class_homepage', {
        homepage: {
          announcements: [{}],
          resources: [],
          custom: [{}, {}]
        }
      })
    ).toEqual({
      title: 'Class homepage',
      detail: '3 blocks (1 announcements · 0 resources · 2 custom)'
    });
  });
});
