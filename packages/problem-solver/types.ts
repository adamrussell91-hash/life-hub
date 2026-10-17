export type PsModelId = 'seven_step' | 'polya' | 'triz';
export type PsToolId = 'five_whys' | 'problem_tree' | 'concept_map' | 'gap_basic' | 'gap_radar' | 'problem_statement' | 'smart';

export type PsNode = { id: string; slot: string; text: string; title?: string; state: 'accepted' | 'contested'; objection?: string; skills: string[]; turnId: string | null };
export type PsEdge = { from: string; to: string; kind: string };
export type PsToolRun = { id: string; tool: PsToolId; status: 'active' | 'done' | 'switched'; switchReason?: string; nodes: PsNode[]; edges: PsEdge[]; radar?: { snapshots: { at: string; current: number[]; objective: number[] }[] } };
export type PsTurn = { id: string; role: 'user' | 'coach'; text: string; verdict?: 'accept' | 'challenge' | 'clarify'; skillsSeen?: string[]; skillsMissing?: string[]; createdAt: string };
export type PsSuggestion = { kind: 'next_tool' | 'switch_tool'; tool: PsToolId; reason: string } | { kind: 'finish_define'; reason: string };

export type PsSession = {
  id: string;
  title: string;
  revision: number;
  status: 'active' | 'defined' | 'archived';
  phase: 'frame' | 'define' | 'defined';
  frame: { goal?: string; whatIsTrue?: string; whatCanBeDone?: string };
  model: { id: PsModelId; reason: string } | null;
  links: { kind: 'task' | 'project' | 'goal'; id: string }[];
  define: { runs: PsToolRun[]; finishedEarly: boolean; exitObjection: string | null };
  turns: PsTurn[];
  summary: string;
  suggestion: PsSuggestion | null;
  pendingKeep: { slot: string; text: string; objection: string } | null;
  runner: { status: 'idle' | 'queued' | 'running' | 'failed'; mode: 'turn' | 'closing'; error: string | null };
  createdAt: string;
  updatedAt: string;
};

export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { model: PsModelId | null; tool: PsToolId | null };

export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'finish_define' | 'rename' | 'archive' | 'rescore_radar' | 'retry';
