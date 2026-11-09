/** The shapes the organiser endpoints send. Stored form: netlify/functions/_shared/organiser.mjs. */
export type OrganiserColumn = { id: string; label: string; hide: boolean };
export type OrganiserKind = 'table' | 'list' | 'sequence';
export type OrganiserRole = 'concept' | 'ideas' | 'facts' | 'vocab' | 'key_lines' | 'story';
export type VocabTier = 1 | 2 | 3;
export type OrganiserLine = { id: string; cells: string[]; lesson_id?: string; also_lesson_ids?: string[]; piece_id?: string; tier?: VocabTier; open?: boolean };
export type OrganiserSection = {
  id: string;
  name: string;
  kind: OrganiserKind;
  role?: OrganiserRole;
  concept_key?: string;
  sentence?: string;
  dot_points?: number[];
  off?: boolean;
  columns?: OrganiserColumn[];
  lines: OrganiserLine[];
};
export type OrganiserWeek = { section_id: string; due: string; reason: string };
export type Organiser = { v?: number; sections: OrganiserSection[]; week?: OrganiserWeek; updated_at?: string };
export type LineStatus = 'released' | 'waiting' | 'lesson_gone';

export type SheetLine = { id: string; cells: string[]; fresh: boolean; tier?: VocabTier; lesson_id?: string; released_on?: string };
export type SheetSection = { id: string; name: string; kind: OrganiserKind; role?: OrganiserRole; sentence?: string; columns?: OrganiserColumn[]; lines: SheetLine[] };
export type Sheet = {
  unit_id: string;
  title: string;
  current: boolean;
  week?: { section_id: string; section_name: string; due: string; reason: string };
  sections: SheetSection[];
};

export type TeacherOrganiser = { organiser: Organiser; status: Record<string, LineStatus>; sheet?: Sheet };

export type OrganiserChange =
  | { op: 'add_section'; name: string; kind?: OrganiserKind; role?: OrganiserRole; concept_key?: string; sentence?: string; columns?: Array<{ id?: string; label: string; hide: boolean }> }
  | { op: 'update_section'; section_id: string; name?: string; kind?: OrganiserKind; sentence?: string; dot_points?: number[]; off?: boolean; columns?: Array<{ id?: string; label: string; hide: boolean }> }
  | { op: 'delete_section'; section_id: string }
  | { op: 'move_section'; section_id: string; to: number }
  | { op: 'add_lines'; section_id: string; lines: Array<{ cells: string[]; lesson_id?: string; piece_id?: string; tier?: VocabTier }> }
  | { op: 'update_line'; line_id: string; cells?: string[]; lesson_id?: string | null; add_lesson_id?: string; remove_lesson_id?: string; piece_id?: string | null; tier?: VocabTier | null }
  | { op: 'delete_line'; line_id: string }
  | { op: 'move_line'; line_id: string; section_id?: string; to: number }
  | { op: 'set_week'; week: OrganiserWeek | null };

/** A line on the end-of-lesson card, with the part of the organiser it belongs to. */
export type EndCardItem = { section: string; text: string };

export type PracticeCard = {
  /** The Leitner box it sits in, and its past answers, oldest first. */
  box?: number;
  history?: Array<{ d: string; ok: boolean }>;
  line_id: string;
  section: string;
  cue_label: string;
  cue: string;
  answer_label: string;
  answer: string;
  more: Array<{ label: string; text: string }>;
  builds?: string;
};
export type PracticeNext = { date: string; count: number } | null;
/** `answered`: cards already answered today. */
export type PracticeLoad = { today: number; cards: PracticeCard[]; next: PracticeNext; boxes?: number[]; answered?: number };
export type OrganiserLoad = { need: null | 'initials' | 'no_list'; sheets: Sheet[]; practice: PracticeLoad | null };
export type ReviewResult = { line_id: string; result: 'got' | 'again' };

export type SuggestEstimate = { kind: 'organiser_suggest'; cost_usd: number; cost_aud: number };
export type SuggestProposal = { line_id: string };
