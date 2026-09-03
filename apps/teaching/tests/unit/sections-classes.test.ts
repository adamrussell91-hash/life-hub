import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/schedule-api', () => ({
  patchScheduledLesson: vi.fn().mockResolvedValue({}),
  patchClass: vi.fn().mockResolvedValue({}),
  postScheduleUnit: vi.fn().mockResolvedValue({ class: {}, scheduled_lessons: [] })
}));

import { navigate } from '@/app/router';
import { patchClass, patchScheduledLesson } from '@/teacher/schedule-api';
import { closeScheduleOverflow } from '@/teacher/schedule-overflow';
import {
  renderClassesIndex,
  renderClassPage
} from '@/teacher/sections/classes';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Block } from '@/schemas/block';
import type { Class, ScheduledLesson, Subject, Unit, Year } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const announcementBlock: Block = {
  id: 'block_homepage_announcements_1',
  type: 'block',
  block_type: 'heading',
  variant: 'section',
  visibility: 'student_teacher',
  content: { text: 'Campus closed Monday' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

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
  unit_ids: ['unit_aotfw'],
  outcome_ids: [],
  class_ids: ['class_2026_12engadv1']
};

const unit: Unit = {
  id: 'unit_aotfw',
  type: 'unit',
  title: 'Artist of the Floating World',
  slug: 'artist_of_the_floating_world',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  lesson_ids: ['lesson_aotfw_008', 'lesson_aotfw_001']
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
  active_unit_ids: ['unit_aotfw'],
  current_unit_id: 'unit_aotfw',
  current_scheduled_lesson_id: 'scheduled_aotfw_008',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduledCurrent: ScheduledLesson = {
  id: 'scheduled_aotfw_008',
  type: 'scheduled_lesson',
  class_id: 'class_2026_12engadv1',
  unit_id: 'unit_aotfw',
  lesson_id: 'lesson_aotfw_008',
  date: '2026-08-12',
  schedule_order: 3,
  delivery_status: 'current',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduledPlanned: ScheduledLesson = {
  id: 'scheduled_aotfw_001',
  type: 'scheduled_lesson',
  class_id: 'class_2026_12engadv1',
  unit_id: 'unit_aotfw',
  lesson_id: 'lesson_aotfw_001',
  date: '2026-08-13',
  schedule_order: 4,
  delivery_status: 'planned',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv],
  units: [unit],
  lessons: [
    {
      id: 'lesson_aotfw_008',
      title: 'Memory',
      slug: 'memory',
      unit_id: 'unit_aotfw',
      sequence: 8,
      status: 'active',
      published: true,
      updated_at: ISO
    },
    {
      id: 'lesson_aotfw_001',
      title: 'Intro',
      slug: 'intro',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: ISO
    }
  ],
  classes: [classRow],
  scheduled_lessons: [scheduledCurrent, scheduledPlanned],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

describe('classes section', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  afterEach(() => {
    closeScheduleOverflow();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('renders glass class tiles that expand before opening the class page', async () => {
    renderClassesIndex(canvas, curriculum);
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Classes');
    expect(canvas.querySelector('[data-create-trigger]')?.getAttribute('aria-label')).toMatch(
      /class/i
    );
    expect(canvas.textContent).toContain('12ENGADV1');
    expect(canvas.textContent).toContain('Year 12 English Advanced');

    const tile = canvas.querySelector<HTMLAnchorElement>(
      'a.home-class-tile[href="/classes/class_2026_12engadv1"]'
    );
    expect(tile).not.toBeNull();
    expect(canvas.querySelector('.page-options__trigger')).not.toBeNull();
    expect(
      [...canvas.querySelectorAll('.page-options__item')].map((item) => item.textContent)
    ).toEqual(['Archive', 'Move to trash']);
    tile?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.entity-card-expand')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.entity-card-expand__full-page')?.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/classes/class_2026_12engadv1');
    });
  });

  it('shows empty copy when there are no classes', () => {
    renderClassesIndex(canvas, { ...curriculum, classes: [] });
    expect(canvas.textContent).toContain('No classes yet.');
    expect(canvas.querySelector('[data-create-trigger]')).not.toBeNull();
  });

  it('renders recomposed class page with banner, calendar, and sequence', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');

    expect(canvas.querySelector('.entity-banner__title')?.textContent).toBe(
      'Year 12 English Advanced'
    );
    expect(canvas.querySelector('.entity-banner__eyebrow')?.textContent).toBe('12ENGADV1');
    expect(canvas.querySelector('.page-header__eyebrow')).toBeNull();
    expect(canvas.querySelector('.page-header__title')).toBeNull();
    expect(canvas.querySelector('.page-header--actions-only')).not.toBeNull();
    expect(canvas.querySelector('.page-options__trigger')?.getAttribute('aria-label')).toMatch(
      /Options for Year 12 English Advanced/
    );
    // Class code once in the banner eyebrow — not the main display name.
    const codeMatches = canvas.textContent?.match(/12ENGADV1/g) ?? [];
    expect(codeMatches.length).toBe(1);

    expect(canvas.querySelector('.class-page__edit-homepage')?.textContent).toBe('Edit page');
    expect(canvas.querySelector('.class-page__view-as-student')).not.toBeNull();

    expect(canvas.querySelector('.class-page__teaching-today')).toBeNull();
    expect(canvas.querySelector('[data-class-section="unit-progress"]')).toBeNull();
    expect(canvas.querySelector('.class-calendar')).not.toBeNull();
    expect(canvas.querySelector('.unit-sequence')).not.toBeNull();
    expect(canvas.querySelector('a.seq__lesson-link[href="/lessons/lesson_aotfw_008"]')).not.toBeNull();

    expect(canvas.textContent).toMatch(/Artist of the Floating World/);
    expect(canvas.textContent).not.toMatch(/Dates from the schedule/);
    expect(canvas.textContent).not.toMatch(/Up next/i);

    expect(canvas.textContent).toMatch(/Announcements/i);
    expect(canvas.textContent).toMatch(/Resources/i);
    expect(canvas.textContent).not.toMatch(/Custom blocks/i);
    expect(canvas.textContent).toContain(
      'Nothing posted. Students see announcements at the top of their class page.'
    );
    expect(canvas.textContent).toContain(
      'Texts, links and files this class should have alongside every lesson.'
    );
    expect(canvas.querySelector('.class-page__write-announcement')?.textContent).toBe('Write one');
    expect(canvas.querySelector('.class-page__add-resource')?.textContent).toBe('Add');
    expect(canvas.textContent).not.toContain(
      'Use Edit homepage above announcements to change resources and custom blocks.'
    );

    const unitLink = canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_aotfw"]');
    expect(unitLink).not.toBeNull();
  });

  it('opens a lesson from the unit sequence', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    const link = canvas.querySelector<HTMLAnchorElement>(
      'a.seq__lesson-link[href="/lessons/lesson_aotfw_008"]'
    );
    expect(link).not.toBeNull();
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('calls onCreateLesson from calendar add controls', () => {
    const onCreateLesson = vi.fn();
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onCreateLesson });

    canvas.querySelector<HTMLButtonElement>('[data-calendar-view="week"]')?.click();
    const weekAdd = canvas.querySelector<HTMLButtonElement>(
      '.class-calendar__week-heading .icon-plus-btn'
    );
    expect(weekAdd).not.toBeNull();
    weekAdd?.click();
    expect(onCreateLesson).toHaveBeenCalledTimes(1);
  });

  it('shows not found for unknown class', () => {
    const handle = renderClassPage(canvas, curriculum, 'class_missing');
    expect(canvas.textContent).toMatch(/Class not found/i);
    expect(typeof handle.dispose).toBe('function');
  });

  it('calls schedule API and refresh when reordering via unit sequence', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    const up = canvas.querySelector<HTMLButtonElement>('[aria-label="Move up"]');
    expect(up).not.toBeNull();
    up?.click();
    await vi.waitFor(() => {
      expect(patchScheduledLesson).toHaveBeenCalledWith('scheduled_aotfw_008', { direction: 'up' });
      expect(onScheduleMutated).toHaveBeenCalled();
    });
  });

  it('shows an error banner and skips refresh when a schedule mutation fails', async () => {
    vi.mocked(patchScheduledLesson).mockRejectedValueOnce(new Error('Reorder failed'));
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    canvas.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.click();

    await vi.waitFor(() => {
      const banner = canvas.querySelector('.class-page__error');
      expect(banner?.textContent).toBe('Reorder failed');
      expect(banner?.getAttribute('role')).toBe('alert');
    });
    expect(onScheduleMutated).not.toHaveBeenCalled();
  });

  it('shows Edit page and renders announcement blocks in view mode', () => {
    const withHomepage: CurriculumResponse = {
      ...curriculum,
      classes: [
        {
          ...classRow,
          homepage: {
            announcements: [announcementBlock],
            resources: [],
            custom: []
          }
        }
      ]
    };

    renderClassPage(canvas, withHomepage, 'class_2026_12engadv1');

    expect(canvas.querySelector('.class-page__edit-homepage')?.textContent).toBe('Edit page');
    const announcements = canvas.querySelector('[data-homepage-region="announcements"]');
    expect(announcements?.querySelector('.block[data-block-type="heading"]')).not.toBeNull();
    expect(announcements?.textContent).toContain('Campus closed Monday');
  });

  it('opens the student class page in a new tab from View as student', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    const link = canvas.querySelector<HTMLAnchorElement>('.class-page__view-as-student');
    expect(link?.getAttribute('href')).toBe('/s/classes/class_2026_12engadv1');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.rel).toContain('noopener');
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('enters edit mode and Save calls patchClass with homepage', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    canvas.querySelector<HTMLButtonElement>('.class-page__edit-homepage')?.click();
    expect(canvas.querySelector('.homepage-editor__save')).not.toBeNull();

    const region = canvas.querySelector('[data-homepage-region="announcements"]');
    expect(region).not.toBeNull();
    canvas.querySelector<HTMLButtonElement>('.lesson-palette__family[data-family="Basic"]')?.click();
    canvas.querySelector<HTMLButtonElement>('.lesson-palette__card[data-block-type="heading"]')?.click();

    canvas.querySelector<HTMLButtonElement>('.homepage-editor__save')?.click();

    await vi.waitFor(() => {
      expect(patchClass).toHaveBeenCalledWith(
        'class_2026_12engadv1',
        expect.objectContaining({
          homepage: expect.objectContaining({
            announcements: expect.arrayContaining([
              expect.objectContaining({ block_type: 'heading' })
            ])
          })
        })
      );
      expect(onScheduleMutated).toHaveBeenCalled();
    });
  });

  it('Cancel restores prior homepage without PATCH', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');

    canvas.querySelector<HTMLButtonElement>('.class-page__edit-homepage')?.click();

    canvas.querySelector<HTMLButtonElement>('.lesson-palette__family[data-family="Basic"]')?.click();
    canvas.querySelector<HTMLButtonElement>('.lesson-palette__card[data-block-type="heading"]')?.click();

    canvas.querySelector<HTMLButtonElement>('.homepage-editor__cancel')?.click();

    expect(patchClass).not.toHaveBeenCalled();
    expect(canvas.querySelector('.homepage-editor')).toBeNull();
    expect(canvas.textContent).toContain(
      'Nothing posted. Students see announcements at the top of their class page.'
    );
    expect(canvas.querySelector('.class-page__edit-homepage')).not.toBeNull();
  });

  it('sets the current scheduled lesson from the sequence overflow', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    const plannedRow = canvas.querySelector(
      'a.seq__lesson-link[href="/lessons/lesson_aotfw_001"]'
    )?.parentElement;
    plannedRow?.querySelector<HTMLButtonElement>('[aria-label="More actions"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-schedule-action="set-current"]')?.click();

    await vi.waitFor(() => {
      expect(patchClass).toHaveBeenCalledWith('class_2026_12engadv1', {
        current_scheduled_lesson_id: 'scheduled_aotfw_001'
      });
      expect(onScheduleMutated).toHaveBeenCalled();
    });
  });

  it('changes a scheduled date from the calendar detail overflow', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    canvas
      .querySelector<HTMLButtonElement>(
        '.class-calendar__detail-row [aria-label="More actions"]'
      )
      ?.click();
    document.querySelector<HTMLButtonElement>('[data-schedule-action="change-date"]')?.click();
    const input = document.querySelector<HTMLInputElement>('.schedule-overflow input[type="date"]');
    expect(input?.value).toBe('2026-08-12');
    input!.value = '2026-08-20';
    input!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(patchScheduledLesson).toHaveBeenCalledWith('scheduled_aotfw_008', {
        date: '2026-08-20'
      });
      expect(onScheduleMutated).toHaveBeenCalled();
    });
  });

  it('removes a cover without invoking the page-remount callback or losing homepage edits', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    const onCoverMutated = vi.fn().mockResolvedValue(undefined);
    const withCover: CurriculumResponse = {
      ...curriculum,
      classes: [{ ...classRow, cover: { url: 'https://cdn.example.com/class.jpg' } }]
    };

    renderClassPage(canvas, withCover, classRow.id, { onScheduleMutated, onCoverMutated });

    canvas.querySelector<HTMLButtonElement>('.class-page__edit-homepage')?.click();
    canvas.querySelector<HTMLButtonElement>('.lesson-palette__family[data-family="Basic"]')?.click();
    canvas
      .querySelector<HTMLButtonElement>('.lesson-palette__card[data-block-type="heading"]')
      ?.click();
    const editor = canvas.querySelector('.homepage-editor');
    expect(editor).not.toBeNull();
    expect(editor?.querySelector('[data-block-type="heading"]')).not.toBeNull();

    canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
    [...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')]
      .find((button) => button.textContent?.trim() === 'Remove cover')
      ?.click();

    await vi.waitFor(() => {
      expect(patchClass).toHaveBeenCalledWith(classRow.id, { cover: null });
      expect(onCoverMutated).toHaveBeenCalledOnce();
    });
    expect(onScheduleMutated).not.toHaveBeenCalled();
    expect(canvas.querySelector('.homepage-editor')).toBe(editor);
    expect(editor?.querySelector('[data-block-type="heading"]')).not.toBeNull();
  });

  it('returns a dispose that tears down the banner', () => {
    const handle = renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    expect(canvas.querySelector('.entity-banner')).not.toBeNull();
    handle.dispose();
    expect(canvas.querySelector('.entity-banner')).toBeNull();
  });
});
