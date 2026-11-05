import { describe, expect, it } from 'vitest';
import { pageName, setPageName } from '@/app/page-title';
import { match } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';

const curriculum = {
  classes: [{ id: 'c1', code: '9ENG', title: 'Year 9 English' }],
  units: [{ id: 'u1', title: 'Invented Unit' }],
  lessons: [{ id: 'l1', title: 'Invented Lesson' }, { id: 'l2', title: '' }],
  subjects: [{ id: 's1', display_title: 'English' }],
  documents: [{ id: 'd1', title: 'Invented Plan' }]
} as unknown as CurriculumResponse;

const nameAt = (path: string, data?: CurriculumResponse) => pageName(match(path)!, data);

describe('pageName', () => {
  it('names the fixed pages', () => {
    expect(nameAt('/')).toBe('Dashboard');
    expect(nameAt('/classes')).toBe('Classes');
    expect(nameAt('/units')).toBe('Units');
    expect(nameAt('/resources')).toBe('Resource Library');
    expect(nameAt('/calendar/year')).toBe('Calendar');
    expect(nameAt('/no-such-page')).toBe('Page not found');
  });

  it('names a page after what it shows', () => {
    expect(nameAt('/lessons/l1', curriculum)).toBe('Invented Lesson');
    expect(nameAt('/units/u1', curriculum)).toBe('Invented Unit');
    expect(nameAt('/classes/c1', curriculum)).toBe('9ENG');
    expect(nameAt('/mark/c1/col', curriculum)).toBe('Marking 9ENG');
    expect(nameAt('/scope-sequences/s1', curriculum)).toBe('English');
    expect(nameAt('/documents/d1', curriculum)).toBe('Invented Plan');
  });

  it('says what kind of page it is until the name is known', () => {
    expect(nameAt('/lessons/l1')).toBe('Lesson');
    expect(nameAt('/lessons/l2', curriculum)).toBe('Lesson');
    expect(nameAt('/units/gone', curriculum)).toBe('Unit');
    expect(nameAt('/classes/gone', curriculum)).toBe('Class');
  });

  it('leaves student pages and Display to name themselves', () => {
    expect(nameAt('/s/lessons/l1', curriculum)).toBeNull();
    expect(nameAt('/lessons/l1/display', curriculum)).toBeNull();
  });
});

describe('setPageName', () => {
  it('puts the page first and falls back to the hub', () => {
    setPageName('Classes');
    expect(document.title).toBe('Classes · Teaching Hub');
    setPageName('  ');
    expect(document.title).toBe('Teaching Hub');
    setPageName(null);
    expect(document.title).toBe('Teaching Hub');
  });
});
