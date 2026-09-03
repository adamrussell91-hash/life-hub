import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurriculumResponse } from '@/teacher/nav';
import { RECENT_STORAGE_KEY } from '@/teacher/search/recent';
import { openSearchPanel, type SearchPanelOptions } from '@/teacher/search/panel';

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

function emptyCurriculum(): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12'
  };
}

function baseOptions(overrides: Partial<SearchPanelOptions> = {}): SearchPanelOptions {
  return {
    curriculum: emptyCurriculum(),
    compositions: [],
    path: '/',
    hasLessonEditor: false,
    onNavigate: vi.fn(),
    onAction: vi.fn(),
    fetchContentSearch: async () => ({ hits: [] }),
    ...overrides
  };
}

describe('openSearchPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.removeItem(RECENT_STORAGE_KEY);
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders dialog with input and closes on Escape', () => {
    const onNavigate = vi.fn();
    openSearchPanel(baseOptions({ onNavigate }));
    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    expect(input).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.search-palette')).toBeNull();
  });

  it('shows recent and actions when query empty', () => {
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify([
        { type: 'lesson', id: 'l1', title: 'Recent Lesson', opened_at: '2026-08-11T00:00:00.000Z' }
      ])
    );
    openSearchPanel(baseOptions());
    const text = document.body.textContent ?? '';
    expect(text).toContain('Recent Lesson');
    expect(text).toMatch(/New Lesson/i);
  });

  it('focuses existing input when opened again', () => {
    openSearchPanel(baseOptions());
    const firstInput = document.querySelector<HTMLInputElement>('.search-palette__input');
    expect(firstInput).toBeTruthy();
    firstInput!.blur();

    openSearchPanel(baseOptions());
    expect(document.querySelectorAll('.search-palette-backdrop')).toHaveLength(1);
    expect(document.activeElement).toBe(firstInput);
  });

  it('closes on backdrop click', () => {
    openSearchPanel(baseOptions());
    const backdrop = document.querySelector<HTMLElement>('.search-palette-backdrop');
    expect(backdrop).toBeTruthy();
    backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.search-palette')).toBeNull();
  });

  it('activates selected action with Enter', () => {
    const onAction = vi.fn();
    openSearchPanel(baseOptions({ onAction }));
    const rows = document.querySelectorAll('.search-palette__row');
    expect(rows.length).toBeGreaterThan(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onAction).toHaveBeenCalledWith('new-lesson');
    expect(document.querySelector('.search-palette')).toBeNull();
  });

  it('navigates recent item with Enter', () => {
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify([
        { type: 'lesson', id: 'l1', title: 'Recent Lesson', opened_at: '2026-08-11T00:00:00.000Z' }
      ])
    );
    const onNavigate = vi.fn();
    openSearchPanel(baseOptions({ onNavigate }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onNavigate).toHaveBeenCalledWith('/lessons/l1');
  });

  it('moves selection with arrow keys', () => {
    openSearchPanel(baseOptions());
    const first = document.querySelector('.search-palette__row');
    expect(first?.getAttribute('aria-selected')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const rows = document.querySelectorAll('.search-palette__row');
    expect(rows[0]?.getAttribute('aria-selected')).toBe('false');
    expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('debounces typed search and merges content hits', async () => {
    vi.useFakeTimers();
    const curriculum = emptyCurriculum();
    curriculum.lessons = [
      {
        id: 'l1',
        title: 'Memory and Identity',
        slug: 'memory',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ];

    const fetchContentSearch = vi.fn(async () => ({
      hits: [{ type: 'lesson' as const, id: 'l2', snippet: '…newton laws…' }]
    }));

    openSearchPanel(
      baseOptions({
        curriculum,
        fetchContentSearch
      })
    );

    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    expect(input).toBeTruthy();
    input!.value = 'me';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fetchContentSearch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchContentSearch).toHaveBeenCalledWith('me');

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const text = document.body.textContent ?? '';
    expect(text).toContain('Memory and Identity');
    expect(text).toContain('l2');
    expect(text).toContain('…newton laws…');
  });

  it('keeps title hits and shows unavailable status on content error', async () => {
    vi.useFakeTimers();
    const curriculum = emptyCurriculum();
    curriculum.lessons = [
      {
        id: 'l1',
        title: 'Memory and Identity',
        slug: 'memory',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ];

    openSearchPanel(
      baseOptions({
        curriculum,
        fetchContentSearch: async () => {
          throw new Error('network');
        }
      })
    );

    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    input!.value = 'mem';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    await Promise.resolve();

    const text = document.body.textContent ?? '';
    expect(text).toContain('Memory and Identity');
    expect(text).toContain('Content search unavailable');
  });

  it('shows type badge and hierarchy together on result rows', async () => {
    vi.useFakeTimers();
    const curriculum = emptyCurriculum();
    curriculum.years = [
      {
        id: 'y12',
        type: 'year',
        title: 'Year 12',
        slug: 'year-12',
        year_level: 12,
        subject_ids: ['eng'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ];
    curriculum.subjects = [
      {
        id: 'eng',
        type: 'subject',
        title: 'English Advanced',
        display_title: 'English Advanced',
        slug: 'english-advanced',
        unit_ids: ['u1'],
        outcome_ids: [],
        class_ids: [],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ];
    curriculum.units = [
      {
        id: 'u1',
        type: 'unit',
        title: 'Artist of the Floating World',
        slug: 'aotfw',
        year_id: 'y12',
        subject_id: 'eng',
        lesson_ids: ['l1'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ];
    curriculum.lessons = [
      {
        id: 'l1',
        title: 'Memory and Identity',
        slug: 'memory',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ];

    openSearchPanel(baseOptions({ curriculum }));

    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    input!.value = 'memory';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    await Promise.resolve();

    const row = document.querySelector('.search-palette__row');
    expect(row).toBeTruthy();
    expect(row?.querySelector('.search-palette__type')?.textContent).toBe('Lesson');
    expect(row?.querySelector('.search-palette__hierarchy')?.textContent).toMatch(/Year 12/);
    expect(row?.querySelector('.search-palette__hierarchy')?.textContent).toMatch(/English/);
  });

  it('populates hierarchy on body-only enrich hits', async () => {
    vi.useFakeTimers();
    const curriculum = emptyCurriculum();
    curriculum.years = [
      {
        id: 'y12',
        type: 'year',
        title: 'Year 12',
        slug: 'year-12',
        year_level: 12,
        subject_ids: ['eng'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ];
    curriculum.subjects = [
      {
        id: 'eng',
        type: 'subject',
        title: 'English Advanced',
        display_title: 'English Advanced',
        slug: 'english-advanced',
        unit_ids: ['u1'],
        outcome_ids: [],
        class_ids: [],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ];
    curriculum.units = [
      {
        id: 'u1',
        type: 'unit',
        title: 'Artist of the Floating World',
        slug: 'aotfw',
        year_id: 'y12',
        subject_id: 'eng',
        lesson_ids: ['l2'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ];
    curriculum.lessons = [
      {
        id: 'l2',
        title: 'Body Only Lesson',
        slug: 'body-only',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ];

    openSearchPanel(
      baseOptions({
        curriculum,
        fetchContentSearch: async () => ({
          hits: [{ type: 'lesson' as const, id: 'l2', snippet: '…newton laws…' }]
        })
      })
    );

    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    input!.value = 'newton';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    await Promise.resolve();

    const row = [...document.querySelectorAll('.search-palette__row')].find((el) =>
      (el.textContent ?? '').includes('Body Only Lesson')
    );
    expect(row).toBeTruthy();
    expect(row?.querySelector('.search-palette__type')?.textContent).toBe('Lesson');
    expect(row?.querySelector('.search-palette__hierarchy')?.textContent).toMatch(/Year 12/);
    expect(row?.querySelector('.search-palette__snippet')?.textContent).toContain('newton');
  });

  it('shows No matches when search finishes with zero hits', async () => {
    vi.useFakeTimers();
    openSearchPanel(baseOptions());

    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    input!.value = 'zzzznonexistent';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.textContent ?? '').toContain('No matches');
    expect(document.querySelectorAll('.search-palette__row')).toHaveLength(0);
  });

  it('navigates to templates when Enter activates a composition hit', async () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();
    const onAction = vi.fn();
    openSearchPanel(
      baseOptions({
        compositions: [{ id: 'comp1', title: 'Template Pack' }],
        onNavigate,
        onAction,
        fetchContentSearch: async () => ({ hits: [] })
      })
    );

    const input = document.querySelector<HTMLInputElement>('.search-palette__input');
    input!.value = 'template';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.textContent ?? '').toContain('Template Pack');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onNavigate).toHaveBeenCalledWith('/templates');
    expect(onAction).not.toHaveBeenCalled();
    expect(document.querySelector('.search-palette')).toBeNull();
  });
});
