import { apiPost, ApiClientError } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import { deviceToken } from '@/quiz/dom';
import type { FeedbackEntry, Level, Part, PhasePayload, SprintPhaseKey } from './schema';

// ---------------------------------------------------------------- student

export type PhaseRow = {
  key: SprintPhaseKey; open: boolean; due_date: string; due_time: string;
  state: 'none' | 'draft' | 'in'; late: boolean; frozen: boolean; closed: boolean; count_in: number;
};
export type GalleryIdea = { id: string; index?: number; title: string; idea: string; answers: string; evidence: string; file: string | null; strongest: boolean };
export type GallerySet = { id: string; ideas: GalleryIdea[] };
export type HeatLevel = 0 | 1 | 2 | 3;
export type SprintStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  group: { id: string; name: string; size: number; mates: string[] } | null;
  phases?: PhaseRow[];
  lock?: { until: string } | null;
  mine?: Partial<PhasePayload>;
  notes?: Array<{ id: string; text: string; mine: boolean }>;
  question?: { text: string } | null;
  gallery?: GallerySet[] | null;
  heat?: Record<string, Record<string, HeatLevel>> | null;
  votes_closed?: boolean;
  chosen?: { id: string; title: string; idea: string } | null;
  awaiting?: { kind: 'question' | 'idea' } | null;
  parts?: Array<Part & { claimed: number; mine: boolean }>;
  pitch?: { kind: 'file' | 'link'; name: string; file: string | null; link: string } | null;
  spotlight?: { text: string; label: string } | null;
  round?: { group_id: string; group_name: string; sent: boolean } | null;
  received?: { levels: Record<string, [number, number, number]>; lines: Array<{ worked: string; next: string; about: string }> } | null;
  running?: string | null;
};
export type UploadedFile = { id: string; name: string; mime: string; size: number; at: string; phase: SprintPhaseKey };

export type SprintClient = {
  status(): Promise<SprintStatus>;
  claim(initials: string): Promise<SprintStatus>;
  open(phase: SprintPhaseKey): Promise<SprintStatus>;
  save<P extends SprintPhaseKey>(phase: P, payload: PhasePayload[P]): Promise<SprintStatus>;
  submit<P extends SprintPhaseKey>(phase: P, payload: PhasePayload[P]): Promise<SprintStatus>;
  parts(parts: Part[]): Promise<SprintStatus>;
  claimPart(partId: string): Promise<SprintStatus>;
  pitch(source: { file_id: string } | { link: string }): Promise<SprintStatus>;
  feedback(groupId: string, entry: FeedbackEntry): Promise<SprintStatus>;
  upload(phase: 'sketch' | 'prototype', file: File): Promise<UploadedFile>;
  /** An object URL for a file the student may read. */
  fileUrl(fileId: string): Promise<string>;
};

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { code: string; message: string } } | null;
  if (body?.ok) return body.data as T;
  throw new ApiClientError({ code: body?.error?.code ?? 'invalid_response', message: body?.error?.message ?? 'That didn’t work. Try again.' });
}

/** POST JSON and get bytes back as an object URL; errors come back as JSON. */
async function postForUrl(path: string, body: unknown): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || (response.headers.get('content-type') ?? '').includes('application/json')) return unwrap<string>(response);
  return URL.createObjectURL(await response.blob());
}

export function sprintClient(lessonId: string, classId: string): SprintClient {
  const endpoint = `/api/published/sprint/${encodeURIComponent(lessonId)}`;
  const fileEndpoint = `/api/published/sprint-file/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<SprintStatus>(endpoint, { action, ...fields, ...extra });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    open: (phase) => call('open', { phase }),
    save: (phase, payload) => call('save', { phase, payload }),
    submit: (phase, payload) => call('submit', { phase, payload }),
    parts: (parts) => call('parts', { parts }),
    claimPart: (partId) => call('claim_part', { part_id: partId }),
    pitch: (source) => call('pitch', source),
    feedback: (groupId, entry) => call('feedback', { group_id: groupId, entry }),
    async upload(phase, file) {
      const form = new FormData();
      form.set('class_id', classId);
      if (classToken) form.set('class_token', classToken);
      form.set('phase', phase);
      form.set('file', file);
      return unwrap<UploadedFile>(await fetch(`${getApiBaseUrl()}${fileEndpoint}`, { method: 'POST', credentials: 'include', body: form }));
    },
    fileUrl: (fileId) => postForUrl(fileEndpoint, { action: 'get', ...fields, file_id: fileId })
  };
}

// ---------------------------------------------------------------- teacher

export type MapStudent = { id: string; initials: string; name: string; phases: Record<SprintPhaseKey, 'none' | 'draft' | 'in' | 'late'>; opened: Record<SprintPhaseKey, boolean> };
export type MapGroup = { id: string; name: string; students: MapStudent[]; open: SprintPhaseKey[]; awaiting: { kind: 'question' | 'idea'; tie: boolean; empty: boolean } | null; chosen: boolean; question: string | null };
export type SprintSummary = {
  groups: MapGroup[];
  class_parts: Partial<Record<SprintPhaseKey, 'open' | 'ended'>>;
  ended: Partial<Record<SprintPhaseKey, { at: string; present: string[] }>>;
  lock: { phase: SprintPhaseKey; until: string; unlocked: string[] } | null;
  extend: Record<string, unknown>;
  running: string | null;
  spotlight: { text: string; label: string } | null;
};
export type BoardSub = { student_id: string; name: string; sub: { payload: Record<string, unknown>; submitted_at?: string; late?: boolean } | null };
export type GroupBoard = {
  group: { id: string; name: string };
  awaiting: MapGroup['awaiting'];
  question: { id: string; text: string } | null;
  chosen: string | null;
  notes: Array<{ id: string; text: string; name: string; student_id: string; index: number }>;
  gallery: Array<{ id: string; name: string; student_id: string; ideas: GalleryIdea[] }>;
  totals: Record<string, number>;
  heat: Record<string, Record<string, HeatLevel>>;
  reasons: Array<{ name: string; votes: Record<string, string>; reasons: Record<string, string> }>;
  parts: Array<Part & { by: string[] }>;
  pitch: { kind: 'file' | 'link'; file?: string; link?: string; name?: string; by: string } | null;
  subs: { prototype: BoardSub[]; test: BoardSub[] };
  round: { status: 'open' | 'closed' | 'released'; entries: Array<{ student_id: string; name: string; levels: Record<string, Level>; worked: string; next: string; about: string; flagged: boolean; status: string }> } | null;
};

export type SprintTeacherApi = {
  summary(): Promise<SprintSummary>;
  board(groupId: string): Promise<GroupBoard>;
  endClass(phase: SprintPhaseKey): Promise<SprintSummary>;
  unlock(studentId: string): Promise<SprintSummary>;
  extend(input: { scope: 'class' | 'group' | 'student'; id?: string; phase: SprintPhaseKey; due_date: string; due_time: string }): Promise<SprintSummary>;
  confirm(groupId: string, kind: 'question' | 'idea', id: string): Promise<SprintSummary>;
  spotlight(studentId: string, phase: SprintPhaseKey, field: string): Promise<SprintSummary>;
  clearSpotlight(): Promise<SprintSummary>;
  move(studentId: string, groupId: string): Promise<SprintSummary>;
  run(groupId: string | null): Promise<SprintSummary>;
  round(groupId: string, op: 'open' | 'close' | 'release'): Promise<SprintSummary>;
  moderate(groupId: string, studentId: string, status: 'released' | 'removed'): Promise<SprintSummary>;
  fileUrl(fileId: string): Promise<string>;
};

export function sprintTeacherApi(lessonId: string): SprintTeacherApi {
  const path = `/api/lessons/${encodeURIComponent(lessonId)}/sprint`;
  const call = <T = SprintSummary>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(path, { action, ...extra });
  return {
    summary: () => call('summary'),
    board: (groupId) => call<GroupBoard>('board', { group_id: groupId }),
    endClass: (phase) => call('end_class', { phase }),
    unlock: (studentId) => call('unlock', { student_id: studentId }),
    extend: (input) => call('extend', input),
    confirm: (groupId, kind, id) => call('confirm', { group_id: groupId, kind, id }),
    spotlight: (studentId, phase, field) => call('spotlight', { student_id: studentId, phase, field }),
    clearSpotlight: () => call('spotlight', { clear: true }),
    move: (studentId, groupId) => call('move', { student_id: studentId, group_id: groupId }),
    run: (groupId) => call('run', { group_id: groupId }),
    round: (groupId, op) => call('round', { group_id: groupId, op }),
    moderate: (groupId, studentId, status) => call('moderate', { group_id: groupId, student_id: studentId, status }),
    fileUrl: (fileId) => postForUrl(`/api/lessons/${encodeURIComponent(lessonId)}/sprint-file`, { file_id: fileId })
  };
}

// ---------------------------------------------------------------- practice run

export type PracticeState = {
  now: number;
  next: { at: number; label: string } | null;
  lesson: import('@/schemas/published-lesson').PublishedLesson;
  summary: SprintSummary;
  students: { s1: SprintStatus; s2: SprintStatus };
};
export type PracticeApi = {
  state(): Promise<PracticeState>;
  skip(): Promise<PracticeState>;
  /** Wipes the last run and starts again from this lesson's Kit. */
  start(lesson: import('@/schemas/lesson').Lesson): Promise<PracticeState>;
  /** Student 1 or 2's SprintClient: the real student screen, on the practice copy. */
  client(as: 's1' | 's2'): SprintClient;
  /** The progress map's API, on the practice copy. `changed` runs after every class control. */
  teacher(changed: () => void): SprintTeacherApi;
};

const NO_UPLOADS = () => Promise.reject(new ApiClientError({ code: 'practice', message: 'Uploads are off in a practice run. Use a link.' }));

export function sprintPracticeApi(lessonId: string): PracticeApi {
  const path = `/api/lessons/${encodeURIComponent(lessonId)}/sprint-practice`;
  const op = <T>(name: string, extra: Record<string, unknown> = {}) => apiPost<T>(path, { op: name, ...extra });
  return {
    state: () => op<PracticeState>('state'),
    skip: () => op<PracticeState>('skip'),
    start: (lesson) => op<PracticeState>('start', { draft: { title: lesson.title, unit_id: lesson.unit_id, pedagogical_mode: lesson.pedagogical_mode, blocks: lesson.blocks, sprint: lesson.sprint } }),
    client(as) {
      const call = (action: string, extra: Record<string, unknown> = {}) => op<SprintStatus>('student', { as, body: { action, ...extra } });
      return {
        status: () => call('status'),
        claim: () => call('status'),
        open: (phase) => call('open', { phase }),
        save: (phase, payload) => call('save', { phase, payload }),
        submit: (phase, payload) => call('submit', { phase, payload }),
        parts: (parts) => call('parts', { parts }),
        claimPart: (partId) => call('claim_part', { part_id: partId }),
        pitch: (source) => call('pitch', source),
        feedback: (groupId, entry) => call('feedback', { group_id: groupId, entry }),
        upload: NO_UPLOADS,
        fileUrl: NO_UPLOADS
      };
    },
    teacher(changed) {
      const call = async <T = SprintSummary>(action: string, extra: Record<string, unknown> = {}) => {
        const out = await op<T>('teacher', { body: { action, ...extra } });
        if (action !== 'summary' && action !== 'board') changed();
        return out;
      };
      return {
        summary: () => call('summary'),
        board: (groupId) => call<GroupBoard>('board', { group_id: groupId }),
        endClass: (phase) => call('end_class', { phase }),
        unlock: (studentId) => call('unlock', { student_id: studentId }),
        extend: (input) => call('extend', input),
        confirm: (groupId, kind, id) => call('confirm', { group_id: groupId, kind, id }),
        spotlight: (studentId, phase, field) => call('spotlight', { student_id: studentId, phase, field }),
        clearSpotlight: () => call('spotlight', { clear: true }),
        move: (studentId, groupId) => call('move', { student_id: studentId, group_id: groupId }),
        run: (groupId) => call('run', { group_id: groupId }),
        round: (groupId, opName) => call('round', { group_id: groupId, op: opName }),
        moderate: (groupId, studentId, status) => call('moderate', { group_id: groupId, student_id: studentId, status }),
        fileUrl: NO_UPLOADS
      };
    }
  };
}
