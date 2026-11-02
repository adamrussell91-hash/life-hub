import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Alignment } from '@/alignment/schema';
import type { ScopeSequence } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';

/* An invented syllabus: the real wording lives in the private data repo. */
const DOC = {
  outcomes: [{ n: 1, code: 'OUT-01', text: 'First invented outcome' }],
  concepts: [],
  focus_areas: [{ id: 'harbours', name: 'Harbours', points: [{ id: 'U1', short: 'Read', outcomes: [{ n: 1, link: 'shared' }], concepts: [] }] }]
} as unknown as Alignment;

vi.mock('@/alignment/coverage-panel', () => ({ loadAlignment: () => Promise.resolve(DOC) }));
vi.mock('@/alignment/year-coverage-view', () => ({
  yearUnits: () => [{ id: 'a', title: 'Harbours unit', lessons: [{ id: 'l1', title: 'One', dot_points: ['harbours:U1'] }] }]
}));
vi.mock('@/teacher/network-context', () => ({ lessonClassDates: () => [] }));

const { mountOutcomeClimb } = await import('@/alignment/outcome-climb-view');

function setup() {
  const scope = {
    id: 'climb-test-' + Math.random(), academic_year: 2026, week_count: 40,
    terms: [{ id: 't1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 40, start_date: '2026-01-26', end_date: '2026-12-11' }],
    timeline_items: [{ id: 'i1', kind: 'unit', unit_id: 'a', start_week: 1, end_week: 8, order: 0 }]
  } as unknown as ScopeSequence;
  const host = document.createElement('div');
  document.body.append(host);
  const onSave = vi.fn(() => Promise.resolve());
  const onSelectItem = vi.fn();
  mountOutcomeClimb(host, {
    curriculum: { units: [{ id: 'a' }] } as unknown as CurriculumResponse,
    subjectId: 's', getScope: () => scope, selectedItemId: null, onSelectItem, onSave, onUnavailable: vi.fn()
  });
  return { host, onSave, onSelectItem };
}

describe('outcome climb view', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
  });

  it('saves a level from the picked outcome and redraws the line solid', async () => {
    const { host, onSave } = setup();
    await vi.waitFor(() => expect(host.querySelector('.climb__pick')).toBeTruthy());
    expect(host.querySelector('.climb__run--unset')).toBeTruthy();
    host.querySelector<HTMLButtonElement>('.climb__pick')!.click();
    expect(host.querySelector('.climb__detail-title')?.textContent).toContain('OUT-01');
    host.querySelector<HTMLButtonElement>('[data-focus-key="a:skilled"]')!.click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith([{ outcome: 1, unit_id: 'a', level: 'skilled' }]));
    expect(host.querySelector('.climb__run--unset')).toBeNull();
    expect(host.querySelector('[data-focus-key="a:skilled"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the unit from the band', async () => {
    const { host, onSelectItem } = setup();
    await vi.waitFor(() => expect(host.querySelector('.climb__unit')).toBeTruthy());
    host.querySelector('.climb__unit')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectItem).toHaveBeenCalledWith('i1');
  });
});
