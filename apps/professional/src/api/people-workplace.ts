import { apiPost } from './client';

export interface SetWorkplaceInput {
  person_ref: string;
  /** Organisation they work at (null = no current workplace). */
  organisation_ref: string | null;
  /** Job title there, e.g. "Head of Department Learning Enrichment". */
  job_title: string | null;
  /** Moving jobs: end the workplace at this organisation. */
  replace_organisation_ref?: string | null;
}

/**
 * One call for organisation + job title. The server keeps the organisation's
 * org chart in step (their box is added, renamed, or released).
 */
export function setPersonWorkplace(
  input: SetWorkplaceInput,
  options: { signal?: AbortSignal } = {}
): Promise<{ workplace: Record<string, unknown> | null; released_organisation_ref: string | null }> {
  return apiPost('/api/people/workplace', input, { signal: options.signal });
}
