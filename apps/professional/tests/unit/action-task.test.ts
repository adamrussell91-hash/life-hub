import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTask = vi.fn(async () => ({ id: 'task_1', title: 'Send the agenda' }));
const createUniversalLink = vi.fn(async () => ({}));
const patchLedger = vi.fn(async (_id: string, patch: { task_ref?: string }) => ({ item: { id: 'ledger_1', ...patch } }));

vi.mock('@/api/universal-links', () => ({ createTask, createUniversalLink }));
vi.mock('@/api/ledger', () => ({ patchLedger }));

const { makeActionTask } = await import('@/lib/action-task');

describe('makeActionTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('makes the task, links it back to the meeting, then records it on the action', async () => {
    const item = { id: 'ledger_1', text: 'Send the agenda' } as Parameters<typeof makeActionTask>[0];
    const next = await makeActionTask(item, 'professional:meeting:meeting_1');
    expect(createTask).toHaveBeenCalledWith({ title: 'Send the agenda' });
    expect(createUniversalLink).toHaveBeenCalledWith({
      source_ref: 'tasks:task:task_1',
      target_ref: 'professional:meeting:meeting_1',
      relationship_type: 'tagged_with'
    });
    expect(patchLedger).toHaveBeenCalledWith('ledger_1', { task_ref: 'tasks:task:task_1' });
    expect(next.task_ref).toBe('tasks:task:task_1');
  });

  it('leaves the action untouched when the link fails', async () => {
    createUniversalLink.mockRejectedValueOnce(new Error('nope'));
    await expect(makeActionTask({ id: 'ledger_1', text: 'x' } as Parameters<typeof makeActionTask>[0], 'professional:meeting:meeting_1')).rejects.toThrow();
    expect(patchLedger).not.toHaveBeenCalled();
  });
});
