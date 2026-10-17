/**
 * Start a text tool job and poll it to the end. The server runs the model in a
 * background function, so the first answer is usually `working`.
 */
import { apiGet, apiPost } from '@/api/client';
import { normaliseWordHelp, type WordHelpEntry } from '@/blocks/word-help';

export type TextTool = 'dictionary' | 'fry';

export type FryResult = { declined: true; reason: string } | { declined: false; html: string };

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
  )) as Partial<{ declined: boolean; reason: string; html: string }> | undefined;
  if (result?.declined) return { declined: true, reason: result.reason || 'This block cannot carry the explainer structure.' };
  if (typeof result?.html === 'string' && result.html) return { declined: false, html: result.html };
  throw new Error('The explainer came back empty. Try again.');
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
