import { apiGet, apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { OrganiserChange, OrganiserLoad, PracticeNext, ReviewResult, SuggestEstimate, SuggestProposal, TeacherOrganiser } from './types';

const teacherPath = (unitId: string) => `/api/units/${encodeURIComponent(unitId)}/organiser`;
const studentPath = (classId: string) => `/api/published/organiser/${encodeURIComponent(classId)}`;
const token = (classId: string) => deviceToken(`class:${classId}`);

export const organiserApi = {
  get: (unitId: string, classId?: string) =>
    apiGet<TeacherOrganiser>(`${teacherPath(unitId)}${classId ? `?class=${encodeURIComponent(classId)}` : ''}`),
  change: (unitId: string, change: OrganiserChange) => apiPost<TeacherOrganiser>(teacherPath(unitId), change),
  /** What a suggestion run would cost, before it runs. */
  estimateSuggest: (lessonId: string) =>
    apiPost<{ estimate: SuggestEstimate }>('/api/ai/jobs', { kind: 'organiser_suggest', lesson_id: lessonId, dry_run: true }),
  startSuggest: (lessonId: string) => apiPost<{ id: string }>('/api/ai/jobs', { kind: 'organiser_suggest', lesson_id: lessonId }),
  suggestJob: (id: string) =>
    apiGet<{ status: string; error?: string; proposals?: SuggestProposal[]; cost_aud?: number }>(`/api/ai/jobs/${encodeURIComponent(id)}`)
};

export const studentOrganiserApi = {
  load: (classId: string) => apiPost<OrganiserLoad>(studentPath(classId), { action: 'load', class_token: token(classId) }),
  review: (classId: string, results: ReviewResult[]) =>
    apiPost<{ today: number; next: PracticeNext }>(studentPath(classId), { action: 'review', class_token: token(classId), results }),
  lesson: (classId: string, lessonId: string) =>
    apiPost<{ lines: string[]; joining?: boolean }>(studentPath(classId), { action: 'lesson', class_token: token(classId), lesson_id: lessonId })
};
