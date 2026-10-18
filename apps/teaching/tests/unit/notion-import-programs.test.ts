import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/create/api', () => ({ postLesson: vi.fn() }));
vi.mock('@/api/universal-links', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/universal-links')>(),
  listUniversalLinksForEntity: vi.fn().mockResolvedValue({ outgoing: [], incoming: [] })
}));

import { renderUnitsIndex } from '@/teacher/sections/units';
import { renderDocumentPage } from '@/teacher/sections/documents';
import { openScheduleUnitModal } from '@/teacher/sections/schedule-unit-modal';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Subject, TeachingDocument, Unit, Year } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';
const base = { status: 'active' as const, created_at: ISO, updated_at: ISO, schema_version: 1 };

const year: Year = {
  ...base, id: 'year_12', type: 'year', title: 'Year 12', slug: 'year_12',
  year_level: 12, subject_ids: ['subject_y12_made']
};
const subject: Subject = {
  ...base, id: 'subject_y12_made', type: 'subject', title: 'Made-up Subject',
  display_title: 'Year 12 Made-up Subject', slug: 'made_up_subject',
  unit_ids: ['unit_plain', 'unit_prog'], outcome_ids: [], class_ids: ['class_made']
};
const plain: Unit = {
  ...base, id: 'unit_plain', type: 'unit', title: 'Made-up Unit', slug: 'made_up_unit',
  year_id: 'year_12', subject_id: 'subject_y12_made', lesson_ids: []
};
const program: Unit = {
  ...plain, id: 'unit_prog', title: 'Made-up Program', slug: 'made_up_program', kind: 'program'
};
const syllabus: TeachingDocument = {
  ...base, id: 'doc_syl', type: 'document', kind: 'syllabus', title: 'Made-up Syllabus',
  slug: 'made_up_syllabus', subject_id: 'subject_y12_made',
  source: { system: 'notion', page_id: 'page_made_up', imported_at: '2026-10-18T00:00:00.000Z', last_edited_at: ISO },
  blocks: [{
    id: 'block_a', block_type: 'rich_text', visibility: 'teacher_and_student',
    content: { html: '<p>Syllabus body text</p>' }
  }] as unknown as TeachingDocument['blocks']
};

const curriculum = {
  years: [year], subjects: [subject], units: [plain, program], documents: [syllabus],
  lessons: [],
  classes: [{
    ...base, id: 'class_made', type: 'class', title: 'Made-up Class', slug: 'made_up_class',
    code: 'MADE', academic_year: 2026, year_id: 'year_12', subject_id: 'subject_y12_made',
    active_unit_ids: ['unit_plain', 'unit_prog'], student_ids: []
  }],
  scheduled_lessons: [], scope_sequences: [], media: [], schedule_anchor_date: '2026-08-12'
} as unknown as CurriculumResponse;

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

describe('programs in the units index', () => {
  let canvas: HTMLElement;
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    canvas = document.createElement('div');
  });
  afterEach(() => vi.unstubAllGlobals());

  const ids = () =>
    [...canvas.querySelectorAll('[data-unit-id]')].map((n) => n.getAttribute('data-unit-id'));

  it('labels program units and filters them', () => {
    renderUnitsIndex(canvas, curriculum);
    const card = canvas.querySelector('[data-unit-id="unit_prog"]')!;
    expect(card.textContent).toContain('Program');
    expect(canvas.querySelector('[data-unit-id="unit_plain"]')!.textContent).not.toContain('Program');

    canvas.querySelector<HTMLButtonElement>('[data-unit-filter="programs"]')!.click();
    expect(ids()).toEqual(['unit_prog']);
    canvas.querySelector<HTMLButtonElement>('[data-unit-filter="units"]')!.click();
    expect(ids()).toEqual(['unit_plain']);
    canvas.querySelector<HTMLButtonElement>('[data-unit-filter="all"]')!.click();
    expect(ids().sort()).toEqual(['unit_plain', 'unit_prog']);
  });

  it('links a syllabus from its subject group', () => {
    renderUnitsIndex(canvas, curriculum);
    const link = canvas.querySelector<HTMLAnchorElement>('a[data-document-id="doc_syl"]')!;
    expect(link.getAttribute('href')).toBe('/documents/doc_syl');
    expect(link.textContent).toContain('Syllabus');
  });

  it('keeps programs out of the schedule-unit picker', () => {
    openScheduleUnitModal({ curriculum, classId: 'class_made', onSuccess: vi.fn() } as never);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Made-up Unit');
    expect(text).not.toContain('Made-up Program');
  });
});

describe('syllabus document page', () => {
  it('renders blocks read-only with the import note', () => {
    const canvas = document.createElement('div');
    renderDocumentPage(canvas, curriculum, 'doc_syl');
    expect(canvas.textContent).toContain('Made-up Syllabus');
    expect(canvas.textContent).toContain('Syllabus body text');
    expect(canvas.textContent).toContain('Imported from Notion');
    expect(canvas.textContent).toContain('2026');
  });
  it('says so when the document is missing', () => {
    const canvas = document.createElement('div');
    renderDocumentPage(canvas, curriculum, 'nope');
    expect(canvas.textContent).toContain('not found');
  });
});
