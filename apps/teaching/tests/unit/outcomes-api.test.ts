import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';

function freshApi() {
  return createMockApi({
    seed: JSON.parse(JSON.stringify(seedFixture)) as SeedData,
    passphrase: PASSPHRASE
  });
}

async function signIn(api: ReturnType<typeof createMockApi>): Promise<string> {
  const res = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie as string;
}

describe('outcomes library', () => {
  it('includes the subject catalog on GET /api/curriculum', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/curriculum', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.outcomes.some((row: { id: string }) => row.id === 'EA12-6')).toBe(true);
    const subject = body.data.subjects.find((row: { id: string }) => row.id === 'subject_y12_engadv');
    expect(subject.outcome_ids).toContain('EA12-1');
  });

  it('patches unit outcome_ids', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('PATCH', '/api/units/unit_aotfw', {
      cookie,
      body: { outcome_ids: ['EA12-6'] }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.outcome_ids).toEqual(['EA12-6']);
  });

  it('creates a custom outcome and adds it to the subject catalog', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/outcomes', {
      cookie,
      body: {
        subject_id: 'subject_y12_engadv',
        code: 'AOTFW-CR',
        title: 'Close reading',
        description: 'Annotate a passage for voice and guilt.'
      }
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.data.source).toBe('custom');
    expect(created.data.code).toBe('AOTFW-CR');

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const subject = curriculum.data.subjects.find(
      (row: { id: string }) => row.id === 'subject_y12_engadv'
    );
    expect(subject.outcome_ids).toContain(created.data.id);
  });
});
