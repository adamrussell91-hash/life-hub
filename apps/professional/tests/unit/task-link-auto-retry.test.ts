import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTaskLinkPanel } from '@/components/schedule-relationships';

function mount(onRetry: (id: string) => Promise<void>) {
  const host = document.createElement('div');
  document.body.append(host);
  mountTaskLinkPanel({
    host,
    heading: 'Learning task',
    relationshipType: 'learning_for',
    incompleteOperationId: 'op_1',
    onRetry,
    onSubmit: async () => {}
  });
  return host;
}

describe('Task link panel with an incomplete link', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('has no Retry button and says Linking…', () => {
    const host = mount(vi.fn().mockResolvedValue(undefined));
    expect(host.textContent).not.toMatch(/Retry incomplete/);
    const state = host.querySelector<HTMLElement>('[data-link-state]');
    expect(state?.dataset.linkState).toBe('linking');
    expect(state?.textContent).toBe('Linking…');
    expect(host.querySelector<HTMLButtonElement>('[data-task-link-submit]')?.disabled).toBe(true);
  });

  it('retries by itself and shows ✓ linked', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const host = mount(onRetry);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onRetry).toHaveBeenCalledWith('op_1');
    expect(host.querySelector('[data-link-state]')?.textContent).toBe('✓ linked');
  });

  it('after an hour of failures shows the amber state and a Try now button', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('Tasks did not answer.'));
    const host = mount(onRetry);
    await vi.advanceTimersByTimeAsync(3_600_000 + 1_800_000);
    const state = host.querySelector<HTMLElement>('[data-link-state]');
    expect(state?.dataset.linkState).toBe('stuck');
    expect(state?.textContent).toContain('Tasks did not answer.');
    const tryNow = host.querySelector<HTMLButtonElement>('.task-link-panel__try');
    expect(tryNow?.hidden).toBe(false);
  });

  it('stops retrying once the panel is gone', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('down'));
    const host = mount(onRetry);
    host.remove();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(30000);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
