import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/teacher/schedule-api', () => ({
  postScheduleUnit: vi.fn().mockResolvedValue({ class: {}, scheduled_lessons: [] })
}));

import { postScheduleUnit } from '@/teacher/schedule-api';
import { openScheduleUnitModal } from '@/teacher/sections/schedule-unit-modal';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class, ScheduledLesson, Subject, Unit, Year } from '@/schemas';

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
  subject_ids: ['subject_y12_engadv']
};

const engAdv: Subject = {
  id: 'subject_y12_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  unit_ids: ['unit_partial', 'unit_full'],
  outcome_ids: [],
  class_ids: ['class_2026_12engadv1']
};

const unitPartial: Unit = {
  id: 'unit_partial',
  type: 'unit',
  title: 'Partial Unit',
  slug: 'partial_unit',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  lesson_ids: ['lesson_a', 'lesson_b']
};

const unitFull: Unit = {
  id: 'unit_full',
  type: 'unit',
  title: 'Fully Scheduled Unit',
  slug: 'fully_scheduled_unit',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  lesson_ids: ['lesson_c']
};

const otherSubjectUnit: Unit = {
  id: 'unit_other',
  type: 'unit',
  title: 'Other Subject Unit',
  slug: 'other_subject_unit',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_other',
  lesson_ids: ['lesson_z']
};

const classRow: Class = {
  id: 'class_2026_12engadv1',
  type: 'class',
  code: '12ENGADV1',
  title: 'Year 12 English Advanced',
  slug: '12engadv1',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  active_unit_ids: ['unit_partial'],
  current_unit_id: 'unit_partial',
  current_scheduled_lesson_id: 'scheduled_a',
  meeting_days: [1, 3, 5],
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduledA: ScheduledLesson = {
  id: 'scheduled_a',
  type: 'scheduled_lesson',
  class_id: 'class_2026_12engadv1',
  unit_id: 'unit_partial',
  lesson_id: 'lesson_a',
  date: '2026-08-12',
  schedule_order: 1,
  delivery_status: 'planned',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduledC: ScheduledLesson = {
  id: 'scheduled_c',
  type: 'scheduled_lesson',
  class_id: 'class_2026_12engadv1',
  unit_id: 'unit_full',
  lesson_id: 'lesson_c',
  date: '2026-08-13',
  schedule_order: 2,
  delivery_status: 'planned',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv],
  units: [unitPartial, unitFull, otherSubjectUnit],
  lessons: [
    {
      id: 'lesson_a',
      title: 'Lesson A',
      slug: 'lesson-a',
      unit_id: 'unit_partial',
      sequence: 1,
      status: 'active',
      published: true,
      updated_at: ISO
    },
    {
      id: 'lesson_b',
      title: 'Lesson B',
      slug: 'lesson-b',
      unit_id: 'unit_partial',
      sequence: 2,
      status: 'active',
      published: false,
      updated_at: ISO
    },
    {
      id: 'lesson_c',
      title: 'Lesson C',
      slug: 'lesson-c',
      unit_id: 'unit_full',
      sequence: 1,
      status: 'active',
      published: true,
      updated_at: ISO
    }
  ],
  classes: [classRow],
  scheduled_lessons: [scheduledA, scheduledC],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

describe('schedule unit modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens and shows step 1 subject units', () => {
    openScheduleUnitModal({
      curriculum,
      classId: 'class_2026_12engadv1',
      onSuccess: vi.fn()
    });

    const modal = document.querySelector('.schedule-modal');
    expect(modal).toBeTruthy();
    expect(document.body.textContent).toContain('Choose unit');
    expect(document.body.textContent).toContain('Partial Unit');
    expect(document.body.textContent).toContain('Fully Scheduled Unit');
    expect(document.body.textContent).not.toContain('Other Subject Unit');
  });

  it('disables fully scheduled units', () => {
    openScheduleUnitModal({
      curriculum,
      classId: 'class_2026_12engadv1',
      onSuccess: vi.fn()
    });

    const full = document.querySelector<HTMLButtonElement>(
      '.schedule-modal__unit-button[data-unit-id="unit_full"]'
    );
    const partial = document.querySelector<HTMLButtonElement>(
      '.schedule-modal__unit-button[data-unit-id="unit_partial"]'
    );

    expect(full?.disabled).toBe(true);
    expect(full?.textContent).toContain('Already scheduled');
    expect(partial?.disabled).toBe(false);
  });

  it('confirm calls postScheduleUnit with unit_id, start_date, meeting_days', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    openScheduleUnitModal({
      curriculum,
      classId: 'class_2026_12engadv1',
      onSuccess
    });

    document
      .querySelector<HTMLButtonElement>('.schedule-modal__unit-button[data-unit-id="unit_partial"]')
      ?.click();

    const nextButtons = [...document.querySelectorAll<HTMLButtonElement>('.schedule-modal__footer .btn--primary')];
    nextButtons.find((button) => button.textContent === 'Next')?.click();

    expect(document.body.textContent).toContain('Meeting pattern');

    const startInput = document.querySelector<HTMLInputElement>(
      '[data-schedule-modal-field="start-date"]'
    );
    expect(startInput?.value).toBe('2026-08-14');

    [...document.querySelectorAll<HTMLButtonElement>('.schedule-modal__footer .btn--primary')]
      .find((button) => button.textContent === 'Next')
      ?.click();

    expect(document.body.textContent).toContain('Preview schedule');
    expect(document.body.textContent).toContain('Lesson B');
    expect(document.body.textContent).toMatch(/· Lesson B · 1/);

    const created = {
      class: { ...classRow, active_unit_ids: ['unit_partial'] },
      scheduled_lessons: [
        {
          ...scheduledA,
          id: 'scheduled_b',
          lesson_id: 'lesson_b',
          date: '2026-08-14',
          schedule_order: 1
        }
      ]
    };
    vi.mocked(postScheduleUnit).mockResolvedValueOnce(created);

    document.querySelector<HTMLButtonElement>('[data-schedule-modal-action="confirm"]')?.click();

    await vi.waitFor(() => {
      expect(postScheduleUnit).toHaveBeenCalledWith('class_2026_12engadv1', {
        unit_id: 'unit_partial',
        start_date: '2026-08-14',
        meeting_days: [1, 3, 5]
      });
      expect(onSuccess).toHaveBeenCalledWith(created);
    });

    expect(document.querySelector('.schedule-modal')).toBeNull();
  });
});
