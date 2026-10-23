import { AI_TOOLS, parseToolProposal, type AiProposal } from '@/ai/proposals';
import { buildAiLessonContext, buildAiStaticPrompt } from '@/ai/context';
import { emptySearchPack } from '@/ai/search-pack';
import { validateMutatingProposal } from '@/ai/validate-proposal';
import { quizProposalIssues } from '@/ai/quiz-proposal';
import { findBlockById } from '@/blocks/find-block';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { AiJob } from '@/ai/jobs';
import type { Lesson } from '@/schemas/lesson';

/**
 * Server-side runner for a queued Teaching AI job. The agent works in a short
 * tool loop: it may research (his lessons, web search, his Knowledge Hub notes), then
 * proposes one change. A proposal that fails the block or quiz checks goes
 * back to the agent as a tool error so it can fix it in the same job; the
 * teacher only ever sees a proposal that passed. Pure apart from the injected
 * `complete` and `runTool`, so it is unit tested here and bundled into
 * `netlify/functions/_shared/teaching-ai-runtime.mjs` for the Netlify runner.
 */

export const TEACHING_AI_MODELS = {
  fast: 'claude-haiku-5-5',
  standard: 'claude-sonnet-5-5'
} as const;

export type ModelTier = keyof typeof TEACHING_AI_MODELS;
export type Effort = 'low' | 'medium' | 'high';

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

/**
 * Server web search: a few lookups per job, not a research project. Sonnet 5.5
 * takes the dynamic-filtering version; Haiku 5.5 only the basic one.
 */
export function webSearchTool(tier: ModelTier): ToolDefinition {
  return { type: tier === 'standard' ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: 5 };
}

/** A guard against runaway loops; a quiz build needs about four turns. */
export const MAX_TURNS = 10;
/** Streamed, so one reply can hold a full 30-question proposal with explanations. */
const MAX_TOKENS = 48000;

export type SystemBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '1h' };
};

export type ToolDefinition = {
  name: string;
  description?: string;
  input_schema?: unknown;
  type?: string;
  [key: string]: unknown;
};

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: string; [key: string]: unknown };

export type ModelMessage = {
  role: 'user' | 'assistant';
  content: string | ModelContentBlock[];
};

export interface ModelRequest {
  model: string;
  tier: ModelTier;
  effort: Effort;
  max_tokens: number;
  system: SystemBlock[];
  tools: ToolDefinition[];
  messages: ModelMessage[];
}

export interface ModelUsage {
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export interface ModelReply {
  model?: string;
  stop_reason?: string | null;
  content: ModelContentBlock[];
  usage?: ModelUsage;
}

export interface TurnUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  web_searches: number;
  cost_usd: number;
}

export type RunPhase = 'searching' | 'writing';

export interface RunLessonJobInput {
  job: AiJob;
  lesson: Lesson;
  agentName: string;
  protocol: string;
  complete: (request: ModelRequest) => Promise<ModelReply>;
  /** Extra client tools the server runs (his lessons, Knowledge Hub notes). */
  tools?: ToolDefinition[];
  runTool?: (name: string, input: unknown) => Promise<unknown>;
  /** Adds the server web_search tool. */
  webSearch?: boolean;
  models?: Partial<Record<ModelTier, string>>;
  onPhase?: (phase: RunPhase) => void;
  signal?: AbortSignal;
}

export interface RunLessonJobResult {
  status: 'done' | 'error';
  response?: string;
  proposal?: AiProposal;
  error?: string;
  model?: string;
  turns: number;
  usage: TurnUsage[];
  cost_usd: number;
  /** Problems with proposals the agent had to fix, oldest first, for diagnosing slow or costly jobs. */
  checks: string[];
}

/** USD per million tokens. Cache reads ~0.1x input, 5-minute cache writes 1.25x; $10 per 1,000 searches. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 }
};
const WEB_SEARCH_USD = 0.01;

/** 5-minute cache writes cost 1.25x input, 1-hour writes 2x. */
function cacheWriteCost(usage: ModelUsage, input: number, perToken: (rate: number) => number): number {
  const hour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const total = usage.cache_creation_input_tokens ?? 0;
  return hour * perToken(input * 2) + Math.max(0, total - hour) * perToken(input * 1.25);
}

export function estimateCostUsd(model: string, usage: ModelUsage | undefined): number {
  if (!usage) return 0;
  const price = PRICES[model];
  const perToken = (rate: number) => rate / 1_000_000;
  const tokens = price
    ? (usage.input_tokens ?? 0) * perToken(price.input) +
      cacheWriteCost(usage, price.input, perToken) +
      (usage.cache_read_input_tokens ?? 0) * perToken(price.cacheRead) +
      (usage.output_tokens ?? 0) * perToken(price.output)
    : 0;
  const searches = (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
  return Math.round((tokens + searches) * 1_000_000) / 1_000_000;
}

const PROPOSAL_TOOLS = new Set<string>(AI_TOOLS.map((tool) => tool.name));

/** The heading Ann puts on a plan, so the next turn can tell the plan was sent. */
export const PLAN_MARKER = 'Plan to confirm';
/** Builds bigger than this cost real money, so the teacher confirms a plan first. */
export const BIG_BUILD = { blocks: 8, quizQuestions: 5 } as const;
const GO_AHEAD = /\b(go ahead|just (build|do|make) it|no need to (confirm|check|ask)|skip the plan|don'?t (ask|check) first)\b/i;

/** The teacher has seen a plan (and this message answers it), or told Ann to skip it. */
export function planConfirmed(job: Pick<AiJob, 'history' | 'message'>): boolean {
  if (GO_AHEAD.test(job.message)) return true;
  return (job.history ?? []).some((turn) => turn.role === 'assistant' && turn.content.includes(PLAN_MARKER));
}

function countBuild(proposal: AiProposal): { blocks: number; quizQuestions: number } {
  const blocks =
    proposal.kind === 'insert_blocks' || proposal.kind === 'replace_lesson' || proposal.kind === 'replace_blocks'
      ? proposal.blocks
      : proposal.kind === 'replace_section'
        ? [proposal.section]
        : [];
  let total = 0;
  let quizQuestions = 0;
  visitBlocks(blocks, (block) => {
    total += 1;
    if (block.block_type === 'quiz_question') quizQuestions += 1;
  });
  return { blocks: total, quizQuestions };
}

export function isBigBuild(proposal: AiProposal): boolean {
  const { blocks, quizQuestions } = countBuild(proposal);
  return blocks > BIG_BUILD.blocks || quizQuestions > BIG_BUILD.quizQuestions;
}

function planStatus(job: AiJob): string {
  return planConfirmed(job)
    ? '[Plan status: the teacher has answered your plan or said to go ahead. Build to it, applying any changes they asked for.]'
    : `[Plan status: no plan confirmed yet. If this is a big build (more than ${BIG_BUILD.quizQuestions} quiz questions or ${BIG_BUILD.blocks} blocks), do not research or build yet: reply with the plan, headed "${PLAN_MARKER}", and stop.]`;
}

function openingMessages(job: AiJob): ModelMessage[] {
  const history = (job.history ?? [])
    .filter((turn) => turn.content.trim())
    .map((turn) => ({ role: turn.role, content: turn.content }));
  // The API needs alternating turns that start with the user.
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const turn of history) {
    const last = messages[messages.length - 1];
    if (!last && turn.role === 'assistant') continue;
    if (last && last.role === turn.role) last.content += `\n\n${turn.content}`;
    else messages.push({ ...turn });
  }
  const current = `${job.message}\n\n${planStatus(job)}`;
  const last = messages[messages.length - 1];
  if (last?.role === 'user') last.content += `\n\n${current}`;
  else messages.push({ role: 'user', content: current });
  return messages;
}

/**
 * The SVG diagram check needs DOMParser, which Node lacks. There the proposal
 * keeps its schema check and the diagram is re-checked when the lesson publishes.
 */
function safeValidate(proposal: AiProposal): { ok: true } | { ok: false; error: string } {
  try {
    return validateMutatingProposal(proposal, emptySearchPack(''));
  } catch (error) {
    if (typeof DOMParser === 'undefined' && error instanceof ReferenceError) return { ok: true };
    throw error;
  }
}

/** Parse and check one proposal tool call; a string is the problem to hand back. */
export function checkProposalCall(name: string, input: unknown, lesson: Lesson): AiProposal | string {
  const parsed = parseToolProposal(name, input);
  if ('error' in parsed) return `${name}: ${truncate(parsed.error)}`;
  // Report every problem in one round. For a quiz question the quiz pass says
  // exactly which field is wrong, so its words replace the publish check's
  // generic ones; any other publish problem is kept.
  const checked = safeValidate(parsed);
  const quiz = quizProposalIssues(parsed, lesson);
  const publish = checked.ok || (quiz.length > 0 && /^Quiz question \d+:/.test(checked.error)) ? [] : [checked.error];
  const problems = [...publish, ...quiz, ...anchorIssues(parsed, lesson)];
  return problems.length ? truncate(problems.join('\n')) : parsed;
}

/** Accept refuses an unanchored insert into a lesson that has blocks, so catch it here. */
function anchorIssues(proposal: AiProposal, lesson: Lesson): string[] {
  if (proposal.kind !== 'insert_blocks') return [];
  if (!proposal.anchor_block_id) {
    if (lesson.blocks.length === 0) return [];
    const last = lesson.blocks[lesson.blocks.length - 1]!;
    return [`Give anchor_block_id. To add to the end of the lesson, anchor below its last block "${last.id}".`];
  }
  return findBlockById(lesson.blocks, proposal.anchor_block_id)
    ? []
    : [`anchor_block_id "${proposal.anchor_block_id}" is not in the lesson. Use an id from the lesson outline.`];
}

function truncate(error: string): string {
  return error.length > 2000 ? `${error.slice(0, 2000)}…` : error;
}

function textOf(content: ModelContentBlock[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
}

/** The note the agent put in the proposal call, if any. */
function messageOf(input: unknown): string {
  const message = input && typeof input === 'object' ? (input as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message.trim() : '';
}

function isToolUse(block: ModelContentBlock): block is { type: 'tool_use'; id: string; name: string; input: unknown } {
  return block.type === 'tool_use' && typeof (block as { id?: unknown }).id === 'string';
}

function totalCost(usage: TurnUsage[]): number {
  return Math.round(usage.reduce((sum, row) => sum + row.cost_usd, 0) * 1_000_000) / 1_000_000;
}

export async function runLessonAiJob(input: RunLessonJobInput): Promise<RunLessonJobResult> {
  const { job, lesson } = input;
  const models = { ...TEACHING_AI_MODELS, ...input.models };
  const research = Boolean(input.webSearch || input.tools?.length);
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
    fullLesson: true,
    research
  });
  // Two cache points: the agent's static prefix (shared by every lesson) and
  // the lesson context (shared by every turn on this lesson until it changes).
  // The prefix keeps for an hour, so a plan and the build the teacher confirms
  // later share it.
  const system: SystemBlock[] = [
    { type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: lessonContext, cache_control: { type: 'ephemeral' } }
  ];
  const toolsFor = (tier: ModelTier): ToolDefinition[] => [
    ...(AI_TOOLS as unknown as ToolDefinition[]),
    ...(input.tools ?? []),
    ...(input.webSearch ? [webSearchTool(tier)] : [])
  ];
  const clientTools = new Set((input.tools ?? []).map((tool) => tool.name));

  const messages: ModelMessage[] = openingMessages(job);
  const usage: TurnUsage[] = [];
  // Conversions start on the fast model and move up after a failed proposal.
  let tier: ModelTier = pickLane(job) === 'fast' ? 'fast' : 'standard';
  let failedProposals = 0;
  let lastProblem = 'The agent could not produce a usable answer.';
  let lastText = '';
  let turns = 0;
  const checks: string[] = [];

  const fail = (error: string): RunLessonJobResult => ({ status: 'error', error, turns, usage, cost_usd: totalCost(usage), checks });

  while (turns < MAX_TURNS) {
    if (input.signal?.aborted) return fail('The agent ran out of time. Try a smaller request.');
    turns += 1;
    const model = models[tier];
    let reply: ModelReply;
    try {
      reply = await input.complete({
        model,
        tier,
        effort: tier === 'fast' ? 'low' : failedProposals > 0 ? 'high' : 'medium',
        max_tokens: MAX_TOKENS,
        system,
        tools: toolsFor(tier),
        messages
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'The model request failed.');
    }
    const servedBy = reply.model ?? model;
    usage.push({
      model: servedBy,
      input_tokens: reply.usage?.input_tokens ?? 0,
      output_tokens: reply.usage?.output_tokens ?? 0,
      cache_read_input_tokens: reply.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: reply.usage?.cache_creation_input_tokens ?? 0,
      web_searches: reply.usage?.server_tool_use?.web_search_requests ?? 0,
      cost_usd: estimateCostUsd(servedBy, reply.usage)
    });

    const content = Array.isArray(reply.content) ? reply.content : [];
    const text = textOf(content);
    if (text) lastText = text;

    if (reply.stop_reason === 'refusal') return fail('The model declined this request.');

    if (reply.stop_reason === 'max_tokens') {
      // A cut-off tool call cannot be replayed; ask for a smaller piece instead.
      lastProblem = 'The answer was too long and got cut off. Try asking for a smaller piece.';
      checks.push(`Turn ${turns}: reply cut off at the ${MAX_TOKENS}-token output limit`);
      const note = 'Your previous answer was cut off for length and was not shown. Propose a smaller change (split large builds across turns) and say so.';
      const last = messages[messages.length - 1]!;
      if (typeof last.content === 'string') last.content += `\n\n${note}`;
      else last.content = [...last.content, { type: 'text', text: note }];
      continue;
    }

    messages.push({ role: 'assistant', content });

    if (reply.stop_reason === 'pause_turn') {
      // A long server-side search paused; send it back to carry on.
      input.onPhase?.('searching');
      continue;
    }

    const calls = content.filter(isToolUse);
    if (calls.length === 0) {
      return { status: 'done', response: text || lastText, model: servedBy, turns, usage, cost_usd: totalCost(usage), checks };
    }

    let accepted: AiProposal | null = null;
    let note = '';
    const results: ModelContentBlock[] = [];
    for (const call of calls) {
      if (PROPOSAL_TOOLS.has(call.name)) {
        if (accepted) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Only one proposal is shown per answer. This one was skipped.', is_error: true });
          continue;
        }
        const parsedCall = checkProposalCall(call.name, call.input, lesson);
        const checked =
          typeof parsedCall !== 'string' && isBigBuild(parsedCall) && !planConfirmed(job)
            ? `This is a big build and the teacher has not confirmed a plan. Do not build yet: reply without any tool call with a short plan headed "${PLAN_MARKER}" and wait for their answer.`
            : parsedCall;
        if (typeof checked === 'string') {
          failedProposals += 1;
          checks.push(`Turn ${turns}: ${checked}`);
          lastProblem = `The proposal failed the checks: ${checked}`;
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: `Not shown to the teacher. Fix these problems and propose again:\n${checked}\nIf the request cannot fit the limits, say so plainly instead.`,
            is_error: true
          });
        } else {
          accepted = checked;
          note = messageOf(call.input);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Shown to the teacher for review.' });
        }
        continue;
      }
      if (clientTools.has(call.name) && input.runTool) {
        input.onPhase?.('searching');
        let value: unknown;
        try {
          value = await input.runTool(call.name, call.input ?? {});
        } catch (error) {
          value = { error: error instanceof Error ? error.message : 'That tool failed.' };
        }
        const isError = Boolean(value && typeof value === 'object' && 'error' in value);
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: typeof value === 'string' ? value : JSON.stringify(value),
          ...(isError ? { is_error: true } : {})
        });
        continue;
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: `Unknown tool: ${call.name}`, is_error: true });
    }

    if (accepted) {
      return {
        status: 'done',
        response: note || text || lastText,
        proposal: accepted,
        model: servedBy,
        turns,
        usage,
        cost_usd: totalCost(usage),
        checks
      };
    }
    if (failedProposals >= 3) return fail(lastProblem);
    input.onPhase?.('writing');
    if (failedProposals > 0 && tier === 'fast') {
      // Step up to the standard model with a fresh conversation: one model's
      // turns (and thinking) are not replayed to another.
      tier = 'standard';
      messages.splice(0, messages.length, ...openingMessages(job));
      const last = messages[messages.length - 1]!;
      last.content = `${String(last.content)}\n\nA first attempt failed these checks; avoid them:\n${lastProblem}`;
      continue;
    }
    messages.push({ role: 'user', content: results });
  }

  return fail(failedProposals > 0 ? lastProblem : 'The agent took too many steps. Try a narrower request.');
}
