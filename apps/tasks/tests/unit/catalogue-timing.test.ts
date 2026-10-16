import { describe, expect, it } from 'vitest';
import { classifyCatalogueTiming, programTimingRows, runWords } from '@/domain/catalogue-timing';

const entry = (registration_window: string, extra: Record<string, unknown> = {}) => ({
  name: 'Something',
  month: 'March',
  registration_window,
  description: '',
  subjects: [] as string[],
  types: ['Competition'],
  ...extra
});

describe('catalogue timing', () => {
  it('keeps a registration close apart from the event, and falls back to the month', () => {
    const t = classifyCatalogueTiming(entry('Usually closes mid-March', { types: ['Event'] }));
    expect(t).toMatchObject({ starts_on: '2026-03-01', ends_on: '2026-03-31', dates_precision: 'month', entries_close_precision: 'part' });
    expect(t.due_on).toBeNull();
  });

  it('uses held days over the close, which becomes an entries close', () => {
    const t = classifyCatalogueTiming(entry('Closes 7 November 2026. Held 21 to 22 November 2026.', { month: 'November', subjects: ['Arts'] }));
    expect(t).toMatchObject({ starts_on: '2026-11-21', ends_on: '2026-11-22', dates_precision: 'day', entries_close_on: '2026-11-07', due_on: null });
  });

  it('reads an essay deadline as due, softened when it is only usual', () => {
    const t = classifyCatalogueTiming(entry('Entries usually due around 10 May', { name: 'Big Essay Prize', month: 'May' }));
    expect(t).toMatchObject({ due_on: '2026-05-10', due_precision: 'part', starts_on: null });
  });

  it('names the sitting as the event even after "register before"', () => {
    const t = classifyCatalogueTiming(entry('Register via AMT before the early-August sitting', { month: 'August' }));
    expect(t).toMatchObject({ starts_on: '2026-08-01', ends_on: '2026-08-10', dates_precision: 'part', entries_close_on: null });
  });

  it('keeps a project deadline and the registration close', () => {
    const t = classifyCatalogueTiming(entry('Closes 31 July 2026. Final project submission 31 August 2026.', { month: 'August', types: ['Competition', 'Program'] }));
    expect(t).toMatchObject({ due_on: '2026-08-31', due_precision: 'day', entries_close_on: '2026-07-31', starts_on: null });
  });

  it('ignores when entries open and when winners are announced', () => {
    const t = classifyCatalogueTiming(entry('Entries usually open March, close late June; winners announced early August', { name: 'Poetry Awards', month: 'June' }));
    expect(t).toMatchObject({ due_precision: 'part', starts_on: null });
    expect(t.due_on!.slice(0, 7)).toBe('2026-06');
  });

  it('words dates at their precision', () => {
    expect(runWords('2026-11-21', '2026-11-22', 'day')).toBe('21–22 Nov');
    expect(runWords('2026-03-11', '2026-03-20', 'part')).toBe('mid Mar');
    expect(runWords('2026-07-01', '2026-08-31', 'month')).toBe('Jul – Aug');
    expect(programTimingRows({ starts_on: '2026-03-01', ends_on: '2026-03-31', dates_precision: 'month', entries_close_on: '2026-03-16', entries_close_precision: 'part' })).toEqual([
      ['Runs (approx.)', 'Mar 2026'],
      ['Entries close (approx.)', 'mid Mar 2026']
    ]);
  });
});
