export type Step = 'starting' | 'building' | 'secure' | 'extending';
export type Rung = 'below' | 'capable' | 'skilled' | 'accomplished' | 'excellent';
export type Place = Step | Rung;
export type Story =
  | { kind: 'holding'; step: Place; count: number; code_id: string | null }
  | { kind: 'moved_up'; from: Place; to: Place; piece_id: string }
  | { kind: 'few'; count: number }
  | { kind: 'now'; step: Place };
export type PieceCol = { id: string; label: string; date: string; kind: 'written' | 'viva' | 'assessment' | 'quiz' };
export type TargetRow = { key: string; name: string; sub: string; cells: (Place | null)[]; now: Place | null; story: Story; looks: string | null };
export type SkillRow = {
  key: string; name: string; counts: Record<Rung, number>; now: Rung; story: Story; i_can: string | null; next_move: string | null; next_rung: Rung | null;
  /** Each rung's "I can" line, for looking along the ladder. */
  rungs?: Record<Exclude<Rung, 'below'>, string | null>;
  /** At the top rung only: how to keep sharpening. */
  refine?: string | null;
};
export type CodeRow = { code_id: string; code: string; label: string; colour: string; positive: boolean; cells: (number | null)[]; hit: number; of: number; total: number; dropped: boolean };
export type CodeTrend = 'new' | 'more' | 'less' | 'steady';
/** One place a code was marked: the student's own words it covers and the teacher's note, when there are any. */
export type CodeHit = { piece_id: string; title: string; date: string; words: string | null; note: string | null };
export type FeedbackRow = { code_id: string; code: string; label: string; colour: string; positive: boolean; cells: (number | null)[]; hit: number; of: number; total: number; trend: CodeTrend; hits: CodeHit[]; do: string | null };
/** "What your feedback keeps saying": the newest few pieces only. */
export type FeedbackPayload = { pieces: PieceCol[]; rows: FeedbackRow[] };
export type Resource = { kind: 'link' | 'video'; url: string; title?: string; start?: number };
export type NextStep = { code_id: string; code: string; colour: string; positive: boolean; hit: number; of: number; action: string; resource?: Resource };
export type ProgressPayload = {
  need: null; initials: string; pieces: PieceCol[]; outcomes: TargetRow[]; concepts: TargetRow[];
  skills: { strand: string; rows: SkillRow[] }[]; codes: CodeRow[]; feedback?: FeedbackPayload; next: NextStep[]; unseen: number; has_returned?: boolean; map: unknown;
};
export type ReturnedItem = { id: string; kind: 'written' | 'viva' | 'quiz' | 'answer' | 'note'; title: string; date: string; new: boolean; codes: string[]; redraft?: 'asked' | 'sent' };
