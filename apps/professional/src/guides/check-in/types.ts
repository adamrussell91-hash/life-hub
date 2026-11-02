/** Check-in: a protocol guide. The wording loads from the private repo; the record is sealed on the server. */
export const CHECK_IN_STEP_IDS = ['open', 'safety', 'listen', 'hope', 'help'] as const;
export type CheckInStepId = (typeof CHECK_IN_STEP_IDS)[number];

export interface CheckInStepText {
  id: CheckInStepId;
  title: string;
  ask: string;
  hint?: string;
  say: string[];
  listen: string[];
  chips?: Array<{ label: string; items: string[] }>;
}

export interface CheckInSideText {
  id: string;
  label: string;
  ask: string;
  hint?: string;
  steps: string[];
  report: boolean;
}

export interface CheckInText {
  version: 1;
  steps: CheckInStepText[];
  sides: CheckInSideText[];
  safety: { title: string; steps: string[]; contacts: Array<{ role: string; how: string }> };
  follow_ups: string[];
  sources: string[];
}

export type CheckInSafety = 'none' | 'concern' | null;
export type CheckInReport = 'not_needed' | 'to_do' | 'made' | null;

export interface CheckInRecord {
  id: string;
  meeting_id: string;
  person_ref: string;
  person_name: string;
  safety: CheckInSafety;
  sides: string[];
  lines: Partial<Record<CheckInStepId, string>>;
  said: string;
  help: string[];
  handed_to: string;
  follow_ups: string[];
  report: CheckInReport;
  created_at: string;
  updated_at: string;
}

/** What a list returns: who, which meeting, when. */
export interface CheckInSummary {
  id: string;
  meeting_id: string;
  person_ref: string;
  person_name: string;
  created_at: string;
  updated_at: string;
}
