import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { MarkResult, PublicQuestion, QuestionKey, QuizResponse } from '@/quiz/core';
import type { Block } from '@/schemas/block';
import type { GateState, LockCheckKind, RotationLevel, WrittenCheck } from './schema';

// ---------------------------------------------------------------- student
// POST /api/published/rotation/:lessonId  (netlify/functions/published-rotation.mjs → _shared/rotation.mjs)

export type Marked = { mark: MarkResult; key: QuestionKey | null };

export type WritingPoint = { text: string; quotes: string[]; techniques: string[]; checks: Array<{ check: WrittenCheck; ok: boolean | null; reason?: string }>; passed: boolean };

export type PublicGate = {
  kind: 'hinge' | 'written';
  state: GateState;
  tries: number;
  /** Hinge: the misconception behind the student's last wrong answer. */
  reteach?: string;
  /** Hinge: the back-up question after a miss. */
  backup?: { prompt: string; options: Array<{ id: string; text: string }> };
  /** Written: checks left before the teacher steps in. */
  checks_left?: number;
  last?: { text: string; at: string; outcome: 'passed' | 'not_yet' | 'teacher'; feedback: string[]; passed: number; need: number; points: WritingPoint[] };
  appeal_at?: string;
  teacher?: { decision: 'pass' | 'keep'; at: string };
};

export type LockState = 'open' | 'passed' | 'locked';

/** A lock's check as students see it: rush questions without keys; an AI check's question only. */
export type PublicLockCheck =
  | { kind: 'rush'; items: PublicQuestion[]; streak: number; seconds: number }
  | { kind: 'ai'; prompt: string };

/** One lock in a station's chain. A locked lock carries its id, title, kind and state only. */
export type PublicStationLock = {
  id: string;
  title: string;
  kind: LockCheckKind;
  state: LockState;
  /** Open or passed only. */
  check?: PublicLockCheck;
  /** Rush, open or passed: the round so far. Ask `next_item_id` next. */
  rush?: { streak: number; best: number; answered: number; started_at: string | null; ends_at: string | null; next_item_id: string | null };
  /** AI check, open or passed. */
  ai?: { checks_left: number; last: { text: string; at: string; outcome: 'passed' | 'not_yet' | 'teacher'; fix: string | null } | null };
  /** Sent to the teacher (out of checks, daily cap, or text that talked to the marker). */
  flagged?: true;
  /** Passed only: the Viva Kit card. */
  reward?: { title: string; text: string };
  /**
   * Open or passed, every lock but the first: its blocks (questions split, no keys).
   * The first lock's blocks are in the published snapshot, tagged settings.rotation_lock.
   */
  blocks?: Block[];
};

/** A reward the student has earned, in station then chain order. */
export type VivaKitCard = { station: string; lock: string; title: string; text: string; at: string };

/** Reply to lock_rush. `right` is null when the round timed out (that answer wasn't marked). Never carries the answer. */
export type RushReply = { item_id: string | null; right: boolean | null; streak: number; need: number; passed: boolean; timed_out: boolean; next_item_id: string | null; ends_at: string | null };
/** Reply to lock_ai. */
export type LockCheckReply = { outcome: 'passed' | 'not_yet' | 'teacher'; pass: boolean; fix: string | null; message: string | null; checks_left: number };

export type RotationStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  pretest: { items: Array<{ id: string; station: string; question: PublicQuestion }>; results: Record<string, Marked> };
  levels: Record<string, { level: RotationLevel; source: 'pretest' | 'own' | 'default' }>;
  /** Path locks: why a station can't be opened yet. (Not station locks.) */
  locks: Record<string, string>;
  /** Station locks: station id → its chain. Only stations that have locks. */
  station_locks: Record<string, PublicStationLock[]>;
  /** The Viva Kit: every reward earned so far. */
  kit: VivaKitCard[];
  gates: Record<string, PublicGate>;
  seats: Record<string, number>;
  recommend: string | null;
  route_open: boolean;
  pieces_left: number;
  fallback_on: boolean;
  called: { at: string; group: string; title: string } | null;
  work: null | {
    current: string | null;
    opened: string[];
    done: string[];
    collected: string[];
    hints: Record<string, number>;
    level_overrides: Record<string, RotationLevel>;
    hand_up_at: string | null;
    finale: { lock_passed?: boolean; lock_tries?: number; build?: string; format?: string; debrief?: Record<string, string> };
    exits: Record<string, { correct: boolean; answered: string[]; at?: string }>;
    results: Record<string, Record<string, Marked>>;
    recall: Record<string, Marked & { block_id: string }>;
  };
  board: { pos: Record<string, { x: number; y: number }>; links: Array<{ from: string; to: string; word: string }> };
  /** Set on the reply to the action that made it. */
  result?: Marked & { item_id: string };
  saved?: 'board';
  lock?: { right: boolean };
  writing?: { outcome: 'passed' | 'not_yet' | 'teacher'; message: string | null };
  rush?: RushReply;
  lock_check?: LockCheckReply;
};

export type RotationClient = {
  status(): Promise<RotationStatus>;
  claim(initials: string): Promise<RotationStatus>;
  pretest(itemId: string, response: QuizResponse): Promise<RotationStatus>;
  open(station: string): Promise<RotationStatus>;
  leave(): Promise<RotationStatus>;
  level(station: string, level: RotationLevel): Promise<RotationStatus>;
  hint(station: string): Promise<RotationStatus>;
  recall(station: string, blockId: string, response: QuizResponse): Promise<RotationStatus>;
  gate(station: string, choice: string, reason: string): Promise<RotationStatus>;
  exit(station: string, blockId: string, response: QuizResponse): Promise<RotationStatus>;
  collect(station: string): Promise<RotationStatus>;
  offline(station: string, code: string): Promise<RotationStatus>;
  move(station: string, x: number, y: number): Promise<RotationStatus>;
  link(from: string, to: string, word: string): Promise<RotationStatus>;
  unlink(from: string, to: string): Promise<RotationStatus>;
  hand(up: boolean): Promise<RotationStatus>;
  checkWriting(station: string, text: string): Promise<RotationStatus>;
  appeal(station: string): Promise<RotationStatus>;
  lock(optionId: string): Promise<RotationStatus>;
  finale(input: { build?: string; format?: string; debrief?: Record<string, string> }): Promise<RotationStatus>;
  /** One rush answer, for the lock's `next_item_id`. */
  lockRush(station: string, lock: string, itemId: string, response: QuizResponse): Promise<RotationStatus>;
  /** A lock's AI check: one or two sentences. */
  lockAi(station: string, lock: string, text: string): Promise<RotationStatus>;
};

export function rotationClient(lessonId: string, classId: string): RotationClient {
  const endpoint = `/api/published/rotation/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<RotationStatus>(endpoint, { action, ...fields, ...extra });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    pretest: (item_id, response) => call('pretest_answer', { item_id, response }),
    open: (station) => call('open_station', { station }),
    leave: () => call('leave_station'),
    level: (station, level) => call('level', { station, level }),
    hint: (station) => call('hint', { station }),
    recall: (station, block_id, response) => call('recall_answer', { station, block_id, response }),
    gate: (station, choice, reason) => call('gate_answer', { station, choice, reason }),
    exit: (station, block_id, response) => call('exit_answer', { station, block_id, response }),
    collect: (station) => call('collect', { station }),
    offline: (station, code) => call('offline_code', { station, code }),
    move: (station, x, y) => call('board_move', { station, x, y }),
    link: (from, to, word) => call('board_link', { from, to, word }),
    unlink: (from, to) => call('board_unlink', { from, to }),
    hand: (up) => call(up ? 'hand_up' : 'hand_down'),
    checkWriting: (station, text) => call('check_writing', { station, text }),
    appeal: (station) => call('appeal', { station }),
    lock: (option_id) => call('finale_lock', { option_id }),
    finale: (input) => call('finale_save', input),
    lockRush: (station, lock, item_id, response) => call('lock_rush', { station, lock, item_id, response }),
    lockAi: (station, lock, text) => call('lock_ai', { station, lock, text })
  };
}

// ---------------------------------------------------------------- teacher
// POST /api/lessons/:id/rotation  (netlify/functions/rotation.mjs → _shared/rotation.mjs, rotationTeacherAction)

export type LiveStudent = {
  id: string;
  name: string;
  initials: string;
  started: boolean;
  at: string | null;
  done: string[];
  collected: string[];
  levels: Record<string, RotationLevel>;
  pretest: Record<string, { right: number; asked: number; answered: number }>;
  exits: Record<string, { correct: boolean; level: RotationLevel | null }>;
  hints: Record<string, number>;
  gates: Record<string, GateState>;
  stuck: boolean;
  hand_up_at: string | null;
  hand_station: string | null;
  pieces_left: number;
  finale: { lock_passed: boolean; built: boolean };
  /** Station locks: station id → each lock's progress. Only stations that have locks. */
  locks: Record<string, LiveLock[]>;
};
export type LiveLock = { id: string; title: string; kind: LockCheckKind; state: LockState; flagged: boolean; best: number; checks: number; teacher: boolean };
/** A lock's AI check waiting on the teacher. */
export type LiveLockCheck = {
  student_id: string;
  name: string;
  station: string;
  lock: string;
  title: string;
  attempts: Array<{ text: string; at: string; outcome: 'passed' | 'not_yet' | 'teacher'; fix: string | null; flagged_text: boolean }>;
};
export type LiveGroup = {
  id: string;
  kind: 'reteach' | 'extend';
  station: string | null;
  title: string;
  questions: Array<{ n: number; prompt: string }>;
  members: Array<{ student_id: string; name: string; missed: number[]; flagged: boolean }>;
  called_at: string | null;
  ticks: Record<string, 'got_it' | 'needs_more'>;
};
export type LiveWriting = {
  student_id: string;
  name: string;
  station: string;
  appeal: boolean;
  state: GateState;
  attempts: Array<{ text: string; at: string; outcome: string; feedback: string[]; points: WritingPoint[]; flagged_text: boolean }>;
};
export type RotationBoard = {
  class_id: string | null;
  started_at: string | null;
  fallback_on: boolean;
  behind_fallback: 'choose_n_minus_1' | 'skip_finale_build' | 'none';
  stations: Array<{ id: string; title: string; kind: string; strand: string | null; minutes: number; seats: number; x: number | null; y: number | null; script: string | null }>;
  students: LiveStudent[];
  groups: LiveGroup[];
  queue: Array<{ student_id: string; name: string; station: string | null; at: string }>;
  heat: Record<string, { support: number; core: number; extend: number }>;
  gate_misses: Record<string, number>;
  writing: LiveWriting[];
  lock_checks: LiveLockCheck[];
  done_share: number;
};

export type RotationTeacherApi = {
  board(): Promise<RotationBoard>;
  callGroup(group: string): Promise<RotationBoard>;
  groupDone(group: string): Promise<RotationBoard>;
  tick(group: string, studentId: string, result: 'got_it' | 'needs_more'): Promise<RotationBoard>;
  openGate(studentId: string, station: string): Promise<RotationBoard>;
  /** Opens this lock (and any before it still closed) for one student. */
  openLock(studentId: string, station: string, lock: string): Promise<RotationBoard>;
  decide(studentId: string, station: string, decision: 'pass' | 'keep'): Promise<RotationBoard>;
  going(studentId: string): Promise<RotationBoard>;
  fallback(on: boolean): Promise<RotationBoard>;
};

export function rotationTeacherApi(lessonId: string): RotationTeacherApi {
  const path = `/api/lessons/${encodeURIComponent(lessonId)}/rotation`;
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<RotationBoard>(path, { action, ...extra });
  return {
    board: () => call('board'),
    callGroup: (group) => call('call_group', { group }),
    groupDone: (group) => call('group_done', { group }),
    tick: (group, student_id, result) => call('group_tick', { group, student_id, result }),
    openGate: (student_id, station) => call('open_gate', { student_id, station }),
    openLock: (student_id, station, lock) => call('open_lock', { student_id, station, lock }),
    decide: (student_id, station, decision) => call('writing_decision', { student_id, station, decision }),
    going: (student_id) => call('going', { student_id }),
    fallback: (on) => call('fallback', { on })
  };
}
