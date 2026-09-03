export const TEACHER_RAIL_PREFS_KEY = 'teaching_hub_teacher_rail_v1';

export type TeacherRailPrefs = {
  collapsed: boolean;
};

export const DEFAULT_TEACHER_RAIL_PREFS: TeacherRailPrefs = {
  collapsed: false
};

function isTeacherRailPrefs(value: unknown): value is TeacherRailPrefs {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { collapsed?: unknown }).collapsed === 'boolean';
}

export function readTeacherRailPrefs(): TeacherRailPrefs {
  try {
    const raw = localStorage.getItem(TEACHER_RAIL_PREFS_KEY);
    if (!raw) return DEFAULT_TEACHER_RAIL_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!isTeacherRailPrefs(parsed)) return DEFAULT_TEACHER_RAIL_PREFS;
    return { collapsed: parsed.collapsed };
  } catch {
    return DEFAULT_TEACHER_RAIL_PREFS;
  }
}

export function writeTeacherRailPrefs(next: TeacherRailPrefs): void {
  try {
    localStorage.setItem(TEACHER_RAIL_PREFS_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}
