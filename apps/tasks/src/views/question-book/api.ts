// apps/tasks/src/views/question-book/api.ts
// The Question Book's client: the shapes netlify/functions/question-book.mjs sends and the five
// calls the view makes. Every call goes through the hub's api client (base URL, envelope, errors).
import { apiGet, apiPost, apiPut } from '@/api/client';

export type QbPart = { label: string; options?: undefined } | { options: string[]; label?: undefined };
export type QbResponse = { type: string } & Record<string, unknown>;
export type QbQuestion = { id: string; chapter: string; n: number; prompt: string; parts: QbPart[]; response: QbResponse; from?: string };
export type QbValue = { main?: unknown; parts?: Record<string, string> } | null;
export type QbAnswer = { value: QbValue; updatedAt: string };
export type QbChart = { title: string; family: 'quadrant' | 'plot'; structure: QbChartStructure };
export type QbAxis = { label: string; low: string; high: string };
export type QbChartStructure = {
  axes: { x: QbAxis; y: QbAxis };
  cells?: { id: string; label: string; col: 0 | 1; row: 0 | 1 }[];
  item?: string;
  point?: string;
  max?: number;
};
export type QbNote = { id: string; at: string; observation: string; question: string; answered: number };
export type QbOwn = { id: string; question: string; answer: string; updatedAt?: string; history?: unknown[] };
export type QbGroup = { key: string; title: string; order: number };
export type QbChapterSummary = { id: string; title: string; group: string; order: number; kind: 'questions' | 'rules' | 'own'; when: string; total: number; answered: number; updatedAt: string | null };
export type QbChapter = {
  chapter: Omit<QbChapterSummary, 'total' | 'answered' | 'updatedAt'>;
  questions: QbQuestion[];
  charts: Record<string, QbChart>;
  answers: Record<string, QbAnswer>;
  notes: QbNote[];
  rules?: { id: string; label: string }[];
  own?: QbOwn[];
};

const BASE = '/api/question-book';

export const questionBookApi = {
  shelf: () => apiGet<{ groups: QbGroup[]; chapters: QbChapterSummary[] }>(BASE),
  chapter: (id: string) => apiGet<QbChapter>(`${BASE}?chapter=${encodeURIComponent(id)}`),
  history: (chapter: string, question: string) =>
    apiGet<{ question: string; versions: QbAnswer[] }>(`${BASE}?chapter=${encodeURIComponent(chapter)}&history=${encodeURIComponent(question)}`),
  save: (chapter: string, question: string, value: QbValue) =>
    apiPut<{ question: string; answer: QbAnswer | null; answered: number; total: number }>(BASE, { chapter, question, value }),
  saveOwn: (chapter: string, own: Array<Pick<QbOwn, 'id' | 'question' | 'answer'>>) =>
    apiPut<{ own: QbOwn[]; answered: number; total: number }>(BASE, { chapter, own }),
  notice: (chapter: string) => apiPost<{ note: QbNote; notes: QbNote[]; cost: string }>(`${BASE}/notice`, { chapter })
};
