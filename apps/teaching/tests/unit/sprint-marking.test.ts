// apps/teaching/tests/unit/sprint-marking.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sprintColumn, markId, ensureColumns } from '@/sprint/marking';
import { checkColumn } from '@/markbook/schema';
import { newSprintSettings } from '@/sprint/defaults';
import type { Lesson } from '@/schemas/lesson';

const settings = { ...newSprintSettings('class1'), criteria: [{ id: 'abcdefgh12', text: 'Uses sources', outcome: 'ht4-9' }, { id: 'c2', text: 'Why it matters' }] };
settings.phases[4]!.due_date = '2026-11-12';
const lesson = { id: 'l1', title: 'Pompeii', sprint: settings } as unknown as Lesson;

describe('sprint marking', () => {
  it('turns any criterion id into a valid markbook id, keeping ones that already are', () => {
    expect(markId('abcdefgh12')).toBe('abcdefgh12');
    expect(markId('c2')).toMatch(/^[a-z0-9]{8,24}$/);
    expect(markId('c2')).not.toBe(markId('c20'));
  });

  it('builds valid assessment columns: 3 marks a criterion, bands, outcomes', () => {
    const col = sprintColumn(lesson, 'prototype', 'col12345');
    expect(checkColumn(col)).toHaveProperty('column');
    expect(col).toMatchObject({ kind: 'assessment', title: 'Pompeii: Prototype', date: '2026-11-12', weight: 0 });
    expect(col.criteria[0]).toMatchObject({ max: 3, outcomes: ['ht4-9'] });
    expect(col.criteria[0]!.bands!.map((b) => b.label)).toEqual(['Starting', 'Showing', 'Strong']);
    expect(sprintColumn(lesson, 'reflection', 'col67890').criteria[0]!.label).toBe('Explains what the test showed and what to change next');
  });

  it('makes the two columns once and remembers them on the lesson', async () => {
    const markbook = { saveColumn: vi.fn(async () => ({})) } as never;
    const first = await ensureColumns(lesson, markbook);
    expect((markbook as { saveColumn: ReturnType<typeof vi.fn> }).saveColumn).toHaveBeenCalledTimes(2);
    const again = await ensureColumns(first.lesson, markbook);
    expect((markbook as { saveColumn: ReturnType<typeof vi.fn> }).saveColumn).toHaveBeenCalledTimes(2);
    expect(again.ids).toEqual(first.ids);
  });
});
