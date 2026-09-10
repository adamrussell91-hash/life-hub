import { describe, expect, it } from 'vitest';
import { FAILURE, aiErrorCopy, aiFailureCopy } from '@/app/failure';

describe('predictable failure copy', () => {
  it('tells the teacher whether an AI failure can be retried', () => {
    expect(aiFailureCopy(true)).toBe(FAILURE.aiRetry);
    expect(aiFailureCopy(false)).toBe(FAILURE.aiStopped);
    expect(aiFailureCopy(undefined)).toBe(FAILURE.aiRetry);
  });

  it('keeps the server reason visible and special-cases expired sessions', () => {
    expect(aiErrorCopy({ code: 'unauthorized', message: 'Authentication required', retryable: false })).toBe(
      'Your session expired. Sign in again to keep using AI.'
    );
    expect(aiErrorCopy({ message: 'Lesson not found', retryable: false })).toBe(
      'Lesson not found. This request cannot be retried.'
    );
    expect(aiErrorCopy({ message: 'AI provider is not configured', retryable: true })).toBe(
      'AI provider is not configured. You can try again.'
    );
  });
});
