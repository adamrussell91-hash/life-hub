import { apiGet, apiPost } from '@/api/client';
import type { Observation, ObservationSummary } from './types';

export function getObservation(id: string): Promise<Observation> {
  return apiGet<{ observation: Observation }>(`/api/classroom-observations?id=${encodeURIComponent(id)}`).then((r) => r.observation);
}

/** Summaries, newest first. `open` limits to status 'open'; `person_ref` to one teacher. */
export function listObservations(filter: { person_ref?: string; open?: boolean } = {}): Promise<ObservationSummary[]> {
  const params = new URLSearchParams();
  if (filter.person_ref) params.set('person_ref', filter.person_ref);
  if (filter.open) params.set('open', '1');
  const qs = params.toString();
  return apiGet<{ observations: ObservationSummary[] }>(`/api/classroom-observations${qs ? `?${qs}` : ''}`).then((r) => r.observations);
}

export function saveObservation(record: Observation): Promise<Observation> {
  return apiPost<{ observation: Observation }>('/api/classroom-observations', { action: 'save', observation: record }).then((r) => r.observation);
}

export function deleteObservation(id: string): Promise<void> {
  return apiPost('/api/classroom-observations', { action: 'delete', id }).then(() => undefined);
}
