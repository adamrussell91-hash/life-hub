/** The shapes the organiser endpoints send. Stored form: netlify/functions/_shared/organiser.mjs. */
export type OrganiserColumn = { id: string; label: string; hide: boolean };
export type OrganiserKind = 'table' | 'list' | 'sequence';
export type OrganiserLine = { id: string; cells: string[]; lesson_id?: string; piece_id?: string };
export type OrganiserSection = { id: string; name: string; kind: OrganiserKind; columns?: OrganiserColumn[]; lines: OrganiserLine[] };
export type OrganiserWeek = { section_id: string; due: string; reason: string };
export type Organiser = { sections: OrganiserSection[]; week?: OrganiserWeek; updated_at?: string };
export type LineStatus = 'released' | 'waiting' | 'lesson_gone';

export type SheetLine = { id: string; cells: string[]; fresh: boolean; lesson_id?: string; released_on?: string };
export type SheetSection = { id: string; name: string; kind: OrganiserKind; columns?: OrganiserColumn[]; lines: SheetLine[] };
export type Sheet = {
  unit_id: string;
  title: string;
  current: boolean;
  week?: { section_id: string; section_name: string; due: string; reason: string };
  sections: SheetSection[];
};

export type TeacherOrganiser = { organiser: Organiser; status: Record<string, LineStatus>; sheet?: Sheet };

export type OrganiserChange =
  | { op: 'add_section'; name: string; kind: OrganiserKind; columns?: Array<{ id?: string; label: string; hide: boolean }> }
  | { op: 'update_section'; section_id: string; name?: string; kind?: OrganiserKind; columns?: Array<{ id?: string; label: string; hide: boolean }> }
  | { op: 'delete_section'; section_id: string }
  | { op: 'move_section'; section_id: string; to: number }
  | { op: 'add_lines'; section_id: string; lines: Array<{ cells: string[]; lesson_id?: string; piece_id?: string }> }
  | { op: 'update_line'; line_id: string; cells?: string[]; lesson_id?: string | null; piece_id?: string | null }
  | { op: 'delete_line'; line_id: string }
  | { op: 'move_line'; line_id: string; section_id?: string; to: number }
  | { op: 'set_week'; week: OrganiserWeek | null };

export type PracticeCard = {
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
export type PracticeLoad = { today: number; cards: PracticeCard[]; next: PracticeNext };
export type OrganiserLoad = { need: null | 'initials' | 'no_list'; sheets: Sheet[]; practice: PracticeLoad | null };
export type ReviewResult = { line_id: string; result: 'got' | 'again' };

export type SuggestEstimate = { kind: 'organiser_suggest'; cost_usd: number; cost_aud: number };
export type SuggestProposal = {
  section_id?: string;
  new_section?: { name: string; kind: OrganiserKind; columns?: Array<{ label: string; hide: boolean }> };
  cells: string[];
  piece_id?: string;
  tag?: string;
};
