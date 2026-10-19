// apps/tasks/tests/unit/problem-solver-canvas-aim.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mountCanvas } from '@/views/problem-solver/canvas';
import type { PsSession, PsTaskLink, PsToolRun } from '../../../../packages/problem-solver/types';

vi.mock('../../design-kit/js/morphing-dialog.js', () => ({ morphFromRect: vi.fn() }));
/** A stand-in chart that records the task links the canvas forwards. */
const setTasks = vi.hoisted(() => vi.fn());
vi.mock('../../../../packages/problem-solver/render/five-whys', () => ({
  createFiveWhysView: () => ({ el: document.createElement('div'), update: () => undefined, setTasks })
}));

const swot: PsToolRun = {
  id: 'd1', tool: 'swot', status: 'done',
  nodes: [{ id: 'c1', slot: 'choice', text: 'Swap to a shared rota board, because it is visible to everyone', title: 'Shared rota board', state: 'accepted' }],
  edges: []
} as unknown as PsToolRun;
const kanban: PsToolRun = {
  id: 'k1', tool: 'kanban', status: 'active',
  nodes: [{ id: 'n1', slot: 'card:1', text: 'Draft the template', state: 'accepted', tag: 'todo' }],
  edges: []
} as unknown as PsToolRun;

function session(withDecide: boolean, extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's1', title: 'Late rota', revision: 3, kind: 'full', status: 'active', phase: 'implement',
    frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: '' }, links: [],
    steps: {
      ...(withDecide ? { decide: { runs: [swot], status: 'done', objection: null } } : {}),
      implement: { runs: [kanban], status: 'open', objection: null }
    },
    learnings: [], pendingLearning: null, turns: [], summary: '', suggestion: null, pendingKeep: null,
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '',
    proposedTasks: [], reviewProposal: null, reviewTaskId: null, ...extra
  } as unknown as PsSession;
}

describe('canvas aim caption', () => {
  it('an Implement chart shows the chosen option as its aim, and drops it when the choice goes', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session(true));
    const aim = host.querySelector('.ps-canvas__aim');
    expect(aim).not.toBeNull();
    expect(aim!.textContent).toContain('Shared rota board');
    expect(aim!.getAttribute('title')).toContain('visible to everyone');
    canvas.update(session(false));
    expect(host.querySelector('.ps-canvas__aim')).toBeNull();
  });

  it('a Decide chart has no aim caption', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session(true, { phase: 'decide', steps: { decide: { runs: [{ ...swot, status: 'active' }], status: 'open', objection: null } } } as Partial<PsSession>));
    expect(host.querySelector('.ps-canvas__aim')).toBeNull();
  });
});

describe('canvas task statuses', () => {
  it('sends the confirmed tasks of the run on screen, with their live status, to the view', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    const whys = { id: 'k1', tool: 'five_whys', status: 'active', nodes: [], edges: [] } as unknown as PsToolRun;
    const s = session(false, {
      steps: { implement: { runs: [whys], status: 'open', objection: null } },
      proposedTasks: [
        { id: 'p1', title: 'Draft', status: 'confirmed', due: null, taskId: 'task-1', source: { runId: 'k1', nodeId: 'n1' } },
        { id: 'p2', title: 'Other', status: 'confirmed', due: null, taskId: 'task-2', source: { runId: 'elsewhere', nodeId: 'x' } },
        { id: 'p3', title: 'Open', status: 'proposed', due: null, source: { runId: 'k1', nodeId: 'n2' } }
      ]
    });
    canvas.update(s);
    expect(setTasks).toHaveBeenLastCalledWith([{ nodeId: 'n1', taskId: 'task-1', status: 'unknown' }]);
    canvas.setTaskStatuses({ 'task-1': 'in_progress' });
    expect(setTasks).toHaveBeenLastCalledWith([{ nodeId: 'n1', taskId: 'task-1', status: 'in_progress' }] satisfies PsTaskLink[]);
  });
});
