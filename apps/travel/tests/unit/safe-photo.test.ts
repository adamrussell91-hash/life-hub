import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeSaveErrorMessage } from '@/lib/safe-photo';
import { uploadTravelPhoto } from '@/api/travel';
import { ApiClientError } from '@/api/client';

const NO_SIGNAL = "Couldn't reach the server. Check your signal and try again.";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeSaveErrorMessage', () => {
  it("turns Safari's raw 'Load failed' into plain words", () => {
    expect(safeSaveErrorMessage(new TypeError('Load failed'))).toBe(NO_SIGNAL);
    expect(safeSaveErrorMessage(new ApiClientError({ code: 'network_error', message: 'Load failed' }))).toBe(NO_SIGNAL);
  });

  it('explains a timeout without showing the API address', () => {
    const msg = safeSaveErrorMessage(
      new ApiClientError({ code: 'timeout', message: 'Timed out calling https://api.example.test/api/travel-checkins' })
    );
    expect(msg).toBe('That took too long. Check your signal and try again.');
  });

  it('names a too-big photo and a server hiccup', () => {
    expect(safeSaveErrorMessage(new ApiClientError({ code: 'invalid_response', message: 'Non-JSON response (HTTP 413)' }, 413))).toBe(
      'That photo is too big to send. Try a different one.'
    );
    expect(safeSaveErrorMessage(new ApiClientError({ code: 'invalid_response', message: 'Non-JSON response (HTTP 502)' }, 502))).toBe(
      'The server had a problem. Try again in a minute.'
    );
  });

  it("keeps the server's own sentence for known errors", () => {
    const conflict = new ApiClientError({ code: 'conflict', message: 'This trip changed somewhere else. Reload to see the latest.' }, 409);
    expect(safeSaveErrorMessage(conflict)).toBe('This trip changed somewhere else. Reload to see the latest.');
    expect(safeSaveErrorMessage(new Error('boom'))).toBe('Could not save. Try again.');
  });
});

describe('uploadTravelPhoto', () => {
  it('reports a dropped connection as a network error, not a bare TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Load failed');
    }));
    const err = await uploadTravelPhoto('trp_test0001', new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('network_error');
  });
});
