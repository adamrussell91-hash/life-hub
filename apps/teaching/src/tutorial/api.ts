import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { Block } from '@/schemas/block';
import type { LectureClient, LectureStatus, MyHandup } from '@/lecture/api';
import type { TutorialStage } from './schema';

export type TutorialStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  group: { id: string; goal: string; blocks: Block[] } | null;
  sitting: boolean;
  unlocked: boolean;
  shown: { text: string; label: string } | null;
  handups: MyHandup[];
};

export type TutorialClient = {
  status(): Promise<TutorialStatus>;
  claim(initials: string): Promise<TutorialStatus>;
  progress(stage: TutorialStage): Promise<TutorialStatus>;
  answer(blockId: string, parts: Record<number, string>, rating: 'right' | 'wrong'): Promise<TutorialStatus>;
  /** The lecture player's client, so its ✋ and initials claim talk to the tutorial. Progress is sent by stage instead. */
  forPlayer(): LectureClient;
};

export function tutorialClient(lessonId: string, classId: string): TutorialClient {
  const endpoint = `/api/published/tutorial/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<TutorialStatus>(endpoint, { action, ...fields, ...extra });
  const asLecture = (s: TutorialStatus): LectureStatus => ({ identity: s.identity, handups: s.handups, ...(s.anonymous ? { anonymous: true } : {}) });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    // progress and answer reply with handups: [] always; read hand-ups from status.
    progress: (stage) => call('progress', { stage }),
    answer: (blockId, parts, rating) => call('answer', { block_id: blockId, parts, rating }),
    forPlayer: () => ({
      status: () => call('status').then(asLecture),
      claim: (initials) => call('claim', { initials }).then(asLecture),
      handup: (input) => call('handup', input).then(asLecture),
      progress: () => {}
    })
  };
}

// ---------------------------------------------------------------------------
// Teacher side: POST /api/lessons/:id/tutorial (operator). Shapes match
// tutorialTeacherAction in netlify/functions/_shared/tutorial.mjs.
// ---------------------------------------------------------------------------

export type BoardStudent = { id: string; initials: string; name: string; stage: TutorialStage | 'not_started'; unlocked: boolean };
export type GroupSummary = {
  id: string;
  name: string;
  why: string;
  gap_type: 'knowledge' | 'mix_up';
  students: BoardStudent[];
  sitting: boolean;
  seen_at: string | null;
  status: 'not_started' | 'working' | 'waiting' | 'seen' | 'done';
  /** Every hand-up from the group; `open` counts the ones not yet answered. */
  handups: number;
  open: number;
};
export type TutorialSummary = { groups: GroupSummary[]; seen: number; total: number };
export type LiveAnswer = { parts: Record<string, string>; rating: 'right' | 'wrong' | null; at: string };
/** `id` is "owner~handup", the id reply takes. Only the teacher sees who sent it. */
export type LiveHandup = { id: string; label: string; text: string; status: 'open' | 'answered'; reply: string; at: string | null; student_id: string | null };
export type LiveBoard = {
  group: { id: string; name: string; why: string };
  sitting: boolean;
  shown: { text: string; label: string } | null;
  done_students: string[];
  students: Array<{ id: string; initials: string; name: string; stage: TutorialStage | 'not_started'; answers: Record<string, LiveAnswer> }>;
  handups: LiveHandup[];
};
/**
 * Error codes move can reject with (ApiClientError.code): `changed` (the lesson
 * was saved in another tab, try again), `not_published` (publish again so the
 * group has a tab), `not_found` (group gone), `bad_student` (not on the list).
 */
export type TutorialMoveError = 'changed' | 'not_published' | 'not_found' | 'bad_student';

export type TutorialTeacherApi = {
  summary(): Promise<TutorialSummary>;
  board(groupId: string): Promise<LiveBoard>;
  sit(groupId: string): Promise<TutorialSummary>;
  show(groupId: string, studentId: string, blockId: string, part: string): Promise<TutorialSummary>;
  hide(groupId: string): Promise<TutorialSummary>;
  done(groupId: string, students: string[]): Promise<TutorialSummary>;
  unlock(groupId: string, studentId: string): Promise<TutorialSummary>;
  move(studentId: string, groupId: string): Promise<TutorialSummary>;
  reply(handupId: string, reply: string): Promise<TutorialSummary>;
};

export function tutorialTeacherApi(lessonId: string): TutorialTeacherApi {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/tutorial`;
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(endpoint, { action, ...extra });
  return {
    summary: () => call('summary'),
    board: (group_id) => call('board', { group_id }),
    sit: (group_id) => call('sit', { group_id }),
    show: (group_id, student_id, block_id, part) => call('show', { group_id, student_id, block_id, part }),
    hide: (group_id) => call('hide', { group_id }),
    done: (group_id, students) => call('done', { group_id, students }),
    unlock: (group_id, student_id) => call('unlock', { group_id, student_id }),
    move: (student_id, group_id) => call('move', { student_id, group_id }),
    reply: (id, reply) => call('reply', { id, reply })
  };
}
