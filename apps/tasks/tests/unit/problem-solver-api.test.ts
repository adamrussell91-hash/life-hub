import { describe, expect, it, vi } from 'vitest';
import { pollUntilSettled, problemSolverApi } from '@/views/problem-solver/api';
import type { PsSession } from '../../../../packages/problem-solver/types';

const at = (status: PsSession['runner']['status']) => ({ runner: { status, mode: 'turn', error: null } }) as PsSession;

describe('pollUntilSettled', () => {
  it('polls while queued or running and stops when idle', async () => {
    const states = [at('queued'), at('running'), at('idle')];
    const get = vi.fn(async () => states.shift()!);
    const seen: string[] = [];
    const final = await pollUntilSettled('id', (s) => seen.push(s.runner.status), { get, intervalMs: 1 });
    expect(final.runner.status).toBe('idle');
    expect(seen).toEqual(['queued', 'running', 'idle']);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const get = vi.fn(async () => { controller.abort(); return at('queued'); });
    await expect(pollUntilSettled('id', () => undefined, { get, intervalMs: 1, signal: controller.signal })).rejects.toThrow('aborted');
  });
});

describe('problemSolverApi.actWith', () => {
  it('posts the action and its JSON payload with the session revision', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { session: { id: 's1', revision: 5 } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const next = await problemSolverApi.actWith({ id: 's1', revision: 4 } as PsSession, 'confirm_task', { proposalId: 'p1', taskId: 'task-1' });
      expect(next.revision).toBe(5);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain('/api/problem-solver');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toMatchObject({ id: 's1', revision: 4, action: 'confirm_task', payload: { proposalId: 'p1', taskId: 'task-1' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('create posts the kind for a Lightning run', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { session: { id: 'l1' } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await problemSolverApi.create({ text: 'The door sticks', kind: 'lightning' });
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(String(init.body)).create).toMatchObject({ text: 'The door sticks', kind: 'lightning' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('linked asks for the sessions linked to a task', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { sessions: [{ id: 's1', title: 'T', phase: 'implement', model: 'seven_step', role: 'task' }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const rows = await problemSolverApi.linked('task:t1');
      expect(rows[0].role).toBe('task');
      expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain('linked=task%3At1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
