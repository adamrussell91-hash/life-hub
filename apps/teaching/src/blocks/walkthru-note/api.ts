import { apiGet, apiPost } from '@/api/client';

/** The private step text. Fetched from the teacher-only endpoint, never stored in a lesson. */
export interface WalkthruStepText { n: number; label: string; text: string }
export interface WalkthruTechniqueText { id: string; steps: WalkthruStepText[]; footer?: string }
export interface WalkthruText { sets: Array<{ set: number; techniques: WalkthruTechniqueText[] }> }

export type RepState = 'planned' | 'ran' | 'partly' | 'skipped';
export interface Rep {
  technique_id: string; lesson_id: string; class_id: string | null; goal_id: string | null;
  state: RepState; note: string; lesson_end: string | null; at: string;
}
export interface GoalLite { id: string; status: string; sphere: string; walkthru?: { technique_id: string; adapted?: Record<string, string> } }

let textCache: Promise<WalkthruText> | null = null;
let goalsCache: Promise<GoalLite[]> | null = null;

/** The step text, fetched once per page load. A failed load isn't kept. */
export function loadWalkthruText(): Promise<WalkthruText> {
  textCache ??= apiGet<{ text: WalkthruText }>('/api/walkthrus-text').then((r) => r.text);
  textCache.catch(() => { textCache = null; });
  return textCache;
}

/** The goal that is being worked on for a technique, if any (its adapted notes show under the steps). */
export async function loadLiveGoal(techniqueId: string): Promise<GoalLite | null> {
  goalsCache ??= apiGet<{ goals: GoalLite[] }>('/api/goals').then((r) => r.goals ?? []);
  goalsCache.catch(() => { goalsCache = null; });
  const goals = await goalsCache;
  return goals.find((g) => g.sphere === 'professional' && (g.status ?? 'active') === 'active' && g.walkthru?.technique_id === techniqueId) ?? null;
}

export async function listReps(techniqueId: string): Promise<Rep[]> {
  const r = await apiGet<{ reps: Rep[] }>(`/api/walkthru-reps?technique=${encodeURIComponent(techniqueId)}`);
  return r.reps ?? [];
}

export async function listAllReps(): Promise<Rep[]> {
  const r = await apiGet<{ reps: Rep[] }>('/api/walkthru-reps');
  return r.reps ?? [];
}

export interface RepTarget { technique_id: string; lesson_id: string; class_id?: string | null; goal_id?: string | null; lesson_end?: string | null }

export async function planRep(target: RepTarget): Promise<Rep> {
  return (await apiPost<{ rep: Rep }>('/api/walkthru-reps', { action: 'plan', ...target })).rep;
}

/** Ran it, Partly or Didn't get to it. Tapping the state it already has undoes it. */
export async function tapRep(target: RepTarget & { state: Exclude<RepState, 'planned'>; note?: string }): Promise<Rep | null> {
  return (await apiPost<{ rep: Rep | null }>('/api/walkthru-reps', { action: 'tap', ...target })).rep;
}

export async function unplanRep(target: RepTarget): Promise<void> {
  await apiPost('/api/walkthru-reps', { action: 'unplan', ...target });
}

export function resetWalkthruNoteCachesForTests(): void {
  textCache = null;
  goalsCache = null;
}
