import { cachedEventRead, isEventRead, changesEventReads, clearEventReadCache } from './event-read-cache';
export { clearEventReadCache } from './event-read-cache';
import { getApiBaseUrl } from './config';
import type { ApiErrorBody, ApiResult } from './types';

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status?: number;
  readonly data?: unknown;
  readonly retryable?: boolean;

  constructor(error: ApiErrorBody, status?: number, data?: unknown) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.details = error.details;
    this.status = status;
    this.data = data;
    this.retryable = error.retryable;
  }
}

export interface ApiRequestOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

// Do not retry `timeout`: each attempt already waited ~20s, and three
// stacked timeouts left Network Ecology on "Loading…" for ~60s.
const RETRYABLE_CODES = new Set(['invalid_response', 'network_error']);
const RETRY_ATTEMPTS = 3;

function isApiResult<T>(value: unknown): value is ApiResult<T> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false;
  }
  return typeof (value as ApiResult<T>).ok === 'boolean';
}

export function isRetryableApiError(err: unknown): boolean {
  return err instanceof ApiClientError && RETRYABLE_CODES.has(err.code);
}

/**
 * Netlify (and similar hosts) return `{ error, message }` when the site is
 * suspended — not our `{ ok, data | error }` envelope. Read that before we
 * treat the body as a malformed hub response.
 */
export function readPlatformError(body: unknown): ApiErrorBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  if ('ok' in body) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'string' || error.length === 0) return null;
  const rawMessage = (body as { message?: unknown }).message;
  const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : error;
  if (error === 'usage_exceeded') {
    return { code: 'usage_exceeded', message };
  }
  return { code: 'platform_unavailable', message };
}

// Netlify answers a function killed at its time limit with a 502/504 that is
// not our envelope. Report that as a timeout (not retried) — retrying it as
// `invalid_response` tripled the wait on Network Ecology.
function isGatewayTimeout(status: number): boolean {
  return status === 502 || status === 504;
}

function gatewayTimeoutError(response: Response): ApiClientError {
  return new ApiClientError(
    { code: 'timeout', message: `The server took too long (HTTP ${response.status})` },
    response.status
  );
}

export async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text();
  if (!text.trim() && isGatewayTimeout(response.status)) throw gatewayTimeoutError(response);
  if (!text.trim()) {
    throw new ApiClientError(
      {
        code: 'invalid_response',
        message: `Empty response (HTTP ${response.status})`
      },
      response.status
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    if (isGatewayTimeout(response.status)) throw gatewayTimeoutError(response);
    throw new ApiClientError(
      {
        code: 'invalid_response',
        message: `Non-JSON response (HTTP ${response.status})`
      },
      response.status
    );
  }

  const platform = readPlatformError(body);
  if (platform) {
    throw new ApiClientError(platform, response.status);
  }

  if (!isApiResult<T>(body)) {
    if (isGatewayTimeout(response.status)) throw gatewayTimeoutError(response);
    throw new ApiClientError(
      {
        code: 'invalid_response',
        message: `Unexpected response shape (HTTP ${response.status})`
      },
      response.status
    );
  }

  return body;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function apiRequestOnce<T>(
  method: string,
  path: string,
  options: ApiRequestOptions & { body?: unknown } = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl(options.baseUrl);
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const signal =
    options.signal ?? (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(20_000)
      : undefined);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal
    });
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : 'Network request failed';
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
    const message = timedOut
      ? `Timed out calling ${url}`
      : raw === 'Failed to fetch' || raw === 'Network request failed' || raw === 'Load failed'
        ? `Could not reach ${url}. Check the Functions deploy or the Network tab.`
        : raw;
    throw new ApiClientError({
      code: timedOut ? 'timeout' : 'network_error',
      message
    });
  }

  const result = await parseApiResponse<T>(response);
  if (!result.ok) {
    if (response.status === 401 || response.status === 403) clearEventReadCache();
    throw new ApiClientError(result.error, response.status, result.data);
  }
  return result.data;
}

async function apiRequest<T>(
  method: string,
  path: string,
  options: ApiRequestOptions & { body?: unknown } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await apiRequestOnce<T>(method, path, options);
    } catch (err) {
      lastError = err;
      if (!isRetryableApiError(err) || attempt === RETRY_ATTEMPTS - 1) {
        throw err;
      }
      await delay(180 * (attempt + 1));
    }
  }
  throw lastError;
}

export function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  if (!isEventRead(path)) return apiRequest<T>('GET', path, options);
  const key = `${getApiBaseUrl(options?.baseUrl)}${path}`;
  return cachedEventRead(key, () => apiRequest<T>('GET', path, {...options, signal: undefined}), options?.signal);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return writeRequest<T>('POST', path, body, options);
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return writeRequest<T>('PATCH', path, body, options);
}

async function writeRequest<T>(method: string, path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
  const invalidates = changesEventReads(path);
  if (invalidates) clearEventReadCache();
  try { return await apiRequest<T>(method, path, {...options, body}); }
  finally { if (invalidates) clearEventReadCache(); }
}
