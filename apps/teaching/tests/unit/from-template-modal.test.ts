import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/template-api', () => ({
  listLessonTemplates: vi.fn(),
  useLessonTemplate: vi.fn()
}));

import { listLessonTemplates, useLessonTemplate } from '@/teacher/template-api';
import { promptLessonFromTemplate } from '@/teacher/lessons-library/from-template';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Lesson, Unit } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const unit: Unit = {
  id: 'unit_partial',
  type: 'unit',
  title: 'Testing Effect',
  slug: 'testing_effect',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_retrieve',
  lesson_ids: []
};

function curriculum(overrides: Partial<CurriculumResponse> = {}): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [unit],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-17',
    ...overrides
  };
}

const createdLesson = {
  id: 'lesson_from_tpl',
  type: 'lesson',
  title: 'Retrieval pack',
  slug: 'retrieval_pack',
  status: 'active',
  unit_id: 'unit_partial',
  sequence: 1,
  blocks: [],
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
} satisfies Lesson;

describe('promptLessonFromTemplate', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('shows a kit dialog when there are no lesson templates, not window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    vi.mocked(listLessonTemplates).mockResolvedValue({ templates: [] });

    const pending = promptLessonFromTemplate(curriculum());
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    });

    expect(document.body.textContent).toContain('From template');
    expect(document.body.textContent).toContain(
      'No lesson templates yet. Save one from a lesson editor.'
    );
    expect(alertSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('[data-from-template-action="close"]')?.click();
    await expect(pending).resolves.toBeNull();
  });

  it('creates a lesson from selected template and unit through the dialog', async () => {
    vi.mocked(listLessonTemplates).mockResolvedValue({
      templates: [{ id: 'tpl_1', title: 'Retrieval pack', updated_at: ISO }]
    });
    vi.mocked(useLessonTemplate).mockResolvedValue(createdLesson);

    const pending = promptLessonFromTemplate(curriculum());
    await vi.waitFor(() => {
      expect(document.querySelector('[data-from-template-field="template_id"]')).toBeTruthy();
    });

    const promptSpy = vi.spyOn(window, 'prompt');
    const templateSelect = document.querySelector<HTMLSelectElement>(
      '[data-from-template-field="template_id"]'
    );
    const unitSelect = document.querySelector<HTMLSelectElement>(
      '[data-from-template-field="unit_id"]'
    );
    expect(templateSelect?.value).toBe('tpl_1');
    expect(unitSelect?.value).toBe('unit_partial');
    expect(promptSpy).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('[data-from-template-action="create"]')?.click();

    await expect(pending).resolves.toEqual(createdLesson);
    expect(useLessonTemplate).toHaveBeenCalledWith({
      templateId: 'tpl_1',
      unitId: 'unit_partial'
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('cancel closes without creating a lesson', async () => {
    vi.mocked(listLessonTemplates).mockResolvedValue({
      templates: [{ id: 'tpl_1', title: 'Retrieval pack', updated_at: ISO }]
    });

    const pending = promptLessonFromTemplate(curriculum());
    await vi.waitFor(() => {
      expect(document.querySelector('[data-from-template-action="cancel"]')).toBeTruthy();
    });

    document.querySelector<HTMLButtonElement>('[data-from-template-action="cancel"]')?.click();
    await expect(pending).resolves.toBeNull();
    expect(useLessonTemplate).not.toHaveBeenCalled();
  });
});
