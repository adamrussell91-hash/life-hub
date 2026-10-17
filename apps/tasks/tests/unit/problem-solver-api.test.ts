import { describe, expect, it, vi } from 'vitest';
import { pollUntilSettled } from '@/views/problem-solver/api';
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
