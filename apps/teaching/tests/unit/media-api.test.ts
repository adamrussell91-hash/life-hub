import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import type { Media } from '@/schemas/media';
import { MAX_MEDIA_BYTES } from '@/media/upload-rules';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;
const PASSPHRASE = 'teaching-hub-local';

/** Minimal 1x1 PNG */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}
function freshApi(seed: SeedData = freshSeed()) {
  return createMockApi({ seed, passphrase: PASSPHRASE });
}
async function signIn(api: ReturnType<typeof createMockApi>): Promise<string> {
  const res = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie as string;
}

describe('media metadata API (mock)', () => {
  it('POST /api/media creates external media when authenticated', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Paste PDF',
        provider: 'external',
        media_type: 'pdf',
        preview_url: 'https://example.com/a.pdf'
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const media = body.data as Media;
    expect(media.provider).toBe('external');
    expect(media.id).toMatch(/^media_/);
    expect(media.title).toBe('Paste PDF');
    expect(media.status).toBe('active');
  });

  it('POST /api/media requires auth', async () => {
    const api = freshApi();
    const res = await api.request('POST', '/api/media', {
      body: { title: 'x', provider: 'external', media_type: 'pdf' }
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/media rejects provider direct', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/media', {
      cookie,
      body: { title: 'Nope', provider: 'direct', media_type: 'image' }
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/media/:id returns media', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const createRes = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Doc',
        provider: 'google_drive',
        media_type: 'link',
        preview_url: 'https://docs.google.com/document/d/1',
        provider_file_id: 'drive_1',
        sharing: 'restricted'
      }
    });
    const created = (await createRes.json()).data as Media;
    const getRes = await api.request('GET', `/api/media/${created.id}`, { cookie });
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()).data as Media).provider_file_id).toBe('drive_1');
  });

  it('PATCH /api/media/:id archives', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const createRes = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Archive me',
        provider: 'external',
        media_type: 'pdf',
        preview_url: 'https://example.com/a.pdf'
      }
    });
    const created = (await createRes.json()).data as Media;
    const patchRes = await api.request('PATCH', `/api/media/${created.id}`, {
      cookie,
      body: { status: 'archived' }
    });
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()).data as Media).status).toBe('archived');
  });

  it('GET /api/media/:id 404 when missing', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/media/media_missing', { cookie });
    expect(res.status).toBe(404);
  });

  it('POST /api/media registers id in curriculum media list', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const createRes = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Curriculum PDF',
        provider: 'external',
        media_type: 'pdf',
        preview_url: 'https://example.com/curriculum.pdf'
      }
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as Media;

    const curriculumRes = await api.request('GET', '/api/curriculum', { cookie });
    expect(curriculumRes.status).toBe(200);
    const media = (await curriculumRes.json()).data.media as Media[];
    expect(media.map((item) => item.id)).toContain(created.id);
  });
});

describe('media upload + file serve (mock)', () => {
  it('POST /api/media/upload stores bytes and returns direct media', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const form = new FormData();
    form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'cover.png');
    form.append('title', 'Cover');
    const res = await api.request('POST', '/api/media/upload', { cookie, body: form });
    expect(res.status).toBe(201);
    const media = (await res.json()).data as Media;
    expect(media.provider).toBe('direct');
    expect(media.media_type).toBe('image');
    expect(media.preview_url).toContain(`/api/media/${media.id}/file`);
    expect(media.sharing).toBe('public_link');

    const fileRes = await api.request('GET', `/api/media/${media.id}/file`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get('content-type')).toMatch(/image\/png/);

    const curriculumRes = await api.request('GET', '/api/curriculum', { cookie });
    expect(curriculumRes.status).toBe(200);
    const listed = (await curriculumRes.json()).data.media as Media[];
    expect(listed.map((item) => item.id)).toContain(media.id);
  });

  it('rejects disallowed MIME', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const form = new FormData();
    form.append('file', new Blob(['<html></html>'], { type: 'text/html' }), 'bad.html');
    const res = await api.request('POST', '/api/media/upload', { cookie, body: form });
    expect(res.status).toBe(400);
  });

  it('rejects oversized uploads', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const form = new FormData();
    const oversized = new File([new Uint8Array(0)], 'big.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: MAX_MEDIA_BYTES + 1 });
    form.append('file', oversized);
    const res = await api.request('POST', '/api/media/upload', { cookie, body: form });
    expect(res.status).toBe(400);
  });

  it('file GET returns 404 for archived media', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const form = new FormData();
    form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'cover.png');
    form.append('title', 'Archive file');
    const uploadRes = await api.request('POST', '/api/media/upload', { cookie, body: form });
    expect(uploadRes.status).toBe(201);
    const media = (await uploadRes.json()).data as Media;

    const patchRes = await api.request('PATCH', `/api/media/${media.id}`, {
      cookie,
      body: { status: 'archived' }
    });
    expect(patchRes.status).toBe(200);

    const fileRes = await api.request('GET', `/api/media/${media.id}/file`);
    expect(fileRes.status).toBe(404);
  });

  it('upload requires auth', async () => {
    const api = freshApi();
    const form = new FormData();
    form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'cover.png');
    const res = await api.request('POST', '/api/media/upload', { body: form });
    expect(res.status).toBe(401);
  });
});
