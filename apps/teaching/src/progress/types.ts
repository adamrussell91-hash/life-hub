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
export type SkillRow = { key: string; name: string; counts: Record<Rung, number>; now: Rung; story: Story; i_can: string | null; next_move: string | null; next_rung: Rung | null };
export type CodeRow = { code_id: string; code: string; label: string; colour: string; positive: boolean; cells: (number | null)[]; hit: number; of: number; total: number; dropped: boolean };
export type Resource = { kind: 'link' | 'video'; url: string; title?: string; start?: number };
export type NextStep = { code_id: string; code: string; colour: string; positive: boolean; hit: number; of: number; action: string; resource?: Resource };
export type ProgressPayload = {
  need: null; initials: string; pieces: PieceCol[]; outcomes: TargetRow[]; concepts: TargetRow[];
  skills: { strand: string; rows: SkillRow[] }[]; codes: CodeRow[]; next: NextStep[]; unseen: number; map: unknown;
};
export type ReturnedItem = { id: string; kind: 'written' | 'viva' | 'quiz' | 'note'; title: string; date: string; new: boolean; codes: string[] };
