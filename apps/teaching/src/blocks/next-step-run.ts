import { AiJobConflictError, pollAiJob, postAiJob } from '@/ai/jobs-client';
import { button, el, errorText } from '@/quiz/dom';

/**
 * Running the two next-step jobs from the teacher's screens: Make next steps
 * (one box, or every box in the lesson) and Draft ladders (the code library).
 * Every run asks the server for its A$ estimate first and waits for the
 * teacher's yes; nothing calls a model by surprise. See ai/next-step-jobs.ts.
 */

export type NextStepTarget = { block_id: string; index: number; code_ids?: string[] };
export type NextStepEstimate = {
  kind: 'next_steps_fill' | 'ladders_draft';
  model: string;
  boxes: number;
  codes: number;
  lines: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_aud: number;
};
export type NextStepJobBody = { kind: 'next_steps_fill'; lesson_id: string; targets: NextStepTarget[] } | { kind: 'ladders_draft' };
export type FillDone = {
  response?: string;
  applied?: number;
  skipped?: number;
  flagged?: Array<{ block_id: string; index: number; code_id: string; rung: string }>;
  cost_usd?: number;
};
export type LadderDraft = { id: string; ladder: string[]; descriptor: string; flags: { ladder: string[][]; descriptor: string[] } };
export type LaddersDone = { response?: string; ladders?: LadderDraft[]; cost_usd?: number };

/** What a lesson builder hands its editors so a box can make its own next steps. */
export type NextStepJobs = {
  lessonId: string;
  /** Saves the draft, since the job reads the saved draft. */
  flush: () => Promise<void>;
  /** Loads the draft the job wrote back into the builder. */
  reload: (done: FillDone) => Promise<void>;
};

type JobRow = { id: string; status: 'working' | 'done' | 'error'; error?: string } & Record<string, unknown>;
export type NextStepJobDeps = {
  post: <T>(body: Record<string, unknown>) => Promise<T>;
  poll: (id: string) => Promise<JobRow>;
  sleep: (ms: number) => Promise<void>;
};
const liveDeps: NextStepJobDeps = {
  post: (body) => postAiJob(body),
  poll: (id) => pollAiJob(id) as unknown as Promise<JobRow>,
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
};

const POLL_MS = 2000;
/** The server gives a next-step job four minutes; this waits a little longer. */
const MAX_POLLS = 150;

/** The estimate as the teacher reads it. */
export function costText(estimate: Pick<NextStepEstimate, 'cost_aud'>): string {
  return estimate.cost_aud < 0.005 ? 'under A$0.01' : `about A$${estimate.cost_aud.toFixed(2)}`;
}

export async function estimateNextStepJob(body: NextStepJobBody, deps: NextStepJobDeps = liveDeps): Promise<NextStepEstimate> {
  const reply = await deps.post<{ estimate: NextStepEstimate }>({ ...body, dry_run: true });
  return reply.estimate;
}

/** Starts the job (or joins the one already running) and waits for it. Throws the job's error. */
export async function runNextStepJob<T>(body: NextStepJobBody, deps: NextStepJobDeps = liveDeps): Promise<T> {
  let id: string;
  try {
    id = (await deps.post<{ id: string }>({ ...body })).id;
  } catch (error) {
    if (!(error instanceof AiJobConflictError)) throw error;
    id = error.jobId;
  }
  for (let polls = 0; polls < MAX_POLLS; polls += 1) {
    const job = await deps.poll(id);
    if (job.status === 'done') return job as unknown as T;
    if (job.status === 'error') throw new Error(job.error || 'The next steps could not be written. Try again.');
    await deps.sleep(POLL_MS);
  }
  throw new Error('This is taking longer than it should. Reload the page in a minute to see the result.');
}

/** Asks in place: the estimate, then a yes or Cancel. */
export function askInline(host: HTMLElement, text: string, yes: string): Promise<boolean> {
  return new Promise((resolve) => {
    const row = el('div', 'nst-ask');
    const done = (ok: boolean) => {
      row.remove();
      resolve(ok);
    };
    row.append(el('span', 'nst-ask__text', text), button(yes, 'primary', () => done(true)), button('Cancel', 'ghost', () => done(false)));
    host.replaceChildren(row);
    row.querySelector<HTMLButtonElement>('.btn--primary')?.focus();
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word.endsWith('x') ? 'es' : 's'}`;

/**
 * Make next steps for some boxes: save, estimate, ask, run, reload. `status`
 * carries every message and the yes/Cancel row.
 */
export async function makeNextSteps(status: HTMLElement, jobs: NextStepJobs, targets: NextStepTarget[], deps: NextStepJobDeps = liveDeps): Promise<void> {
  const say = (text: string, tone: 'info' | 'error' = 'info') => {
    status.replaceChildren(el('span', `nst-status nst-status--${tone}`, text));
  };
  const body: NextStepJobBody = { kind: 'next_steps_fill', lesson_id: jobs.lessonId, targets };
  try {
    say('Working out the cost…');
    await jobs.flush();
    const estimate = await estimateNextStepJob(body, deps);
    if (!estimate.codes) {
      say('Give a code one of these skills and a ladder in Feedback codes first.');
      return;
    }
    const ok = await askInline(status, `${plural(estimate.lines, 'line')} for ${plural(estimate.boxes, 'box')}, ${costText(estimate)}.`, 'Make them');
    if (!ok) {
      status.replaceChildren();
      return;
    }
    say('Writing next steps…');
    const done = await runNextStepJob<FillDone>(body, deps);
    say(done.response ?? 'Next steps made.');
    await jobs.reload(done);
  } catch (error) {
    say(errorText(error), 'error');
  }
}
