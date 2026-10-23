// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';

const seed = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/seed.json'), 'utf-8')) as SeedData;
const PASSPHRASE = 'teaching-hub-local';

describe('tutorial routes (mock)', () => {
  it('serves the tutorial functions for students and the teacher', async () => {
    const api = createMockApi({ seed: JSON.parse(JSON.stringify(seed)) as SeedData, passphrase: PASSPHRASE });
    const signIn = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = signIn.headers.get('set-cookie') as string;
    // Not a tutorial: the real functions answer, so the routes are wired.
    const student = await api.request('POST', '/api/published/tutorial/nope', { body: { action: 'status' } });
    expect(student.status).toBe(404);
    const teacher = await api.request('POST', '/api/lessons/nope/tutorial', { cookie, body: { action: 'summary' } });
    expect(teacher.status).toBe(404);
    expect(((await teacher.json()) as { error?: { code?: string } }).error?.code).toBe('not_found');
    // Signed out, the operator gate turns the teacher route away.
    const signedOut = await api.request('POST', '/api/lessons/nope/tutorial', { body: { action: 'summary' } });
    expect(signedOut.status).toBe(401);
  });
});
