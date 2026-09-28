import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/api/client';
import { isUnauthenticatedError, messageForSignInFailure } from '@/auth/gate';

describe('travel auth gate messages', () => {
  it('treats unauthenticated and 401 as session-gate failures', () => {
    expect(
      isUnauthenticatedError(
        new ApiClientError({ code: 'unauthenticated', message: 'Please sign in to continue.' }, 401)
      )
    ).toBe(true);
    expect(
      isUnauthenticatedError(new ApiClientError({ code: 'validation_error', message: 'number required for tickets' }, 400))
    ).toBe(false);
  });

  it('never surfaces ticket validation copy on the passphrase gate', () => {
    const msg = messageForSignInFailure(
      new ApiClientError({ code: 'validation_error', message: 'number required for tickets' }, 400)
    );
    expect(msg).not.toMatch(/tickets/i);
    expect(msg).toBe('Unable to sign in. Please try again.');
  });
});
