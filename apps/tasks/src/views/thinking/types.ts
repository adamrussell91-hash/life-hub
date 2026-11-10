// apps/tasks/src/views/thinking/types.ts
// The shapes /api/thinking-threads and its guide send (netlify/functions/_shared/thinking-threads).
export type ThreadStatus = 'open' | 'resting' | 'closed';
export type SessionRole = 'home' | 'detour' | 'handed_on';
export type SessionState = 'open' | 'running' | 'returned' | 'failed' | 'removed';
export type Landing = 'answer' | 'note' | 'dismissed';
export type Joint = 'framed' | 'step_done' | 'before_commit' | 'returned' | 'resumed' | 'recorded' | 'asked';
export type RouteOutcome = 'taken' | 'not_now' | 'shown';

export type Packet = {
  answer: string;
  detail: string;
  restsOn: string[];
  openQuestions: string[];
  actions: string[];
  source: { tool: string; sessionId: string };
};

export type ThreadSession = {
  kind: 'tool' | 'protocol';
  tool: string;
  sessionId: string;
  role: SessionRole;
  from: { sessionId: string; stepId: string | null } | null;
  question: string | null;
  /** A Thought Starter detour: the chapter and the question ids chosen for it. */
  questions?: { chapterId: string; questionIds: string[] };
  state: SessionState;
  packet: Packet | null;
  landing: Landing | null;
  addedAt?: string;
  returnedAt?: string;
};

export type ThreadRoute = { at: string; joint: Joint; optionId: string; reason: string | null; outcome: RouteOutcome; stepId: string | null; sessionId: string | null };
export type Digest = { facts: string[]; choices: string[]; restsOn: string[]; openQuestions: string[] };

export type Thread = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  situation: string;
  status: ThreadStatus;
  restUntil: string | null;
  digest: Digest;
  sessions: ThreadSession[];
  route: ThreadRoute[];
  links: { kind: 'page' | 'project'; id: string }[];
  lastCheckAt: string | null;
};

/** The small row the thread list sends. */
export type ThreadRow = { id: string; title: string; status: ThreadStatus; restUntil: string | null; listed: boolean; sessionCount: number; home: { tool: string; sessionId: string } | null; createdAt: string; updatedAt: string };

export type DetourOpen = { tool: string; sessionId: string; route: string; questions?: { chapterId: string; questionIds: string[] } };
export type ProtocolDraft = { protocolId: string; mode: string; intake: Record<string, string> };

export type Triage =
  | { question: string }
  | { start: { optionId: string; reason: string }; likely: string[]; alternative: { optionId: string; reason: string }; fallback?: boolean };

/** A snare the guide saw in the work (before_commit and returned only). Never blocks anything. */
export type Caution = { snareId: string; title: string; line: string; check: string };
export type Verdict = { verdict: 'carry_on' | 'suggest' | 'hand_over'; optionId?: string; reason?: string; why?: string; fallback?: boolean; caution?: Caution };
export type LatestStep = { optionId?: string; title?: string; text?: string };
export type CheckInRequest = { threadId: string; joint: Joint; sessionId: string; stepId?: string | null; latestStep?: LatestStep | null };
