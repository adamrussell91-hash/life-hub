// apps/tasks/tests/unit/problem-solver-task-bridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createTaskBridge, reviewBody, taskBody } from '../../src/views/problem-solver/task-bridge';
import type { PsProposedTask, PsSession } from '../../../../packages/problem-solver/types';

const session = { id: 's1', title: 'Late rota', revision: 4, links: [{ kind: 'project', id: 'proj-1' }], proposedTasks: [], reviewProposal: null, reviewTaskId: null } as unknown as PsSession;
const proposal: PsProposedTask = { id: 'p1', title: 'Draft the template', status: 'proposed', due: '2026-10-24', source: { runId: 'k', nodeId: 'n1' } };

describe('task bodies', () => {
  it('a proposed task becomes a Tasks body tagged and sourced from Problem Solver, under the linked project', () => {
    expect(taskBody(session, { title: 'Draft the rota template', due: '2026-10-24' }, 'life')).toEqual({
      title: 'Draft the rota template', domain: 'life', due_date: '2026-10-24', description: 'From Problem Solver: Late rota', source: 'problem_solver', tags: ['problem-solver'], parent_project_id: 'proj-1'
    });
  });
  it('the review task carries review_at and the review tag', () => {
    expect(reviewBody(session, { title: 'Review: Late rota', due: '2026-11-02' }, 'life')).toMatchObject({ title: 'Review: Late rota', due_date: '2026-11-02', review_at: '2026-11-02', tags: ['problem-solver', 'review'] });
  });
});

describe('createTaskBridge', () => {
  it('creates the task then confirms it; a failed confirm retries without creating twice', async () => {
    const createTask = vi.fn().mockResolvedValue({ id: 'task-1' });
    const confirm = vi.fn().mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'conflict' })).mockResolvedValue(undefined);
    const bridge = createTaskBridge({ createTask, getTask: vi.fn(), domainFor: async () => 'life', confirm, dismiss: vi.fn(), setReview: vi.fn() });
    await expect(bridge.create(session, proposal, { title: 'Draft', due: null })).rejects.toThrow('conflict');
    await bridge.create(session, proposal, { title: 'Draft', due: null });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenLastCalledWith('p1', 'task-1');
  });
  it('statuses: found tasks give their status; a 404 gives removed and dismisses the proposal', async () => {
    const getTask = vi.fn(async (id: string) => {
      if (id === 'gone') throw Object.assign(new Error('Task not found'), { status: 404 });
      return { id, status: 'in_progress' };
    });
    const dismiss = vi.fn().mockResolvedValue(undefined);
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask, domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    const confirmed = (id: string, taskId: string): PsProposedTask => ({ ...proposal, id, status: 'confirmed', taskId });
    const statuses = await bridge.statuses([confirmed('a', 'task-1'), confirmed('b', 'gone')]);
    expect(statuses).toEqual({ 'task-1': 'in_progress', gone: 'removed' });
    expect(dismiss).toHaveBeenCalledWith('b', 'removed');
  });
  it('a network failure leaves the status unknown and dismisses nothing', async () => {
    const dismiss = vi.fn();
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask: vi.fn().mockRejectedValue(new Error('offline')), domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    expect(await bridge.statuses([{ ...proposal, status: 'confirmed', taskId: 't' }])).toEqual({ t: 'unknown' });
    expect(dismiss).not.toHaveBeenCalled();
  });
});

describe('removed tasks', () => {
  it('a proposal already dismissed as removed is not fetched again', async () => {
    const getTask = vi.fn();
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask, domainFor: async () => 'life', confirm: vi.fn(), dismiss: vi.fn(), setReview: vi.fn() });
    expect(await bridge.statuses([{ ...proposal, status: 'dismissed', removed: true, taskId: 'gone' }])).toEqual({});
    expect(getTask).not.toHaveBeenCalled();
  });
});
