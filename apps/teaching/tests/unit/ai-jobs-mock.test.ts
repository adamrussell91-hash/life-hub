// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockApi, loadSeedFile } from '../../scripts/mock-api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const seed = loadSeedFile(path.resolve(root, '../../fixtures/seed.json'));
const PASSPHRASE = 'teaching-hub-local';

async function signIn() {
  const api = createMockApi({ seed, passphrase: PASSPHRASE });
  const unauth = await api.request('POST', '/api/ai/jobs', {
    body: { lesson_id: 'x', agent: 'clementine', message: 'Build a lesson' }
  });
  expect(unauth.status).toBe(401);

  const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
  const cookie = auth.headers.get('set-cookie');
  expect(cookie).toBeTruthy();

  const curriculum = await api.request('GET', '/api/curriculum', { cookie });
  const data = (await curriculum.json()) as {
    data: { lessons: Array<{ id: string; title?: string }> };
  };
  const lessonId = data.data.lessons[0]?.id;
  expect(lessonId).toBeTruthy();
  return { api, cookie: cookie!, lessonId: lessonId! };
}

describe('mock /api/ai/jobs', () => {
  it('creates a working job, stays working until run, then returns a replace_lesson proposal', async () => {
    const { api, cookie, lessonId } = await signIn();

    const unknownLesson = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: { lesson_id: 'does-not-exist', agent: 'clementine', message: 'Build a lesson' }
    });
    expect(unknownLesson.status).toBe(404);

    const created = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: { lesson_id: lessonId, agent: 'clementine', message: 'Build a lesson on X' }
    });
    expect(created.status).toBe(202);
    const createdBody = (await created.json()) as { data: { id: string; status: string } };
    expect(createdBody.data.status).toBe('working');

    const unknownJob = await api.request('GET', '/api/ai/jobs/missing-job', { cookie });
    expect(unknownJob.status).toBe(404);

    const beforeRun = await api.request('GET', `/api/ai/jobs/${createdBody.data.id}`, { cookie });
    const beforeBody = (await beforeRun.json()) as { data: { status: string } };
    expect(beforeBody.data.status).toBe('working');

    const inboxWorking = await api.request('GET', '/api/ai/jobs', { cookie });
    const inboxWorkingBody = (await inboxWorking.json()) as {
      data: { jobs: Array<{ id: string; status: string; lesson_id: string }> };
    };
    expect(inboxWorkingBody.data.jobs[0]).toMatchObject({
      id: createdBody.data.id,
      status: 'working',
      lesson_id: lessonId
    });

    const conflict = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: { lesson_id: lessonId, agent: 'clementine', message: 'Another build' }
    });
    expect(conflict.status).toBe(409);
    const conflictBody = (await conflict.json()) as { error: { details?: { id?: string } } };
    expect(conflictBody.error.details?.id).toBe(createdBody.data.id);

    const run = await api.request('POST', `/api/ai/jobs/${createdBody.data.id}/run`, { cookie });
    expect(run.status).toBe(200);

    const polled = await api.request('GET', `/api/ai/jobs/${createdBody.data.id}`, { cookie });
    const job = (await polled.json()) as {
      data: { status: string; proposal?: { kind: string; blocks?: unknown[] } };
    };
    expect(job.data.status).toBe('done');
    expect(job.data.proposal?.kind).toBe('replace_lesson');
    expect(job.data.proposal?.blocks?.length).toBeGreaterThan(0);

    const readyInbox = await api.request('GET', '/api/ai/jobs', { cookie });
    const readyBody = (await readyInbox.json()) as { data: { jobs: Array<{ status: string }> } };
    expect(readyBody.data.jobs[0]?.status).toBe('done');
  });

  it('accepts a finished job and drops it from the inbox', async () => {
    const { api, cookie, lessonId } = await signIn();
    const created = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: { lesson_id: lessonId, agent: 'clementine', message: 'Build' }
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    await api.request('POST', `/api/ai/jobs/${id}/run`, { cookie });

    const accepted = await api.request('PATCH', `/api/ai/jobs/${id}`, {
      cookie,
      body: { resolution: 'accepted' }
    });
    expect(accepted.status).toBe(200);

    const inbox = await api.request('GET', '/api/ai/jobs', { cookie });
    const inboxBody = (await inbox.json()) as { data: { jobs: unknown[] } };
    expect(inboxBody.data.jobs).toEqual([]);
  });

  it('preserves fast-agent context and returns a mock Hammond review', async () => {
    const { api, cookie, lessonId } = await signIn();
    const snapshot = '2026-08-17T10:00:00.000Z';
    const created = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: {
        lesson_id: lessonId,
        agent: 'hammond',
        scope: 'lesson',
        lesson_snapshot_at: snapshot,
        message: 'Review this lesson',
        protocol_id: 'make-the-call',
        action: 'review',
        history: [{ role: 'user', content: 'Keep the existing structure.' }]
      }
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const beforeRun = await api.request('GET', `/api/ai/jobs/${id}`, { cookie });
    const before = (await beforeRun.json()) as {
      data: { snapshot_at: string; protocol_id?: string; action?: string; history?: unknown[] };
    };
    expect(before.data).toMatchObject({
      snapshot_at: snapshot,
      protocol_id: 'make-the-call',
      action: 'review',
      history: [{ role: 'user', content: 'Keep the existing structure.' }]
    });

    const run = await api.request('POST', `/api/ai/jobs/${id}/run`, { cookie });
    const done = (await run.json()) as {
      data: { proposal?: { kind: string; summary?: string } };
    };
    expect(done.data.proposal).toMatchObject({
      kind: 'review_only',
      summary: expect.stringContaining('Mock review')
    });
  });

  it('dismisses a failed job and refuses dismiss on a ready plan', async () => {
    const { api, cookie, lessonId } = await signIn();
    const created = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: { lesson_id: lessonId, agent: 'clementine', message: 'Build' }
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    await api.request('POST', `/api/ai/jobs/${id}/run`, { cookie });

    const refuse = await api.request('PATCH', `/api/ai/jobs/${id}`, {
      cookie,
      body: { resolution: 'dismissed' }
    });
    expect(refuse.status).toBe(400);
  });
});
