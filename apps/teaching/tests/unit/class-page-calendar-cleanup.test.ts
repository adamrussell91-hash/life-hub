import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/schedule-api', () => ({
  patchScheduledLesson: vi.fn().mockResolvedValue({}),
  patchClass: vi.fn().mockResolvedValue({}),
  postScheduledLesson: vi.fn().mockResolvedValue({})
}));

import { renderClassPage } from '@/teacher/sections/classes';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

function curriculumWithTrashedUnit(): CurriculumResponse {
  return {
    years: [
      {
        id: 'year_12',
        type: 'year',
        title: 'Year 12',
        slug: 'year_12',
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1,
        year_level: 12,
        subject_ids: ['subject_y12_engadv']
      }
    ],
    subjects: [
      {
        id: 'subject_y12_engadv',
        type: 'subject',
        title: 'English Advanced',
        display_title: 'Year 12 English Advanced',
        slug: 'english_advanced',
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1,
        unit_ids: ['unit_lkeep'],
        outcome_ids: [],
        class_ids: ['class_2026_12engadv1']
      }
    ],
    units: [
      {
        id: 'unit_lkeep',
        type: 'unit',
        title: 'The Lantern Keeper',
        slug: 'artist_of_the_floating_world',
        status: 'trashed',
        previous_status: 'active',
        trashed_at: ISO,
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1,
        year_id: 'year_12',
        subject_id: 'subject_y12_engadv',
        lesson_ids: ['lesson_lkeep_001']
      }
    ],
    lessons: [
      {
        id: 'lesson_lkeep_001',
        title: 'Introduction to The Lantern Keeper',
        slug: 'intro',
        unit_id: 'unit_lkeep',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: ISO
      }
    ],
    classes: [
      {
        id: 'class_2026_12engadv1',
        type: 'class',
        code: '12ENA6',
        title: 'English Advanced',
        slug: '12ena6',
        academic_year: 2026,
        year_id: 'year_12',
        subject_id: 'subject_y12_engadv',
        active_unit_ids: ['unit_lkeep'],
        current_unit_id: 'unit_lkeep',
        current_scheduled_lesson_id: 'scheduled_lkeep_001',
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      }
    ],
    scheduled_lessons: [
      {
        id: 'scheduled_lkeep_001',
        type: 'scheduled_lesson',
        class_id: 'class_2026_12engadv1',
        unit_id: 'unit_lkeep',
        lesson_id: 'lesson_lkeep_001',
        date: '2026-09-17',
        start_time: '12:30',
        schedule_order: 1,
        delivery_status: 'planned',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      }
    ],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-09-17'
  };
}

describe('class page calendar cleanup', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('div');
    document.body.append(canvas);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        const ok = (data: unknown) =>
          ({ ok: true, status: 200, json: async () => ({ ok: true, data }) }) as Response;
        if (path.includes('/api/curriculum')) return ok(curriculumWithTrashedUnit());
        if (path.includes('/markbook')) return ok({ markbook: { columns: [], hidden_quizzes: [], marks: {}, updated_at: '' }, students: [], quizzes: [] });
        if (path.includes('/api/calendar-ghosts')) {
          return { ok: true, status: 200, json: async () => ({ ghosts: [] }) } as Response;
        }
        return ok({ tasks: [], work_blocks: [], pages: [] });
      })
    );
  });

  afterEach(() => {
    canvas.remove();
    vi.unstubAllGlobals();
    document.querySelectorAll('.entity-banner__dialog').forEach((element) => element.remove());
  });

  it('uses kit calendar with one nav quick-add and no standing Add column', async () => {
    const onScheduleUnit = vi.fn();
    renderClassPage(canvas, curriculumWithTrashedUnit(), 'class_2026_12engadv1', {
      onScheduleUnit
    });

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-part="hub-calendar-mount"].class-calendar')).not.toBeNull();
      expect(canvas.querySelector('[data-part="tideline"]')).not.toBeNull();
    });

    expect(canvas.querySelector('.calendar-compose-card')).toBeNull();
    expect(canvas.querySelector('.calendar-compose')).toBeNull();
    expect(canvas.querySelector('.class-calendar__week-heading > .icon-plus-btn')).toBeNull();
    expect(canvas.querySelector('[data-calendar-view="month"]')).toBeNull();

    const add = canvas.querySelector<HTMLButtonElement>('[data-calendar-quick-add]');
    expect(add).not.toBeNull();
    add?.click();
    expect(onScheduleUnit).toHaveBeenCalledTimes(1);
  });

  it('does not render a trashed unit, its sequence link, or its scheduled lesson', () => {
    renderClassPage(canvas, curriculumWithTrashedUnit(), 'class_2026_12engadv1');

    expect(canvas.querySelector('a[href="/units/unit_lkeep"]')).toBeNull();
    expect(canvas.querySelector('a.event-chip[href="/lessons/lesson_lkeep_001"]')).toBeNull();
    expect(canvas.textContent).not.toContain('The Lantern Keeper');
  });
});
