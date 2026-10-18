// apps/tasks/tests/unit/problem-solver-view.test.ts
import { describe, expect, it } from 'vitest';
import { mountCoachPanel, renderCoachPanel } from '@/views/problem-solver/coach-panel';
import { createTrack, problemMedal } from '@/views/problem-solver/decor';
import { mountCanvas } from '@/views/problem-solver/canvas';
import type { PsSession } from '../../../../packages/problem-solver/types';

function session(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's1', title: 'Late rota', revision: 3, status: 'active', phase: 'define',
    frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, links: [],
    define: { runs: [{ id: 'r1', tool: 'five_whys', status: 'active', nodes: [], edges: [] }], finishedEarly: false, exitObjection: null },
    turns: [
      { id: 't1', role: 'user', text: 'Late rota.', createdAt: '' },
      { id: 't2', role: 'coach', text: 'That is a person, not a process. What happens?', verdict: 'challenge', skillsSeen: [], skillsMissing: ['analysis'], createdAt: '' }
    ],
    summary: '', suggestion: null, pendingKeep: { slot: 'why:1', text: 'Sam forgets', objection: 'x' },
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '', ...extra
  };
}

const noop = { onSay: () => undefined, onAction: () => undefined };

describe('coach panel', () => {
  it('renders turns with missing-skill chips and the keep button', () => {
    const panel = renderCoachPanel(session(), noop);
    expect(panel.querySelectorAll('.chat-message').length).toBe(2);
    expect(panel.querySelector('.ps-skill--missing')).not.toBeNull();
    expect(panel.querySelector('[data-action="keep_anyway"]')).not.toBeNull();
    expect(panel.querySelector('[data-action="finish_define"]')).not.toBeNull();
  });

  it('shows a suggestion card and disables the composer while thinking', () => {
    const panel = renderCoachPanel(session({ pendingKeep: null, suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' }, runner: { status: 'running', mode: 'turn', error: null } }), noop);
    expect(panel.querySelector('.ps-suggestion')!.textContent).toContain('Problem tree');
    expect(panel.querySelector('.ps-suggestion__title .ps-emblem')).not.toBeNull();
    expect(panel.querySelector('[data-action="accept_suggestion"]')).not.toBeNull();
    expect((panel.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
    expect(panel.textContent).toContain('Coach is thinking');
  });

  it('shows the retry action when the coach failed', () => {
    const panel = renderCoachPanel(session({ runner: { status: 'failed', mode: 'turn', error: 'Coach lost the thread, try again.' } }), noop);
    expect(panel.querySelector('[data-action="retry"]')).not.toBeNull();
  });
});

describe('coach panel updates in place', () => {
  it('appends new turns, swaps the thinking bubble for the reply and keeps the composer text', () => {
    const panel = mountCoachPanel(noop);
    const base = session({ pendingKeep: null });
    panel.update(base);
    const list = panel.el.querySelector('.ps-coach__messages')!;
    const firstNode = list.firstElementChild;
    expect(list.querySelector('.is-new')).toBeNull();
    const input = panel.el.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'half typed';
    const asked = { ...base, turns: [...base.turns, { id: 't3', role: 'user' as const, text: 'Because Friday.', createdAt: '' }], runner: { status: 'running' as const, mode: 'turn' as const, error: null } };
    panel.update(asked);
    expect(list.firstElementChild).toBe(firstNode);
    const thinking = list.querySelector('.ps-msg--thinking')!;
    expect(thinking).not.toBeNull();
    expect(list.lastElementChild).toBe(thinking);
    expect(input.value).toBe('half typed');
    panel.update({ ...asked, turns: [...asked.turns, { id: 't4', role: 'coach' as const, text: 'Why Friday?', createdAt: '' }], runner: { status: 'idle', mode: 'turn', error: null } });
    expect(list.querySelector('.ps-msg--thinking')).toBeNull();
    expect(list.querySelectorAll('.chat-message').length).toBe(4);
    expect(list.lastElementChild!.classList.contains('is-new')).toBe(true);
    expect(list.lastElementChild!.querySelector('.ps-avatar')).not.toBeNull();
  });

  it('clears the composer once the sent answer shows in the thread', () => {
    const panel = mountCoachPanel(noop);
    const base = session({ pendingKeep: null });
    panel.update(base);
    const input = panel.el.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'Because Friday.';
    panel.update({ ...base, turns: [...base.turns, { id: 't3', role: 'user', text: 'Because Friday.', createdAt: '' }] });
    expect(input.value).toBe('');
  });
});

describe('frame and track', () => {
  it('fills frame pieces in place and marks the current question', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    const empty = { runs: [], finishedEarly: false, exitObjection: null };
    canvas.update(session({ phase: 'frame', frame: { goal: 'Ship it' }, define: empty }));
    const frame = host.querySelector('.ps-frame');
    expect(host.querySelectorAll('.ps-frame__row.is-answered').length).toBe(1);
    expect(host.querySelector('.ps-frame__row[data-state="now"]')!.textContent).toContain('What is true?');
    expect(host.querySelector('.ps-frame__piece--mid')!.getAttribute('data-state')).toBe('now');
    canvas.update(session({ phase: 'frame', frame: { goal: 'Ship it', whatIsTrue: 'Late 3 of 4 weeks', whatCanBeDone: 'Move the day' }, define: empty, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom.' } }));
    expect(host.querySelector('.ps-frame')).toBe(frame);
    expect(host.querySelector('.ps-frame__medal')!.classList.contains('is-done')).toBe(true);
    expect(host.querySelector('.ps-frame__core [data-tool="five_whys"] path')).not.toBeNull();
  });

  it('draws Frame then the model steps, with the current one marked', () => {
    const track = createTrack();
    track.update(session());
    const stations = [...track.el.querySelectorAll('.ps-track__stn')];
    expect(stations[0].querySelector('.ps-track__name')!.textContent).toBe('Frame');
    expect(stations[0].getAttribute('data-state')).toBe('done');
    expect(stations[1].querySelector('.ps-track__name')!.textContent).toBe('Define');
    expect(stations[1].getAttribute('aria-current')).toBe('step');
  });

  it('medal fills one piece per answered question', () => {
    const medal = problemMedal(2, 'five_whys');
    expect(medal.querySelector('.ps-medal__mid')!.getAttribute('fill')).toBe('var(--ps-yellow)');
    expect(medal.querySelector('.ps-medal__bot')!.getAttribute('fill')).toBe('var(--ps-ghost)');
  });
});

describe('canvas', () => {
  it('shows the frame card in frame phase and the 5 Whys svg in define', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session({ phase: 'frame', frame: { goal: 'Ship it' }, define: { runs: [], finishedEarly: false, exitObjection: null } }));
    expect(host.querySelector('.ps-frame')!.textContent).toContain('Ship it');
    canvas.update(session());
    expect(host.querySelector('.ps-whys')).not.toBeNull();
  });

  it.each([
    ['five_whys', 'problem', '.ps-whys'],
    ['problem_tree', 'trunk', '.ps-tree'],
    ['concept_map', 'theme', '.ps-cmap'],
    ['problem_statement', 'problem', '.ps-statement'],
    ['gap_basic', 'current', '.ps-gap'],
    ['gap_radar', 'current', '.ps-radar'],
    ['smart', 'problem', '.ps-smart']
  ] as const)('draws %s with its own chart', (tool, slot, selector) => {
    const host = document.createElement('div');
    mountCanvas(host).update(session({ define: { runs: [{ id: `r-${tool}`, tool, status: 'active', nodes: [{ id: 'n', slot, text: 'Something specific', state: 'accepted', skills: [], turnId: 't' }], edges: [], ...(tool === 'gap_radar' ? { radar: { snapshots: [] } } : {}) }], finishedEarly: false, exitObjection: null } }));
    expect(host.querySelector(selector)).not.toBeNull();
    expect(host.querySelector('.ps-canvas__title .ps-emblem svg')).not.toBeNull();
  });
});

describe('canvas record', () => {
  const runs = (status: 'active' | 'done'): PsSession['define'] => ({
    runs: [
      { id: 'r1', tool: 'five_whys', status: 'switched', switchReason: 'Branches', nodes: [{ id: 'n', slot: 'problem', text: 'Late rota', state: 'accepted', skills: [], turnId: 't' }], edges: [] },
      { id: 'r2', tool: 'problem_tree', status, nodes: [{ id: 'n', slot: 'trunk', text: 'Late rota', state: 'accepted', skills: [], turnId: 't' }], edges: [] }
    ],
    finishedEarly: false,
    exitObjection: null
  });

  it('opens on the record once defined and shows the chart from the define step', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session({ phase: 'defined', status: 'defined', define: runs('done') }));
    expect(host.querySelector('[data-step="define"]')!.getAttribute('data-state')).toBe('done');
    expect(host.querySelector('.ps-tree')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-step="define"] button')!.click();
    expect(host.querySelector('.ps-tree')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.ps-canvas__toggle')!.click();
    expect(host.querySelector('.ps-record')).not.toBeNull();
  });

  it('opens a switched run from its filmstrip card', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session({ phase: 'defined', status: 'defined', define: runs('done') }));
    host.querySelector<HTMLButtonElement>('[data-run="r1"] button')!.click();
    expect(host.querySelector('.ps-whys')).not.toBeNull();
    expect(host.querySelector('.ps-canvas__toggle')!.textContent).toBe('Back to record');
  });

  it('shows the active chart during define with a Record toggle, and switches to the record when defined', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session({ define: runs('active') }));
    expect(host.querySelector('.ps-tree')).not.toBeNull();
    expect(host.querySelector('.ps-canvas__toggle')!.textContent).toBe('Record');
    host.querySelector<HTMLButtonElement>('.ps-canvas__toggle')!.click();
    expect(host.querySelector('[data-step="define"]')!.getAttribute('data-state')).toBe('current');
    canvas.update(session({ define: runs('active') }));
    expect(host.querySelector('.ps-record')).not.toBeNull();
    canvas.update(session({ phase: 'defined', status: 'defined', define: runs('done') }));
    expect(host.querySelector('[data-step="define"]')!.getAttribute('data-state')).toBe('done');
  });
});
