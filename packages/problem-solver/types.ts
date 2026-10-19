export type PsModelId = 'seven_step' | 'polya' | 'triz';
export type PsToolId = 'five_whys' | 'problem_tree' | 'concept_map' | 'gap_basic' | 'gap_radar' | 'problem_statement' | 'smart' | 'contradiction' | 'causal_map' | 'perspective_shift' | 'radial_tree' | 'force_field' | 'from_to' | 'intent_statement';

export type PsNode = { id: string; slot: string; text: string; title?: string; tag?: string; state: 'accepted' | 'contested'; objection?: string; skills: string[]; turnId: string | null };
export type PsEdge = { from: string; to: string; kind: string };
export type PsToolRun = { id: string; tool: PsToolId; status: 'active' | 'done' | 'switched'; switchReason?: string; nodes: PsNode[]; edges: PsEdge[]; radar?: { snapshots: { at: string; current: number[]; objective: number[] }[] }; scores?: { snapshots: Array<{ at: string } & Record<string, unknown>> } };
export type PsTurn = { id: string; role: 'user' | 'coach'; text: string; verdict?: 'accept' | 'challenge' | 'clarify'; skillsSeen?: string[]; skillsMissing?: string[]; createdAt: string };

export type PsStepStatus = 'open' | 'done' | 'skipped';
export type PsStepState = { runs: PsToolRun[]; status: PsStepStatus; objection: string | null };

export type PsSuggestion =
  | { kind: 'next_tool' | 'switch_tool'; tool: PsToolId; reason: string }
  | { kind: 'next_step'; reason: string };

export type PsSession = {
  id: string;
  title: string;
  revision: number;
  kind: 'full';
  status: 'active' | 'finished' | 'archived';
  /** 'frame', a plan step id from steps.mjs, or 'finished'. */
  phase: string;
  frame: { goal?: string; whatIsTrue?: string; whatCanBeDone?: string };
  model: { id: PsModelId; reason: string } | null;
  links: { kind: 'task' | 'project' | 'goal'; id: string }[];
  steps: Record<string, PsStepState>;
  learnings: { step: string; text: string; at: string }[];
  /** The step just left, while the coach waits for what was learned there. */
  pendingLearning: string | null;
  turns: PsTurn[];
  summary: string;
  suggestion: PsSuggestion | null;
  /** The step whose opening tool suggestion was dismissed with Not now; it stays away there. */
  dismissedOpening?: string | null;
  pendingKeep: { slot: string; text: string; objection: string } | null;
  runner: { status: 'idle' | 'queued' | 'running' | 'failed'; mode: 'turn' | 'boundary'; error: string | null; leaving?: string };
  createdAt: string;
  updatedAt: string;
};

export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full'; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number> };

export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'move_on' | 'rename' | 'archive' | 'score' | 'rescore_radar' | 'retry';
