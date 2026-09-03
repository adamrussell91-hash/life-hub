import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/teacher/create/api', () => ({
  postClass: vi.fn(),
  postUnit: vi.fn(),
  postLesson: vi.fn(),
  postScopeSequence: vi.fn(),
  postSubject: vi.fn()
}));

import { postClass, postSubject } from '@/teacher/create/api';
import { mountCreateControl } from '@/teacher/create/control';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class, Subject, Unit, Year } from '@/schemas';

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
  subject_ids: []
};

const engAdv: Subject = {
  id: 'subject_y12_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  unit_ids: ['unit_partial'],
  outcome_ids: [],
  class_ids: ['class_2026_12engadv1']
};

const psychology: Subject = {
  id: 'subject_psych',
  type: 'subject',
  title: 'Psychology',
  display_title: 'Psychology',
  slug: 'psychology',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  unit_ids: [],
  outcome_ids: [],
  class_ids: []
};

const unitPartial: Unit = {
  id: 'unit_partial',
  type: 'unit',
  title: 'Partial Unit',
  slug: 'partial_unit',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  lesson_ids: ['lesson_a']
};

const classRow: Class = {
  id: 'class_2026_12engadv1',
  type: 'class',
  code: '12ENGADV1',
  title: 'Year 12 English Advanced',
  slug: '12engadv1',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  active_unit_ids: ['unit_partial'],
  current_unit_id: 'unit_partial',
  meeting_days: [1, 3, 5],
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const curriculum: CurriculumResponse = {
  years: [year, year11],
  subjects: [engAdv, psychology],
  units: [unitPartial],
  lessons: [
    {
      id: 'lesson_a',
      title: 'Lesson A',
      slug: 'lesson-a',
      unit_id: 'unit_partial',
      sequence: 1,
      status: 'active',
      published: true,
      updated_at: ISO
    }
  ],
  classes: [classRow],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

describe('mountCreateControl', () => {
  let host: HTMLElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
    host = document.createElement('div');
    document.body.append(host);
    dispose = undefined;
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  it('home context shows Create menu with Class, Subject, Unit, Lesson, Scope & Sequence', () => {
    const result = mountCreateControl(host, {
      context: 'home',
      curriculum,
      onCreated: vi.fn()
    });
    dispose = result.dispose;

    const trigger = host.querySelector<HTMLButtonElement>('[data-create-trigger]');
    expect(trigger).toBeTruthy();
    expect(trigger?.getAttribute('aria-label')).toMatch(/Create/i);

    trigger?.click();

    const menu = host.querySelector('[data-create-menu]');
    expect(menu).toBeTruthy();
    const labels = [...menu!.querySelectorAll('[data-create-kind]')].map((el) =>
      (el.textContent ?? '').trim()
    );
    expect(labels).toEqual(
      expect.arrayContaining(['Class', 'Subject', 'Unit', 'Lesson', 'Scope & Sequence'])
    );
    expect(menu!.querySelectorAll('[data-create-kind]')).toHaveLength(5);
  });

  it('classes context shows a single New class control without the full four-item menu', () => {
    const result = mountCreateControl(host, {
      context: 'classes',
      curriculum,
      onCreated: vi.fn()
    });
    dispose = result.dispose;

    const trigger = host.querySelector<HTMLButtonElement>('[data-create-trigger]');
    expect(trigger).toBeTruthy();
    expect(trigger?.getAttribute('aria-label')).toMatch(/class/i);

    trigger?.click();

    expect(host.querySelector('[data-create-menu]')).toBeNull();
    expect(document.querySelector('.create-modal')).toBeTruthy();
    expect(document.body.textContent).toMatch(/New class|Create class/i);
  });

  it('choosing Class from home menu opens the create modal', () => {
    const result = mountCreateControl(host, {
      context: 'home',
      curriculum,
      onCreated: vi.fn()
    });
    dispose = result.dispose;

    host.querySelector<HTMLButtonElement>('[data-create-trigger]')?.click();
    host
      .querySelector<HTMLButtonElement>('[data-create-kind="class"]')
      ?.click();

    const modal = document.querySelector('.create-modal');
    expect(modal).toBeTruthy();
    expect(document.querySelector('.create-modal-backdrop')).toBeTruthy();
    expect(document.body.textContent).toMatch(/New class|Create class/i);
  });

  it('submitting class modal calls postClass and onCreated with kind and id', async () => {
    const created: Class = {
      ...classRow,
      id: 'class_new',
      code: '12ENGSTD1',
      title: '12 Eng Std'
    };
    vi.mocked(postClass).mockResolvedValue(created);
    const onCreated = vi.fn().mockResolvedValue(undefined);

    const result = mountCreateControl(host, {
      context: 'classes',
      curriculum,
      onCreated
    });
    dispose = result.dispose;

    host.querySelector<HTMLButtonElement>('[data-create-trigger]')?.click();

    const titleInput = document.querySelector<HTMLInputElement>(
      '[data-create-field="title"]'
    );
    const codeInput = document.querySelector<HTMLInputElement>(
      '[data-create-field="code"]'
    );
    const yearSelect = document.querySelector<HTMLSelectElement>(
      '[data-create-field="year_id"]'
    );
    const subjectSelect = document.querySelector<HTMLSelectElement>(
      '[data-create-field="subject_id"]'
    );
    const academicYearInput = document.querySelector<HTMLInputElement>(
      '[data-create-field="academic_year"]'
    );

    expect(titleInput).toBeTruthy();
    expect(codeInput).toBeTruthy();
    expect(yearSelect).toBeTruthy();
    expect(subjectSelect).toBeTruthy();

    if (titleInput) titleInput.value = '12 Eng Std';
    if (codeInput) codeInput.value = '12ENGSTD1';
    if (yearSelect) yearSelect.value = 'year_12';
    if (subjectSelect) subjectSelect.value = 'subject_y12_engadv';
    if (academicYearInput) academicYearInput.value = '2026';

    document.querySelector<HTMLButtonElement>('[data-create-action="save"]')?.click();

    await vi.waitFor(() => {
      expect(postClass).toHaveBeenCalledWith({
        title: '12 Eng Std',
        code: '12ENGSTD1',
        academic_year: 2026,
        year_id: 'year_12',
        subject_id: 'subject_y12_engadv'
      });
      expect(onCreated).toHaveBeenCalledWith('class', 'class_new', created);
    });

    expect(document.querySelector('.create-modal')).toBeNull();
  });

  it('class and unit subject pickers list every subject regardless of selected year', () => {
    const result = mountCreateControl(host, {
      context: 'classes',
      curriculum,
      onCreated: vi.fn()
    });
    dispose = result.dispose;

    host.querySelector<HTMLButtonElement>('[data-create-trigger]')?.click();

    const yearSelect = document.querySelector<HTMLSelectElement>(
      '[data-create-field="year_id"]'
    );
    const subjectSelect = document.querySelector<HTMLSelectElement>(
      '[data-create-field="subject_id"]'
    );
    expect(yearSelect).toBeTruthy();
    expect(subjectSelect).toBeTruthy();

    if (yearSelect) yearSelect.value = 'year_12';
    yearSelect?.dispatchEvent(new Event('change'));

    const labels = [...(subjectSelect?.options ?? [])].map((opt) => opt.textContent ?? '');
    expect(labels).toEqual(expect.arrayContaining(['English Advanced', 'Psychology']));
    expect(labels.some((label) => /year\s*12/i.test(label))).toBe(false);
  });

  it('Create Subject requests only a title and calls postSubject', async () => {
    const created = { ...psychology, id: 'subject_new', title: 'History' };
    vi.mocked(postSubject).mockResolvedValue(created);
    const onCreated = vi.fn().mockResolvedValue(undefined);

    const result = mountCreateControl(host, {
      context: 'home',
      curriculum,
      onCreated
    });
    dispose = result.dispose;

    host.querySelector<HTMLButtonElement>('[data-create-trigger]')?.click();
    host.querySelector<HTMLButtonElement>('[data-create-kind="subject"]')?.click();

    const modal = document.querySelector('.create-modal');
    expect(modal).toBeTruthy();
    expect(document.body.textContent).toMatch(/New subject/i);
    expect(document.querySelector('[data-create-field="year_id"]')).toBeNull();
    expect(document.querySelector('[data-create-field="subject_id"]')).toBeNull();
    expect(document.querySelectorAll('[data-create-field]')).toHaveLength(1);

    const titleInput = document.querySelector<HTMLInputElement>(
      '[data-create-field="title"]'
    );
    if (titleInput) titleInput.value = 'History';
    document.querySelector<HTMLButtonElement>('[data-create-action="save"]')?.click();

    await vi.waitFor(() => {
      expect(postSubject).toHaveBeenCalledWith({ title: 'History' });
      expect(onCreated).toHaveBeenCalledWith('subject', 'subject_new', created);
    });

    expect(document.querySelector('.create-modal')).toBeNull();
  });
});
