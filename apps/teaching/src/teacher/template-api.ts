import { apiGet, apiPatch, apiPost, apiPut } from '@/api/client';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { builtinLessonTemplate } from '@/marge/template';
import type {
  Lesson,
  LessonTemplate,
  LessonTemplateSummary,
  Unit,
  UnitTemplate,
  UnitTemplateSummary
} from '@/schemas';
import { postLesson, postUnit } from '@/teacher/create/api';

export function listLessonTemplates(): Promise<{ templates: LessonTemplateSummary[] }> {
  return apiGet('/api/lesson-templates');
}

export function listUnitTemplates(): Promise<{ templates: UnitTemplateSummary[] }> {
  return apiGet('/api/unit-templates');
}

export function createLessonTemplate(body: {
  title: string;
  blocks: Lesson['blocks'];
}): Promise<LessonTemplate> {
  return apiPost('/api/lesson-templates', body);
}

export function createUnitTemplate(body: {
  title: string;
  description?: string;
  blocks?: Unit['blocks'];
}): Promise<UnitTemplate> {
  return apiPost('/api/unit-templates', body);
}

export function getLessonTemplate(id: string): Promise<LessonTemplate> {
  return apiGet(`/api/lesson-templates/${id}`);
}

export function getUnitTemplate(id: string): Promise<UnitTemplate> {
  return apiGet(`/api/unit-templates/${id}`);
}

export function patchLessonTemplate(
  id: string,
  body: { title?: string; status?: 'active' | 'archived' | 'trashed' }
): Promise<LessonTemplate> {
  return apiPatch(`/api/lesson-templates/${id}`, body);
}

export function patchUnitTemplate(
  id: string,
  body: { title?: string; status?: 'active' | 'archived' | 'trashed' }
): Promise<UnitTemplate> {
  return apiPatch(`/api/unit-templates/${id}`, body);
}

/** Create a new lesson from a template (independent copy). */
export async function useLessonTemplate(options: {
  templateId: string;
  unitId: string;
  title?: string;
}): Promise<Lesson> {
  const builtin = builtinLessonTemplate(options.templateId);
  const template = builtin ? null : await getLessonTemplate(options.templateId);
  const created = await postLesson({
    title: options.title?.trim() || (builtin ? builtin.title.split(' (')[0]! : template!.title),
    unit_id: options.unitId
  });
  const freshId = () => `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const blocks = builtin ? builtin.build(freshId) : cloneBlocksWithNewIds(template!.blocks);
  const updated: Lesson = {
    ...created,
    blocks,
    updated_at: new Date().toISOString()
  };
  return apiPut(`/api/lessons/${created.id}`, updated);
}

/** Create a new unit from a template (independent copy). */
export async function useUnitTemplate(options: {
  templateId: string;
  yearId: string;
  subjectId: string;
  title?: string;
}): Promise<Unit> {
  const template = await getUnitTemplate(options.templateId);
  return postUnit({
    title: options.title?.trim() || template.title,
    year_id: options.yearId,
    subject_id: options.subjectId,
    description: template.description,
    blocks: template.blocks ? cloneBlocksWithNewIds(template.blocks) : undefined
  });
}
