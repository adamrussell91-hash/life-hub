import { apiPost } from '@/api/client';
import type { Column, Markbook } from './schema';
import type { MarkbookView } from './types';

export type MarkbookApi = {
  load: (classId: string) => Promise<MarkbookView>;
  saveColumn: (classId: string, column: Column) => Promise<Markbook>;
  deleteColumn: (classId: string, columnId: string) => Promise<Markbook>;
  setMark: (classId: string, columnId: string, studentId: string, mark: unknown | null) => Promise<Markbook>;
  hideQuiz: (classId: string, lessonId: string, hidden: boolean) => Promise<Markbook>;
  setFocus: (classId: string, studentId: string, pinned: string[], dismissed: string[]) => Promise<Markbook>;
  setTook: (classId: string, studentId: string, lessonIds: string[]) => Promise<Markbook>;
};

const path = (classId: string): string => `/api/classes/${encodeURIComponent(classId)}/markbook`;
const write = async (classId: string, body: Record<string, unknown>): Promise<Markbook> => (await apiPost<{ markbook: Markbook }>(path(classId), body)).markbook;

export const httpMarkbookApi: MarkbookApi = {
  load: (classId) => apiPost<MarkbookView>(path(classId), { action: 'load' }),
  saveColumn: (classId, column) => write(classId, { action: 'save_column', column }),
  deleteColumn: (classId, columnId) => write(classId, { action: 'delete_column', column_id: columnId }),
  setMark: (classId, columnId, studentId, mark) => write(classId, { action: 'set_mark', column_id: columnId, student_id: studentId, mark }),
  hideQuiz: (classId, lessonId, hidden) => write(classId, { action: 'hide_quiz', lesson_id: lessonId, hidden }),
  setFocus: (classId, studentId, pinned, dismissed) => write(classId, { action: 'set_focus', student_id: studentId, pinned, dismissed }),
  setTook: (classId, studentId, lessonIds) => write(classId, { action: 'set_took', student_id: studentId, lesson_ids: lessonIds })
};
