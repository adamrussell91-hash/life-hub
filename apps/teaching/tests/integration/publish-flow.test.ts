import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const LESSON_ID = 'lesson_aotfw_008';
const UNIT_ID = 'unit_aotfw';

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}

function freshApi() {
  return createMockApi({ seed: freshSeed(), passphrase: PASSPHRASE });
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

describe('publish flow', () => {
  it('auth -> save draft -> publish -> student sees published-only content', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const draftRes = await api.request('GET', `/api/lessons/${LESSON_ID}`, {
      cookie
    });
    expect(draftRes.status).toBe(200);
    const draftBody = await draftRes.json();
    const lesson = draftBody.data;
    const draftTeacherOnlyCount = lesson.blocks.filter(
      (b: { visibility: string }) => b.visibility === 'teacher_only'
    ).length;
    expect(draftTeacherOnlyCount).toBeGreaterThan(0);

    lesson.title = 'Memory, Identity and Ono (Updated)';

    const putRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(putRes.status).toBe(200);

    const publishRes = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/publish`,
      { cookie }
    );
    expect(publishRes.status).toBe(200);
    const publishBody = await publishRes.json();
    expect(publishBody.data.student_path).toBe(`/s/lessons/${LESSON_ID}`);

    const draftAfterPublish = await (
      await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie })
    ).json();
    expect(draftAfterPublish.data.published_at).toBeTruthy();

    const studentRes = await api.request(
      'GET',
      `/api/published/lessons/${LESSON_ID}`
    );
    expect(studentRes.status).toBe(200);
    const studentBody = await studentRes.json();
    expect(studentBody.data.title).toBe('Memory, Identity and Ono (Updated)');
    expect(studentBody.data.blocks.length).toBeGreaterThan(0);
    expect(studentBody.data.blocks.length).toBeLessThan(lesson.blocks.length);
    for (const block of studentBody.data.blocks) {
      expect(block.visibility).toBe('student_teacher');
    }
  });

  it('draft changes after publish do not appear to students until re-publish', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, {
      cookie
    });
    const initial = await (
      await api.request('GET', `/api/published/lessons/${LESSON_ID}`)
    ).json();

    const draftBody = await (
      await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie })
    ).json();
    const lesson = draftBody.data;
    lesson.title = 'DRAFT ONLY TITLE';
    const putRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(putRes.status).toBe(200);

    const stillPublished = await (
      await api.request('GET', `/api/published/lessons/${LESSON_ID}`)
    ).json();
    expect(stillPublished.data.title).toBe(initial.data.title);
    expect(stillPublished.data.title).not.toBe('DRAFT ONLY TITLE');

    await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, {
      cookie
    });
    const republished = await (
      await api.request('GET', `/api/published/lessons/${LESSON_ID}`)
    ).json();
    expect(republished.data.title).toBe('DRAFT ONLY TITLE');
  });

  it('rejects an unauthenticated draft GET with 401', async () => {
    const api = freshApi();
    const res = await api.request('GET', `/api/lessons/${LESSON_ID}`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('unauthorized');
  });

  it('rejects an invalid passphrase with 401', async () => {
    const api = freshApi();
    const res = await api.request('POST', '/api/auth', {
      body: { passphrase: 'not-the-right-passphrase' }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('invalid_credentials');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects publish with an empty (whitespace-only) title with 400', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const draftBody = await (
      await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie })
    ).json();
    const lesson = draftBody.data;
    lesson.title = '   ';
    const putRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(putRes.status).toBe(200);

    const publishRes = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/publish`,
      { cookie }
    );
    expect(publishRes.status).toBe(400);
    const body = await publishRes.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('validation_error');
  });

  it('sanitises html blocks on publish', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const draftBody = await (
      await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie })
    ).json();
    const lesson = draftBody.data;
    const now = '2026-08-08T00:00:00.000Z';
    lesson.blocks.push({
      id: 'block_l008_html',
      type: 'block',
      block_type: 'html',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>Safe</p><script>alert(1)</script>' },
      layout: {},
      print: {},
      settings: {},
      created_at: now,
      updated_at: now,
      schema_version: 1
    });

    const putRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(putRes.status).toBe(200);

    const publishRes = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/publish`,
      { cookie }
    );
    expect(publishRes.status).toBe(200);

    const studentBody = await (
      await api.request('GET', `/api/published/lessons/${LESSON_ID}`)
    ).json();
    const htmlBlock = studentBody.data.blocks.find(
      (b: { block_type: string }) => b.block_type === 'html'
    );
    expect(htmlBlock).toBeTruthy();
    expect(htmlBlock.content.html).not.toContain('<script>');
    expect(htmlBlock.content.html).toContain('Safe');
  });

  it('never returns teacher_only blocks from the published endpoint', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, {
      cookie
    });

    const res = await api.request(
      'GET',
      `/api/published/lessons/${LESSON_ID}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.data.blocks.some(
        (b: { visibility: string }) => b.visibility === 'teacher_only'
      )
    ).toBe(false);
  });

  it('returns 404 for a published lesson that was never published', async () => {
    const api = freshApi();
    const res = await api.request(
      'GET',
      '/api/published/lessons/lesson_aotfw_001'
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('not_found');
  });

  it('requires teacher auth for curriculum, and returns nav data once signed in', async () => {
    const api = freshApi();
    const unauth = await api.request('GET', '/api/curriculum');
    expect(unauth.status).toBe(401);

    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/curriculum', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.years.length).toBeGreaterThan(0);
    expect(body.data.subjects.length).toBeGreaterThan(0);
    expect(body.data.units.length).toBeGreaterThan(0);
    expect(body.data.lessons.length).toBeGreaterThanOrEqual(8);
  });

  it('reports session state via GET /api/session and clears it via logout', async () => {
    const api = freshApi();
    const before = await (await api.request('GET', '/api/session')).json();
    expect(before.data.authenticated).toBe(false);

    const cookie = await signIn(api);
    const after = await (
      await api.request('GET', '/api/session', { cookie })
    ).json();
    expect(after.data.authenticated).toBe(true);
    expect(typeof after.data.expiresAt).toBe('number');

    const logoutRes = await api.request('POST', '/api/logout', { cookie });
    expect(logoutRes.status).toBe(200);
    const clearedCookie = logoutRes.headers.get('set-cookie');
    expect(clearedCookie).toContain('Max-Age=0');
  });

  it('published unit endpoint lists the lesson after publish', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const draftRes = await api.request('GET', `/api/lessons/${LESSON_ID}`, {
      cookie
    });
    expect(draftRes.status).toBe(200);
    const lesson = (await draftRes.json()).data;

    const saveRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(saveRes.status).toBe(200);

    const publishRes = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/publish`,
      { cookie }
    );
    expect(publishRes.status).toBe(200);

    const unitRes = await api.request('GET', `/api/published/units/${UNIT_ID}`);
    expect(unitRes.status).toBe(200);
    const unitBody = await unitRes.json();
    expect(unitBody.data.unit_id).toBe(UNIT_ID);
    expect(unitBody.data.title).toBeTruthy();
    expect(
      unitBody.data.lessons.some(
        (l: { lesson_id: string }) => l.lesson_id === LESSON_ID
      )
    ).toBe(true);
    expect(
      unitBody.data.lessons.some(
        (l: { lesson_id: string }) => l.lesson_id === 'lesson_aotfw_001'
      )
    ).toBe(false);
  });

  it('returns 404 for an unknown published unit', async () => {
    const api = freshApi();
    const res = await api.request(
      'GET',
      '/api/published/units/unit_does_not_exist'
    );
    expect(res.status).toBe(404);
  });
});
