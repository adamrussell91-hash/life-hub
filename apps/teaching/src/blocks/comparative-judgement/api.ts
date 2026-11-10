import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';

/**
 * Every request and reply shape for the comparative judgement block, in one
 * place. The server side is netlify/functions/_shared/comparative-judgement.mjs;
 * the design is docs/superpowers/specs/2026-11-11-comparative-judgement-design.md.
 */

export type Third = 'top' | 'middle' | 'bottom';
export type Side = 'left' | 'right';
export type Phase = 'closed' | 'calibrate' | 'predict' | 'judge' | 'reflect' | 'done';

/** An answer as anyone judging sees it: an opaque id and the text. Never a name. */
export type PoolText = { id: string; text: string };
export type Pair = { left: PoolText; right: PoolText };

/** Chip indexes ticked under each answer. */
export type ChipPicks = { left: number[]; right: number[] };
export type JudgeBody = { left: string; right: string; winner: string; chips: ChipPicks; reason: string };

/* ── Student ───────────────────────────────────────────────────────── */

/**
 * The student's state. `{ need: 'initials' }` alone: claim first.
 * `{ need: null, anonymous: true }` alone: the class has no list yet (D23).
 * Error codes: closed, calibrate_first, predict_first, seen, enough,
 * no_answer, no_list, need_initials.
 */
export type StudentStatus = {
  need: 'initials' | null;
  anonymous?: true;
  initials?: string;
  phase?: Phase;
  target?: number;
  done_count?: number;
  calibration?: { index: number; total: number; left: string; right: string };
  has_answer?: boolean;
  /** Only when the teacher turned on Show students their third and the scale bears it. */
  third?: Third;
};
/** `pair` is null once this judge has judged 2 × target. */
export type NextReply = { pair: Pair | null; done_count: number; target: number; phase: Phase };
/** The full state, plus the teacher's pick and reason for the pair just judged. */
export type CalibrateReply = StudentStatus & { teacher: Side; reason: string };

export type StudentApi = {
  status(): Promise<StudentStatus>;
  claim(initials: string): Promise<StudentStatus>;
  calibrate(index: number, choice: Side): Promise<CalibrateReply>;
  predict(third: Third): Promise<StudentStatus>;
  next(): Promise<NextReply>;
  judge(body: JudgeBody): Promise<StudentStatus>;
  reflect(text: string): Promise<StudentStatus>;
};

export function studentApi(lessonId: string, blockId: string, classId: string): StudentApi {
  const endpoint = `/api/published/comparative-judgement/${encodeURIComponent(lessonId)}/${encodeURIComponent(blockId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const call = <T>(action: string, extra: Record<string, unknown> = {}) =>
    apiPost<T>(endpoint, { class_id: classId, ...(classToken ? { class_token: classToken } : {}), action, ...extra });
  return {
    status: () => call<StudentStatus>('status'),
    claim: (initials) => call<StudentStatus>('claim', { initials }),
    calibrate: (index, choice) => call<CalibrateReply>('calibrate', { index, choice }),
    predict: (third) => call<StudentStatus>('predict', { third }),
    next: () => call<NextReply>('next'),
    judge: (body) => call<StudentStatus>('judge', body),
    reflect: (text) => call<StudentStatus>('reflect', { text })
  };
}

/* ── Teacher ───────────────────────────────────────────────────────── */

export type ClassOption = { id: string; title?: string; name?: string };
export type ClassesReply = { classes: ClassOption[] };

export type ProgressRow = {
  student_id: string;
  name: string;
  initials: string;
  has_answer: boolean;
  judged: number;
  target: number;
  calibrated: boolean;
  predicted: boolean;
  reflected: boolean;
};
export type TeacherStatus = {
  round: { open: boolean; started_at: string; pool_size: number; anchors: number } | null;
  progress: ProgressRow[];
};

export type ResultItem = {
  id: string;
  text: string;
  kind: 'student' | 'anchor';
  name?: string;
  initials?: string;
  anchor_mark?: number | null;
  theta: number;
  se: number;
  wins: number;
  comparisons: number;
  rank: number;
};
export type Reliability = {
  value: number;
  level: 'keep' | 'feedback' | 'marks';
  per_item: number;
  more_to_12: number;
  ssr: number;
  split_half: number | null;
};
export type JudgeRow = { key: string; name: string; judged: number; infit: number | null; flagged: boolean; weight: number };
export type ChipRow = { label: string; winner_rate: number; loser_rate: number; diff: number };
export type Results = {
  /** Sorted best first; rank is 1-based. */
  items: ResultItem[];
  reliability: Reliability;
  judges: JudgeRow[];
  chips: ChipRow[];
  contested: { left: PoolText; right: PoolText; split: number | null } | null;
  exemplars: PoolText[];
  predictions: Array<{ name: string; predicted: Third; actual: Third }>;
  reflections: Array<{ name: string; text: string }>;
  /** mark = a + b·θ, clamped to 0..out_of and rounded to 0.5. by_student: student id → mark. */
  marks: { a: number; b: number; out_of: number; by_student: Record<string, number> } | null;
};
export type TeacherNextReply = { pair: Pair | null; done_count: number };
export type DisplayReply = { contested: { left: PoolText; right: PoolText } | null; exemplars: PoolText[] };
export type PushReply = { column_id: string; count: number };

export type TeacherApi = {
  classes(): Promise<ClassesReply>;
  status(classId: string): Promise<TeacherStatus>;
  /** start, refresh, close, open: each replies with the fresh status. start: 409 `started` once a round exists; 400 `too_few` under 2 answers. */
  act(classId: string, action: 'start' | 'refresh' | 'close' | 'open'): Promise<TeacherStatus>;
  next(classId: string): Promise<TeacherNextReply>;
  judge(classId: string, body: JudgeBody): Promise<{ done_count: number }>;
  results(classId: string): Promise<Results>;
  display(classId: string): Promise<DisplayReply>;
  pushMarks(classId: string, title: string): Promise<PushReply>;
};

export function teacherApi(lessonId: string, blockId: string): TeacherApi {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/comparative-judgement/${encodeURIComponent(blockId)}`;
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(endpoint, { action, ...extra });
  return {
    classes: () => call<ClassesReply>('classes'),
    status: (class_id) => call<TeacherStatus>('status', { class_id }),
    act: (class_id, action) => call<TeacherStatus>(action, { class_id }),
    next: (class_id) => call<TeacherNextReply>('next', { class_id }),
    judge: (class_id, body) => call<{ done_count: number }>('judge', { class_id, ...body }),
    results: (class_id) => call<Results>('results', { class_id }),
    display: (class_id) => call<DisplayReply>('display', { class_id }),
    pushMarks: (class_id, title) => call<PushReply>('push_marks', { class_id, title })
  };
}

export const classLabel = (c: ClassOption): string => c.title || c.name || c.id;
