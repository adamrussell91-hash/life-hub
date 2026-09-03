import { getApiBaseUrl } from '@/api/config';
import { apiGet, apiPatch } from '@/api/client';
import type { AiJob, AiJobCreate } from '@/ai/jobs';
import type { AiJobInbox, AiJobResolution } from '@/ai/jobs-inbox';

export type StartAiJobPayload = AiJobCreate;

export type StartAiJobResult = {
  id: string;
  status: 'working' | 'done' | 'error';
};

export class AiJobConflictError extends Error {
  readonly jobId: string;
  readonly status: string;

  constructor(jobId: string, status: string) {
    super('An unresolved job already exists for this lesson');
    this.name = 'AiJobConflictError';
    this.jobId = jobId;
    this.status = status;
  }
}

async function readOkData<T>(response: Response): Promise<T> {
  const body = (await response.json()) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string; code?: string; details?: { id?: string; status?: string } };
  };
  if (body && body.ok === true && body.data !== undefined) {
    return body.data;
  }
  if (response.status === 409 && body.error?.details?.id) {
    throw new AiJobConflictError(body.error.details.id, body.error.details.status ?? 'working');
  }
  throw new Error(body?.error?.message ?? `AI job request failed (${response.status})`);
}

export async function startAiJob(
  payload: StartAiJobPayload,
  options?: { baseUrl?: string; signal?: AbortSignal }
): Promise<StartAiJobResult> {
  const baseUrl = getApiBaseUrl(options?.baseUrl);
  const response = await fetch(`${baseUrl}/api/ai/jobs`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal
  });
  return readOkData<StartAiJobResult>(response);
}

export async function pollAiJob(
  id: string,
  options?: { baseUrl?: string; signal?: AbortSignal }
): Promise<AiJob> {
  const baseUrl = getApiBaseUrl(options?.baseUrl);
  const response = await fetch(`${baseUrl}/api/ai/jobs/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal: options?.signal
  });
  return readOkData<AiJob>(response);
}

export async function listAiJobs(options?: { baseUrl?: string; signal?: AbortSignal }): Promise<AiJobInbox> {
  return apiGet<AiJobInbox>('/api/ai/jobs', options);
}

export async function resolveAiJob(
  id: string,
  resolution: AiJobResolution,
  options?: { baseUrl?: string; signal?: AbortSignal }
): Promise<AiJob> {
  return apiPatch<AiJob>(`/api/ai/jobs/${id}`, { resolution }, options);
}
