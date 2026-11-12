import { getApiBaseUrl } from './config';
import type { ApiErrorBody, ApiResult } from './types';

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(error: ApiErrorBody) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.details = error.details;
  }
}

export interface ApiRequestOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

function isApiResult<T>(value: unknown): value is ApiResult<T> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false;
  }
  return typeof (value as ApiResult<T>).ok === 'boolean';
}

async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError({
      code: 'invalid_response',
      message: 'Response is not valid JSON'
    });
  }

  if (!isApiResult<T>(body)) {
    throw new ApiClientError({
      code: 'invalid_response',
      message: `Unexpected response shape (HTTP ${response.status})`
    });
  }

  return body;
}

async function apiRequest<T>(
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

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (cause) {
    throw new ApiClientError({
      code: 'network_error',
      message: cause instanceof Error ? cause.message : 'Network request failed'
    });
  }

  const result = await parseApiResponse<T>(response);
  if (!result.ok) {
    throw new ApiClientError(result.error);
  }
  return result.data;
}

export function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>('GET', path, options);
}

/** Asks the student for their personal code. Resolves null if they close the box. */
export type CodePrompt = (message: string, wrong: boolean) => Promise<string | null>;

let codePrompt: CodePrompt = async (message, wrong) => (await import('@/student/code-prompt')).askForCode(message, wrong);
let openPrompt: Promise<string | null> | null = null;

/** Test seam: replace the box that asks for a student's code. */
export function setCodePrompt(prompt: CodePrompt): void {
  codePrompt = prompt;
}

// Two blocks on one page can claim at once: they share one box and one answer.
const askCode: CodePrompt = (message, wrong) => (openPrompt ??= codePrompt(message, wrong).finally(() => (openPrompt = null)));

/**
 * A student's initials are in on another computer (`need_code`): ask for their
 * personal code and send the same request again with it, until it matches or
 * they close the box. Every block that claims initials goes through here.
 */
async function claimWithCode<T>(path: string, body: Record<string, unknown>, options: ApiRequestOptions | undefined, first: ApiClientError): Promise<T> {
  let message = first.message;
  let wrong = false;
  for (;;) {
    const code = await askCode(message, wrong);
    if (!code) throw first;
    try {
      return await apiRequest<T>('POST', path, { ...options, body: { ...body, code } });
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.code !== 'wrong_code') throw error;
      message = error.message;
      wrong = true;
    }
  }
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  try {
    return await apiRequest<T>('POST', path, { ...options, body });
  } catch (error) {
    const plain = typeof body === 'object' && body !== null && !Array.isArray(body);
    if (!(error instanceof ApiClientError) || error.code !== 'need_code' || !plain) throw error;
    return claimWithCode<T>(path, body as Record<string, unknown>, options, error);
  }
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>('PUT', path, { ...options, body });
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>('PATCH', path, { ...options, body });
}

export function apiDelete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>('DELETE', path, options);
}
