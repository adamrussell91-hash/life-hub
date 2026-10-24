import type { Lesson } from '@/schemas/lesson';
import type { SprintSummary, SprintTeacherApi } from './api';
export function openPitchView(_o: { api: SprintTeacherApi; getLesson: () => Lesson; summary: SprintSummary; onClose(): void }): () => void {
  return () => {};
}
