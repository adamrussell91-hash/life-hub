export type PsModelId = 'seven_step' | 'polya' | 'triz';
export type PsToolId = 'five_whys' | 'problem_tree' | 'concept_map' | 'gap_basic' | 'gap_radar' | 'problem_statement' | 'smart' | 'contradiction' | 'causal_map' | 'perspective_shift' | 'radial_tree' | 'force_field' | 'from_to' | 'intent_statement' | 'problem_reduction' | 'analogical_reasoning' | 'solution_tree' | 'lotus_blossom' | 'duncker' | 'decision_matrix' | 'swot' | 'morphological' | 'pareto' | 'dmaic' | 'fifteen_percent' | 'kanban' | 'eisenhower' | 'after_action_review' | 'double_loop' | 'feedback_matrix' | 'five_cs' | 'knowledge_management';

export type PsNode = { id: string; slot: string; text: string; title?: string; tag?: string; state: 'accepted' | 'contested'; objection?: string; skills: string[]; turnId: string | null };
export type PsEdge = { from: string; to: string; kind: string };
export type PsToolRun = { id: string; tool: PsToolId; status: 'active' | 'done' | 'switched'; switchReason?: string; nodes: PsNode[]; edges: PsEdge[]; radar?: { snapshots: { at: string; current: number[]; objective: number[] }[] }; scores?: { snapshots: Array<{ at: string } & Record<string, unknown>> } };
export type PsTurn = { id: string; role: 'user' | 'coach'; text: string; verdict?: 'accept' | 'challenge' | 'clarify'; skillsSeen?: string[]; skillsMissing?: string[]; createdAt: string };

export type PsStepStatus = 'open' | 'done' | 'skipped' | 'waiting';

/** Improve's review: waiting for results, under way, or done. `returnTo` is where a late review goes back to. */
export type PsReviewState = { status: 'waiting' | 'reviewing' | 'done'; due: string | null; returnTo: string | null; startedAt: string | null };
/** Counts of the problem's tasks by live status, and overdue titles. Posted by the page; deleted tasks are left out. */
export type PsTaskSnapshot = { at: string; byStatus: Record<'open' | 'in_progress' | 'deferred' | 'done' | 'dead' | 'unknown', number>; overdue: string[] };
/** A step reopened from Improve; Move on returns to `from`. */
export type PsDetour = { from: string; to: string; reason: string; at: string };
export type PsStepState = { runs: PsToolRun[]; status: PsStepStatus; objection: string | null };

export type PsSuggestion =
  | { kind: 'next_tool' | 'switch_tool'; tool: PsToolId; reason: string }
  | { kind: 'next_step'; reason: string }
  | { kind: 'reopen_step'; step: 'define' | 'analyse'; reason: string }
  | { kind: 'escalate'; reason: string };

export type PsProposedTask = {
  id: string;
  title: string;
  status: 'proposed' | 'confirmed' | 'dismissed';
  due: string | null;
  taskId?: string;
  /** Set when a confirmed task was deleted in Tasks and the proposal reverted. */
  removed?: boolean;
  source: { runId: string; nodeId: string };
};
export type PsReviewProposal = { title: string; due: string; reason: string; status: 'proposed' | 'confirmed' | 'dismissed' };
/** A confirmed task's live state, passed from the page to a chart (never stored). */
export type PsLightningNodeId = 'start' | 'goal' | 'subtract' | 'one_step' | 'via_negativa' | 'guess_check' | 'diagram' | 'solved_1' | 'work_backwards' | 'solved_2' | 'make_list' | 'solved_3' | 'take_break' | 'solved_4' | 'analogy' | 'solved_5' | 'reframing' | 'cannot' | 'relax' | 'learn' | 'next';
export type PsLightningEntry = { node: PsLightningNodeId; round: number; at: string; answer?: 'yes' | 'no'; note?: string };
export type PsLightningState = { path: PsLightningEntry[]; rounds: number; finishedAt: string | null; escalatedTo: string | null };
export type PsLightningTried = { node: PsLightningNodeId; label: string; note: string | null; outcome: 'solved' | 'not solved' | null; round: number };
/** What an escalated full session starts from; seeds, not answers, until the coach confirms them. */
export type PsFrameSeeds = { goal: string | null; whatIsTrue: string | null; tried: PsLightningTried[] };

export type PsTaskLink = { nodeId: string; taskId: string; status: string };

export type PsSession = {
  id: string;
  title: string;
  revision: number;
  kind: 'full' | 'lightning';
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
  /** Tasks the coach proposed from Implement nodes; the page creates them in Tasks. */
  proposedTasks: PsProposedTask[];
  reviewProposal: PsReviewProposal | null;
  reviewTaskId: string | null;
  reviewState: PsReviewState | null;
  caseFile: PsCaseFileRecord | null;
  /** The key of a case-file offer set aside with Not now. */
  caseFileDeclined: string | null;
  lightning: PsLightningState | null;
  escalatedFrom: string | null;
  frameSeeds: PsFrameSeeds | null;
  taskSnapshot: PsTaskSnapshot | null;
  detour: PsDetour | null;
  createdAt: string;
  updatedAt: string;
};

export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full' | 'lightning'; escalatedTo?: string | null; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number>; taskIds?: string[]; reviewTaskId?: string | null; reviewDue?: string | null };

export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'move_on' | 'rename' | 'archive' | 'score' | 'rescore_radar' | 'retry' | 'confirm_task' | 'dismiss_task' | 'set_review_task' | 'dismiss_review' | 'start_review' | 'task_status' | 'link_case_file' | 'dismiss_case_file' | 'lightning_answer' | 'lightning_again' | 'escalate';

export type PsCaseFileTarget = { kind: 'task' | 'project'; id: string };
/** What was written where: the section digests written, so later changes can be found. */
export type PsCaseFileRecord = { title: string; version: number; target: PsCaseFileTarget; writtenAt: string; sections: Record<string, string>; history: { version: number; at: string; target: PsCaseFileTarget }[] };
export type PsCaseFileSection = { key: string; heading: string; lines: string[] };
export type PsCaseFile = { title: string; version: number; sections: PsCaseFileSection[] };
export type PsCaseFileOffer = { kind: 'write' | 'update'; version: number; file: PsCaseFile; digests: Record<string, string>; key: string; changed: string[] };
