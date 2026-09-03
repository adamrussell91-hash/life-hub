import type { CurriculumResponse } from '@/teacher/nav';

/**
 * Session-scoped curriculum fetch cache. Lists and rail read from the current
 * snapshot so add/delete can paint immediately; background fetches reconcile.
 */
export function createCurriculumCache(
  fetchCurriculum: () => Promise<CurriculumResponse>
): {
  invalidate: () => void;
  replace: (curriculum: CurriculumResponse) => void;
  peek: () => CurriculumResponse | undefined;
  get: () => Promise<CurriculumResponse>;
} {
  let snapshot: CurriculumResponse | null = null;
  let curriculumPromise: Promise<CurriculumResponse> | null = null;

  return {
    invalidate(): void {
      snapshot = null;
      curriculumPromise = null;
    },
    replace(curriculum: CurriculumResponse): void {
      snapshot = curriculum;
      curriculumPromise = Promise.resolve(curriculum);
    },
    peek(): CurriculumResponse | undefined {
      return snapshot ?? undefined;
    },
    get(): Promise<CurriculumResponse> {
      if (!curriculumPromise) {
        const request = fetchCurriculum()
          .then((curriculum) => {
            if (curriculumPromise === request) {
              snapshot = curriculum;
            }
            return snapshot ?? curriculum;
          })
          .catch((error: unknown) => {
            if (curriculumPromise === request) {
              curriculumPromise = null;
              snapshot = null;
            }
            throw error;
          });
        curriculumPromise = request;
      }
      return curriculumPromise;
    }
  };
}
