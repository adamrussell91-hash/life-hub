import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Unit } from '@/schemas';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/search/api', () => ({
  fetchContentSearch: vi.fn(async () => ({ hits: [] }))
}));

import { navigate } from '@/app/router';
import { renderLessonsIndex } from '@/teacher/sections/lessons';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [
    {
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
      lesson_ids: ['lesson_001']
    } satisfies Unit
  ],
  lessons: [
    {
      id: 'lesson_001',
      title: 'Introduction',
      slug: 'introduction',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: ISO
    }
  ],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

describe('lessons index', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    canvas = document.createElement('div');
    history.replaceState(null, '', '/lessons');
  });

  it('lists lessons and opens the expanded card', async () => {
    renderLessonsIndex(canvas, curriculum);
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Lessons');
    expect(canvas.querySelector('[data-create-trigger]')?.getAttribute('aria-label')).toMatch(
      /lesson/i
    );
    expect(canvas.querySelector('.lesson-list__title')?.textContent).toBe('Introduction');
    const card = canvas.querySelector<HTMLElement>('.lesson-list__item--openable')!;
    expect(card).toBeTruthy();
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.entity-card-expand')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.entity-card-expand__full-page')?.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/lessons/lesson_001');
    });
  });

  it('shows a no-results state for a query that matches nothing', async () => {
    vi.useFakeTimers();
    renderLessonsIndex(canvas, curriculum);
    const input = canvas.querySelector<HTMLInputElement>('[data-lessons-search]')!;
    input.value = 'zzzz-not-a-lesson';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    expect(canvas.querySelector('[data-lessons-empty]')).toBeTruthy();
    expect(canvas.querySelector('[data-lessons-clear-filters]')?.textContent).toMatch(/clear filters/i);
    vi.useRealTimers();
  });

  it('shows a search field, status badge, grouped unit, and lesson count', () => {
    renderLessonsIndex(canvas, curriculum);
    expect(canvas.querySelector('[data-lessons-search]')).toBeTruthy();
    expect(canvas.querySelector('[data-lessons-count]')?.textContent).toMatch(/1 lesson/);
    expect(canvas.querySelector('.status-badge')?.textContent).toBe('Draft');
    expect(canvas.querySelector('.lesson-group__summary')?.textContent).toMatch(
      /Artist of the Floating World/
    );
  });

  it('lays library cards out as checkbox, info, and row actions', () => {
    renderLessonsIndex(canvas, curriculum);
    const card = canvas.querySelector<HTMLElement>('.lesson-list__item--openable')!;
    const lead = card.querySelector('.lessons-lib__lead');
    const info = card.querySelector('.lesson-list__info');
    const actions = card.querySelector('.list-row-actions');
    expect(lead?.querySelector('.lessons-lib__check')).toBeTruthy();
    expect(info?.querySelector('.lesson-list__title')?.textContent).toBe('Introduction');
    expect(info?.querySelector('.lesson-list__meta')?.textContent).toMatch(/Artist of the Floating World/);
    expect(info?.querySelector('.lesson-list__meta')?.textContent).toMatch(/Draft/);
    expect(actions?.querySelector('.page-options__trigger')?.getAttribute('aria-label')).toMatch(
      /Options for Introduction/
    );
    expect(
      [...(actions?.querySelectorAll('.page-options__item') ?? [])].map((item) => item.textContent)
    ).toEqual(['Duplicate', 'Archive', 'Move to trash']);
    expect([...card.children].map((node) => node.className.split(' ')[0])).toEqual([
      'lessons-lib__lead',
      'lesson-list__info',
      'list-row-actions'
    ]);
  });

  it('wraps the table view in a fixed-column scroll shell', () => {
    renderLessonsIndex(canvas, curriculum);
    canvas.querySelector<HTMLButtonElement>('[data-view="table"]')!.click();
    const wrap = canvas.querySelector('.lessons-table-wrap');
    expect(wrap?.querySelector('.lessons-table__scroll')).toBeTruthy();
    expect(wrap?.querySelector('.lessons-table colgroup col.c-title')).toBeTruthy();
    expect(wrap?.querySelector('.lessons-table__title')?.textContent).toBe('Introduction');
    expect(wrap?.querySelector('.status-badge')?.textContent).toBe('Draft');
  });
});
