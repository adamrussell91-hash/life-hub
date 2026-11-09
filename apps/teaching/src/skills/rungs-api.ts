import { apiPost } from '@/api/client';

/** Each skill a student's returned work has placed, `strand.sub` to rung. */
export type SkillRungs = Record<string, string>;
export type ClassSkillRungs = { students: Array<{ id: string; name: string; initials: string; rungs: SkillRungs }> };

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
