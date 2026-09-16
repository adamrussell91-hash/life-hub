import { apiGet } from './client';
import type { NetworkEcologyEgo, NetworkEcologyWorld, SelfPersonResponse } from '@/domain/types';

/** `GET /api/network-ecology/world` (Phase 4, Feature 4.1). */
export function fetchNetworkEcologyWorld(options: { signal?: AbortSignal } = {}): Promise<NetworkEcologyWorld> {
  return apiGet<NetworkEcologyWorld>('/api/network-ecology/world', { signal: options.signal });
}

/** `GET /api/network-ecology/ego?ref=<ref>&hops=<n>` (Phase 4, Feature
 * 4.3 — EGO Ecology recentre; also reused by Feature 4.4's Your Network
 * mode, anchored on the self Person's ref instead of a selected person's). */
export function fetchNetworkEcologyEgo(
  ref: string,
  hops = 2,
  options: { signal?: AbortSignal } = {}
): Promise<NetworkEcologyEgo> {
  const params = new URLSearchParams({ ref, hops: String(hops) });
  return apiGet<NetworkEcologyEgo>(`/api/network-ecology/ego?${params.toString()}`, { signal: options.signal });
}

/** `GET /api/people/self` (Phase 4, Feature 4.4 support) — the active self
 * Person's ref, needed before Your Network mode can call
 * `fetchNetworkEcologyEgo` anchored on "me" rather than a selected person.
 * See `netlify/functions/people-self.mjs` for why this is a small
 * dedicated route rather than reusing `/api/career` (which computes the
 * same lookup internally but does not expose it, and does several
 * unrelated queries this caller does not need). */
export function fetchSelfPerson(options: { signal?: AbortSignal } = {}): Promise<SelfPersonResponse> {
  return apiGet<SelfPersonResponse>('/api/people/self', { signal: options.signal });
}
