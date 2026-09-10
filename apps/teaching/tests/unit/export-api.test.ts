import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import type { PortableExport } from '@/export/portable';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const LESSON_ID = 'lesson_aotfw_008';
const UNIT_ID = 'unit_aotfw';

function freshApi() {
  return createMockApi({
    seed: JSON.parse(JSON.stringify(seedFixture)) as SeedData,
    passphrase: PASSPHRASE
  });
}

async function signIn(api: ReturnType<typeof createMockApi>): Promise<string> {
  const res = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie') as string;
}

describe('GET /api/export (mock)', () => {
  it('requires auth', async () => {
    const api = freshApi();
    const res = await api.request('GET', `/api/export?kind=lesson&id=${LESSON_ID}`);
    expect(res.status).toBe(401);
  });

  it('exports a full lesson draft', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', `/api/export?kind=lesson&id=${LESSON_ID}`, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: PortableExport };
    expect(body.data.kind).toBe('lesson');
    expect(body.data.lesson?.id).toBe(LESSON_ID);
    expect(body.data.lesson?.blocks?.length).toBeGreaterThan(0);
    expect(JSON.stringify(body.data)).not.toMatch(/passphrase|SESSION_SECRET/i);
  });

  it('exports a unit with its lessons', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', `/api/export?kind=unit&id=${UNIT_ID}`, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: PortableExport };
    expect(body.data.kind).toBe('unit');
    expect(body.data.unit?.id).toBe(UNIT_ID);
    expect(body.data.lessons?.some((row) => row.id === LESSON_ID)).toBe(true);
  });

  it('exports a full archive without media bytes or AI jobs', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/export?kind=archive', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: PortableExport };
    expect(body.data.kind).toBe('archive');
    expect(body.data.objects.lessons).toBeGreaterThan(0);
    expect(body.data.years?.length).toBeGreaterThan(0);
    expect(body.data.media_files).toBeUndefined();
    expect(body.data.ai_jobs).toBeUndefined();
  });
});
