import { describe, it, expect, vi } from 'vitest';
import type { Class } from '@/schemas';

vi.mock('@/app/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/router')>();
  return { ...actual, navigate: vi.fn() };
});

import { navigate } from '@/app/router';
import { renderTeacherRail } from '@/teacher/rail';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const sampleClass: Class = {
  id: 'class_2026_12engadv1',
  type: 'class',
  code: '12ENGADV1',
  title: 'Year 12 English Advanced',
  slug: '12engadv1',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_engadv',
  active_unit_ids: ['unit_aotfw'],
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  lessons: [],
  classes: [sampleClass],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

describe('renderTeacherRail', () => {
  it('renders primary nav above a classes list, not a curriculum tree', () => {
    const railNav = document.createElement('div');
    renderTeacherRail(railNav, curriculum, {
      activeSection: 'classes',
      activeClassId: 'class_2026_12engadv1'
    });
    expect(railNav.querySelector('.primary-nav')).not.toBeNull();
    expect(railNav.querySelector('[aria-current="page"]')?.textContent).toBe('Classes');
    expect(railNav.querySelector('.teacher-layout__tree-host')).not.toBeNull();
    expect(railNav.querySelector('.rail-classes__label')?.textContent).toBe('Your classes');
    expect(railNav.querySelector('.nav-item--toggle')).toBeNull();
    expect(railNav.querySelector('a.nav-item--selected')?.textContent).toBe('12ENGADV1');
  });

  it('navigates to the class page when a class row is clicked', () => {
    const railNav = document.createElement('div');
    renderTeacherRail(railNav, curriculum, { activeSection: 'classes' });

    const link = railNav.querySelector('a.rail-classes__item') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/classes/class_2026_12engadv1');
  });

  it('calls onCreateClass when + New class is clicked', () => {
    const onCreateClass = vi.fn();
    const railNav = document.createElement('div');
    renderTeacherRail(railNav, curriculum, {
      activeSection: 'home',
      onCreateClass
    });

    (railNav.querySelector('button.rail-classes__new') as HTMLButtonElement).click();
    expect(onCreateClass).toHaveBeenCalledOnce();
  });

  it('calls onOpenSearch when Search is clicked', () => {
    const onOpenSearch = vi.fn();
    const railNav = document.createElement('div');
    renderTeacherRail(railNav, curriculum, {
      activeSection: 'home',
      onOpenSearch
    });

    const search = railNav.querySelector('button.rail-search') as HTMLButtonElement;
    expect(search.textContent).toBe('Search');
    search.click();
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });
});
