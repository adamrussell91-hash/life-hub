import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/create/blank-lesson', () => ({
  openBlankLesson: vi.fn()
}));

import { navigate } from '@/app/router';
import { openBlankLesson } from '@/teacher/create/blank-lesson';
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
      unit_ids: ['unit_aotfw'],
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
      active_unit_ids: ['unit_aotfw'],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    }
  ],
  scheduled_lessons: [
    {
      id: 'scheduled_aotfw_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_008',
      date: '2026-08-12',
      schedule_order: 1,
      delivery_status: 'current',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    },
    {
      id: 'scheduled_aotfw_001',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_001',
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
      id: 'lesson_aotfw_008',
      title: 'Memory',
      slug: 'memory',
      unit_id: 'unit_aotfw',
      sequence: 8,
      status: 'active',
      published: true,
      updated_at: '2026-08-01T09:00:00.000Z',
      published_at: '2026-02-01T12:00:00.000Z'
    },
    {
      id: 'lesson_aotfw_001',
      title: 'Intro',
      slug: 'intro',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: '2026-07-01T00:00:00.000Z'
    }
  ]
};

describe('teacher home dashboard', () => {
  let canvas: HTMLElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
    dispose = undefined;
  });

  afterEach(() => {
    dispose?.();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('renders a cover banner, clock, calendar, and classes without signal tiles', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    expect(canvas.querySelector('.entity-banner__title')?.textContent).toBe('Dashboard');
    expect(canvas.querySelector('.entity-banner__edit')?.textContent).toBe('Change cover');
    expect(
      canvas.querySelector('[data-home-hero-clock], .home-dashboard__hero-time')
    ).not.toBeNull();
    expect(canvas.querySelector('[data-home-panel="signals"]')).toBeNull();
    expect(canvas.querySelector('.home-today')).toBeNull();
    expect(canvas.querySelector('.class-calendar')).not.toBeNull();
    expect(canvas.querySelector('[data-home-panel="classes"]')).not.toBeNull();
    expect(canvas.querySelector('.page-header__title')).toBeNull();
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

    // Asserted before the suite's fallback cleanup gets a chance to help.
    result.dispose();
    expect(document.querySelector('.entity-banner__dialog')).toBeNull();

    dispose = result.dispose;
  });

  it('shows weekday day numbers, today, class meta on chips, and lesson links', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    const todayCol = canvas.querySelector('.class-calendar__week-day[data-today="true"]');
    expect(todayCol?.getAttribute('data-date')).toBe('2026-08-12');
    expect(todayCol?.querySelector('.class-calendar__day-num')?.textContent).toBe('12');

    const dayNumbers = [
      ...canvas.querySelectorAll('.class-calendar__week-day .class-calendar__day-num')
    ].map((el) => el.textContent);
    expect(dayNumbers).toEqual(['10', '11', '12', '13', '14']);

    const lessonLink = canvas.querySelector<HTMLAnchorElement>(
      'a.event-chip[href="/lessons/lesson_aotfw_008"]'
    );
    expect(lessonLink).not.toBeNull();
    expect(lessonLink?.querySelector('.event-chip__title')?.textContent).toBe('Memory');
    expect(lessonLink?.querySelector('.event-chip__meta')?.textContent).toBe('12ENGADV1');
    expect(lessonLink?.dataset.tint).toMatch(/blue|sage|peach|gold|lilac/);

    lessonLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('switches month and timeline views', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    canvas.querySelector<HTMLButtonElement>('[data-calendar-view="month"]')!.click();
    expect(canvas.querySelector('[role="grid"]')).not.toBeNull();
    expect(
      canvas.querySelector('.class-calendar__day[data-today="true"]')
    ).not.toBeNull();

    canvas.querySelector<HTMLButtonElement>('[data-calendar-view="timeline"]')!.click();
    expect(canvas.querySelector('.class-calendar__timeline')).not.toBeNull();
    expect(canvas.textContent).toContain('Memory');
    expect(canvas.querySelector('.class-calendar__timeline-today')?.textContent).toBe('Today');
  });

  it('expands class tiles from the dashboard before opening the class page', async () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    const classTile = canvas.querySelector<HTMLAnchorElement>(
      'a.home-class-tile[href="/classes/class_2026_12engadv1"]'
    );
    expect(classTile).not.toBeNull();
    expect(classTile?.querySelector('.home-class-tile__title')?.textContent).toBe(
      'Year 12 English Advanced'
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

  it('calendar add opens blank lesson flow instead of the home create menu', () => {
    const onCreated = vi.fn();
    const result = renderTeacherHome(canvas, curriculum, { onCreated });
    dispose = result.dispose;

    const addBtn = canvas.querySelector<HTMLButtonElement>(
      '.class-calendar__week-heading .icon-plus-btn'
    );
    expect(addBtn).not.toBeNull();
    addBtn?.click();

    expect(openBlankLesson).toHaveBeenCalledWith({
      curriculum,
      onCreated
    });
    expect(canvas.querySelector('[data-create-menu]')).toBeNull();
  });
});
