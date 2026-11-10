import { afterEach, describe, expect, it, vi } from 'vitest';
import { setProtocolCosts } from '../../../../packages/protocol-view/cost.mjs';
import { catalog } from '../../../../config/knowledge/cognitive/definitions.mjs';
import type { Thread } from '@/views/thinking/types';

const detourBodies: Record<string, unknown>[] = [];
const baseThread = {
  id: 'thr-1', revision: 3, createdAt: '2026-11-02T01:00:00Z', updatedAt: '2026-11-09T01:00:00Z', title: 'Choosing between two garden plots',
  situation: 'Two plots, one budget.', status: 'open', restUntil: null,
  digest: { facts: ['Plot A is shaded'], choices: ['Take plot B'], restsOn: [], openQuestions: ['Who waters it in summer?'] },
  sessions: [{ kind: 'tool', tool: 'decision-book', sessionId: 'home-1', role: 'home', from: null, question: null, state: 'open', packet: null, landing: null }],
  route: [
    { at: '2026-11-03T00:00:00Z', joint: 'asked', optionId: 'protocol:fates', reason: null, outcome: 'taken', stepId: null, sessionId: 'home-1' },
    { at: '2026-11-04T00:00:00Z', joint: 'asked', optionId: 'protocol:mirror', reason: null, outcome: 'not_now', stepId: null, sessionId: 'home-1' }
  ],
  links: [], lastCheckAt: null
} as unknown as Thread;

vi.mock('@/views/thinking/api', () => ({
  threadsApi: { get: vi.fn(async () => baseThread) },
  withRevision: vi.fn(async (thread: Thread, build: (t: Thread) => Record<string, unknown>) => {
    detourBodies.push({ id: thread.id, revision: thread.revision, ...build(thread) });
    return { thread: baseThread, open: { tool: 'knowledge-protocols', sessionId: 'run-9', route: '#/think/thr-1?detour=run-9' } };
  })
}));

const { mountProtocolDetour, runLabel, timeEstimate, witnessDraft, NO_COST_LABEL, RUNNING_NOTE } = await import('@/views/thinking/protocol-detour');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  setProtocolCosts({});
  detourBodies.length = 0;
});

describe('witnessDraft', () => {
  it('builds a Witness intake from the route log and digest, with no AI', () => {
    const draft = witnessDraft(baseThread);
    expect(draft.protocolId).toBe('witness');
    expect(draft.mode).toBe('standard');
    expect(draft.intake.instance).toContain('Choosing between two garden plots');
    expect(draft.intake.timeBoundary).toBe('From 2026-11-02 to 2026-11-09');
    expect(draft.intake.outcome).toContain('Take plot B');
    expect(draft.intake.process).toContain('protocol:fates');
    expect(draft.intake.process).toContain('Suggestions not taken: protocol:mirror');
    expect(draft.intake.concerns).toBe('Who waters it in summer');
    const fields = catalog.find((d: { id: string }) => d.id === 'witness').intake.map((f: { id: string }) => f.id);
    expect(Object.keys(draft.intake).every((key) => fields.includes(key))).toBe(true);
  });
});

describe('run button', () => {
  it('shows the median cost with three or more logged runs, else "no cost data yet"', () => {
    expect(runLabel('fates', 'sprint')).toBe(NO_COST_LABEL);
    setProtocolCosts({ 'fates:sprint': { aud: 0.42, runs: 5 } });
    expect(runLabel('fates', 'sprint')).toBe('Run (≈ A$0.42)');
    expect(runLabel('fates', 'long')).toBe(NO_COST_LABEL);
  });
  it('gives a rough time for each mode', () => {
    expect(timeEstimate('fates', 'sprint')).toMatch(/10 to 15/);
    expect(timeEstimate('fates', 'long')).toMatch(/30 to 40/);
  });
});

describe('mountProtocolDetour', () => {
  function stubFetch(status = 'running') {
    const session = { id: 'run-9', protocolId: 'fates', mode: 'sprint', status, stage: 'briefing', speaker: 'lachesis', revision: 1, transcript: [], checkpoint: null, allowedActions: ['cancel'], error: null };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('costs=1')) return json({ costs: { 'fates:sprint': { aud: 0.31, runs: 4 } } });
      if (String(url).includes('sessionId=')) return json({ session });
      return json({ catalog });
    }));
  }

  it('shows the pre-filled intake with the cost on the button, and runs nothing until Run is pressed', async () => {
    stubFetch();
    const host = document.createElement('div');
    mountProtocolDetour(host, { threadId: 'thr-1', draft: { protocolId: 'fates', mode: 'sprint', intake: { task: 'Pick a garden plot' } } });
    await flush();
    await flush();
    expect(host.querySelector<HTMLTextAreaElement>('textarea[name="task"]')?.value).toBe('Pick a garden plot');
    expect(host.querySelector('[data-protocol-run]')?.textContent).toBe('Run (≈ A$0.31)');
    expect(host.querySelector('[data-protocol-estimate]')?.textContent).toMatch(/minutes/);
    expect(detourBodies).toEqual([]);
  });

  it('starts the run through the thread detour action with the edited intake, then shows the running panel', async () => {
    stubFetch();
    const host = document.createElement('div');
    const started = vi.fn();
    mountProtocolDetour(host, { threadId: 'thr-1', draft: { protocolId: 'fates', mode: 'sprint', intake: { task: 'Pick a garden plot' } }, fromStepId: 'step-2', question: 'Which plot?', onStarted: started });
    await flush();
    await flush();
    host.querySelector<HTMLTextAreaElement>('textarea[name="task"]')!.value = 'Pick the better garden plot';
    host.querySelector<HTMLFormElement>('[data-protocol-form]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    expect(detourBodies).toHaveLength(1);
    expect(detourBodies[0]).toMatchObject({
      id: 'thr-1', action: 'detour', optionId: 'protocol:fates', mode: 'sprint',
      fromSessionId: 'home-1', fromStepId: 'step-2', question: 'Which plot?', intake: { task: 'Pick the better garden plot' }
    });
    expect(started).toHaveBeenCalledWith('run-9');
    expect(host.querySelector('.tt-protocol__note')?.textContent).toBe(RUNNING_NOTE);
    expect(host.querySelector('.tt-protocol__panel')).not.toBeNull();
  });

  it('shows an existing session straight away when given a sessionId', async () => {
    stubFetch();
    const host = document.createElement('div');
    mountProtocolDetour(host, { threadId: 'thr-1', sessionId: 'run-9' });
    await flush();
    await flush();
    expect(host.querySelector('.tt-protocol__note')?.textContent).toBe(RUNNING_NOTE);
    expect(host.querySelector('.protocol-session')).not.toBeNull();
  });
});
