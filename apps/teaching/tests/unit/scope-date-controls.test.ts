import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/scope-api', () => ({
  patchScopeSequence: vi.fn()
}));

import { patchScopeSequence } from '@/teacher/scope-api';
import { renderScopeTimelineEditor } from '@/teacher/sections/scope-sequences';
import type { CurriculumResponse } from '@/teacher/nav';
import type { ScopeSequence, Subject, Unit, Year } from '@/schemas';

const patchScopeSequenceMock = vi.mocked(patchScopeSequence);
const ISO = '2026-01-01T00:00:00.000Z';

const year: Year = {
  id: 'year_12',
  type: 'year',
  title: 'Year 12',
  slug: 'year_12',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_level: 12,
  subject_ids: ['subject_eng']
};

const subject: Subject = {
  id: 'subject_eng',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  scope_id: 'scope_eng_2026',
  unit_ids: ['unit_a'],
  outcome_ids: [],
  class_ids: []
};

const unit: Unit = {
  id: 'unit_a',
  type: 'unit',
  title: 'Unit A',
  slug: 'unit_a',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_eng',
  lesson_ids: []
};

function makeScope(timelineItems?: ScopeSequence['timeline_items']): ScopeSequence {
  return {
    id: 'scope_eng_2026',
    type: 'scope_sequence',
    title: 'English Advanced 2026',
    slug: 'english_advanced_2026',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    subject_id: 'subject_eng',
    academic_year: 2026,
    week_count: 40,
    terms: [
      {
        id: 'term_t1',
        title: 'Term 1',
        term_number: 1,
        start_week: 1,
        end_week: 10,
        start_date: '2026-01-28',
        end_date: '2026-04-10'
      },
      {
        id: 'term_t2',
        title: 'Term 2',
        term_number: 2,
        start_week: 11,
        end_week: 20,
        start_date: '2026-04-27',
        end_date: '2026-07-03'
      },
      {
        id: 'term_t3',
        title: 'Term 3',
        term_number: 3,
        start_week: 21,
        end_week: 30,
        start_date: '2026-07-20',
        end_date: '2026-09-25'
      },
      {
        id: 'term_t4',
        title: 'Term 4',
        term_number: 4,
        start_week: 31,
        end_week: 40,
        start_date: '2026-10-12',
        end_date: '2026-12-18'
      }
    ],
    timeline_items:
      timelineItems ?? [
        {
          id: 'ti_unit_a',
          kind: 'unit',
          unit_id: 'unit_a',
          start_week: 12,
          end_week: 18,
          order: 1
        }
      ]
  };
}

function makeCurriculum(): CurriculumResponse {
  return {
    years: [year],
    subjects: [subject],
    units: [unit],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [makeScope()],
    media: [],
    schedule_anchor_date: '2026-05-04'
  };
}

describe('scope timeline unit date controls', () => {
  let canvas: HTMLElement;
  let curriculum: CurriculumResponse;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
    curriculum = makeCurriculum();
    patchScopeSequenceMock.mockImplementation(async (_id, patch) => {
      const current = curriculum.scope_sequences[0]!;
      return makeScope(patch.timeline_items ?? current.timeline_items);
    });
  });

  it('adds editable start and end dates to a selected unit', async () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_eng');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(canvas.querySelector<HTMLInputElement>('.scope-timeline__start-date')?.value).toBe(
        '2026-05-04'
      );
      expect(canvas.querySelector<HTMLInputElement>('.scope-timeline__end-date')?.value).toBe(
        '2026-06-15'
      );
    });
  });

  it('saves exact dates and updates the week span used by dragging', async () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_eng');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const start = await vi.waitFor(() => {
      const input = canvas.querySelector<HTMLInputElement>('.scope-timeline__start-date');
      expect(input).not.toBeNull();
      return input!;
    });
    start.value = '2026-05-11';
    start.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });

    const firstItems = patchScopeSequenceMock.mock.calls[0]![1].timeline_items!;
    expect(firstItems.find((item) => item.id === 'ti_unit_a')).toMatchObject({
      start_date: '2026-05-11',
      end_date: '2026-06-15',
      start_week: 13,
      end_week: 18
    });

    await vi.waitFor(() => {
      expect(canvas.querySelector('.scope-timeline__inspector-weeks')?.textContent).toBe(
        '11/05/26 – 15/06/26'
      );
    });

    const end = canvas.querySelector<HTMLInputElement>('.scope-timeline__end-date')!;
    end.value = '2026-06-22';
    end.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(2);
    });

    const secondItems = patchScopeSequenceMock.mock.calls[1]![1].timeline_items!;
    expect(secondItems.find((item) => item.id === 'ti_unit_a')).toMatchObject({
      start_date: '2026-05-11',
      end_date: '2026-06-22',
      start_week: 13,
      end_week: 19
    });
  });

  it('blocks an end date before the start date', async () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_eng');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const end = await vi.waitFor(() => {
      const input = canvas.querySelector<HTMLInputElement>('.scope-timeline__end-date');
      expect(input).not.toBeNull();
      return input!;
    });
    end.value = '2026-05-01';
    end.dispatchEvent(new Event('change', { bubbles: true }));

    expect(patchScopeSequenceMock).not.toHaveBeenCalled();
    expect(canvas.querySelector('.scope-timeline__date-error')?.textContent).toMatch(
      /End date must be on or after the start date/i
    );
  });
});
