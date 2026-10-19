// apps/tasks/tests/unit/problem-solver-task-bridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createTaskBridge, reviewBody, taskBody, taskSnapshot, TaskNotLinkedError } from '../../src/views/problem-solver/task-bridge';
import type { PsProposedTask, PsSession } from '../../../../packages/problem-solver/types';

const session = { id: 's1', title: 'Late rota', revision: 4, links: [{ kind: 'project', id: 'proj-1' }], proposedTasks: [], reviewProposal: null, reviewTaskId: null } as unknown as PsSession;
const proposal: PsProposedTask = { id: 'p1', title: 'Draft the template', status: 'proposed', due: '2026-10-24', source: { runId: 'k', nodeId: 'n1' } };

describe('task bodies', () => {
  it('a proposed task becomes a Tasks body tagged and sourced from Problem Solver, under the linked project', () => {
    expect(taskBody(session, { title: 'Draft the rota template', due: '2026-10-24' }, 'life')).toEqual({
      title: 'Draft the rota template', domain: 'life', due_date: '2026-10-24', description: 'From Problem Solver: Late rota', source: 'problem_solver', tags: ['problem-solver'], parent_project_id: 'proj-1'
    });
  });
  it('a Kanban card tagged Doing becomes a task already in progress; other cards start open', () => {
    const board = { id: 'k', tool: 'kanban', status: 'active', edges: [], nodes: [
      { id: 'n1', slot: 'card:1', text: 'a', tag: 'doing', state: 'accepted', skills: [], turnId: 't' },
      { id: 'n2', slot: 'card:2', text: 'b', tag: 'review', state: 'accepted', skills: [], turnId: 't' },
      { id: 'n3', slot: 'card:3', text: 'c', tag: 'todo', state: 'accepted', skills: [], turnId: 't' }
    ] };
    const withBoard = { ...session, steps: { implement: { runs: [board], status: 'open', objection: null } } } as unknown as PsSession;
    const edits = { title: 'Draft', due: null };
    expect(taskBody(withBoard, edits, 'life', { runId: 'k', nodeId: 'n1' }).status).toBe('in_progress');
    expect(taskBody(withBoard, edits, 'life', { runId: 'k', nodeId: 'n2' }).status).toBeUndefined();
    expect(taskBody(withBoard, edits, 'life', { runId: 'k', nodeId: 'n3' }).status).toBeUndefined();
  });
  it('create sends the in-progress status for a Doing card', async () => {
    const board = { id: 'k', tool: 'kanban', status: 'active', edges: [], nodes: [{ id: 'n1', slot: 'card:1', text: 'a', tag: 'doing', state: 'accepted', skills: [], turnId: 't' }] };
    const withBoard = { ...session, steps: { implement: { runs: [board], status: 'open', objection: null } } } as unknown as PsSession;
    const createTask = vi.fn().mockResolvedValue({ id: 'task-1' });
    const bridge = createTaskBridge({ createTask, getTask: vi.fn(), domainFor: async () => 'life', confirm: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn(), setReview: vi.fn() });
    await bridge.create(withBoard, proposal, { title: 'Draft', due: null });
    expect(createTask.mock.calls[0][0]).toMatchObject({ status: 'in_progress' });
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

describe('review fixes', () => {
  const confirmed = (id: string, taskId: string): PsProposedTask => ({ ...proposal, id, status: 'confirmed', taskId });
  const gone = async () => { throw Object.assign(new Error('Task not found'), { status: 404 }); };

  it('statuses returns while a dismissal is still pending, and dismissals go one after another', async () => {
    let release!: () => void;
    const dismiss = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (release = r))).mockResolvedValue(undefined);
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask: vi.fn(gone), domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    const statuses = await bridge.statuses([confirmed('a', 'x'), confirmed('b', 'y')]);
    expect(statuses).toEqual({ x: 'removed', y: 'removed' });
    expect(dismiss).toHaveBeenCalledTimes(1);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(dismiss).toHaveBeenLastCalledWith('b', 'removed');
  });

  it('a dismissal already on its way is not sent again by a second refresh', async () => {
    const dismiss = vi.fn(() => new Promise<void>(() => undefined));
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask: vi.fn(gone), domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    await bridge.statuses([confirmed('a', 'x')]);
    await bridge.statuses([confirmed('a', 'x')]);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('a confirm the server refuses leaves the created task in place and says it is not linked', async () => {
    const createTask = vi.fn().mockResolvedValue({ id: 'task-7' });
    const confirm = vi.fn().mockRejectedValue(Object.assign(new Error('That proposal was set aside.'), { code: 'action_not_allowed', status: 409 }));
    const bridge = createTaskBridge({ createTask, getTask: vi.fn(), domainFor: async () => 'life', confirm, dismiss: vi.fn(), setReview: vi.fn() });
    const err = await bridge.create(session, proposal, { title: 'Draft', due: null }).catch((e) => e);
    expect(err).toBeInstanceOf(TaskNotLinkedError);
    expect(err.taskId).toBe('task-7');
    expect(err.message).toContain('not linked');
  });

  it('a network failure on confirm keeps the task for a retry', async () => {
    const createTask = vi.fn().mockResolvedValue({ id: 'task-7' });
    const confirm = vi.fn().mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'network_error' })).mockResolvedValue(undefined);
    const bridge = createTaskBridge({ createTask, getTask: vi.fn(), domainFor: async () => 'life', confirm, dismiss: vi.fn(), setReview: vi.fn() });
    await expect(bridge.create(session, proposal, { title: 'Draft', due: null })).rejects.toThrow('offline');
    await bridge.create(session, proposal, { title: 'Draft', due: null });
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('a refused review link says the review task was created but not linked', async () => {
    const bridge = createTaskBridge({
      createTask: vi.fn().mockResolvedValue({ id: 'task-8' }), getTask: vi.fn(), domainFor: async () => 'life', confirm: vi.fn(), dismiss: vi.fn(),
      setReview: vi.fn().mockRejectedValue(Object.assign(new Error('This problem already has a review task.'), { code: 'action_not_allowed', status: 409 }))
    });
    const err = await bridge.createReview(session, { title: 'Review', due: '2026-11-02' }).catch((e) => e);
    expect(err).toBeInstanceOf(TaskNotLinkedError);
    expect(err.taskId).toBe('task-8');
  });
});

describe('taskSnapshot', () => {
  it('counts confirmed tasks by live status, lists overdue open ones and leaves deleted tasks out', () => {
    const proposals = [
      { id: 'p1', title: 'Draft rota', status: 'confirmed', due: null, taskId: 't1', source: { runId: 'r', nodeId: 'n1' } },
      { id: 'p2', title: 'Ask for swaps', status: 'confirmed', due: null, taskId: 't2', source: { runId: 'r', nodeId: 'n2' } },
      { id: 'p3', title: 'Old', status: 'confirmed', due: null, taskId: 't3', source: { runId: 'r', nodeId: 'n3' } },
      { id: 'p4', title: 'Idea', status: 'proposed', due: null, source: { runId: 'r', nodeId: 'n4' } }
    ] as PsProposedTask[];
    const details = {
      t1: { status: 'done', due_date: '2026-10-25', title: 'Draft rota' },
      t2: { status: 'open', due_date: '2026-10-28', title: 'Ask for swaps' },
      t3: 'removed' as const
    };
    expect(taskSnapshot(proposals, details, '2026-11-02')).toEqual({
      byStatus: { open: 1, in_progress: 0, deferred: 0, done: 1, dead: 0, unknown: 0 },
      overdue: ['Ask for swaps']
    });
  });
  it('counts unknown and unrecognised statuses as unknown', () => {
    const proposals = [
      { id: 'p1', title: 'A', status: 'confirmed', taskId: 't1' },
      { id: 'p2', title: 'B', status: 'confirmed', taskId: 't2' }
    ] as PsProposedTask[];
    expect(taskSnapshot(proposals, { t1: 'unknown', t2: { status: 'weird' } }, '2026-11-02').byStatus.unknown).toBe(2);
  });
});

describe('bridge.details', () => {
  const confirmed = (id: string, taskId: string): PsProposedTask => ({ ...proposal, id, status: 'confirmed', taskId });
  it('returns the task, removed on a 404 or unknown on another failure, dismissing removed ones once', async () => {
    const getTask = vi.fn(async (id: string) => {
      if (id === 'gone') throw Object.assign(new Error('nf'), { status: 404 });
      if (id === 'bad') throw new Error('offline');
      return { id, status: 'done', due_date: '2026-10-25', title: 'T' };
    });
    const dismiss = vi.fn(() => new Promise<void>(() => undefined));
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask, domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    const list = [confirmed('a', 'ok'), confirmed('b', 'gone'), confirmed('c', 'bad')];
    expect(await bridge.details(list)).toEqual({ ok: { id: 'ok', status: 'done', due_date: '2026-10-25', title: 'T' }, gone: 'removed', bad: 'unknown' });
    await bridge.statuses(list);
    await new Promise((r) => setTimeout(r, 0));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith('b', 'removed');
  });
});
