// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockApi, loadSeedFile } from '../../scripts/mock-api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const seed = loadSeedFile(path.resolve(root, '../../fixtures/seed.json'));
const PASSPHRASE = 'teaching-hub-local';

describe('mock /api/alchemy-lab', () => {
  it('requires auth and returns fixture cards', async () => {
    const api = createMockApi({ seed, passphrase: PASSPHRASE });
    const unauth = await api.request('POST', '/api/alchemy-lab', {
      body: { lessonText: 'duty' }
    });
    expect(unauth.status).toBe(401);

    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = auth.headers.get('set-cookie');

    const empty = await api.request('POST', '/api/alchemy-lab', {
      cookie,
      body: { lessonText: '  ' }
    });
    expect(empty.status).toBe(400);

    const ok = await api.request('POST', '/api/alchemy-lab', {
      cookie,
      body: { lessonText: 'inherited duty' }
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      ok: boolean;
      data: { mode: string; connections: Array<{ sourcePageId: string }> };
    };
    expect(body.data.mode).toBe('local');
    expect(body.data.connections).toHaveLength(3);
    expect(body.data.connections[0]?.sourcePageId).toBeTruthy();
  });
});
