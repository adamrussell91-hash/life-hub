import { describe, expect, it } from 'vitest';
import { DEFAULT_LESSONS_STATE } from '@/teacher/lessons-library/types';
import { parseLessonsSearch, serializeLessonsSearch } from '@/teacher/lessons-library/state';

describe('lessons library URL state', () => {
  it('parses empty search as defaults', () => {
    expect(parseLessonsSearch('')).toEqual(DEFAULT_LESSONS_STATE);
    expect(parseLessonsSearch('?')).toEqual(DEFAULT_LESSONS_STATE);
  });

  it('round-trips combinable filters and sort', () => {
    const state = {
      ...DEFAULT_LESSONS_STATE,
      q: 'floating world',
      units: ['unit_a', 'unit_b'],
      subjects: ['subject_eng'],
      modes: ['workshop', 'lab'] as const,
      statuses: ['draft', 'published'] as ('draft' | 'published')[],
      tags: ['assessment', 'module-a'],
      sort: 'title_asc' as const,
      view: 'table' as const,
      density: 'compact' as const,
      smart: 'health' as const
    };
    const search = serializeLessonsSearch({ ...state, modes: [...state.modes] });
    expect(search.startsWith('?')).toBe(true);
    expect(parseLessonsSearch(search)).toEqual({
      ...state,
      modes: [...state.modes],
      savedViewId: null
    });
  });

  it('ignores unknown keys and invalid enums', () => {
    const parsed = parseLessonsSearch(
      '?q=guilt&sort=nope&view=cards&status=live&unit=unit_1&subject=sub_1&mode=party'
    );
    expect(parsed.q).toBe('guilt');
    expect(parsed.sort).toBe('edited_desc');
    expect(parsed.view).toBe('library');
    expect(parsed.units).toEqual(['unit_1']);
    expect(parsed.subjects).toEqual(['sub_1']);
    expect(parsed.modes).toEqual([]);
    expect(parsed.statuses).toEqual([]);
  });
});