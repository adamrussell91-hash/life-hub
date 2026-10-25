import { apiPost } from '@/api/client';
import type { Column, HistoryEvent, Markbook } from './schema';
import type { MarkbookView } from './types';

export type NewMember = { student: string; why: string };

export type MarkbookApi = {
  load: (classId: string) => Promise<MarkbookView>;
  saveColumn: (classId: string, column: Column) => Promise<Markbook>;
  deleteColumn: (classId: string, columnId: string) => Promise<Markbook>;
  setMark: (classId: string, columnId: string, studentId: string, mark: unknown | null) => Promise<Markbook>;
  hideQuiz: (classId: string, lessonId: string, hidden: boolean) => Promise<Markbook>;
  setFocus: (classId: string, studentId: string, pinned: string[], dismissed: string[]) => Promise<Markbook>;
  setTook: (classId: string, studentId: string, lessonIds: string[]) => Promise<Markbook>;
  saveGroup: (classId: string, group: { id: string; name: string; tags: string[]; members: NewMember[] }, today: string) => Promise<Markbook>;
  addMembers: (classId: string, groupId: string, members: NewMember[], today: string) => Promise<Markbook>;
  removeMember: (classId: string, groupId: string, student: string, today: string) => Promise<Markbook>;
  renameGroup: (classId: string, groupId: string, name: string) => Promise<Markbook>;
  recordHistory: (classId: string, events: HistoryEvent[], leaves: Array<{ group_id: string; student: string; day: string; why: string }>) => Promise<Markbook>;
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
  setTook: (classId, studentId, lessonIds) => write(classId, { action: 'set_took', student_id: studentId, lesson_ids: lessonIds }),
  saveGroup: (classId, group, today) => write(classId, { action: 'save_group', group, today }),
  addMembers: (classId, groupId, members, today) => write(classId, { action: 'add_members', group_id: groupId, members, today }),
  removeMember: (classId, groupId, student, today) => write(classId, { action: 'remove_member', group_id: groupId, student, today }),
  renameGroup: (classId, groupId, name) => write(classId, { action: 'rename_group', group_id: groupId, name }),
  recordHistory: (classId, events, leaves) => write(classId, { action: 'record_history', events, leaves })
};
