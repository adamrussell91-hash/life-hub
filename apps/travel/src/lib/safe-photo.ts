import { ApiClientError } from '@/api/client';

/**
 * Plain words for a failed safe mark or photo. Safari reports a dropped
 * connection as a bare "Load failed", and timeouts carry the API address.
 */
export function safeSaveErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return "Couldn't reach the server. Check your signal and try again.";
  if (!(err instanceof ApiClientError)) return 'Could not save. Try again.';
  if (err.code === 'network_error') return "Couldn't reach the server. Check your signal and try again.";
  if (err.code === 'timeout') return 'That took too long. Check your signal and try again.';
  if (err.status === 413) return 'That photo is too big to send. Try a different one.';
  if (err.code === 'invalid_response' || err.code === 'platform_unavailable' || (err.status ?? 0) >= 500) {
    return 'The server had a problem. Try again in a minute.';
  }
  // The travel functions write their own messages for people ("Please sign in to continue.").
  return err.message || 'Could not save. Try again.';
}

/** Width of the follower photo: sharp on a phone, a few hundred KB. */
export const SAFE_PHOTO_WIDTH = 1600;
