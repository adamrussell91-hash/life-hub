import { AiJobConflictError, pollAiJob, postAiJob } from '@/ai/jobs-client';
import { costText, type NextStepJobDeps } from '@/blocks/next-step-run';

/**
 * Running AI marking from a quiz's results (ai/answer-marking-jobs.ts). The
 * button carries the dry run's count and A$ figure, so the cost is seen
 * before anything calls a model; pressing it queues one job for the quiz.
 */

export type AnswerMarkEstimate = { kind: 'quiz_ai_mark'; answers: number; questions: number; calls: number; input_tokens: number; output_tokens: number; cost_usd: number; cost_aud: number };
export type AiMarkDone = { response?: string; marked?: number; unsure?: number; waiting?: number; cost_usd?: number; cost_aud?: number };

const liveDeps: NextStepJobDeps = {
  post: (body) => postAiJob(body),
  poll: (id) => pollAiJob(id) as unknown as ReturnType<NextStepJobDeps['poll']>,
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
};

const POLL_MS = 2000;
/** The server gives a marking job eight minutes; this waits a little longer. */
const MAX_POLLS = 270;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The button: "AI mark 12 answers · about A$0.02". */
export function aiMarkLabel(estimate: Pick<AnswerMarkEstimate, 'answers' | 'cost_aud'>): string {
  return `AI mark ${plural(estimate.answers, 'answer')} · ${costText(estimate)}`;
}

export async function estimateAiMarking(lessonId: string, deps: NextStepJobDeps = liveDeps): Promise<AnswerMarkEstimate> {
  return (await deps.post<{ estimate: AnswerMarkEstimate }>({ kind: 'quiz_ai_mark', lesson_id: lessonId, dry_run: true })).estimate;
}

/** Queues the job (or joins the one already running) and waits for it. Throws the job's error. */
export async function runAiMarking(lessonId: string, deps: NextStepJobDeps = liveDeps): Promise<AiMarkDone> {
  let id: string;
  try {
    id = (await deps.post<{ id: string }>({ kind: 'quiz_ai_mark', lesson_id: lessonId })).id;
  } catch (error) {
    if (!(error instanceof AiJobConflictError)) throw error;
    id = error.jobId;
  }
  for (let polls = 0; polls < MAX_POLLS; polls += 1) {
    const job = await deps.poll(id);
    if (job.status === 'done') return job as unknown as AiMarkDone;
    if (job.status === 'error') throw new Error(job.error || 'The answers could not be marked. Try again.');
    await deps.sleep(POLL_MS);
  }
  throw new Error('This is taking longer than it should. Reload the page in a minute to see the marks.');
}

/** The line once a run is done: "Marked 31 · 3 for you to check · A$0.02". */
export function aiMarkDoneLine(done: AiMarkDone): string {
  const cost = typeof done.cost_aud === 'number' ? ` · ${costText({ cost_aud: done.cost_aud }).replace('about ', '')}` : '';
  return `${done.response ?? 'Marked.'}${cost}`;
}
