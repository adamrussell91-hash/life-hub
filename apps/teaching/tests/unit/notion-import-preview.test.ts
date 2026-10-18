// apps/teaching/tests/unit/notion-import-preview.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiGet } from '@/api/client';
import { parseNotionPageId, waitForJob } from '@/teacher/notion-import/api';
import { buildRows, choicesFrom, groupWarnings, toggleExcluded } from '@/teacher/notion-import/preview-model';
import type { ImportPlanPreview } from '@/notion-import/types';

vi.mock('@/api/client', async (original) => ({
  ...(await original<typeof import('@/api/client')>()),
  apiGet: vi.fn(),
  apiPost: vi.fn()
}));

const entity = (page_id: string, parent_page_id: string | null, label: string, needs: any[] = []) => ({
  page_id, parent_page_id, kind: 'lesson' as const, label, id: `id_${page_id}`, title: `T ${page_id}`,
  existing: page_id === 'l2', needs, suggested: {}
});
const plan: ImportPlanPreview = {
  root_page_id: 'u1',
  entities: [entity('u1', null, 'Unit'), entity('l1', 'u1', 'Lesson'), entity('l2', 'u1', 'Workshop')],
  skipped: [{ page_id: 'm1', parent_page_id: 'u1', title: 'Map', reason: 'Curriculum Map pages are not imported.' }],
  new_subjects: [], media_count: 0, html_apps: [{ page_id: 'l1', notion_block_id: 'c1', preview: '<html>' }],
  warnings: [
    { page_id: 'l1', notion_block_id: 'b', rule: 'flattened', message: 'a' },
    { page_id: 'l1', notion_block_id: 'c', rule: 'file_too_big', message: 'b' },
    { page_id: 'l2', notion_block_id: 'd', rule: 'flattened', message: 'c' }
  ]
};

describe('parseNotionPageId', () => {
  it('reads ids from Notion links and raw ids', () => {
    expect(parseNotionPageId('https://www.notion.so/Some-Lesson-0123456789abcdef0123456789abcdef?pvs=4'))
      .toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(parseNotionPageId('01234567-89ab-cdef-0123-456789abcdef')).toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(parseNotionPageId('not a link')).toBeNull();
  });
});

describe('preview model', () => {
  it('builds an indented tree with skipped pages and warning counts', () => {
    const rows = buildRows(plan, new Set());
    expect(rows.map((r) => [r.page_id, r.depth, r.label, r.included, r.warning_count])).toEqual([
      ['u1', 0, 'Unit', true, 0], ['l1', 1, 'Lesson', true, 2], ['l2', 1, 'Workshop', true, 1], ['m1', 1, 'Skipped', false, 0]
    ]);
    expect(rows[2].badge).toBe('Updates existing copy');
  });

  it('excluding a parent excludes its descendants', () => {
    const excluded = toggleExcluded(plan, new Set(), 'u1');
    expect([...excluded].sort()).toEqual(['l1', 'l2', 'u1']);
    expect([...toggleExcluded(plan, excluded, 'u1')]).toEqual([]);
  });

  it('groups warnings by rule and drops those for excluded pages', () => {
    const groups = groupWarnings(plan, new Set(['l2']));
    expect(groups.map((g) => [g.rule, g.items.length])).toEqual([['flattened', 1], ['file_too_big', 1]]);
  });

  it('builds choices', () => {
    expect(choicesFrom(new Set(['l2']), { u1: { year_id: 'y' } }, new Set(['c1']))).toEqual({
      excluded_page_ids: ['l2'], overrides: { u1: { year_id: 'y' } }, html_as_code: ['c1']
    });
  });
});
describe('waitForJob', () => {
  // Fake time: sleeping advances the clock, so nothing really waits.
  let t = 0;
  const opts = (intervalMs = 10_000) => ({ intervalMs, now: () => t, sleep: async (ms: number) => { t += ms; } });
  const job = (status: string, updated_at = 'a') => ({ id: 'nij_x', kind: 'plan', status, page_id: 'p', updated_at });
  beforeEach(() => { t = 0; vi.mocked(apiGet).mockReset(); });

  it('returns a planned job', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(job('queued')).mockResolvedValueOnce(job('planned', 'b'));
    expect((await waitForJob('nij_x', () => {}, opts())).status).toBe('planned');
  });

  it('treats any ApiClientError (for example a 401) as fatal', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiClientError({ code: 'unauthenticated', message: 'Please sign in to continue.' } as never));
    await expect(waitForJob('nij_x', () => {}, opts())).rejects.toThrow('Please sign in to continue.');
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('keeps polling through a network blip', async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(job('done', 'b'));
    expect((await waitForJob('nij_x', () => {}, opts())).status).toBe('done');
  });

  it('fails a job left queued for over 60 seconds', async () => {
    vi.mocked(apiGet).mockResolvedValue(job('queued'));
    await expect(waitForJob('nij_x', () => {}, opts())).rejects.toThrow("The import didn't start. Try again.");
  });

  it('keeps polling a running job whose heartbeat keeps updating', async () => {
    let n = 0;
    vi.mocked(apiGet).mockImplementation(async () => (++n > 60 ? job('done', 'z') : job('running', `u${n}`)) as never);
    expect((await waitForJob('nij_x', () => {}, { ...opts(), timeoutMs: 15 * 60 * 1000 })).status).toBe('done');
  });

  it('fails a running job with no update for over 4 minutes', async () => {
    vi.mocked(apiGet).mockResolvedValue(job('running', 'same'));
    await expect(waitForJob('nij_x', () => {}, opts())).rejects.toThrow('The import stopped responding. Try again.');
  });
});
