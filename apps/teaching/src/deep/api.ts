import { apiPost } from '@/api/client';
import type { PlacedStep } from './schema';
import type { WritingTicks } from './track';

export type DeepProgress = { steps: Record<string, Record<string, { step: PlacedStep; at: string; hint?: boolean }>>; writing: WritingTicks };
const path = (classId: string) => `/api/classes/${encodeURIComponent(classId)}/deep`;

export const deepApi = {
  load: (classId: string, unitId: string) => apiPost<DeepProgress>(path(classId), { action: 'load', unit_id: unitId }),
  setStep: (classId: string, unitId: string, studentId: string, duId: string, step: PlacedStep | null, hint = false) =>
    apiPost<DeepProgress>(path(classId), { action: 'set_step', unit_id: unitId, student_id: studentId, du_id: duId, step, hint }),
  setWriting: (classId: string, unitId: string, blockId: string, studentId: string, used: string[], missed: string[]) =>
    apiPost<DeepProgress>(path(classId), { action: 'set_writing', unit_id: unitId, block_id: blockId, student_id: studentId, used, missed })
};
