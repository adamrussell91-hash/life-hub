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
    const res = await api.request('PATCH', '/api/units/unit_lkeep', {
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
        code: 'LKEEP-CR',
        title: 'Close reading',
        description: 'Annotate a passage for voice and guilt.'
      }
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.data.source).toBe('custom');
    expect(created.data.code).toBe('LKEEP-CR');

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const subject = curriculum.data.subjects.find(
      (row: { id: string }) => row.id === 'subject_y12_engadv'
    );
    expect(subject.outcome_ids).toContain(created.data.id);
  });

  it('edits, reorders, merges and deletes outcomes through the item routes', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const add = (code: string) =>
      api.request('POST', '/api/outcomes', {
        cookie,
        body: { subject_id: 'subject_y12_engadv', code, title: code, description: `${code} wording`, group: 'Custom' }
      });
    const keep = (await (await add('EAV-12-04')).json()).data;
    expect((await add(' eav-12-04 ')).status).toBe(409);
    const extra = (await (await add('EAV-12-09')).json()).data;

    const unit = await api.request('PATCH', '/api/units/unit_lkeep', { cookie, body: { outcome_ids: ['EA12-6', extra.id] } });
    expect(unit.status).toBe(200);

    const patched = await api.request('PATCH', `/api/outcomes/${keep.id}`, {
      cookie,
      body: { title: 'New and different contexts', group: 'Module A' }
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.group).toBe('Module A');

    const blocked = await api.request('DELETE', `/api/outcomes/${extra.id}`, { cookie });
    expect(blocked.status).toBe(409);

    const merged = await api.request('POST', `/api/outcomes/${extra.id}/merge`, { cookie, body: { into: keep.id } });
    expect(merged.status).toBe(200);

    const curriculum = (await (await api.request('GET', '/api/curriculum', { cookie })).json()).data;
    const unitRow = curriculum.units.find((row: { id: string }) => row.id === 'unit_lkeep');
    expect(unitRow.outcome_ids).toEqual(['EA12-6', keep.id]);
    expect(curriculum.outcomes.some((row: { id: string }) => row.id === extra.id)).toBe(false);

    const subject = curriculum.subjects.find((row: { id: string }) => row.id === 'subject_y12_engadv');
    const reordered = [keep.id, ...subject.outcome_ids.filter((id: string) => id !== keep.id)];
    const saved = await api.request('PATCH', '/api/subjects/subject_y12_engadv', { cookie, body: { outcome_ids: reordered } });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.outcome_ids[0]).toBe(keep.id);

    const unused = (await (await add('EAV-12-10')).json()).data;
    expect((await api.request('DELETE', `/api/outcomes/${unused.id}`, { cookie })).status).toBe(200);
  });
});
