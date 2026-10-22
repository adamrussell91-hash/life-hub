import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/outcomes/api', () => ({
  createCustomOutcome: vi.fn(),
  deleteOutcome: vi.fn(),
  mergeOutcome: vi.fn(),
  patchOutcome: vi.fn(),
  saveOutcomeOrder: vi.fn()
}));

import { renderResourcesIndex, resetResourcesViewForTests } from '@/teacher/sections/resources';
import { resetOutcomesLibraryForTests } from '@/teacher/sections/outcomes-library';
import type { CurriculumResponse } from '@/teacher/nav';
import type { CurriculumOutcome } from '@/schemas/outcome';

const ISO = '2026-01-01T00:00:00.000Z';

function outcome(id: string, code: string, group: string, description: string): CurriculumOutcome {
  return {
    id, type: 'curriculum_outcome', source: 'custom', code, title: code, slug: id, description, group,
    subject_id: 'subject_eav', status: 'active', created_at: ISO, updated_at: ISO, schema_version: 1
  } as CurriculumOutcome;
}

const curriculum = {
  years: [],
  subjects: [{
    id: 'subject_eav', type: 'subject', title: 'English Advanced', slug: 'eav', year_id: 'y12', status: 'active',
    unit_ids: [], outcome_ids: ['o1', 'o2', 'o3'], class_ids: [], created_at: ISO, updated_at: ISO, schema_version: 1
  }],
  units: [{ id: 'unit_1', title: 'Texts', outcome_ids: ['o2'] }],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  outcomes: [
    outcome('o1', 'EAV-12-04', 'Custom', 'Responds to new and different contexts in full wording'),
    outcome('o2', 'EAV-12-04', 'Custom', 'Second copy'),
    outcome('o3', 'EAV-12-06', 'Module B', 'Own compositional processes')
  ],
  schedule_anchor_date: '2026-08-12'
} as unknown as CurriculumResponse;

describe('Resource Library outcomes view', () => {
  let canvas: HTMLElement;
  beforeEach(() => {
    resetResourcesViewForTests({ kind: 'outcomes' });
    resetOutcomesLibraryForTests();
    canvas = document.createElement('div');
    document.body.append(canvas);
  });
  afterEach(() => canvas.remove());

  it('lists outcomes by group with full wording, usage and a duplicate panel', () => {
    renderResourcesIndex(canvas, curriculum);
    const nav = canvas.querySelector('[data-resources-view="outcomes"]');
    expect(nav?.getAttribute('aria-current')).toBe('page');
    expect(nav?.textContent).toContain('3');
    expect(canvas.querySelector<HTMLElement>('.resources-toolbar')?.hidden).toBe(true);

    const groups = [...canvas.querySelectorAll<HTMLElement>('[data-outcomes-group]')].map((el) => el.dataset.outcomesGroup);
    expect(groups).toEqual(['Custom', 'Module B']);
    expect(canvas.textContent).toContain('Responds to new and different contexts in full wording');
    expect(canvas.querySelector('[data-outcome-id="o2"] .outcomes-lib__usage summary')?.textContent).toBe('Used in 1 unit');

    const dupes = canvas.querySelector('[data-outcomes-duplicates]');
    expect(dupes?.querySelectorAll('[data-outcomes-keep]').length).toBe(2);
  });

  it('opens an inline editor with every field', () => {
    renderResourcesIndex(canvas, curriculum);
    canvas.querySelector<HTMLButtonElement>('[data-outcomes-edit="o3"]')!.click();
    const form = canvas.querySelector('[data-outcome-id="o3"] [data-outcomes-form]');
    const values = [...form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].map((el) => el.value);
    expect(values).toEqual(['EAV-12-06', 'Module B', 'EAV-12-06', 'Own compositional processes']);
  });
});
