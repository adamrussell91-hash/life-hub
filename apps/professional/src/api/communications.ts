import { apiGet, apiPatch, apiPost, ApiClientError } from './client';
import type { CommunicationRecord } from '@/domain/types';

export interface CommunicationLinkInput {
  source_ref?: string;
  target_ref: string;
  relationship_type: 'recipient' | 'about_person' | 'follows_from';
  occurred_at?: string | null;
  role?: string | null;
  context_key?: string | null;
  context_ref?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateCommunicationInput {
  direction: 'outbound' | 'inbound';
  channel: string;
  occurred_at: string;
  subject?: string;
  summary?: string;
  links?: CommunicationLinkInput[];
}

export interface CreateCommunicationResult {
  communication: CommunicationRecord;
  links: unknown[];
  created: boolean;
}

export function listCommunications(options: { signal?: AbortSignal } = {}): Promise<{
  communications: CommunicationRecord[];
}> {
  return apiGet('/api/communications', { signal: options.signal });
}

export function getCommunication(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ communication: CommunicationRecord }> {
  const params = new URLSearchParams({ id });
  return apiGet(`/api/communications?${params.toString()}`, { signal: options.signal });
}

export async function createCommunication(
  body: CreateCommunicationInput,
  options: { signal?: AbortSignal } = {}
): Promise<CreateCommunicationResult> {
  try {
    return await apiPost<CreateCommunicationResult>('/api/communications', body, {
      signal: options.signal
    });
  } catch (err) {
    throw err;
  }
}

export function updateCommunication(
  id: string,
  patch: { subject?: string; summary?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ communication: CommunicationRecord }> {
  const params = new URLSearchParams({ id });
  return apiPatch(`/api/communications?${params.toString()}`, patch, { signal: options.signal });
}

export function retryCommunicationLinks(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<CreateCommunicationResult> {
  const params = new URLSearchParams({ id, action: 'retry-links' });
  return apiPost(`/api/communications?${params.toString()}`, {}, { signal: options.signal });
}

export interface FollowUpOperationResult {
  communication: CommunicationRecord;
  follow_up_operation: NonNullable<CommunicationRecord['follow_up_operation']>;
  task_id: string;
  created_task: boolean;
  incomplete: boolean;
}

export function createFollowUpTask(
  id: string,
  body: { title?: string } = {},
  options: { signal?: AbortSignal } = {}
): Promise<FollowUpOperationResult> {
  const params = new URLSearchParams({ id, action: 'create-follow-up' });
  return apiPost(`/api/communications?${params.toString()}`, body, { signal: options.signal });
}

export function retryFollowUpTask(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<FollowUpOperationResult> {
  const params = new URLSearchParams({ id, action: 'retry-follow-up' });
  return apiPost(`/api/communications?${params.toString()}`, {}, { signal: options.signal });
}

export function isIncompleteLinksError(err: unknown): err is ApiClientError & {
  data: {
    communication_id: string;
    operation_id: string;
    completed_link_ids: string[];
    failed_intent_ids: string[];
  };
} {
  return (
    err instanceof ApiClientError &&
    err.code === 'communication_links_incomplete' &&
    typeof (err as ApiClientError & { data?: unknown }).data === 'object'
  );
}

export function isFollowUpIncompleteError(err: unknown): err is ApiClientError & {
  data: {
    communication_id: string;
    operation_id: string;
    task_id: string;
    completed_link_ids: string[];
    failed_intent_ids: string[];
  };
} {
  return (
    err instanceof ApiClientError &&
    err.code === 'follow_up_operation_incomplete' &&
    typeof (err as ApiClientError & { data?: unknown }).data === 'object'
  );
}
