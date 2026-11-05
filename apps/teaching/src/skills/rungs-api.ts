import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { SkillRow } from '@/progress/types';

/** Each skill a student's returned work has placed, `strand.sub` to rung. */
export type SkillRungs = Record<string, string>;
export type ClassSkillRungs = { students: Array<{ id: string; name: string; initials: string; rungs: SkillRungs }> };
export type OwnSkills = { need: 'initials' | null; skills?: Array<{ strand: string; strand_id?: string; rows: SkillRow[] }> };

const profile = <T>(classId: string, body: Record<string, unknown>): Promise<T> =>
  apiPost<T>(`/api/classes/${encodeURIComponent(classId)}/profile`, body);

/** Teacher: one student's latest rung on each skill, from their returned work. */
export async function loadStudentRungs(classId: string, studentId: string): Promise<SkillRungs> {
  const r = await profile<{ rungs?: SkillRungs }>(classId, { action: 'skill_rungs', student_id: studentId });
  return r.rungs ?? {};
}

/** Teacher: every student in a class, with their latest rung on each skill. */
export function loadClassRungs(classId: string): Promise<ClassSkillRungs> {
  return profile<ClassSkillRungs>(classId, { action: 'skill_rungs' });
}

/** Student: their own rows on one strand, where they sit now and the move to the next rung. */
export function loadOwnSkills(classId: string, strand: string): Promise<OwnSkills> {
  return apiPost<OwnSkills>(`/api/published/profile/${encodeURIComponent(classId)}`, { action: 'skills', strand, class_token: deviceToken(`class:${classId}`) });
}
