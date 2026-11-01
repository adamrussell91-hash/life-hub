/**
 * Start a text tool job and poll it to the end. The server runs the model in a
 * background function, so the first answer is usually `working`.
 */
import { apiGet, apiPost } from '@/api/client';
import type { LiteraryElementsTable } from '@/blocks/literary-elements';
import { normaliseTechniqueFindings, type TechniqueFinding } from '@/blocks/technique-scan';
import { normaliseWordHelp, type WordHelpEntry } from '@/blocks/word-help';

export type TextTool = 'dictionary' | 'fry' | 'question_first' | 'techniques';

export type FryResult = { html: string };

export type QuestionFirstHookType = 'contradiction' | 'prediction' | 'dilemma';
export type QuestionFirstHook = { type: QuestionFirstHookType; html: string };
/** The question the block answers, and up to one hook of each type to put above it. */
export type QuestionFirstResult = { question: string; hooks: QuestionFirstHook[] };

const HOOK_TYPES: QuestionFirstHookType[] = ['contradiction', 'prediction', 'dilemma'];

type JobView = {
  key: string;
  status: 'working' | 'done' | 'error' | 'missing';
  result?: unknown;
  error?: string;
};

export type PollOptions = {
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function pollTextToolJob(
  start: () => Promise<JobView>,
  poll: (key: string) => Promise<JobView>,
  options: PollOptions = {}
): Promise<unknown> {
  const wait = options.wait ?? defaultWait;
  const interval = options.intervalMs ?? 1500;
  const deadline = Date.now() + (options.timeoutMs ?? 150_000);
  let view = await start();
  while (view.status === 'working') {
    if (options.signal?.aborted) throw new Error('Stopped.');
    if (Date.now() > deadline) throw new Error('This is taking longer than usual. Try again in a minute.');
    await wait(interval);
    view = await poll(view.key);
  }
  if (view.status === 'done') return view.result;
  throw new Error(view.error || 'The scan did not finish. Try again.');
}

/** Teacher: scan the words in a block's current HTML. */
export async function scanWordsAsTeacher(html: string, options?: PollOptions): Promise<WordHelpEntry[]> {
  const result = await pollTextToolJob(
    () => apiPost<JobView>('/api/text-tools', { tool: 'dictionary', html }, { signal: options?.signal }),
    (key) => apiGet<JobView>(`/api/text-tools/${encodeURIComponent(key)}`, { signal: options?.signal }),
    options
  );
  return normaliseWordHelp((result as { words?: unknown } | undefined)?.words);
}

/** Teacher only: rewrite a block as a Fry explainer. */
export async function rewriteAsFryExplainer(html: string, options?: PollOptions): Promise<FryResult> {
  const result = (await pollTextToolJob(
    () => apiPost<JobView>('/api/text-tools', { tool: 'fry', html }, { signal: options?.signal }),
    (key) => apiGet<JobView>(`/api/text-tools/${encodeURIComponent(key)}`, { signal: options?.signal }),
    { timeoutMs: 240_000, intervalMs: 2500, ...options }
  )) as Partial<FryResult> | undefined;
  if (typeof result?.html === 'string' && result.html) return { html: result.html };
  throw new Error('The explainer came back empty. Try again.');
}

/** Teacher only: write three hooks to go above a block. The block itself is not rewritten. */
export async function writeQuestionFirst(html: string, options?: PollOptions): Promise<QuestionFirstResult> {
  const result = (await pollTextToolJob(
    () => apiPost<JobView>('/api/text-tools', { tool: 'question_first', html }, { signal: options?.signal }),
    (key) => apiGet<JobView>(`/api/text-tools/${encodeURIComponent(key)}`, { signal: options?.signal }),
    { timeoutMs: 180_000, intervalMs: 2000, ...options }
  )) as { question?: unknown; hooks?: unknown } | undefined;
  const hooks = (Array.isArray(result?.hooks) ? result.hooks : [])
    .filter((hook): hook is QuestionFirstHook =>
      Boolean(hook) &&
      HOOK_TYPES.includes((hook as QuestionFirstHook).type) &&
      typeof (hook as QuestionFirstHook).html === 'string' &&
      Boolean((hook as QuestionFirstHook).html)
    )
    .map(({ type, html: hookHtml }) => ({ type, html: hookHtml }));
  if (!hooks.length) throw new Error('The hooks came back empty. Try again.');
  return { question: typeof result?.question === 'string' ? result.question : '', hooks };
}

/**
 * Teacher: find the Periodic Table techniques in a block's current HTML.
 * Names the table does not know are dropped here.
 */
export async function scanTechniquesAsTeacher(
  html: string,
  table: LiteraryElementsTable,
  options?: PollOptions
): Promise<TechniqueFinding[]> {
  const result = await pollTextToolJob(
    () => apiPost<JobView>('/api/text-tools', { tool: 'techniques', html }, { signal: options?.signal }),
    (key) => apiGet<JobView>(`/api/text-tools/${encodeURIComponent(key)}`, { signal: options?.signal }),
    { intervalMs: 2000, ...options }
  );
  return normaliseTechniqueFindings((result as { findings?: unknown } | undefined)?.findings, table);
}

/** Student: scan a published block. The server reads the text from the lesson. */
export async function scanWordsAsStudent(lessonId: string, blockId: string, options?: PollOptions): Promise<WordHelpEntry[]> {
  const lesson = encodeURIComponent(lessonId);
  const result = await pollTextToolJob(
    () => apiPost<JobView>(`/api/published/word-help/${lesson}`, { block_id: blockId }, { signal: options?.signal }),
    (key) => apiGet<JobView>(`/api/published/word-help/${lesson}/${encodeURIComponent(key)}`, { signal: options?.signal }),
    { intervalMs: 2000, ...options }
  );
  return normaliseWordHelp((result as { words?: unknown } | undefined)?.words);
}
