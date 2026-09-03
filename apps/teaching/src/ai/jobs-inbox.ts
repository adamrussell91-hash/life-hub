import type { AiJob } from '@/ai/jobs';

export type AiJobResolution = 'accepted' | 'rejected' | 'dismissed';

export type AiJobInboxRow = {
  id: string;
  lesson_id: string;
  lesson_title: string;
  agent: AiJob['agent'];
  status: 'working' | 'done' | 'error';
  created_at: string;
  message: string;
};

export type AiJobInbox = {
  jobs: AiJobInboxRow[];
};

export function isInboxVisible(job: AiJob): boolean {
  if (job.resolution) return false;
  return job.status === 'working' || job.status === 'done' || job.status === 'error';
}

export function inboxRowFromJob(job: AiJob, lessonTitle: string): AiJobInboxRow {
  return {
    id: job.id,
    lesson_id: job.lesson_id,
    lesson_title: lessonTitle,
    agent: job.agent,
    status: job.status === 'error' ? 'error' : job.status === 'done' ? 'done' : 'working',
    created_at: job.created_at,
    message: job.message
  };
}

export function upsertInboxJob(inbox: AiJobInbox, row: AiJobInboxRow): AiJobInbox {
  const jobs = inbox.jobs.filter((item) => item.id !== row.id);
  return { jobs: [row, ...jobs] };
}

export function removeInboxJob(inbox: AiJobInbox, id: string): AiJobInbox {
  return { jobs: inbox.jobs.filter((item) => item.id !== id) };
}

export function syncInboxForJob(inbox: AiJobInbox, job: AiJob, lessonTitle: string): AiJobInbox {
  if (!isInboxVisible(job)) return removeInboxJob(inbox, job.id);
  return upsertInboxJob(inbox, inboxRowFromJob(job, lessonTitle));
}

export function unresolvedJobForLesson(inbox: AiJobInbox, lessonId: string): AiJobInboxRow | null {
  return (
    inbox.jobs.find((row) => row.lesson_id === lessonId && (row.status === 'working' || row.status === 'done')) ??
    null
  );
}

export function applyJobResolution(
  job: AiJob,
  resolution: AiJobResolution
): { ok: true; job: AiJob } | { ok: false; message: string } {
  if (job.resolution) {
    return { ok: false, message: 'Job is already resolved' };
  }
  if (resolution === 'dismissed') {
    if (job.status !== 'error') {
      return { ok: false, message: 'Only failed jobs can be dismissed' };
    }
    return { ok: true, job: { ...job, resolution } };
  }
  if (job.status !== 'done') {
    return { ok: false, message: 'Only a finished plan can be accepted or rejected' };
  }
  return { ok: true, job: { ...job, resolution } };
}
