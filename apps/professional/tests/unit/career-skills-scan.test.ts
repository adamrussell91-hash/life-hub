import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSkillsScanPanel } from '@/views/career-skills-scan';
import type { CareerModel } from '@/domain/career-model';

const PROJECT_REF = 'tasks:project:project_1';
const GONE_REF = 'professional:meeting:meeting_gone';

describe('renderSkillsScanPanel source chips', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          proposals: [
            {
              id: 'scan_1',
              title: 'Led the policy rewrite',
              source_refs: [PROJECT_REF, GONE_REF],
              source_labels: [
                { ref: PROJECT_REF, label: 'Policy rewrite', href: '/tasks/#/project/project_1' },
                { ref: GONE_REF, label: null, href: null }
              ]
            }
          ],
          pending_count: 1,
          scan_state: { last_run_at: null }
        }
      })
    ) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('links resolved sources to their records and leaves unresolved ones as plain chips', async () => {
    const host = document.createElement('div');
    renderSkillsScanPanel(host, { futures: [] } as unknown as CareerModel, { onChanged: () => {} });
    await vi.waitFor(() => expect(host.querySelector('.career-scan__card')).not.toBeNull());

    const chips = [...host.querySelectorAll('.career-scan__source-chip')];
    expect(chips).toHaveLength(2);
    expect(chips[0].tagName).toBe('A');
    expect(chips[0].getAttribute('href')).toBe('/tasks/#/project/project_1');
    expect(chips[0].textContent).toBe('From Project · Policy rewrite');
    expect(chips[1].tagName).toBe('SPAN');
    expect(chips[1].textContent).toBe('From Meeting');
  });
});
