import { apiPost } from '@/api/client';
import type { InsightPayload } from './types';

export type InsightReply = InsightPayload | { published: false };
export const isInsight = (r: InsightReply | null): r is InsightPayload => !!r && !('published' in r && r.published === false);

const quizPath = (lessonId: string): string => `/api/lessons/${encodeURIComponent(lessonId)}/quiz`;

export type InsightApi = {
  load: (lessonId: string, classId: string | null) => Promise<InsightReply>;
  close: (lessonId: string, classId: string | null) => Promise<InsightReply>;
  reopen: (lessonId: string, classId: string | null) => Promise<InsightReply>;
  dismiss: (lessonId: string, flagId: string, undo?: boolean) => Promise<{ dismissed: string[] }>;
  classes: (lessonId: string) => Promise<{ classes: Array<{ id: string; title: string }> }>;
};

export const httpInsightApi: InsightApi = {
  load: (lessonId, classId) => apiPost<InsightReply>(quizPath(lessonId), { action: 'insight', class_id: classId }),
  close: (lessonId, classId) => apiPost<InsightReply>(quizPath(lessonId), { action: 'close', class_id: classId }),
  reopen: (lessonId, classId) => apiPost<InsightReply>(quizPath(lessonId), { action: 'reopen', class_id: classId }),
  dismiss: (lessonId, flagId, undo = false) => apiPost<{ dismissed: string[] }>(quizPath(lessonId), { action: 'dismiss_flag', flag_id: flagId, undo }),
  classes: (lessonId) => apiPost<{ classes: Array<{ id: string; title: string }> }>(quizPath(lessonId), { action: 'classes' })
};
