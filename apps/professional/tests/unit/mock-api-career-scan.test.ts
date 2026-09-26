import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';

describe('mock api career-scan', () => {
  it('returns an honest empty Skills scan panel instead of Unknown route', async () => {
    const api = createMockApi();
    await api.handle('POST', '/api/auth', { passphrase: 'professional-hub-local' });

    const scan = await api.handle('GET', '/api/career-scan');
    expect(scan.status).toBe(200);
    expect(scan.body).toMatchObject({
      ok: true,
      data: {
        proposals: [],
        pending_count: 0,
        scan_state: { last_run_at: null }
      }
    });
    expect(JSON.stringify(scan.body)).not.toContain('Unknown route');

    const overview = await api.handle('GET', '/api/career');
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({
      ok: true,
      data: {
        achievements: [],
        futures: [],
        stones: [],
        scan: { pending_count: 0, last_run_at: null }
      }
    });

    const run = await api.handle('POST', '/api/career-scan?action=run-now', {});
    expect(run.status).toBe(200);
    expect((run.body as { ok: boolean; data: { skipped: boolean } }).data.skipped).toBe(false);
  });
});
