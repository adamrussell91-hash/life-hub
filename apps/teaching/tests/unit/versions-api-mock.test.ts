// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import type { Lesson } from '@/schemas';
import type { VersionIndex, VersionRecord } from '@/schemas/version';
import { versionKey } from '@/storage/keys';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const LESSON_ID = 'lesson_aotfw_001';

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}

function freshApi(seed: SeedData = freshSeed()) {
  return createMockApi({ seed, passphrase: PASSPHRASE });
}

async function signIn(api: ReturnType<typeof createMockApi>): Promise<string> {
  const res = await api.request('POST', '/api/auth', {
    body: { passphrase: PASSPHRASE }
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie as string;
}

async function getLesson(
  api: ReturnType<typeof createMockApi>,
  cookie: string,
  id = LESSON_ID
): Promise<Lesson> {
  const res = await api.request('GET', `/api/lessons/${id}`, { cookie });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; data: Lesson };
  return body.data;
}

describe('mock version APIs', () => {
  it('requires auth on version routes', async () => {
    const api = freshApi();

    const list = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`);
    expect(list.status).toBe(401);

    const create = await api.request('POST', `/api/lessons/${LESSON_ID}/versions`, {
      body: { label: 'Before edit' }
    });
    expect(create.status).toBe(401);

    const item = await api.request('GET', `/api/lessons/${LESSON_ID}/versions/1`);
    expect(item.status).toBe(401);

    const restore = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/versions/1/restore`
    );
    expect(restore.status).toBe(401);
  });

  it('manual checkpoint + list + get', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const lesson = await getLesson(api, cookie);

    const created = await api.request('POST', `/api/lessons/${LESSON_ID}/versions`, {
      cookie,
      body: { label: 'Before rewrite' }
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { ok: boolean; data: VersionRecord };
    expect(createdBody.data.revision).toBe(1);
    expect(createdBody.data.reason).toBe('manual_checkpoint');
    expect(createdBody.data.label).toBe('Before rewrite');
    expect(createdBody.data.snapshot).toMatchObject({ id: lesson.id, title: lesson.title });

    const list = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`, { cookie });
    expect(list.status).toBe(200);
    const index = ((await list.json()) as { ok: boolean; data: VersionIndex }).data;
    expect(index.entries).toHaveLength(1);
    expect(index.latest_revision).toBe(1);
    expect(index.entries[0]).toMatchObject({
      revision: 1,
      reason: 'manual_checkpoint',
      label: 'Before rewrite'
    });

    const get = await api.request('GET', `/api/lessons/${LESSON_ID}/versions/1`, { cookie });
    expect(get.status).toBe(200);
    const record = ((await get.json()) as { ok: boolean; data: VersionRecord }).data;
    expect(record.snapshot).toMatchObject({ id: lesson.id, title: lesson.title });
  });

  it('publish creates a publish version; published GET is unchanged after restore', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const original = await getLesson(api, cookie);

    const publish = await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, { cookie });
    expect(publish.status).toBe(200);

    const listAfterPublish = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`, {
      cookie
    });
    expect(listAfterPublish.status).toBe(200);
    const indexAfterPublish = (
      (await listAfterPublish.json()) as { ok: boolean; data: VersionIndex }
    ).data;
    expect(indexAfterPublish.entries.some((e) => e.reason === 'publish')).toBe(true);
    const publishRevision = indexAfterPublish.entries.find((e) => e.reason === 'publish')!.revision;

    const publishedBefore = await api.request('GET', `/api/published/lessons/${LESSON_ID}`);
    expect(publishedBefore.status).toBe(200);
    const publishedSnapshot = (await publishedBefore.json()) as { ok: boolean; data: unknown };

    const edited = {
      ...original,
      title: 'Edited after publish'
    };
    const put = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: edited
    });
    expect(put.status).toBe(200);

    const restore = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/versions/${publishRevision}/restore`,
      { cookie }
    );
    expect(restore.status).toBe(200);

    const publishedAfter = await api.request('GET', `/api/published/lessons/${LESSON_ID}`);
    expect(publishedAfter.status).toBe(200);
    const publishedAfterBody = (await publishedAfter.json()) as { ok: boolean; data: unknown };
    expect(publishedAfterBody.data).toEqual(publishedSnapshot.data);

    const draftAfter = await getLesson(api, cookie);
    expect(draftAfter.title).toBe(original.title);
  });

  it('restore checkpoints current then applies the old draft', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const original = await getLesson(api, cookie);

    const checkpoint = await api.request('POST', `/api/lessons/${LESSON_ID}/versions`, {
      cookie,
      body: { label: 'Original' }
    });
    expect(checkpoint.status).toBe(200);
    const originalRevision = ((await checkpoint.json()) as { ok: boolean; data: VersionRecord })
      .data.revision;

    const put = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: { ...original, title: 'Current draft' }
    });
    expect(put.status).toBe(200);

    const restore = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/versions/${originalRevision}/restore`,
      { cookie }
    );
    expect(restore.status).toBe(200);
    const restored = ((await restore.json()) as { ok: boolean; data: Lesson }).data;
    expect(restored.title).toBe(original.title);

    const list = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`, { cookie });
    const index = ((await list.json()) as { ok: boolean; data: VersionIndex }).data;
    expect(index.entries.some((e) => e.reason === 'restore')).toBe(true);

    const restoreEntry = index.entries.find((e) => e.reason === 'restore')!;
    const restoreBlob = await api.request(
      'GET',
      `/api/lessons/${LESSON_ID}/versions/${restoreEntry.revision}`,
      { cookie }
    );
    expect(restoreBlob.status).toBe(200);
    const restoreRecord = ((await restoreBlob.json()) as { ok: boolean; data: VersionRecord })
      .data;
    expect(restoreRecord.snapshot).toMatchObject({ title: 'Current draft' });
  });

  it('11th checkpoint leaves 10 entries and drops the oldest blob', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    for (let i = 1; i <= 11; i++) {
      const res = await api.request('POST', `/api/lessons/${LESSON_ID}/versions`, {
        cookie,
        body: { label: `cp-${i}` }
      });
      expect(res.status).toBe(200);
    }

    const list = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`, { cookie });
    expect(list.status).toBe(200);
    const index = ((await list.json()) as { ok: boolean; data: VersionIndex }).data;
    expect(index.entries).toHaveLength(10);
    expect(index.latest_revision).toBe(11);
    expect(index.entries.map((e) => e.revision)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

    const gone = await api.request('GET', `/api/lessons/${LESSON_ID}/versions/1`, { cookie });
    expect(gone.status).toBe(404);

    // Direct key also absent from the mock store surface via version GET above;
    // assert the canonical key path for clarity.
    expect(versionKey('lesson', LESSON_ID, 1)).toBe(`versions/lesson/${LESSON_ID}/1`);
  });

  it("PUT with checkpoint_reason: 'ai_accepted' creates a version", async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const lesson = await getLesson(api, cookie);

    const put = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: {
        ...lesson,
        title: 'AI accepted title',
        checkpoint_reason: 'ai_accepted'
      }
    });
    expect(put.status).toBe(200);
    const saved = ((await put.json()) as { ok: boolean; data: Lesson }).data;
    expect(saved.title).toBe('AI accepted title');
    expect((saved as Lesson & { checkpoint_reason?: unknown }).checkpoint_reason).toBeUndefined();

    const list = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`, { cookie });
    expect(list.status).toBe(200);
    const index = ((await list.json()) as { ok: boolean; data: VersionIndex }).data;
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]?.reason).toBe('ai_accepted');

    const get = await api.request(
      'GET',
      `/api/lessons/${LESSON_ID}/versions/${index.entries[0]!.revision}`,
      { cookie }
    );
    expect(get.status).toBe(200);
    const record = ((await get.json()) as { ok: boolean; data: VersionRecord }).data;
    expect(record.snapshot).toMatchObject({ title: 'AI accepted title' });
  });
});
