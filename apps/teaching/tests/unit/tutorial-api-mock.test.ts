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
  it('serves the tutorial function for students', async () => {
    const api = createMockApi({ seed: JSON.parse(JSON.stringify(seed)) as SeedData, passphrase: PASSPHRASE });
    const student = await api.request('POST', '/api/published/tutorial/nope', { body: { action: 'status' } });
    expect(student.status).toBe(404);
  });
  // The teacher route (/api/lessons/:id/tutorial) arrives with Task 14; add its 404 check there.
});
