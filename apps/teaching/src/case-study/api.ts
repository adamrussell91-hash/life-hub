import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { CaseDoc, CaseEvidence, CaseStation, CaseWork } from './schema';

// ---------------------------------------------------------------- student
// POST /api/published/case/:lessonId  (netlify/functions/published-case.mjs → _shared/case-study.mjs)

export type CaseStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  /** Every station up to and including this index is open to the student (0 = Brief … 4 = Rules). */
  open_to: number;
  /** Stations the student has finished, by key. */
  done: CaseStation[];
  /** Case documents the student may read now. Whole case: all parts. Layered: parts opened so far. */
  parts: Array<{ id: string; title: string; docs: CaseDoc[]; question?: string }>;
  /** Layered release: how many parts exist and how many are open. */
  parts_total: number;
  work: CaseWork;
  /** Own pace: the objection text offered before the Outcome (null in teacher pace or when none are set). */
  objections: string[] | null;
  /** Present only once the student's decision is locked and the Outcome is open to them. */
  outcome: { text: string; source: string } | null;
  /** Own pace Outcome held until a date: "2026-11-03" while held, else null. */
  held_until: string | null;
  /** The class spread, no names. Null until the Outcome opens. `early` is true when fewer than 5 have decided. */
  spread: { options: Record<string, number>; confidence_avg: number | null; total: number; early: boolean } | null;
  /** Ids of documents the student never cited, once the Outcome opens. */
  not_used: string[];
  /** The unseen transfer case, once the Rules station opens. */
  transfer: { title: string; docs: CaseDoc[]; question: string } | null;
};

export type CaseSave =
  | { kind: 'first_take'; option_id?: string; text?: string; why: string }
  | { kind: 'answer'; part_id: string; text: string }
  | { kind: 'evidence'; doc_id: string; quote: string }
  | { kind: 'evidence_remove'; id: string }
  | { kind: 'objection'; index: number; answer: string }
  | { kind: 'reflection'; text: string }
  | { kind: 'rule'; when: string; then: string; unless: string }
  | { kind: 'transfer'; answer: string };

export type CaseClient = {
  status(): Promise<CaseStatus>;
  claim(initials: string): Promise<CaseStatus>;
  save(input: CaseSave): Promise<CaseStatus>;
  /** Layered release: open the next part. Own pace only, and only once this part's question is answered. */
  nextPart(): Promise<CaseStatus>;
  /** Own pace: move on to the next station. Refused until the current one is done. */
  advance(): Promise<CaseStatus>;
  /** Lock in the decision. Cannot be edited afterwards. */
  lock(input: { option_id?: string; text?: string; because: string; confidence: number }): Promise<CaseStatus>;
};

export function caseClient(lessonId: string, classId: string): CaseClient {
  const endpoint = `/api/published/case/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<CaseStatus>(endpoint, { action, ...fields, ...extra });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    save: (input) => call('save', { ...input }),
    nextPart: () => call('next_part'),
    advance: () => call('advance'),
    lock: (input) => call('lock', input)
  };
}

// ---------------------------------------------------------------- teacher
// POST /api/lessons/:id/case  (netlify/functions/case.mjs → _shared/case-study.mjs, caseTeacherAction)

export type CaseBoardStudent = {
  id: string;
  initials: string;
  name: string;
  /** Highest station index the student has reached. */
  at: number;
  locked: { option_id?: string; text?: string; confidence: number; changed: boolean } | null;
  cited: number;
  transfer: 'none' | 'in';
  rule: boolean;
};
export type CaseBoard = {
  /** Teacher pace: stations open to the whole class (0 = Brief only … 4 = all), and parts open (layered). */
  open_to: number;
  parts_open: number;
  parts_total: number;
  outcome_revealed: boolean;
  pace: 'teacher' | 'own';
  students: CaseBoardStudent[];
  /** Option id → how many locked on it. */
  spread: Record<string, number>;
  /** Doc id → how many students cited it; every doc is listed, so zero shows. */
  heat: Array<{ doc_id: string; title: string; cited: number }>;
  /** Rule-of-thumb proposals written, with initials. */
  rules: Array<{ initials: string; when: string; then: string; unless: string }>;
};

export type CaseTeacherApi = {
  board(): Promise<CaseBoard>;
  /** Teacher pace: open the next station for the whole class. */
  open(station: number): Promise<CaseBoard>;
  /** Teacher pace, layered: open the next part for the whole class. */
  releasePart(): Promise<CaseBoard>;
  /** Teacher pace: show the Outcome to the whole room. */
  reveal(): Promise<CaseBoard>;
};

export function caseTeacherApi(lessonId: string): CaseTeacherApi {
  const path = `/api/lessons/${encodeURIComponent(lessonId)}/case`;
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<CaseBoard>(path, { action, ...extra });
  return {
    board: () => call('board'),
    open: (station) => call('open', { station }),
    releasePart: () => call('release_part'),
    reveal: () => call('reveal')
  };
}

export type { CaseEvidence };
