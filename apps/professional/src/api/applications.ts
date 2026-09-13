import { apiGet, apiPatch, apiPost, ApiClientError } from './client';
import type {
  ApplicationDocument,
  ApplicationPipelineStatus,
  ApplicationRecord,
  InterviewRound,
  OutcomeStatus,
  RefereeRole,
  SelectionCriterion
} from '@/domain/types';

export interface ApplicationLinkInput {
  source_ref?: string;
  target_ref: string;
  relationship_type: 'applies_to' | 'application_contact' | 'referee' | 'related_to';
  role?: RefereeRole | string | null;
  context_key?: string | null;
  context_ref?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateApplicationInput {
  position_title: string;
  advertisement?: {
    title?: string | null;
    url?: string | null;
    source?: string | null;
    summary?: string | null;
    captured_at?: string | null;
  };
  closing_date?: string | null;
  documents?: Array<Partial<ApplicationDocument> & { document_type: string; label: string; version: string; status: string }>;
  selection_criteria?: Array<Partial<SelectionCriterion> & { criterion: string; order: number; completed: boolean }>;
  interview_rounds?: Array<Partial<InterviewRound> & { format: string; lifecycle_state: string }>;
  links?: ApplicationLinkInput[];
}

export interface CreateApplicationResult {
  application: ApplicationRecord;
  links: unknown[];
  created: boolean;
}

export interface ApplicationTaskLinkOperation {
  operation_id: string;
  status: string;
  task_id: string | null;
  title?: string | null;
  relationship_type: string;
  completed_intent_ids: string[];
  completed_link_ids: string[];
  failed_intent_ids: string[];
  pending_intent_ids: string[];
}

export function listApplications(
  options: { signal?: AbortSignal } = {}
): Promise<{ applications: ApplicationRecord[] }> {
  return apiGet('/api/applications', { signal: options.signal });
}

export function getApplication(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ application: ApplicationRecord }> {
  const params = new URLSearchParams({ id });
  return apiGet(`/api/applications?${params.toString()}`, { signal: options.signal });
}

export function createApplication(
  body: CreateApplicationInput,
  options: { signal?: AbortSignal } = {}
): Promise<CreateApplicationResult> {
  return apiPost<CreateApplicationResult>('/api/applications', body, { signal: options.signal });
}

export function updateApplication(
  id: string,
  patch: {
    position_title?: string;
    advertisement?: CreateApplicationInput['advertisement'];
    closing_date?: string | null;
    documents?: Array<Partial<ApplicationDocument> & {
      document_type: string;
      label: string;
      version: string;
      status: string;
    }>;
    selection_criteria?: Array<Partial<SelectionCriterion> & {
      criterion: string;
      order: number;
      completed: boolean;
    }>;
    interview_rounds?: Array<Partial<InterviewRound> & {
      format: string;
      lifecycle_state: string;
    }>;
    outcome?: {
      status?: OutcomeStatus;
      date?: string | null;
      offer_details?: string | null;
      reason?: string | null;
    };
    reflection?: string | null;
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ application: ApplicationRecord }> {
  const params = new URLSearchParams({ id });
  return apiPatch(`/api/applications?${params.toString()}`, patch, { signal: options.signal });
}

export function transitionApplication(
  id: string,
  pipelineStatus: ApplicationPipelineStatus,
  options: { signal?: AbortSignal } = {}
): Promise<{ application: ApplicationRecord }> {
  const params = new URLSearchParams({ id, action: 'transition' });
  return apiPost(`/api/applications?${params.toString()}`, { pipeline_status: pipelineStatus }, {
    signal: options.signal
  });
}

export function retryApplicationLinks(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<CreateApplicationResult> {
  const params = new URLSearchParams({ id, action: 'retry-links' });
  return apiPost(`/api/applications?${params.toString()}`, {}, { signal: options.signal });
}

export function linkApplicationTask(
  id: string,
  body: { relationship_type: 'application_action'; title?: string; task_id?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ application: ApplicationRecord; operation: ApplicationTaskLinkOperation }> {
  const params = new URLSearchParams({ id, action: 'link-task' });
  return apiPost(`/api/applications?${params.toString()}`, body, { signal: options.signal });
}

export function retryApplicationTaskLink(
  id: string,
  operationId: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ application: ApplicationRecord; operation: ApplicationTaskLinkOperation }> {
  const params = new URLSearchParams({ id, action: 'retry-task-link' });
  return apiPost(`/api/applications?${params.toString()}`, { operation_id: operationId }, {
    signal: options.signal
  });
}

export function isApplicationIncompleteLinksError(err: unknown): err is ApiClientError & {
  data: {
    application_id: string;
    operation_id: string;
    completed_link_ids: string[];
    failed_intent_ids: string[];
  };
} {
  return (
    err instanceof ApiClientError &&
    err.code === 'application_links_incomplete' &&
    typeof (err as ApiClientError & { data?: unknown }).data === 'object'
  );
}

export function isApplicationTaskLinkIncompleteError(err: unknown): err is ApiClientError & {
  data: { operation_id: string; task_id?: string | null };
} {
  return err instanceof ApiClientError && err.code === 'professional_task_link_incomplete';
}
