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
        unit_ids: ['unit_aotfw'],
        outcome_ids: [],
        class_ids: ['class_2026_12engadv1']
      }
    ],
    units: [
      {
        id: 'unit_aotfw',
        type: 'unit',
        title: 'Artist of the Floating World',
        slug: 'artist_of_the_floating_world',
        status: 'trashed',
        previous_status: 'active',
        trashed_at: ISO,
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1,
        year_id: 'year_12',
        subject_id: 'subject_y12_engadv',
        lesson_ids: ['lesson_aotfw_001']
      }
    ],
    lessons: [
      {
        id: 'lesson_aotfw_001',
        title: 'Introduction to An Artist of the Floating World',
        slug: 'intro',
        unit_id: 'unit_aotfw',
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
        active_unit_ids: ['unit_aotfw'],
        current_unit_id: 'unit_aotfw',
        current_scheduled_lesson_id: 'scheduled_aotfw_001',
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      }
    ],
    scheduled_lessons: [
      {
        id: 'scheduled_aotfw_001',
        type: 'scheduled_lesson',
        class_id: 'class_2026_12engadv1',
        unit_id: 'unit_aotfw',
        lesson_id: 'lesson_aotfw_001',
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
  });

  afterEach(() => {
    document.querySelectorAll('.entity-banner__dialog').forEach((element) => element.remove());
  });

  it('uses a full width calendar with one visible add control and compact dates', () => {
    const onScheduleUnit = vi.fn();
    renderClassPage(canvas, curriculumWithTrashedUnit(), 'class_2026_12engadv1', {
      onScheduleUnit
    });

    const rail = canvas.querySelector<HTMLElement>('[data-calendar="rail"]');
    expect(rail?.hidden).toBe(true);
    expect(
      canvas.querySelector<HTMLElement>('.hub-calendar__workspace')?.style.gridTemplateColumns
    ).toBe('minmax(0, 1fr)');

    const add = canvas.querySelector<HTMLButtonElement>('[data-calendar-quick-add]');
    expect(add).not.toBeNull();
    add?.click();
    expect(onScheduleUnit).toHaveBeenCalledTimes(1);

    for (const legacyAdd of canvas.querySelectorAll<HTMLButtonElement>(
      '.class-calendar__week-heading > .icon-plus-btn'
    )) {
      expect(legacyAdd.hidden).toBe(true);
    }

    canvas.querySelector<HTMLButtonElement>('[data-calendar-view="month"]')?.click();
    const today = canvas.querySelector<HTMLElement>('.class-calendar__day[data-today="true"]');
    expect(today?.querySelector('.class-calendar__day-num')?.textContent).toBe('17');
  });

  it('does not render a trashed unit, its sequence link, or its scheduled lesson', () => {
    renderClassPage(canvas, curriculumWithTrashedUnit(), 'class_2026_12engadv1');

    expect(canvas.querySelector('a[href="/units/unit_aotfw"]')).toBeNull();
    expect(canvas.querySelector('a.event-chip[href="/lessons/lesson_aotfw_001"]')).toBeNull();
    expect(canvas.textContent).not.toContain('Artist of the Floating World');
  });
});
