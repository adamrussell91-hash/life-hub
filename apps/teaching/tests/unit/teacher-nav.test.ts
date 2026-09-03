import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Subject, Unit, Year } from '@/schemas';

// Node 22+ ships an experimental global `localStorage` that is a no-op
// without `--localstorage-file`, and vitest's happy-dom environment leaves
// that no-op global in place rather than overriding it (see vitest's
// `getWindowKeys`, which skips keys already present on `global`). Stub a
// minimal in-memory implementation so nav.ts's persistence logic is testable.
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/api/client', () => ({ apiGet: vi.fn() }));

import { navigate } from '@/app/router';
import { apiGet } from '@/api/client';
import {
  fetchCurriculum,
  renderClassesNav,
  renderCurriculumNav,
  type CurriculumResponse
} from '@/teacher/nav';
import type { Class } from '@/schemas';

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
  subject_ids: ['subject_engadv', 'subject_engstd']
};

const subjectEngAdv: Subject = {
  id: 'subject_engadv',
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
  class_ids: []
};

const subjectEngStd: Subject = {
  ...subjectEngAdv,
  id: 'subject_engstd',
  title: 'English Standard',
  display_title: 'Year 12 English Standard',
  slug: 'english_standard',
  unit_ids: []
};

const unitAotfw: Unit = {
  id: 'unit_aotfw',
  type: 'unit',
  title: 'Artist of the Floating World',
  slug: 'artist_of_the_floating_world',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_engadv',
  lesson_ids: ['lesson_001', 'lesson_002']
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [subjectEngAdv, subjectEngStd],
  units: [unitAotfw],
  lessons: [
    { id: 'lesson_001', title: 'Introduction', slug: 'introduction', unit_id: 'unit_aotfw', sequence: 1, status: 'active', published: false, updated_at: ISO },
    { id: 'lesson_002', title: 'Follow-up', slug: 'follow_up', unit_id: 'unit_aotfw', sequence: 2, status: 'active', published: true, updated_at: ISO }
  ],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

function toggleButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button.nav-item--toggle')] as HTMLButtonElement[];
}

function labelOf(button: HTMLButtonElement): string | null {
  return button.querySelector('.nav-item__label')?.textContent ?? null;
}

describe('curriculum nav rendering', () => {
  let container: HTMLElement;
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    vi.clearAllMocks();
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders collapsed year/subject nodes by default and persists nothing', () => {
    renderCurriculumNav(container, curriculum);

    const buttons = toggleButtons(container);
    expect(buttons).toHaveLength(1);
    expect(labelOf(buttons[0])).toBe('Year 12');
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('a.nav-item')).toHaveLength(0);
  });

  it('expands a node on click and persists the choice to localStorage', () => {
    renderCurriculumNav(container, curriculum);
    toggleButtons(container)[0].click();

    const labels = toggleButtons(container).map(labelOf);
    expect(labels).toEqual(['Year 12', 'English Advanced', 'English Standard']);

    const stored = JSON.parse(memoryStorage.getItem('teaching-hub.nav') ?? '[]');
    expect(stored).toContain('year:year_12');
  });

  it('walks all the way down to a lesson leaf that navigates on click', () => {
    memoryStorage.setItem(
      'teaching-hub.nav',
      JSON.stringify(['year:year_12', 'subject:subject_engadv', 'unit:unit_aotfw'])
    );

    renderCurriculumNav(container, curriculum);

    const links = [...container.querySelectorAll('a.nav-item')] as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent)).toEqual(['Introduction', 'Follow-up']);
    expect(links[0].getAttribute('href')).toBe('/lessons/lesson_001');

    links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_001');
  });

  it('auto-expands the active lesson ancestors and highlights the selected leaf', () => {
    renderCurriculumNav(container, curriculum, { activeLessonId: 'lesson_002' });

    const links = [...container.querySelectorAll('a.nav-item')] as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent)).toEqual(['Introduction', 'Follow-up']);

    const selected = container.querySelector('a.nav-item--selected');
    expect(selected?.textContent).toBe('Follow-up');
  });

  it('collapses a node again on second click and removes it from storage', () => {
    renderCurriculumNav(container, curriculum);
    toggleButtons(container)[0].click();
    toggleButtons(container)[0].click();

    expect(toggleButtons(container)).toHaveLength(1);
    const stored = JSON.parse(memoryStorage.getItem('teaching-hub.nav') ?? '[]');
    expect(stored).not.toContain('year:year_12');
  });
});

describe('fetchCurriculum', () => {
  it('delegates to apiGet with the curriculum endpoint', async () => {
    (apiGet as ReturnType<typeof vi.fn>).mockResolvedValue(curriculum);

    const result = await fetchCurriculum();

    expect(apiGet).toHaveBeenCalledWith('/api/curriculum');
    expect(result).toBe(curriculum);
  });
});

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

describe('classes nav rendering', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
  });

  it('lists classes and navigates to class page on click', () => {
    const withClass: CurriculumResponse = {
      ...curriculum,
      classes: [sampleClass]
    };

    renderClassesNav(container, withClass);

    expect(container.querySelector('.rail-classes__label')?.textContent).toBe('Your classes');
    const links = [...container.querySelectorAll('a.rail-classes__item')] as HTMLAnchorElement[];
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('12ENGADV1');
    expect(links[0].getAttribute('href')).toBe('/classes/class_2026_12engadv1');

    links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/classes/class_2026_12engadv1');
  });

  it('does not render year/subject expand tree', () => {
    renderClassesNav(container, {
      ...curriculum,
      classes: [sampleClass]
    });

    expect(container.querySelector('.nav-item--toggle')).toBeNull();
  });

  it('highlights the active class and invokes onCreateClass', () => {
    const onCreateClass = vi.fn();
    renderClassesNav(
      container,
      { ...curriculum, classes: [sampleClass] },
      { activeClassId: 'class_2026_12engadv1', onCreateClass }
    );

    expect(container.querySelector('a.nav-item--selected')?.textContent).toBe('12ENGADV1');
    const add = container.querySelector('button.rail-classes__new') as HTMLButtonElement;
    expect(add.getAttribute('aria-label')).toBe('New class');
    expect(add.textContent).toBe('+');
    add.click();
    expect(onCreateClass).toHaveBeenCalledOnce();
  });
});
