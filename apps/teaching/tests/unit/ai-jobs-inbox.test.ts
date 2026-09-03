import { describe, expect, it } from 'vitest';
import type { AiJob } from '@/ai/jobs';
import {
  applyJobResolution,
  inboxRowFromJob,
  isInboxVisible,
  removeInboxJob,
  unresolvedJobForLesson,
  upsertInboxJob,
  type AiJobInbox
} from '@/ai/jobs-inbox';

const working: AiJob = {
  id: 'job_1',
  lesson_id: 'lesson_1',
  agent: 'clementine',
  status: 'working',
  snapshot_at: '2026-08-15T01:00:00.000Z',
  message: 'Build a lesson on Othello',
  created_at: '2026-08-15T01:00:00.000Z'
};

function inboxWith(job: AiJob, title = 'Othello'): AiJobInbox {
  return { jobs: [inboxRowFromJob(job, title)] };
}

describe('jobs inbox helpers', () => {
  it('shows working, ready, and failed jobs and hides resolved ones', () => {
    expect(isInboxVisible(working)).toBe(true);
    expect(isInboxVisible({ ...working, status: 'done' })).toBe(true);
    expect(isInboxVisible({ ...working, status: 'error', error: 'timed out' })).toBe(true);
    expect(isInboxVisible({ ...working, status: 'done', resolution: 'accepted' })).toBe(false);
    expect(isInboxVisible({ ...working, status: 'done', resolution: 'rejected' })).toBe(false);
    expect(isInboxVisible({ ...working, status: 'error', resolution: 'dismissed' })).toBe(false);
  });

  it('upserts by id and finds an unresolved job for a lesson', () => {
    let inbox: AiJobInbox = { jobs: [] };
    inbox = upsertInboxJob(inbox, inboxRowFromJob(working, 'Othello'));
    inbox = upsertInboxJob(inbox, inboxRowFromJob({ ...working, status: 'done' }, 'Othello'));
    expect(inbox.jobs).toHaveLength(1);
    expect(inbox.jobs[0]?.status).toBe('done');
    expect(unresolvedJobForLesson(inbox, 'lesson_1')?.id).toBe('job_1');
    expect(unresolvedJobForLesson(inbox, 'lesson_2')).toBeNull();
  });

  it('treats done as blocking a second job, but not error', () => {
    const ready = inboxWith({ ...working, status: 'done' });
    expect(unresolvedJobForLesson(ready, 'lesson_1')?.status).toBe('done');
    const failed = inboxWith({ ...working, status: 'error', error: 'nope' });
    expect(unresolvedJobForLesson(failed, 'lesson_1')).toBeNull();
  });

  it('accepts or rejects only a done job and dismisses only an error', () => {
    expect(applyJobResolution(working, 'accepted').ok).toBe(false);
    const accepted = applyJobResolution({ ...working, status: 'done' }, 'accepted');
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.job.resolution).toBe('accepted');

    const dismissedDone = applyJobResolution({ ...working, status: 'done' }, 'dismissed');
    expect(dismissedDone.ok).toBe(false);

    const dismissed = applyJobResolution({ ...working, status: 'error', error: 'x' }, 'dismissed');
    expect(dismissed.ok).toBe(true);
    if (!dismissed.ok) return;
    expect(dismissed.job.resolution).toBe('dismissed');
  });

  it('removes a job from the inbox index', () => {
    const next = removeInboxJob(inboxWith(working), 'job_1');
    expect(next.jobs).toEqual([]);
  });
});
