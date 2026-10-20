// apps/tasks/tests/unit/problem-solver-case-file-bridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CaseFilePageGone, createCaseFileBridge } from '../../src/views/problem-solver/case-file-bridge';
import type { PsCaseFileOffer, PsSession } from '../../../../packages/problem-solver/types';

const file = {
  title: 'Late rota Problem Solver 20261102 v1',
  version: 1,
  sections: [
    { key: 'problem', heading: 'The problem', lines: ['Rota goes out late'] },
    { key: 'actions', heading: 'Actions', lines: ['Draft template'] }
  ]
};
const digests = { problem: 'a', actions: 'b' };
const writeOffer: PsCaseFileOffer = { kind: 'write', version: 1, file, digests, key: 'k1', changed: [] };
const updateOffer: PsCaseFileOffer = { kind: 'update', version: 2, file: { ...file, version: 2 }, digests: { problem: 'a', actions: 'b2' }, key: 'k2', changed: ['actions'] };
const session = { id: 's1234567-aaaa', title: 'Late rota', caseFile: null } as unknown as PsSession;
const written = {
  ...session,
  caseFile: { title: file.title, version: 1, target: { kind: 'project', id: 'proj-9' }, writtenAt: 'x', sections: digests, history: [] }
} as unknown as PsSession;

const missing = () => Object.assign(new Error('not found'), { status: 404 });

function deps(over: Record<string, unknown> = {}) {
  return {
    createProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    getProject: vi.fn().mockResolvedValue({ id: 'proj-1', page_blocks: [{ id: 'old' }] }),
    updateProject: vi.fn().mockResolvedValue({}),
    getTask: vi.fn().mockResolvedValue({ id: 't1', page_blocks: [] }),
    updateTask: vi.fn().mockResolvedValue({}),
    link: vi.fn().mockResolvedValue(undefined),
    today: () => '20261102',
    ...over
  };
}

describe('createCaseFileBridge', () => {
  it('a new project is created once, the blocks are appended after the existing ones, then linked', async () => {
    const d = deps();
    await createCaseFileBridge(d as never).write(session, writeOffer, { place: 'new', title: file.title });
    expect(d.createProject).toHaveBeenCalledTimes(1);
    expect(d.createProject).toHaveBeenCalledWith({ title: file.title });
    const [id, body] = d.updateProject.mock.calls[0];
    expect(id).toBe('proj-1');
    expect(body.page_blocks[0]).toEqual({ id: 'old' });
    expect(body.page_blocks).toHaveLength(1 + 4);
    expect(d.link).toHaveBeenCalledWith({ target: { kind: 'project', id: 'proj-1' }, version: 1, title: file.title, sections: digests });
  });

  it('a retry after a failed append does not create a second project or repeat blocks', async () => {
    const d = deps();
    d.updateProject.mockRejectedValueOnce(new Error('boom'));
    const bridge = createCaseFileBridge(d as never);
    await expect(bridge.write(session, writeOffer, { place: 'new', title: file.title })).rejects.toThrow('boom');
    expect(d.link).not.toHaveBeenCalled();
    await bridge.write(session, writeOffer, { place: 'new', title: file.title });
    expect(d.createProject).toHaveBeenCalledTimes(1);
    expect(d.updateProject).toHaveBeenCalledTimes(2);
    expect(d.link).toHaveBeenCalledTimes(1);

    // Blocks already on the page are skipped.
    const d2 = deps();
    const first = createCaseFileBridge(d2 as never);
    await first.write(session, writeOffer, { place: 'new', title: file.title });
    const sent = d2.updateProject.mock.calls[0][1].page_blocks;
    d2.getProject.mockResolvedValue({ id: 'proj-1', page_blocks: sent });
    await first.write(session, writeOffer, { place: 'new', title: file.title });
    expect(d2.updateProject).toHaveBeenCalledTimes(1);
  });

  it('an existing task uses getTask and updateTask', async () => {
    const d = deps();
    await createCaseFileBridge(d as never).write(session, writeOffer, { place: { kind: 'task', id: 't1' }, title: file.title });
    expect(d.createProject).not.toHaveBeenCalled();
    expect(d.getTask).toHaveBeenCalledWith('t1');
    expect(d.updateTask).toHaveBeenCalledTimes(1);
    expect(d.updateTask.mock.calls[0][0]).toBe('t1');
    expect(d.updateProject).not.toHaveBeenCalled();
    expect(d.link.mock.calls[0][0].target).toEqual({ kind: 'task', id: 't1' });
  });

  it('an update appends to the case file target and links only the changed digests, with no moved', async () => {
    const d = deps();
    await createCaseFileBridge(d as never).write(written, updateOffer, { place: { kind: 'project', id: 'proj-9' }, title: file.title });
    expect(d.getProject).toHaveBeenCalledWith('proj-9');
    expect(d.updateProject.mock.calls[0][0]).toBe('proj-9');
    expect(d.updateProject.mock.calls[0][1].page_blocks).toHaveLength(1 + 3);
    const payload = d.link.mock.calls[0][0];
    expect(payload).toEqual({ target: { kind: 'project', id: 'proj-9' }, version: 2, title: file.title, sections: { actions: 'b2' } });
    expect('moved' in payload).toBe(false);
  });

  it('a 404 on an update throws CaseFilePageGone; a later moved write sends every digest', async () => {
    const d = deps();
    d.getProject.mockRejectedValueOnce(missing());
    const bridge = createCaseFileBridge(d as never);
    await expect(bridge.write(written, updateOffer, { place: { kind: 'project', id: 'proj-9' }, title: file.title })).rejects.toBeInstanceOf(CaseFilePageGone);
    expect(d.link).not.toHaveBeenCalled();
    await bridge.write(written, updateOffer, { place: { kind: 'task', id: 't1' }, title: 'Late rota Problem Solver 20261102 v2', moved: true });
    expect(d.getTask).toHaveBeenCalledWith('t1');
    expect(d.link).toHaveBeenCalledWith({ target: { kind: 'task', id: 't1' }, version: 2, title: 'Late rota Problem Solver 20261102 v2', sections: { problem: 'a', actions: 'b2' }, moved: true });
  });

  it('other errors are not mistaken for a missing page', async () => {
    const d = deps();
    d.getProject.mockRejectedValueOnce(Object.assign(new Error('server'), { status: 500 }));
    await expect(createCaseFileBridge(d as never).write(written, updateOffer, { place: { kind: 'project', id: 'proj-9' }, title: file.title })).rejects.toThrow('server');
  });
});
