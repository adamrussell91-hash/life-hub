import { apiPost } from './client';

export interface LinkedInReviewRow {
  id: string;
  section: 'current' | 'past' | 'education';
  relationship_type: 'employee_at' | 'member_of' | 'studied_at';
  title: string | null;
  organisation: { name: string; ref: string | null; status: 'matched' | 'new_organisation' };
  /** "YYYY" or "YYYY-MM". */
  start: string | null;
  end: string | null;
  current: boolean;
  /** Against an existing person: same (hidden by default), changed (dates differ) or new. */
  diff: 'new' | 'same' | 'changed';
  link_id: string | null;
}

export interface LinkedInParseResult {
  name: string | null;
  headline: string | null;
  about: string | null;
  rows: LinkedInReviewRow[];
}

export const LINKEDIN_TEXT_CAP = 30_000;

/** `POST /api/people/linkedin-parse` — reads a pasted profile; saves nothing. */
export function parseLinkedInPaste(body: { text: string; person_ref?: string | null }): Promise<LinkedInParseResult> {
  return apiPost('/api/people/linkedin-parse', body);
}
