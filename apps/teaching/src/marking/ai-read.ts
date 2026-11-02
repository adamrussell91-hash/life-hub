import { AiJobConflictError, pollAiJob, postAiJob } from '@/ai/jobs-client';
import { runAiMarking } from '@/quiz/ai-mark-run';
import type { RubricRows } from './rubric-model';
import type { AiCheck, RubricAiRead } from './rubric-panel';

/**
 * The To mark flow's one "AI read them" button: AI marking for each quiz with
 * answers waiting, and the AI's read of takes on each tagged viva question.
 * Everything comes back as a suggestion the teacher keeps or changes.
 */

const POLL_MS = 2000;
/** The server gives a job eight minutes; this waits a little longer. */
const MAX_POLLS = 270;

export async function runVoiceRead(lessonId: string, blockId: string): Promise<void> {
  let id: string;
  try {
    id = (await postAiJob<{ id: string }>({ kind: 'voice_ai_read', lesson_id: lessonId, block_id: blockId })).id;
  } catch (error) {
    if (!(error instanceof AiJobConflictError)) throw error;
    id = error.jobId;
  }
  for (let polls = 0; polls < MAX_POLLS; polls += 1) {
    const job = await pollAiJob(id);
    if (job.status === 'done') return;
    if (job.status === 'error') throw new Error(job.error || 'The takes could not be read. Try again.');
    await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
  }
  throw new Error('This is taking longer than it should. Reload the page in a minute.');
}

export type AiReadTarget = { kind: 'quiz'; lessonId: string } | { kind: 'voice'; lessonId: string; blockId: string };

/** Runs them all, one failure leaving the rest. Returns how many failed. */
export async function runAiRead(targets: readonly AiReadTarget[], onDone: (finished: number) => void): Promise<number> {
  let finished = 0;
  let failed = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        if (t.kind === 'quiz') await runAiMarking(t.lessonId);
        else await runVoiceRead(t.lessonId, t.blockId);
      } catch {
        failed += 1;
      }
      finished += 1;
      onDone(finished);
    })
  );
  return failed;
}

/** What the AI heard in a viva take: its checks run on through the block's steps, in order. */
export type VoiceAiRead = { checks: AiCheck[]; pieces: Record<string, boolean> };

/** A viva read in the rubric's terms. It has no rungs to give, so `skills` stays empty until a read supplies them. */
export function voiceReadForRubric(read: VoiceAiRead | null | undefined, rows: Pick<RubricRows, 'steps'>): RubricAiRead | null {
  if (!read) return null;
  let at = 0;
  const steps: Record<string, AiCheck[]> = {};
  for (const step of rows.steps) {
    steps[step.key] = read.checks.slice(at, at + step.checks.length);
    at += step.checks.length;
  }
  return { pieces: Object.fromEntries(Object.entries(read.pieces ?? {}).map(([id, used]) => [id, used ? 'used' : 'missed'])), steps };
}
