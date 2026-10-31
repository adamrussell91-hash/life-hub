import { apiGet, apiPatch, apiPost } from '@/api/client';
import { newArrowId, normalizeArrows, normalizePicked } from '../../../../packages/walkthrus/arrows.mjs';
import { normalizeWalkthru } from '../../../../packages/walkthrus/goal.mjs';
import { clustersFromPicked, normalizeClusters } from '../../../../packages/walkthrus/clusters.mjs';
import type { BoardArrow } from '../../../../packages/walkthrus/board/route';

/** The private step text for one technique. Served only to the signed-in teacher, never stored in a lesson. */
export interface WalkthruTechniqueText { id: string; steps: Array<{ n: number; label: string; text: string }>; footer?: string }
export interface WalkthruFrameworkText { id: string; summary: string }
export interface WalkthruText { sets: Array<{ set: number; techniques: WalkthruTechniqueText[]; frameworks: WalkthruFrameworkText[] }> }

export interface WalkthruSnapshot { at: string; class_id: string | null; label: string; mean: number; n: number }
export interface WalkthruCycle {
  started: string; ended: string | null; decision: 'keep' | 'move_on' | null; reps: number;
  evidence_before: WalkthruSnapshot | null; evidence_after: WalkthruSnapshot | null;
}
export interface WalkthruSection {
  set: number; technique_id: string; stage: 'attempt' | 'develop' | 'adapt' | 'practise' | 'test';
  problem_type: string | null; adapted: Record<string, string>; cycles: WalkthruCycle[];
  origin: { kind: 'pattern' | 'manual'; suggestion_id?: string };
}
export interface WalkthruGoal {
  id: string; title: string; status: string; sphere: string; term?: { year: number; term: number } | null;
  term_history?: Array<{ year: number; term: number; outcome: string; at: string }>;
  walkthru?: WalkthruSection;
  [key: string]: unknown;
}
export interface WalkthruRep {
  technique_id: string; lesson_id: string; class_id: string | null; goal_id: string | null;
  state: 'planned' | 'ran' | 'partly' | 'skipped'; note: string; lesson_end: string | null; at: string;
}

let textCache: Promise<WalkthruText> | null = null;

/** The step text, fetched once per page load and kept in memory. A failed load is not cached. */
export function loadWalkthruText(): Promise<WalkthruText> {
  textCache ??= apiGet<{ text: WalkthruText }>('/api/walkthrus-text').then((r) => r.text);
  textCache.catch(() => { textCache = null; });
  return textCache;
}

export function resetWalkthruTextForTests(): void {
  textCache = null;
}

/** One named cluster on Adam's own board: the title anchor (board units) and its tiles on axial cells from the cluster origin. */
export interface BoardCluster { id: string; name: string; x: number; y: number; tiles: Array<{ id: string; q: number; r: number }> }
/** A fusion as the board needs it; the Fuse bench owns the full shape. */
export interface BoardFusion { id: string; name: string; parents?: string[]; [key: string]: unknown }

export interface LoadedBoard { arrows: BoardArrow[]; picked: string[] | null; clusters: BoardCluster[]; fusions: BoardFusion[] }

const fusionsOf = (value: unknown): BoardFusion[] =>
  Array.isArray(value) ? value.filter((f): f is BoardFusion => Boolean(f) && typeof f.id === 'string' && typeof f.name === 'string') : [];

/**
 * Adam's board: his arrows, the techniques he had picked (null until he first picks), his clusters
 * (made from the picks until he saves some) and his fusions.
 */
export async function loadBoard(): Promise<LoadedBoard> {
  const r = await apiGet<{ board: { arrows: unknown; picked?: unknown; clusters?: unknown; fusions?: unknown } }>('/api/walkthrus-board');
  const picked = Array.isArray(r.board.picked) ? (normalizePicked(r.board.picked) as string[]) : null;
  const clusters = (Array.isArray(r.board.clusters) ? normalizeClusters(r.board.clusters) : clustersFromPicked(picked ?? [])) as BoardCluster[];
  return { arrows: normalizeArrows(r.board.arrows) as BoardArrow[], picked, clusters, fusions: fusionsOf(r.board.fusions) };
}

/** Saves the clusters whole. A server that doesn't echo them back keeps what was sent. */
export async function saveBoardClusters(clusters: BoardCluster[]): Promise<BoardCluster[]> {
  const r = await apiPost<{ board: { clusters?: unknown } }>('/api/walkthrus-board', { clusters });
  return normalizeClusters(Array.isArray(r.board?.clusters) ? r.board.clusters : clusters) as BoardCluster[];
}

export async function saveBoardArrows(arrows: BoardArrow[]): Promise<BoardArrow[]> {
  const r = await apiPost<{ board: { arrows: unknown } }>('/api/walkthrus-board', { arrows });
  return normalizeArrows(r.board.arrows) as BoardArrow[];
}

export async function saveBoardPicked(picked: string[]): Promise<string[]> {
  const r = await apiPost<{ board: { picked: unknown } }>('/api/walkthrus-board', { picked });
  return normalizePicked(r.board.picked) as string[];
}

export const makeArrowId = (): string => newArrowId() as string;

/** Professional goals that carry a WalkThru section. */
export async function loadWalkthruGoals(): Promise<WalkthruGoal[]> {
  const r = await apiGet<{ goals: WalkthruGoal[] }>('/api/goals');
  return (r.goals ?? []).filter((g) => g && g.sphere === 'professional' && normalizeWalkthru(g.walkthru));
}

export function createWalkthruGoal(body: { title: string; walkthru: Partial<WalkthruSection> & { technique_id: string } }): Promise<WalkthruGoal> {
  return apiPost<WalkthruGoal>('/api/goals', { ...body, sphere: 'professional', status: 'active' });
}

export function patchWalkthruGoal(id: string, patch: Record<string, unknown>): Promise<WalkthruGoal> {
  return apiPatch<WalkthruGoal>(`/api/goals?id=${encodeURIComponent(id)}`, patch);
}

export async function loadWalkthruReps(): Promise<WalkthruRep[]> {
  const r = await apiGet<{ reps: WalkthruRep[] }>('/api/walkthru-reps');
  return r.reps ?? [];
}

/** A pattern the monitor found: where it came from, the technique it points to and the chain of reasons. */
export interface WalkthruSuggestion {
  key: string;
  kind: 'one_off' | 'repeated';
  problem_type: string;
  problem_label: string;
  series: { key: string; code: string; name: string } | null;
  technique_id: string | null;
  alternatives: string[];
  class_ids: string[];
  class_titles: string[];
  count: number;
  scope: 'class' | 'classes';
  /** evidence → problem type → series → technique */
  chain: Array<{ step: 'evidence' | 'problem' | 'series' | 'technique'; text: string }>;
  /** One-offs suggest a note on the next lesson; repeated patterns suggest a goal. */
  action: 'note' | 'goal';
  /** One-offs: the class's next lesson, where the WalkThru note goes. */
  next_lesson?: { lesson_id: string; date: string; url: string };
  /** Why it came back, when it did: "Dismissed 4 Nov. Since then, 3 more quizzes show the same problem." */
  note: string;
}

export type DismissKind = 'not_now' | 'not_this' | 'accepted';

export async function loadSuggestions(): Promise<WalkthruSuggestion[]> {
  const r = await apiGet<{ suggestions: WalkthruSuggestion[] }>('/api/walkthru-suggestions');
  return (r.suggestions ?? []).filter((s) => s && typeof s.key === 'string' && s.technique_id);
}

export function dismissSuggestion(key: string, kind: DismissKind): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>('/api/walkthru-suggestions', { action: 'dismiss', key, kind });
}
