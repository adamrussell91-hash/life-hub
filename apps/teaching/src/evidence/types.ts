import type { EvidenceItem, Why } from '@/quiz/evidence';

export type { EvidenceItem, Why };
export type Confidence = 1 | 2 | 3 | null;
export type TagKind = 'tech' | 'fam' | 'out' | 'skill' | 'kp' | 'du';
export const TAG_KINDS: TagKind[] = ['tech', 'fam', 'out', 'skill', 'kp', 'du'];
export const TAG_KIND_LABEL: Record<TagKind, string> = { tech: 'Technique', fam: 'Family', out: 'Outcome', skill: 'Skill', kp: 'Knowledge piece', du: 'Deep understanding' };

/** An evidence item placed: whose, from where, when, how sure. */
export type Evidence = EvidenceItem & { student: string; source: string; date: string; confidence: Confidence };

export type InsightRow = {
  id: string;
  awarded: number | null;
  max: number;
  confidence: Confidence;
  codes: string[];
  outcomes: string[];
  items: EvidenceItem[];
};
export type InsightAttempt = { student: string; attempt_id: string; submitted_at: string; score: number; max: number; pending: number; rows: InsightRow[] };
export type InsightQuestion = { id: string; prompt: string; marks: number; kind: string; outcomes: string[] };
export type InsightStudent = { id: string; name: string; initials: string };

/** What the quiz `insight` action returns for one class (or all attempts when `class_id` is null). */
export type InsightPayload = {
  lesson_id: string;
  title: string;
  unit_id: string;
  record_version: string;
  class_id: string | null;
  closed: boolean;
  closed_by: 'button' | 'date' | null;
  built_at: string;
  saved: boolean;
  confidence: boolean;
  students: InsightStudent[];
  questions: InsightQuestion[];
  attempts: InsightAttempt[];
  compare_with: string | null;
  follow_up_of: string | null;
  follow_up_flag: string | null;
  for_students: string[];
  dismissed: string[];
  follow_ups: Array<{ lesson_id: string; title: string; flag: string | null }>;
  siblings: Array<{ lesson_id: string; title: string }>;
};

export type Band = 'weak' | 'developing' | 'secure' | 'thin';
export type StudentBand = Exclude<Band, 'thin'>;

export type TagRow = {
  tag: string;
  mean: number;
  /** Share of items with full marks. */
  full: number;
  /** Share of items with part marks (e.g. found the words, named them wrong). */
  half: number;
  confidence: number | null;
  questions: number;
  band: Band;
  groups: Record<StudentBand, string[]>;
};

export type FlagType = 'sure_wrong' | 'guessing' | 'thin' | 'outlier';
export type Flag = { id: string; type: FlagType; tag: string; students: string[] };

export type MixUp = { tag: string; key: string; why: Why; count: number; students: string[] };
