import type { Lesson } from '@/schemas/lesson';
import type { SprintTeacherApi } from './api';
export type SprintMapHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };
export function mountSprintMap(_o: { getLesson: () => Lesson; api: SprintTeacherApi; emitLesson: (next: Lesson) => void }): SprintMapHandle {
  return { root: document.createElement('div'), refresh: async () => {}, dispose() {} };
}
