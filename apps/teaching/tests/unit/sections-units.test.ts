import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/create/api', () => ({ postLesson: vi.fn() }));
vi.mock('@/api/universal-links', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/universal-links')>(),
  listUniversalLinksForEntity: vi.fn().mockResolvedValue({ outgoing: [], incoming: [] })
}));
vi.mock('@/teacher/unit-api', () => ({ patchUnit: vi.fn().mockResolvedValue({}) }));
vi.mock('@/teacher/history-panel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/teacher/history-panel')>();
  return {
    ...actual,
    mountHistoryPanel: vi.fn(() => ({
      dispose: vi.fn(),
      refresh: vi.fn(async () => undefined),
      open: vi.fn(),
      close: vi.fn()
    }))
  };
});

import { navigate } from '@/app/router';
import { postLesson } from '@/teacher/create/api';
import { peekCurriculum, replaceCurriculum } from '@/app/curriculum-state';
import { DEFAULT_PEDAGOGICAL_MODE } from '@/curriculum/pedagogical-mode';
import { patchUnit } from '@/teacher/unit-api';
import { mountHistoryPanel, type HistoryPanelHandle } from '@/teacher/history-panel';
import {
  UNITS_INDEX_GROUP_STORAGE_KEY,
  renderUnitPage,
  renderUnitsIndex,
  renderUnitStub
} from '@/teacher/sections/units';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Lesson, Subject, Unit, Year } from '@/schemas';

/** Reaches the `onRestored` callback the unit page handed to the history panel. */
const lastRestoreCallback = (): ((live: unknown) => void) => {
  const call = vi.mocked(mountHistoryPanel).mock.calls.at(-1);
  if (!call) throw new Error('mountHistoryPanel was never called');
  return call[0].onRestored;
};

const lastHistoryHandle = (): HistoryPanelHandle => {
  const result = vi.mocked(mountHistoryPanel).mock.results.at(-1);
  if (!result || result.type !== 'return') throw new Error('mountHistoryPanel did not return');
  return result.value;
};

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

const year11: Year = {
  id: 'year_11',
  type: 'year',
  title: 'Year 11',
  slug: 'year_11',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_level: 11,
  subject_ids: ['subject_y11_engadv']
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
  class_ids: []
};

const engAdvY11: Subject = {
  id: 'subject_y11_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 11 English Advanced',
  slug: 'english_advanced_y11',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  unit_ids: ['unit_othello'],
  outcome_ids: [],
  class_ids: []
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
  lesson_ids: ['lesson_001', 'lesson_002'],
  cover: { url: 'https://cdn.example.com/aotfw.jpg' }
};

const othello: Unit = {
  id: 'unit_othello',
  type: 'unit',
  title: 'Othello',
  slug: 'othello',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_11',
  subject_id: 'subject_y11_engadv',
  lesson_ids: []
};

const curriculum: CurriculumResponse = {
  years: [year, year11],
  subjects: [engAdv, engAdvY11],
  units: [unit, othello],
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
    },
    {
      id: 'lesson_002',
      title: 'Themes',
      slug: 'themes',
      unit_id: 'unit_aotfw',
      sequence: 2,
      status: 'active',
      published: true,
      updated_at: ISO
    }
  ],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

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

describe('units', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postLesson).mockReset();
    replaceCurriculum(structuredClone(curriculum));
    vi.stubGlobal('localStorage', new MemoryStorage());
    canvas = document.createElement('div');
  });

  it('offers scheduling only in the unit options menu',()=>{
    renderUnitPage(canvas,curriculum,unit.id);
    const buttons=[...canvas.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent==='Schedule lessons');
    expect(buttons).toHaveLength(1);expect(buttons[0]!.getAttribute('role')).toBe('menuitem');
    canvas.querySelector<HTMLButtonElement>('.page-options__trigger')!.click();buttons[0]!.click();
    expect(document.querySelector('[data-timetable-dialog]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-timetable-action="cancel"]')!.click();
  });

  const newLesson: Lesson = {
    id: 'lesson_new', type: 'lesson', title: 'Untitled lesson', slug: 'untitled_lesson',
    unit_id: unit.id, sequence: 3, status: 'active',
    created_at: ISO, updated_at: ISO, schema_version: 1, blocks: [],
    pedagogical_mode: DEFAULT_PEDAGOGICAL_MODE
  };

  it.each([unit.id, othello.id])('offers the shared plus for lessons in %s, including empty units', (unitId) => {
    const handle = renderUnitPage(canvas, curriculum, unitId);
    const button = canvas.querySelector<HTMLButtonElement>('[aria-label="New lesson"]');
    expect(button).not.toBeNull();
    expect(button?.classList.contains('icon-plus-btn')).toBe(true);
    expect(button?.closest('[data-unit-section="lessons"]')).not.toBeNull();
    expect(button?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    handle.dispose();
  });

  it('creates one lesson in the current unit and seeds the curriculum before opening it', async () => {
    let resolve!: (lesson: Lesson) => void;
    vi.mocked(postLesson).mockImplementation(() => new Promise<Lesson>((done) => { resolve = done; }));
    const handle = renderUnitPage(canvas, curriculum, unit.id);
    const button = canvas.querySelector<HTMLButtonElement>('[aria-label="New lesson"]')!;
    expect(button).not.toBeNull();
    button.click();
    button.click();
    expect(button.disabled).toBe(true);
    expect(postLesson).toHaveBeenCalledTimes(1);
    expect(postLesson).toHaveBeenCalledWith({
      title: 'Untitled lesson', unit_id: unit.id, pedagogical_mode: DEFAULT_PEDAGOGICAL_MODE
    });
    expect(navigate).not.toHaveBeenCalled();
    resolve(newLesson);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/lessons/lesson_new'));
    expect(peekCurriculum()?.lessons.find((lesson) => lesson.id === newLesson.id)?.unit_id).toBe(unit.id);
    handle.dispose();
    const returned = renderUnitPage(canvas, peekCurriculum()!, unit.id);
    expect(canvas.textContent).toContain('Untitled lesson');
    returned.dispose();
  });

  it('keeps failed creation in the same unit and allows retry', async () => {
    vi.mocked(postLesson).mockRejectedValueOnce(new Error('Unable to create lesson.'));
    const handle = renderUnitPage(canvas, curriculum, othello.id);
    const button = canvas.querySelector<HTMLButtonElement>('[aria-label="New lesson"]')!;
    expect(button).not.toBeNull();
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    const alert = canvas.querySelector<HTMLElement>('[data-unit-section="lessons"] [role="alert"]')!;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toContain('Unable to create lesson');
    expect(navigate).not.toHaveBeenCalled();
    vi.mocked(postLesson).mockResolvedValueOnce({ ...newLesson, unit_id: othello.id });
    button.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/lessons/lesson_new'));
    expect(postLesson).toHaveBeenLastCalledWith(expect.objectContaining({ unit_id: othello.id }));
    expect(alert.hidden).toBe(true);
    handle.dispose();
  });

  it('does not pull the user back to a lesson after the unit page is disposed', async () => {
    let resolve!: (lesson: Lesson) => void;
    vi.mocked(postLesson).mockImplementation(() => new Promise<Lesson>((done) => { resolve = done; }));
    const handle = renderUnitPage(canvas, curriculum, unit.id);
    const button = canvas.querySelector<HTMLButtonElement>('[aria-label="New lesson"]')!;
    expect(button).not.toBeNull();
    button.click();
    handle.dispose();
    resolve(newLesson);
    await vi.waitFor(() => expect(peekCurriculum()?.lessons.some((lesson) => lesson.id === newLesson.id)).toBe(true));
    expect(navigate).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('lists compact unit cards with cover, title, and year/subject meta', () => {
    renderUnitsIndex(canvas, curriculum);
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Units');
    expect(canvas.querySelector('[data-create-trigger]')?.getAttribute('aria-label')).toMatch(
      /unit/i
    );

    const aotfw = canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_aotfw"]')!;
    expect(aotfw.querySelector('.units-index__title')?.textContent).toBe(
      'Artist of the Floating World'
    );
    expect(aotfw.querySelector('.units-index__meta')?.textContent).toBe(
      'Year 12 · English Advanced'
    );
    expect(aotfw.querySelector<HTMLImageElement>('.entity-cover-tile__media img')?.src).toBe(
      'https://cdn.example.com/aotfw.jpg'
    );

    const othelloCard = canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_othello"]')!;
    expect(othelloCard.querySelector('.entity-cover-tile__media')).toBeTruthy();
    expect(othelloCard.querySelector('.entity-cover-tile__media img')).toBeNull();
  });

  it('puts archive and trash in a kebab on each unit card', () => {
    renderUnitsIndex(canvas, curriculum);
    const card = canvas.querySelector('.units-index__card');
    expect(card?.querySelector('.page-options__trigger')?.getAttribute('aria-label')).toMatch(
      /Options for/
    );
    expect(card?.querySelector('.btn--ghost')).toBeNull();
    const labels = [...(card?.querySelectorAll('.page-options__item') ?? [])].map(
      (item) => item.textContent
    );
    expect(labels).toEqual(['Archive', 'Move to trash']);
  });

  it('groups units by subject by default', () => {
    renderUnitsIndex(canvas, curriculum);
    const headings = [...canvas.querySelectorAll('.units-index__group-title')].map(
      (el) => el.textContent
    );
    expect(headings).toEqual(['English Advanced']);
    expect(
      canvas.querySelector('[data-units-group="subject"]')?.getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('regroups by year level when that filter is selected', () => {
    renderUnitsIndex(canvas, curriculum);
    canvas.querySelector<HTMLButtonElement>('[data-units-group="year"]')!.click();
    const headings = [...canvas.querySelectorAll('.units-index__group-title')].map(
      (el) => el.textContent
    );
    expect(headings).toEqual(['Year 11', 'Year 12']);
    expect(localStorage.getItem(UNITS_INDEX_GROUP_STORAGE_KEY)).toBe('year');
  });

  it('restores the last grouping choice', () => {
    localStorage.setItem(UNITS_INDEX_GROUP_STORAGE_KEY, 'year');
    renderUnitsIndex(canvas, curriculum);
    const headings = [...canvas.querySelectorAll('.units-index__group-title')].map(
      (el) => el.textContent
    );
    expect(headings).toEqual(['Year 11', 'Year 12']);
  });

  it('expands unit tiles before opening the unit page', async () => {
    renderUnitsIndex(canvas, curriculum);
    canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_aotfw"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(document.querySelector('.entity-card-expand')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.entity-card-expand__full-page')?.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
    });
  });

  it('lists unit lessons in sequence and opens the editor', () => {
    renderUnitStub(canvas, curriculum, 'unit_aotfw');
    expect(canvas.querySelector('.page-header__title')).toBeNull();
    expect(canvas.querySelector('.entity-banner__title')?.textContent).toBe(
      'Artist of the Floating World'
    );
    expect(canvas.querySelector('[data-export="unit"]')?.textContent).toMatch(/Export JSON/);
    expect(canvas.querySelector('[data-unit-section="plan"]')).toBeTruthy();
    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map((el) => el.textContent);
    expect(titles).toEqual(['Introduction', 'Themes']);
    canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')[1].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_002');
  });

  it('edits the unit plan with the lesson palette canvas', () => {
    renderUnitStub(canvas, curriculum, 'unit_aotfw');
    const plan = canvas.querySelector('[data-unit-section="plan"]');
    expect(plan?.querySelector('.lesson-palette')).not.toBeNull();
    expect(plan?.querySelector('.lesson-page')).not.toBeNull();
    expect(plan?.querySelector('.unit-plan-editor__add-select')).toBeNull();
    const families = [...(plan?.querySelectorAll('.lesson-palette__family') ?? [])].map((el) =>
      el.getAttribute('data-family')
    );
    expect(families).toContain('Learning');
    expect(families).toContain('Layout');
  });

  it('live saves the unit name from the full unit page', async () => {
    const isolated = structuredClone(curriculum);
    const renamed = {
      ...isolated.units.find((entry) => entry.id === unit.id)!,
      title: 'Area of Study B: Critical Study of Literature'
    };
    vi.mocked(patchUnit).mockResolvedValue(renamed);

    renderUnitPage(canvas, isolated, unit.id);

    expect(canvas.querySelector('.entity-page-title__edit')).toBeNull();
    const input = canvas.querySelector<HTMLInputElement>('.entity-page-title__input')!;
    expect(input.value).toBe('Artist of the Floating World');

    input.value = renamed.title;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));

    await vi.waitFor(() => {
      expect(patchUnit).toHaveBeenCalledWith(unit.id, { title: renamed.title });
    });
    expect(isolated.units.find((entry) => entry.id === unit.id)?.title).toBe(renamed.title);
    expect(canvas.querySelector('.entity-banner__title')?.textContent).toBe(renamed.title);
    await vi.waitFor(() => {
      expect(canvas.querySelector('.entity-page-title__status')?.textContent).toBe('Saved');
    });
  });

  it('uses the shared banner and removes its cover without remounting the unit plan', async () => {
    const onMutated = vi.fn().mockResolvedValue(undefined);
    const onCoverMutated = vi.fn().mockResolvedValue(undefined);
    // renderUnitPage mutates the unit in place, so isolate it from other tests.
    const isolated = structuredClone(curriculum);
    vi.mocked(patchUnit).mockResolvedValue({ ...unit, cover: undefined });

    renderUnitPage(canvas, isolated, unit.id, { onMutated, onCoverMutated });

    expect(canvas.querySelector('.entity-banner__edit')?.textContent).toBe('Change cover');
    expect(canvas.querySelector('.unit-page__cover > .cover-picker')).toBeNull();
    expect(canvas.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'aotfw.jpg'
    );
    const plan = canvas.querySelector('.unit-plan-editor');
    expect(plan).not.toBeNull();
    const bannerRoot = canvas.querySelector('.entity-banner');

    canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
    [...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')]
      .find((button) => button.textContent?.trim() === 'Remove cover')
      ?.click();

    await vi.waitFor(() => {
      expect(patchUnit).toHaveBeenCalledWith(unit.id, { cover: null });
      expect(onCoverMutated).toHaveBeenCalledOnce();
    });
    expect(onMutated).not.toHaveBeenCalled();
    expect(canvas.querySelector('.unit-plan-editor')).toBe(plan);

    // The banner repaints in place: image gone, gradient fallback shown.
    expect(canvas.querySelector('.entity-banner')).toBe(bannerRoot);
    expect(canvas.querySelector('.entity-banner__image')).toBeNull();
    expect(canvas.querySelector('.entity-banner__fallback')).not.toBeNull();
    expect(isolated.units.find((entry) => entry.id === unit.id)?.cover).toBeUndefined();

    // Reopening the dialog reflects the cleared cover rather than stale state.
    canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
    const remove = [
      ...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')
    ].find((button) => button.textContent?.trim() === 'Remove cover');
    expect(remove?.disabled).toBe(true);
  });

  it('syncs unit plan blocks after saving so a remount does not lose them', async () => {
    const onMutated = vi.fn().mockResolvedValue(undefined);
    const isolated = structuredClone(curriculum);
    const savedBlocks = [{ id: 'block_unit_1', type: 'divider' }] as Unit['blocks'];
    vi.mocked(patchUnit).mockResolvedValue({ ...unit, blocks: savedBlocks });

    renderUnitPage(canvas, isolated, unit.id, { onMutated });

    const saveButton = [
      ...canvas.querySelectorAll<HTMLButtonElement>('.unit-plan-editor__toolbar button')
    ].find((button) => button.textContent === 'Save plan');
    saveButton?.click();

    await vi.waitFor(() => {
      expect(patchUnit).toHaveBeenCalledWith(unit.id, { blocks: [] });
      expect(onMutated).toHaveBeenCalledOnce();
    });

    expect(isolated.units.find((entry) => entry.id === unit.id)?.blocks).toEqual(savedBlocks);
  });

  it('applies a restored version in place, clearing an omitted cover', () => {
    const isolated = structuredClone(curriculum);
    renderUnitPage(canvas, isolated, unit.id);

    const bannerRoot = canvas.querySelector('.entity-banner');
    expect(canvas.querySelector('.entity-banner__image')).not.toBeNull();

    const restored = structuredClone(unit);
    restored.title = 'Restored unit title';
    delete restored.cover;
    lastRestoreCallback()(restored);

    expect(canvas.querySelector('.entity-banner')).toBe(bannerRoot);
    expect(canvas.querySelector('.entity-banner__title')?.textContent).toBe(
      'Restored unit title'
    );
    expect(canvas.querySelector('.page-header__title')).toBeNull();
    expect(canvas.querySelector('.entity-banner__image')).toBeNull();
    expect(isolated.units.find((entry) => entry.id === unit.id)?.cover).toBeUndefined();

    canvas.querySelector<HTMLButtonElement>('.entity-banner__edit')?.click();
    const remove = [
      ...document.querySelectorAll<HTMLButtonElement>('.entity-banner__dialog button')
    ].find((button) => button.textContent?.trim() === 'Remove cover');
    expect(remove?.disabled).toBe(true);
  });

  it('disposes the history panel along with the unit page', () => {
    const isolated = structuredClone(curriculum);
    const handle = renderUnitPage(canvas, isolated, unit.id);
    const historyPanel = lastHistoryHandle();

    handle.dispose();

    expect(historyPanel.dispose).toHaveBeenCalledOnce();
  });

  it('renders not-found for an unknown unit', () => {
    renderUnitStub(canvas, curriculum, 'unit_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
