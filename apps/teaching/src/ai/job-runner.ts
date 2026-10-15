import { AI_TOOLS, parseToolProposal, type AiProposal } from '@/ai/proposals';
import { buildAiLessonContext, buildAiStaticPrompt } from '@/ai/context';
import { emptySearchPack } from '@/ai/search-pack';
import { validateMutatingProposal } from '@/ai/validate-proposal';
import type { AiJob } from '@/ai/jobs';
import type { Lesson } from '@/schemas/lesson';

/**
 * Server-side runner for a queued Teaching AI job. Pure apart from the
 * injected `complete` call, so it is unit tested here and bundled into
 * `netlify/functions/_shared/teaching-ai-runtime.mjs` for the Netlify runner.
 */

export const TEACHING_AI_MODELS = {
  fast: 'claude-haiku-5-5',
  standard: 'claude-sonnet-5-5'
} as const;

export type ModelTier = keyof typeof TEACHING_AI_MODELS;
export type Effort = 'low' | 'medium' | 'high';

export interface ModelAttempt {
  tier: ModelTier;
  effort: Effort;
}

/** Quick actions that reshape content rather than judge it: cheap model first. */
const MECHANICAL_ACTIONS = new Set([
  'shorten',
  'simplify',
  'change_reading_level',
  'summarise',
  'write_alt_text',
  'generate_answers'
]);

/** Free-typed requests that are conversions, e.g. "turn this glossary into flashcards". */
const MECHANICAL_MESSAGE =
  /\b(flash ?cards?|flip ?cards?|cloze|glossary|vocab(?:ulary)?|alt text|reformat|convert|turn (?:this|these|it|them) into)\b/i;

export type Lane = 'fast' | 'standard';

export function pickLane(job: Pick<AiJob, 'action' | 'protocol_id' | 'message'>): Lane {
  if (job.protocol_id) return 'standard';
  if (job.action) return MECHANICAL_ACTIONS.has(job.action) ? 'fast' : 'standard';
  return MECHANICAL_MESSAGE.test(job.message) ? 'fast' : 'standard';
}

/** Each lane steps up once when the first answer fails the block checks. */
export function attemptsForLane(lane: Lane): ModelAttempt[] {
  return lane === 'fast'
    ? [
        { tier: 'fast', effort: 'low' },
        { tier: 'standard', effort: 'medium' }
      ]
    : [
        { tier: 'standard', effort: 'medium' },
        { tier: 'standard', effort: 'high' }
      ];
}

export type SystemBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

export type ModelMessage = { role: 'user' | 'assistant'; content: string };

export interface ModelRequest {
  model: string;
  tier: ModelTier;
  effort: Effort;
  max_tokens: number;
  system: SystemBlock[];
  tools: typeof AI_TOOLS;
  messages: ModelMessage[];
}

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: string; [key: string]: unknown };

export interface ModelUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface ModelReply {
  model?: string;
  stop_reason?: string | null;
  content: ModelContentBlock[];
  usage?: ModelUsage;
}

export interface AttemptUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
  outcome: 'ok' | 'invalid' | 'refused' | 'truncated' | 'failed';
}

export interface RunLessonJobInput {
  job: AiJob;
  lesson: Lesson;
  agentName: string;
  protocol: string;
  complete: (request: ModelRequest) => Promise<ModelReply>;
  models?: Partial<Record<ModelTier, string>>;
}

export interface RunLessonJobResult {
  status: 'done' | 'error';
  response?: string;
  proposal?: AiProposal;
  error?: string;
  model?: string;
  usage: AttemptUsage[];
  cost_usd: number;
}

/** USD per million tokens. Cache reads ~0.1x input, 5-minute cache writes 1.25x. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 }
};

export function estimateCostUsd(model: string, usage: ModelUsage | undefined): number {
  const price = PRICES[model];
  if (!price || !usage) return 0;
  const perToken = (rate: number) => rate / 1_000_000;
  const cost =
    (usage.input_tokens ?? 0) * perToken(price.input) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(price.input * 1.25) +
    (usage.cache_read_input_tokens ?? 0) * perToken(price.cacheRead) +
    (usage.output_tokens ?? 0) * perToken(price.output);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

const MAX_TOKENS = 32000;

function buildMessages(job: AiJob, retryNote: string | null): ModelMessage[] {
  const history = (job.history ?? [])
    .filter((turn) => turn.content.trim())
    .map((turn) => ({ role: turn.role, content: turn.content }));
  // The API needs alternating turns that start with the user.
  const messages: ModelMessage[] = [];
  for (const turn of history) {
    const last = messages[messages.length - 1];
    if (!last && turn.role === 'assistant') continue;
    if (last && last.role === turn.role) last.content += `\n\n${turn.content}`;
    else messages.push({ ...turn });
  }
  const current = retryNote ? `${job.message}\n\n${retryNote}` : job.message;
  const last = messages[messages.length - 1];
  if (last?.role === 'user') last.content += `\n\n${current}`;
  else messages.push({ role: 'user', content: current });
  return messages;
}

type Interpreted =
  | { kind: 'ok'; response: string; proposal?: AiProposal }
  | { kind: 'invalid'; response: string; error: string }
  | { kind: 'refused' }
  | { kind: 'truncated' };

function interpret(reply: ModelReply): Interpreted {
  if (reply.stop_reason === 'refusal') return { kind: 'refused' };
  if (reply.stop_reason === 'max_tokens') return { kind: 'truncated' };
  const response = reply.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  const toolUses = reply.content.filter(
    (block): block is { type: 'tool_use'; name: string; input: unknown } => block.type === 'tool_use'
  );
  if (toolUses.length === 0) return { kind: 'ok', response };
  const emptyPack = emptySearchPack('');
  for (const call of toolUses) {
    const parsed = parseToolProposal(call.name, call.input);
    if ('error' in parsed) {
      return { kind: 'invalid', response, error: `${call.name}: ${parsed.error}` };
    }
    const checked = safeValidate(parsed, emptyPack);
    if (!checked.ok) return { kind: 'invalid', response, error: checked.error };
    // One proposal per turn: the panel shows a single Confirm card.
    return { kind: 'ok', response, proposal: parsed };
  }
  return { kind: 'ok', response };
}

/**
 * The SVG diagram check needs DOMParser, which Node lacks. There the proposal
 * keeps its schema check and the diagram is re-checked when the lesson publishes.
 */
function safeValidate(
  proposal: AiProposal,
  pack: ReturnType<typeof emptySearchPack>
): { ok: true } | { ok: false; error: string } {
  try {
    return validateMutatingProposal(proposal, pack);
  } catch (error) {
    if (typeof DOMParser === 'undefined' && error instanceof ReferenceError) return { ok: true };
    throw error;
  }
}

function truncateError(error: string): string {
  return error.length > 1200 ? `${error.slice(0, 1200)}…` : error;
}

export async function runLessonAiJob(input: RunLessonJobInput): Promise<RunLessonJobResult> {
  const { job, lesson } = input;
  const models = { ...TEACHING_AI_MODELS, ...input.models };
  const staticPrompt = buildAiStaticPrompt({ agentName: input.agentName, protocol: input.protocol });
  const lessonContext = buildAiLessonContext({
    agentName: input.agentName,
    protocol: input.protocol,
    lesson,
    scope: job.scope ?? 'lesson',
    selectedBlockId: job.selected_block_id ?? null,
    // Fixed fields so the lesson context stays byte-identical across turns.
    searchPack: emptySearchPack('', lesson.updated_at),
    action: job.action,
    fullLesson: true
  });
  // Two cache points: the agent's static prefix (shared by every lesson) and
  // the lesson context (shared by every turn on this lesson until it changes).
  const system: SystemBlock[] = [
    { type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: lessonContext, cache_control: { type: 'ephemeral' } }
  ];

  const usage: AttemptUsage[] = [];
  let retryNote: string | null = null;
  let lastProblem = 'The agent could not produce a usable answer.';

  for (const attempt of attemptsForLane(pickLane(job))) {
    const model = models[attempt.tier];
    let reply: ModelReply;
    try {
      reply = await input.complete({
        model,
        tier: attempt.tier,
        effort: attempt.effort,
        max_tokens: MAX_TOKENS,
        system,
        tools: AI_TOOLS,
        messages: buildMessages(job, retryNote)
      });
    } catch (error) {
      usage.push({
        model,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cost_usd: 0,
        outcome: 'failed'
      });
      lastProblem = error instanceof Error ? error.message : 'The model request failed.';
      continue;
    }

    let result: Interpreted;
    try {
      result = interpret(reply);
    } catch (error) {
      result = {
        kind: 'invalid',
        response: '',
        error: error instanceof Error ? error.message : 'The proposal could not be checked.'
      };
    }
    const servedBy = reply.model ?? model;
    usage.push({
      model: servedBy,
      input_tokens: reply.usage?.input_tokens ?? 0,
      output_tokens: reply.usage?.output_tokens ?? 0,
      cache_read_input_tokens: reply.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: reply.usage?.cache_creation_input_tokens ?? 0,
      cost_usd: estimateCostUsd(servedBy, reply.usage),
      outcome: result.kind
    });

    if (result.kind === 'ok') {
      return {
        status: 'done',
        response: result.response,
        proposal: result.proposal,
        model: servedBy,
        usage,
        cost_usd: totalCost(usage)
      };
    }
    if (result.kind === 'refused') {
      lastProblem = 'The model declined this request.';
      break;
    }
    if (result.kind === 'truncated') {
      lastProblem = 'The answer was too long and got cut off. Try asking for a smaller piece.';
      retryNote =
        'Your previous answer was cut off for length. Propose a smaller change (split large builds across turns) and say so.';
      continue;
    }
    lastProblem = `The proposal failed the block checks: ${truncateError(result.error)}`;
    retryNote = [
      'Your previous proposal failed validation and was not shown to the teacher:',
      truncateError(result.error),
      'Fix it and propose again. If the request cannot fit the limits, say so plainly instead.'
    ].join('\n');
  }

  return { status: 'error', error: lastProblem, usage, cost_usd: totalCost(usage) };
}

function totalCost(usage: AttemptUsage[]): number {
  return Math.round(usage.reduce((sum, row) => sum + row.cost_usd, 0) * 1_000_000) / 1_000_000;
}
