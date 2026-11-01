import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/create/blank-lesson', () => ({
  openBlankLesson: vi.fn()
}));
vi.mock('@/teacher/sections/schedule-timetable-modal', () => ({ openScheduleTimetableModal: vi.fn() }));

import { navigate } from '@/app/router';
import { openBlankLesson } from '@/teacher/create/blank-lesson';
import { openScheduleTimetableModal } from '@/teacher/sections/schedule-timetable-modal';
import { renderTeacherHome } from '@/teacher/home';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const curriculum: CurriculumResponse = {
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
  units: [],
  schedule_anchor_date: '2026-08-12',
  classes: [
    {
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: '12ENGADV1',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      active_unit_ids: ['unit_lkeep'],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    }
  ],
  scheduled_lessons: [
    {
      id: 'scheduled_lkeep_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_lkeep',
      lesson_id: 'lesson_lkeep_008',
      date: '2026-08-12',
      schedule_order: 1,
      delivery_status: 'current',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    },
    {
      id: 'scheduled_lkeep_001',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_lkeep',
      lesson_id: 'lesson_lkeep_001',
      date: '2026-08-13',
      schedule_order: 2,
      delivery_status: 'planned',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    }
  ],
  scope_sequences: [],
  media: [],
  lessons: [
    {
      id: 'lesson_lkeep_008',
      title: 'Memory',
      slug: 'memory',
      unit_id: 'unit_lkeep',
      sequence: 8,
      status: 'active',
      published: true,
      updated_at: '2026-08-01T09:00:00.000Z',
      published_at: '2026-02-01T12:00:00.000Z'
    },
    {
      id: 'lesson_lkeep_001',
      title: 'Intro',
      slug: 'intro',
      unit_id: 'unit_lkeep',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: '2026-07-01T00:00:00.000Z'
    }
  ]
};

function stubCalendarFetches(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const ok = (data: unknown) =>
        ({ ok: true, status: 200, json: async () => ({ ok: true, data }) }) as Response;
      if (path.includes('/api/curriculum')) return ok(curriculum);
      if (path.includes('/api/calendar-ghosts')) {
        return { ok: true, status: 200, json: async () => ({ ghosts: [] }) } as Response;
      }
      return ok({ tasks: [], work_blocks: [], pages: [] });
    })
  );
}

describe('teacher home dashboard', () => {
  let canvas: HTMLElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    stubCalendarFetches();
    canvas = document.createElement('div');
    document.body.append(canvas);
    dispose = undefined;
  });

  afterEach(() => {
    dispose?.();
    canvas.remove();
    vi.unstubAllGlobals();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('renders a cover banner, clock, calendar, and classes without signal tiles', async () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    expect(canvas.querySelector('.entity-banner__title')?.textContent).toBe('');
    expect(canvas.querySelector('.entity-banner__edit')?.textContent).toBe('Change cover');
    expect(
      canvas.querySelector('[data-home-hero-clock], .home-dashboard__hero-time')
    ).not.toBeNull();
    // Clock and create control overlay the cover instead of a row beneath it.
    const banner = canvas.querySelector('.home-dashboard__banner');
    expect(banner?.querySelector('[data-home-hero-clock]')).not.toBeNull();
    expect(banner?.querySelector('[data-create-host]')).not.toBeNull();
    expect(canvas.querySelector('.home-dashboard__toolbar')).toBeNull();
    expect(canvas.querySelector('[data-home-panel="signals"]')).toBeNull();
    expect(canvas.querySelector('.home-today')).toBeNull();
    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-part="hub-calendar-mount"].class-calendar')).not.toBeNull();
    });
    expect(canvas.querySelector('[data-home-panel="classes"]')).not.toBeNull();
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Dashboard');
    expect(canvas.querySelector('.hub-mark')).toBeNull();
  });

  it('opens the shared cover dialog from the dashboard banner', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    expect(canvas.querySelector('.cover-picker')).toBeNull();
    canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();

    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('.cover-picker__url')).not.toBeNull();
    const remove = [...dialog!.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Remove cover'
    );
    expect(remove).toBeTruthy();
  });

  it('dispose closes an open cover dialog', () => {
    const result = renderTeacherHome(canvas, curriculum);
    canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    expect(document.querySelector('.entity-banner__dialog')).not.toBeNull();

    result.dispose();
    expect(document.querySelector('.entity-banner__dialog')).toBeNull();

    dispose = result.dispose;
  });

  it('mounts kit Tideline with the lesson (no classic month/timeline skin)', async () => {
    // Month / Timeline zoom stops DROPPED — see HUB-MIGRATION.md / Step 4 PR note.
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-part="tideline"]')).not.toBeNull();
    });

    expect(canvas.querySelector('[data-calendar-view="month"]')).toBeNull();
    expect(canvas.querySelector('[data-calendar-view="timeline"]')).toBeNull();
    expect(canvas.querySelector('.calendar-compose-card')).toBeNull();
    expect(canvas.querySelector('.calendar-compose')).toBeNull();
    expect(canvas.querySelector('.class-calendar__week-heading > .icon-plus-btn')).toBeNull();

    // A lesson with a date but no period rides the all-day row, not a made-up 9 am block.
    await vi.waitFor(() => {
      const row = canvas.querySelector<HTMLElement>('.cal-due.is-allday[data-id="scheduled_lkeep_008"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('Memory');
    });
    expect(canvas.querySelector('.cal-chip[data-lesson-id="lesson_lkeep_008"]')).toBeNull();
  });

  it('expands class tiles from the dashboard before opening the class page', async () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    const classTile = canvas.querySelector<HTMLAnchorElement>(
      'a.home-class-tile[href="/classes/class_2026_12engadv1"]'
    );
    expect(classTile).not.toBeNull();
    expect(classTile?.querySelector('.home-class-tile__title')?.textContent).toBe(
      '12ENGADV1'
    );
    expect(classTile?.querySelector('.home-class-tile__eyebrow')?.textContent).toBe('12ENGADV1');
    classTile?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.entity-card-expand')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.entity-card-expand__full-page')?.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/classes/class_2026_12engadv1');
    });
  });

  it('dispose clears the clock interval without throwing', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const result = renderTeacherHome(canvas, curriculum);
    expect(() => result.dispose()).not.toThrow();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('does not render the standing Add card even when a deleted lesson remains in the library', async () => {
    const withDeleted: CurriculumResponse = {
      ...curriculum,
      lessons: [
        ...curriculum.lessons,
        {
          id: 'lesson_lkeep_deleted',
          title: 'Introduction to The Lantern Keeper',
          slug: 'intro-deleted',
          unit_id: 'unit_lkeep',
          sequence: 1,
          status: 'trashed',
          published: false,
          updated_at: ISO
        }
      ]
    };
    const result = renderTeacherHome(canvas, withDeleted);
    dispose = result.dispose;

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-part="tideline"]')).not.toBeNull();
    });
    expect(canvas.querySelector('.calendar-compose-card')).toBeNull();
    expect(canvas.querySelector('.calendar-compose')).toBeNull();
    expect(canvas.textContent).not.toContain('Introduction to The Lantern Keeper');
  });

  it('calendar add opens timetable scheduling for blank calendar lessons', async () => {
    const onCreated = vi.fn();
    const result = renderTeacherHome(canvas, curriculum, { onCreated });
    dispose = result.dispose;

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-calendar-quick-add]')).not.toBeNull();
    });
    canvas.querySelector<HTMLButtonElement>('[data-calendar-quick-add]')?.click();

    expect(openScheduleTimetableModal).toHaveBeenCalledWith({
      curriculum,
      onSuccess: expect.any(Function)
    });
    expect(canvas.querySelector('[data-create-menu]')).toBeNull();
  });
});
