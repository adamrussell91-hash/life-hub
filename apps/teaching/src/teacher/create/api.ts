import { apiPost } from '@/api/client';
import type { Class, Lesson, PedagogicalMode, ScopeSequence, Subject, Unit } from '@/schemas';

export function postSubject(body: { title: string }): Promise<Subject> {
  return apiPost('/api/subjects', body);
}

export function postClass(body: {
  title: string;
  code: string;
  academic_year: number;
  year_id: string;
  subject_id: string;
}): Promise<Class> {
  return apiPost('/api/classes', body);
}

export function postUnit(body: {
  title: string;
  year_id: string;
  subject_id: string;
  description?: string;
  blocks?: Unit['blocks'];
}): Promise<Unit> {
  return apiPost('/api/units', body);
}

export function postLesson(body: {
  title: string;
  unit_id: string;
  pedagogical_mode?: PedagogicalMode;
}): Promise<Lesson> {
  return apiPost('/api/lessons', body);
}

export function postScopeSequence(body: {
  title: string;
  subject_id: string;
  academic_year: number;
}): Promise<ScopeSequence> {
  return apiPost('/api/scope-sequences', body);
}
