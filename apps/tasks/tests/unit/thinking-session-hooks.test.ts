import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Thread } from '../../src/views/thinking/types';

const get = vi.fn();
const checkIn = vi.fn();
vi.mock('../../src/views/thinking/api', async (orig) => ({
  ...(await orig<typeof import('../../src/views/thinking/api')>()),
  threadsApi: { get: (...a: unknown[]) => get(...a), patch: vi.fn(), route: vi.fn(), detour: vi.fn(), protocolDraft: vi.fn() },
  guideApi: { checkIn: (...a: unknown[]) => checkIn(...a), triage: vi.fn(), spend: vi.fn() }
}));

import { mountSessionThread } from '../../src/views/thinking/session-hooks';

const now = new Date().toISOString();
const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 'th1', revision: 1, createdAt: now, updatedAt: now, title: 'Choosing between two garden plots', situation: 'Two plots.', status: 'open', restUntil: null,
  digest: { facts: [], choices: [], restsOn: [], openQuestions: [] }, route: [], links: [], lastCheckAt: null,
  sessions: [
    { kind: 'tool', tool: 'decision-book', sessionId: 's1', role: 'home', from: null, question: null, state: 'open', packet: null, landing: null, addedAt: now },
    { kind: 'tool', tool: 'rules-book', sessionId: 'd1', role: 'detour', from: { sessionId: 's1', stepId: 'explore' }, question: 'What would the habit be?', state: 'returned',
      packet: { answer: 'Water on Sundays', detail: '', restsOn: [], openQuestions: ['Who has the key?'], actions: [], source: { tool: 'rules-book', sessionId: 'd1' } }, landing: null, addedAt: now }
  ],
  ...over
});
const session = (over: Record<string, unknown> = {}) => ({ id: 's1', threadId: 'th1', phase: 'frame', model: { id: 'seven_step', reason: '' }, frame: {}, learnings: [], summary: '', kind: 'decision', updatedAt: now, caseFile: null, ...over }) as never;

beforeEach(() => {
  get.mockReset();
  checkIn.mockReset().mockResolvedValue({ verdict: 'carry_on' });
});

describe('mountSessionThread', () => {
  it('stays hidden for a session with no thread', () => {
    const t = mountSessionThread({ say: vi.fn() });
    t.update(session({ threadId: null }));
    expect(t.el.hidden).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('shows the strip and a Came back block for a returned detour', async () => {
    get.mockResolvedValue(thread());
    const say = vi.fn().mockResolvedValue(undefined);
    const t = mountSessionThread({ say });
    document.body.append(t.el);
    t.update(session());
    await vi.waitFor(() => expect(t.el.hidden).toBe(false));
    expect(t.el.querySelector('.tt-strip__title')?.textContent).toBe('Choosing between two garden plots');
    expect(t.el.querySelector('.tt-land__answer')?.textContent).toBe('Water on Sundays');
    expect(t.el.textContent).toContain('Came back from Wayfinder');
    expect([...t.el.querySelectorAll('.tt-land .btn')].map((b) => b.textContent)).toEqual(['Use as this step’s answer', 'Add to notes', 'Not useful']);
    t.destroy();
    t.el.remove();
  });

  it('checks in when the frame is confirmed, with the step the session reached', async () => {
    get.mockResolvedValue(thread({ sessions: [thread().sessions[0]] }));
    const t = mountSessionThread({ say: vi.fn() });
    t.update(session());
    await vi.waitFor(() => expect(t.el.hidden).toBe(false));
    t.update(session({ phase: 'explore', revision: 2 }));
    await vi.waitFor(() => expect(checkIn).toHaveBeenCalled());
    expect(checkIn.mock.calls[0][0]).toMatchObject({ threadId: 'th1', joint: 'framed', sessionId: 's1', stepId: 'explore' });
    t.destroy();
  });

  it('checks in once on a detour that came back, and not again on the next visit', async () => {
    const base = thread();
    // A detour id no other test has seen: what has been checked is remembered for the page's life.
    get.mockResolvedValue({ ...base, sessions: [base.sessions[0], { ...base.sessions[1], sessionId: 'd-fresh' }] });
    const first = mountSessionThread({ say: vi.fn() });
    first.update(session({ phase: 'explore', id: 's1' }));
    await vi.waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1));
    expect(checkIn.mock.calls[0][0]).toMatchObject({ joint: 'returned', stepId: 'explore' });
    first.destroy();
    const second = mountSessionThread({ say: vi.fn() });
    second.update(session({ phase: 'explore' }));
    await vi.waitFor(() => expect(second.el.hidden).toBe(false));
    expect(checkIn).toHaveBeenCalledTimes(1);
    second.destroy();
  });

  it('marks a detour session so its record and review cards stay hidden', async () => {
    get.mockResolvedValue(thread());
    const page = document.createElement('div');
    const t = mountSessionThread({ say: vi.fn() });
    page.append(t.el);
    t.update(session({ threadDetour: { threadId: 'th1', fromSessionId: 'x', fromStepId: null, question: '' } }));
    expect(page.classList.contains('tt-is-detour')).toBe(true);
    t.destroy();
  });
});
