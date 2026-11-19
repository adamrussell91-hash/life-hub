import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { Edit, Finding, LevelGroup, PairPrediction, SetResult } from './model';
import type { LabFeature, LabJudge, LabLevel, LabStep } from './schema';

// ---------------------------------------------------------------------------
// Student side: POST /api/published/lab/:id (public). Shapes match labAction
// in netlify/functions/_shared/lab.mjs.
// ---------------------------------------------------------------------------

/** The round as anyone may see it. `step` is an index into `steps`; one past the last means the lab is finished. */
export type LabRound = { session: string; step: number; step_name: LabStep | null; steps: LabStep[]; revealed: boolean; finished: boolean };
/** A text to judge, as a reader sees it: the words, never which option they are. */
export type LabReadingItem =
  | { kind: 'text'; text: string }
  | { kind: 'set'; pieces: string[] }
  /** Pairs design it: the control or a pair's version, line by line, with no marks to say which. */
  | { kind: 'lines'; lines: string[] };

/** Pairs design it: the student's own pair. Any member's save is the pair's. */
export type LabPairView = {
  edit: Edit;
  /** On the bench: locked until a member takes it off. */
  ready: boolean;
  pred: PairPrediction | null;
  feature: number | null;
  /** The pair has changed something, so it has a version for readers. */
  trial: boolean;
};
/** The control's ratings, lowest first. */
export type LabControlReading = { mean: number; n: number; ratings: number[] };
/** A trial as any student may see it: the change in words and what it did. */
export type LabOpenTrial = Pick<Finding, 'desc' | 'shift' | 'n' | 'verdict' | 'thin'> & { mine: boolean };
/** Pairs design it, from the Result step: the class's trials, and the student's own pair's in full (null when the pair has none). */
export type LabFindings = {
  control: LabControlReading;
  threshold: number;
  trials: LabOpenTrial[];
  mine: (LabOpenTrial & { edit: Edit; ratings: number[]; mean: number; pred: PairPrediction | null; held: boolean }) | null;
};
/** A trial as the teacher's board has it: the pair, its members' initials, its edit and its ratings. */
export type LabBoardTrial = Finding & { pair: string; number: number; initials: string[]; edit: Edit; ratings: number[] };
export type LabBoardFindings = { control: LabControlReading; threshold: number; trials: LabBoardTrial[] };
export type LabMe = {
  pred: number | null;
  reason: string;
  notes: Record<string, string>;
  done: Record<string, boolean>;
  /** From the Result step: which version(s) this reader had, and the rating they gave (null for a choice). */
  read?: Array<{ version: number; value: number | null }>;
  /** Students write it: this student's own versions, one per option. */
  writing?: string[];
  /** Students write it, from the Result step: how often readers chose each of this student's versions. */
  own?: { chosen: number[]; readers: number };
};
export type LabStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  /** Null until the teacher starts the lab, and after the round goes idle. */
  round: LabRound | null;
  me: LabMe | null;
  /** Pairs design it: the student's pair. Null at the other levels, and for a student who is in no pair. */
  pair: LabPairView | null;
  /** Pairs design it: the control text, once the round is open. */
  control?: string | null;
  /** At Test: where this reader is up to. `item` is null once every text is judged. */
  reading: { index: number; total: number; item: LabReadingItem | null } | null;
  /** Null before the Result step. */
  results: SetResult | null;
  /** Pairs design it. Null before the Result step. */
  findings?: LabFindings | null;
};

export type LabClient = {
  status(): Promise<LabStatus>;
  claim(initials: string): Promise<LabStatus>;
  /** `note` is the step's lab note, sent with the action that completes the step when lab notes are on. */
  predict(pred: number, reason: string, note?: string): Promise<LabStatus>;
  note(step: LabStep, text: string): Promise<LabStatus>;
  /** Students write it: saves this student's version for one option. */
  write(option: number, text: string, note?: string): Promise<LabStatus>;
  /** Pairs design it: saves the pair's edit to the control. The last save wins. */
  bench(edit: Edit): Promise<LabStatus>;
  /** Pairs design it: puts the pair's version on the bench, or takes it off. */
  ready(on: boolean, note?: string): Promise<LabStatus>;
  /** Pairs design it: the pair's prediction for its own change. */
  pairPredict(pred: PairPrediction, note?: string): Promise<LabStatus>;
  /** Pairs design it: the feature the pair changed, as an index into the lab's list. */
  feature(feature: number, note?: string): Promise<LabStatus>;
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
  const noted = (note?: string) => (note && note.trim() ? { note } : {});
  return {
    status: () => look('status'),
    claim: (initials) => look('claim', { initials }),
    predict: (pred, reason, note) => act('predict', { pred, reason, ...noted(note) }),
    note: (step, text) => act('note', { step, text }),
    write: (option, text, note) => act('write', { option, text, ...noted(note) }),
    bench: (edit) => act('bench', { edit }),
    ready: (on, note) => act('ready', { on, ...noted(note) }),
    pairPredict: (pred, note) => act('pair_predict', { pred, ...noted(note) }),
    feature: (feature, note) => act('feature', { feature, ...noted(note) }),
    rate: (item, value) => act('rate', { item, value }),
    pick: (item, choice) => act('pick', { item, choice }),
    explain: () => act('explain')
  };
}

// ---------------------------------------------------------------------------
// Teacher side: POST /api/lessons/:id/lab (operator). Shapes match
// labTeacherAction in netlify/functions/_shared/lab.mjs.
// ---------------------------------------------------------------------------

/** Flagged work waiting for the teacher. `owner` is what Release and Remove send back. */
export type LabHeld = { owner: string; initials: string; pieces: Array<{ label: string; text: string; flagged: boolean }> };
/** Students write it: the one piece readers chose most, with no name on it. */
export type LabBestPiece = { text: string; option: number; chosen: number; readers: number };

export type LabBoard = {
  round: LabRound | null;
  level: LabLevel;
  judge: LabJudge;
  /** `here`: students who have joined the round. `done`: how many have finished the current step. `total`: the class list. */
  counts: { here: number; done: number; total: number };
  /** Per option; for Pairs design it, how many pairs predicted lower, about the same, higher. At Predict only once revealed; always from Result on. */
  predictions: number[] | null;
  /** Null before the Result step. */
  results: SetResult | null;
  /** You supply it: the versions side by side, from Result on. */
  texts: string[] | null;
  explained?: number;
  /** Flagged writing (or a pair's flagged word) the teacher has not released or removed yet. */
  held?: LabHeld[];
  /** Students write it, from Result on. */
  best?: LabBestPiece | null;
  /** Pairs design it: how many pairs there are, have changed something, are on the bench, have predicted. */
  pairs?: { total: number; changed: number; ready: number; predicted: number; named?: number } | null;
  /** Pairs design it. Null before the Result step. */
  findings?: LabBoardFindings | null;
  /** Pairs design it, from Name it: the trials by level of language, biggest average shift first. */
  levels?: LevelGroup[] | null;
  /** The teacher's debrief notes, at the last step and after. */
  debrief: string | null;
};
export type LabPastRound = { session: string; started_at: string | null; students: number; live: boolean };
/** What the marking view needs to put a student's lab record in words. */
export type LabRecordLab = { level: LabLevel; judge: LabJudge; notes_on: boolean; steps: LabStep[]; options: string[]; features: LabFeature[]; trait: string };
export type LabStudentRecord = {
  student_id: string;
  lab?: LabRecordLab;
  record: (LabMe & { ratings?: number[]; picks?: number[] }) | null;
  items: unknown[];
  /** Pairs design it: the student's pair, its saved record and its change in words. */
  pair?: { id: string; students: string[]; record: (LabPairView & { flagged?: boolean }) | null; change: string[] } | null;
  /** Pairs design it, from the Result step: the pair's trial. */
  trial?: Omit<LabBoardTrial, 'initials'> | null;
};

/** After class: one student who took part. `pred` is an option index, or for Pairs design it the pair's −1, 0 or 1. */
export type LabAfterStudent = { student_id: string; initials: string; pred: number | null; pair: number | null; notes: number; handed_in_at: string | null; explanation: string };
export type LabAfter = { session: string; class_id: string; students: LabAfterStudent[] };

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
  /** Everyone who took part, with the start of each explanation, for the After class page. */
  after(session: string): Promise<LabAfter>;
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
    student: (student_id) => call('student', { student_id }),
    after: (session) => call('after', { session })
  };
}
