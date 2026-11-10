import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/views/thinking/api', () => ({
  guideApi: { checkIn: vi.fn() },
  threadsApi: {}
}));

import { guideApi } from '../../src/views/thinking/api';
import { cautionLine, clearCard, fireJoint, registerCardSlot } from '../../src/views/thinking/checkin-card';

const ctx = { threadId: 't1', sessionId: 's1', joint: 'before_commit' as const };
const caution = { snareId: 'sn_confirmation', title: 'Confirmation bias', line: 'Every source so far backs the plan.', check: 'What would change my mind?' };

describe('caution line', () => {
  beforeEach(() => {
    clearCard();
  });
  it('renders the title, line and a folded check, and can be dismissed', () => {
    const line = cautionLine(caution);
    document.body.append(line);
    expect(line.textContent).toContain('Watch for: Confirmation bias.');
    expect(line.textContent).toContain('Every source so far backs the plan.');
    expect(line.querySelector('details summary')?.textContent).toBe('Ask yourself');
    expect(line.querySelector('details p')?.textContent).toBe(caution.check);
    line.querySelector<HTMLButtonElement>('.tt-caution__dismiss')!.click();
    expect(document.querySelector('.tt-caution')).toBeNull();
  });
  it('shows on a carry_on, which otherwise shows nothing', async () => {
    const host = document.createElement('div');
    registerCardSlot(host);
    vi.mocked(guideApi.checkIn).mockResolvedValue({ verdict: 'carry_on', caution } as never);
    await fireJoint(ctx);
    expect(host.querySelector('.tt-caution')).not.toBeNull();
    clearCard();
    vi.mocked(guideApi.checkIn).mockResolvedValue({ verdict: 'carry_on' } as never);
    await fireJoint(ctx);
    expect(host.querySelector('.tt-caution')).toBeNull();
    expect(host.children.length).toBe(0);
    registerCardSlot(null);
  });
});
