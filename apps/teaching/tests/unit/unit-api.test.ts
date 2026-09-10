import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { unitKey } from '../../src/storage/keys';
import type { Unit } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const UNIT_ID = 'unit_aotfw';
const PATH = `/api/units/${UNIT_ID}`;
const ISO = '2026-01-01T00:00:00.000Z';

const validHeadingBlock = {
  id: 'block_unit_cover_preservation',
  type: 'block' as const,
  block_type: 'heading' as const,
  variant: 'section' as const,
  visibility: 'student_teacher' as const,
  content: { text: 'Keep this plan' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1 as const
};

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

describe('PATCH /api/units/:id (mock)', () => {
  it('clears only the cover and preserves unit blocks', async () => {
    const seed = freshSeed();
    const unit = seed.units.find(
      (entry) => (entry as { id?: string }).id === UNIT_ID
    ) as Record<string, unknown>;
    unit.cover = { url: 'https://cdn.example.com/unit.jpg' };
    unit.blocks = [validHeadingBlock];
    const api = freshApi(seed);
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { cover: null }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cover).toBeUndefined();
    expect(body.data).not.toHaveProperty('cover');
    expect(body.data.blocks).toEqual([validHeadingBlock]);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const stored = curriculum.data.units.find((row: Unit) => row.id === UNIT_ID);
    expect(stored).not.toHaveProperty('cover');
    expect(stored.blocks).toEqual([validHeadingBlock]);
  });
});

describe('unit storage key', () => {
  it('builds unit key', () => {
    expect(unitKey(UNIT_ID)).toBe(`units/${UNIT_ID}`);
  });
});
