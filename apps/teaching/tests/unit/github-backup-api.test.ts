import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { GITHUB_BACKUP_PATH } from '@/export/github-backup';

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

describe('POST /api/backup/github (mock)', () => {
  it('requires auth', async () => {
    const api = freshApi();
    const res = await api.request('POST', '/api/backup/github');
    expect(res.status).toBe(401);
  });

  it('commits the portable archive snapshot', async () => {
    const api = freshApi();
    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = auth.headers.get('set-cookie') as string;
    const res = await api.request('POST', '/api/backup/github', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      data: { path: string; commit_url: string };
    };
    expect(body.data.path).toBe(GITHUB_BACKUP_PATH);
    expect(body.data.commit_url).toContain('http');
  });
});
