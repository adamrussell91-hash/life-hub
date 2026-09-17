import { apiGet, apiPost } from './client';
import type { ObservationRecord } from '@/domain/types';

export type { ObservationRecord };

export interface ObservationRequestOptions {
  signal?: AbortSignal;
}

export interface ObservationsListResult {
  observations: ObservationRecord[];
}

export interface CreateObservationInput {
  about_ref: string;
  text: string;
  occurred_at: string;
  source: ObservationRecord['source'];
  linked_ref?: string | null;
}

export interface CreateObservationResult {
  observation: ObservationRecord;
  created: boolean;
}

/** `GET /api/observations?about_ref=<encoded ref>` — newest `occurred_at` first, per the server contract. */
export function fetchObservations(
  aboutRef: string,
  options: ObservationRequestOptions = {}
): Promise<ObservationsListResult> {
  const params = new URLSearchParams({ about_ref: aboutRef });
  return apiGet<ObservationsListResult>(`/api/observations?${params.toString()}`, {
    signal: options.signal
  });
}

/** `POST /api/observations` */
export function createObservation(
  input: CreateObservationInput,
  options: ObservationRequestOptions = {}
): Promise<CreateObservationResult> {
  return apiPost<CreateObservationResult>('/api/observations', input, { signal: options.signal });
}
