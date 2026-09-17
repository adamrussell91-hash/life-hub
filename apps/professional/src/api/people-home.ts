import { apiGet } from './client';
import type {
  PeopleActivityResponse,
  PeopleCohortsResponse,
  PeopleHomeSignalsResponse
} from '@/domain/types';

export interface PeopleHomeRequestOptions {
  signal?: AbortSignal;
}

/** `GET /api/people/home-signals` — signal counts + People Today modules. */
export function fetchPeopleHomeSignals(
  options: PeopleHomeRequestOptions = {}
): Promise<PeopleHomeSignalsResponse> {
  return apiGet<PeopleHomeSignalsResponse>('/api/people/home-signals', { signal: options.signal });
}

/** `GET /api/people/cohorts` — Dynamic Cohorts. */
export function fetchPeopleCohorts(
  options: PeopleHomeRequestOptions = {}
): Promise<PeopleCohortsResponse> {
  return apiGet<PeopleCohortsResponse>('/api/people/cohorts', { signal: options.signal });
}

export interface FetchPeopleActivityParams extends PeopleHomeRequestOptions {
  since?: string | null;
  limit?: number;
}

/** `GET /api/people/activity?since=<cursor>&limit=<n>` — Recent Activity strip, paginated. */
export function fetchPeopleActivity(
  params: FetchPeopleActivityParams = {}
): Promise<PeopleActivityResponse> {
  const search = new URLSearchParams();
  if (params.since) search.set('since', params.since);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const query = search.toString();
  return apiGet<PeopleActivityResponse>(`/api/people/activity${query ? `?${query}` : ''}`, {
    signal: params.signal
  });
}
