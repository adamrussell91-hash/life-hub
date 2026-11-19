import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { SetResult } from './model';
import type { LabJudge, LabLevel, LabStep } from './schema';

// ---------------------------------------------------------------------------
// Student side: POST /api/published/lab/:id (public). Shapes match labAction
// in netlify/functions/_shared/lab.mjs.
// ---------------------------------------------------------------------------

/** The round as anyone may see it. `step` is an index into `steps`; one past the last means the lab is finished. */
export type LabRound = { session: string; step: number; step_name: LabStep | null; steps: LabStep[]; revealed: boolean; finished: boolean };
/** A text to judge, as a reader sees it: the words, never which option they are. */
export type LabReadingItem = { kind: 'text'; text: string } | { kind: 'set'; pieces: string[] };
export type LabMe = {
  pred: number | null;
  reason: string;
  notes: Record<string, string>;
  done: Record<string, boolean>;
  /** From the Result step: which version(s) this reader had, and the rating they gave (null for a choice). */
  read?: Array<{ version: number; value: number | null }>;
};
export type LabStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  /** Null until the teacher starts the lab, and after the round goes idle. */
  round: LabRound | null;
  me: LabMe | null;
  /** Pairs design it: the pair's record (Task 4). Null until then. */
  pair: null;
  /** At Test: where this reader is up to. `item` is null once every text is judged. */
  reading: { index: number; total: number; item: LabReadingItem | null } | null;
  /** Null before the Result step. */
  results: SetResult | null;
};

export type LabClient = {
  status(): Promise<LabStatus>;
  claim(initials: string): Promise<LabStatus>;
  predict(pred: number, reason: string): Promise<LabStatus>;
  note(step: LabStep, text: string): Promise<LabStatus>;
  rate(item: number, value: number): Promise<LabStatus>;
  /** `choice` is the position tapped; the server knows which option sat there. */
  pick(item: number, choice: number): Promise<LabStatus>;
  /** Marks the Explain step done once the written answer is handed in. */
  explain(): Promise<LabStatus>;
};

export function labClient(lessonId: string, classId: string): LabClient {
  const endpoint = `/api/published/lab/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  /** The round this device last saw: sent with every action, so work for an old round is refused, not mixed in. */
  let session: string | null = null;
  const seen = (status: LabStatus): LabStatus => {
    session = status.round?.session ?? null;
    return status;
  };
  const look = (action: string, extra: Record<string, unknown> = {}) => apiPost<LabStatus>(endpoint, { action, ...fields, ...extra }).then(seen);
  const act = (action: string, extra: Record<string, unknown> = {}) => apiPost<LabStatus>(endpoint, { action, ...fields, ...(session ? { session } : {}), ...extra }).then(seen);
  return {
    status: () => look('status'),
    claim: (initials) => look('claim', { initials }),
    predict: (pred, reason) => act('predict', { pred, reason }),
    note: (step, text) => act('note', { step, text }),
    rate: (item, value) => act('rate', { item, value }),
    pick: (item, choice) => act('pick', { item, choice }),
    explain: () => act('explain')
  };
}

// ---------------------------------------------------------------------------
// Teacher side: POST /api/lessons/:id/lab (operator). Shapes match
// labTeacherAction in netlify/functions/_shared/lab.mjs.
// ---------------------------------------------------------------------------

export type LabBoard = {
  round: LabRound | null;
  level: LabLevel;
  judge: LabJudge;
  /** `here`: students who have joined the round. `done`: how many have finished the current step. `total`: the class list. */
  counts: { here: number; done: number; total: number };
  /** Per option. At Predict only once revealed; always from Result on. */
  predictions: number[] | null;
  /** Null before the Result step. */
  results: SetResult | null;
  /** You supply it: the versions side by side, from Result on. */
  texts: string[] | null;
  explained?: number;
  /** The teacher's debrief notes, at the last step and after. */
  debrief: string | null;
};
export type LabPastRound = { session: string; started_at: string | null; students: number; live: boolean };
export type LabStudentRecord = { student_id: string; record: (LabMe & { ratings?: number[]; picks?: number[] }) | null; items: unknown[] };

export type LabTeacherApi = {
  endpoint: string;
  board(): Promise<LabBoard>;
  start(): Promise<LabBoard>;
  /** `step` is the index being moved to, so a double press moves once. */
  next(session: string, step: number): Promise<LabBoard>;
  reveal(session: string, on: boolean): Promise<LabBoard>;
  end(session: string): Promise<LabBoard>;
  rounds(): Promise<{ rounds: LabPastRound[] }>;
  resume(session: string): Promise<LabBoard>;
  release(owner: string): Promise<LabBoard>;
  remove(owner: string): Promise<LabBoard>;
  student(studentId: string): Promise<LabStudentRecord>;
};

export function labTeacherApi(lessonId: string): LabTeacherApi {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/lab`;
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(endpoint, { action, ...extra });
  return {
    endpoint,
    board: () => call('board'),
    start: () => call('start'),
    next: (session, step) => call('next', { session, step }),
    reveal: (session, on) => call('reveal', { session, on }),
    end: (session) => call('end', { session }),
    rounds: () => call('rounds'),
    resume: (session) => call('resume', { session }),
    release: (owner) => call('release', { owner }),
    remove: (owner) => call('remove', { owner }),
    student: (student_id) => call('student', { student_id })
  };
}
