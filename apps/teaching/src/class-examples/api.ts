import { apiGet, apiPost } from '@/api/client';

/** Server mirror: netlify/functions/_shared/class-examples.mjs */
export const DIRECT_CONTEXT = 'direct';
export const MAX_EXAMPLE_LENGTH = 4000;

export interface PublicExampleSlot {
  id: string;
  block_id: string;
  label: string;
  shown: boolean;
  text?: string;
  saved_at?: string | null;
}

export interface PublicExamples {
  lesson_id: string;
  context: string;
  poll_seconds: number;
  slots: PublicExampleSlot[];
}

export type ExampleStatus = 'empty' | 'open' | 'writing' | 'locked' | 'saved';

export interface TeacherExampleEntry {
  status: ExampleStatus;
  code?: string | null;
  attempts: number;
  attempts_left?: number;
  text?: string;
  shown: boolean;
  saved_at?: string | null;
  opened_at?: string | null;
}

export interface ExampleSlot {
  id: string;
  block_id: string;
  label: string;
  created_at: string;
}

export interface TeacherExampleSlot extends ExampleSlot {
  entry: TeacherExampleEntry;
}

export interface ExampleContext {
  id: string;
  label: string;
  detail: string;
  dates: string[];
}

export interface TeacherExamples {
  lesson_id: string;
  context: string;
  max_wrong_codes: number;
  slots: TeacherExampleSlot[];
  contexts: ExampleContext[];
  removed?: ExampleSlot;
}

export type TeacherExampleAction =
  | { action: 'add_slot'; block_id: string; label: string }
  | { action: 'rename_slot'; slot_id: string; label: string }
  | { action: 'remove_slot'; slot_id: string }
  | { action: 'restore_slot'; slot: ExampleSlot; index: number }
  | { action: 'open' | 'close' | 'show' | 'hide' | 'clear'; slot_id: string }
  | { action: 'edit_text'; slot_id: string; text: string };

function enc(value: string): string {
  return encodeURIComponent(value);
}

export function fetchPublicExamples(lessonId: string, classId?: string): Promise<PublicExamples> {
  const query = classId ? `?class=${enc(classId)}` : '';
  return apiGet<PublicExamples>(`/api/published/examples/${enc(lessonId)}${query}`);
}

export function unlockExample(
  lessonId: string,
  body: { class?: string; slot_id: string; code: string }
): Promise<{ token: string }> {
  return apiPost(`/api/published/examples/${enc(lessonId)}/unlock`, body);
}

export function submitExample(
  lessonId: string,
  body: { class?: string; slot_id: string; token: string; text: string }
): Promise<{ saved_at: string }> {
  return apiPost(`/api/published/examples/${enc(lessonId)}/submit`, body);
}

export function fetchTeacherExamples(lessonId: string, context?: string): Promise<TeacherExamples> {
  const query = context ? `?context=${enc(context)}` : '';
  return apiGet<TeacherExamples>(`/api/lessons/${enc(lessonId)}/examples${query}`);
}

export function postTeacherExample(
  lessonId: string,
  context: string,
  body: TeacherExampleAction
): Promise<TeacherExamples> {
  return apiPost<TeacherExamples>(`/api/lessons/${enc(lessonId)}/examples`, { ...body, context });
}
