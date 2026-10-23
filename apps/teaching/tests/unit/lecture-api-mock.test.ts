// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';

const seed = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/seed.json'), 'utf-8')) as SeedData;
const PASSPHRASE = 'teaching-hub-local';

describe('lecture routes (mock)', () => {
  it('serves the lecture functions for students and the teacher', async () => {
    const api = createMockApi({ seed: JSON.parse(JSON.stringify(seed)) as SeedData, passphrase: PASSPHRASE });
    const signIn = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = signIn.headers.get('set-cookie') as string;
    // Not published as a lecture: the real function answers, so the route is wired.
    const student = await api.request('POST', '/api/published/lecture/nope', { body: { action: 'status' } });
    expect(student.status).toBe(404);
    expect(((await student.json()) as { error?: { code?: string } }).error?.code).toBe('not_found');
    const teacher = await api.request('POST', '/api/lessons/nope/lecture', { cookie, body: { action: 'summary' } });
    expect(teacher.status).toBe(200);
    expect(((await teacher.json()) as { data?: { students?: number } }).data?.students).toBe(0);
  });
});
