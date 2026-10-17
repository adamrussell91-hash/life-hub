// apps/tasks/tests/unit/problem-solver-view.test.ts
import { describe, expect, it } from 'vitest';
import { renderCoachPanel } from '@/views/problem-solver/coach-panel';
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
    expect(panel.querySelector('[data-action="accept_suggestion"]')).not.toBeNull();
    expect((panel.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
    expect(panel.textContent).toContain('Coach is thinking');
  });

  it('shows the retry action when the coach failed', () => {
    const panel = renderCoachPanel(session({ runner: { status: 'failed', mode: 'turn', error: 'Coach lost the thread, try again.' } }), noop);
    expect(panel.querySelector('[data-action="retry"]')).not.toBeNull();
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

  it('falls back to the outline for tools without a renderer yet', () => {
    const host = document.createElement('div');
    mountCanvas(host).update(session({ define: { runs: [{ id: 'r2', tool: 'concept_map', status: 'active', nodes: [{ id: 'n', slot: 'theme', text: 'x', state: 'accepted', skills: [], turnId: 't' }], edges: [] }], finishedEarly: false, exitObjection: null } }));
    expect(host.querySelector('.ps-outline:not(.sr-only)')).not.toBeNull();
  });

  it.each([
    ['five_whys', 'problem', '.ps-whys'],
    ['problem_tree', 'trunk', '.ps-tree'],
    ['problem_statement', 'problem', '.ps-statement'],
    ['gap_basic', 'current', '.ps-gap'],
    ['gap_radar', 'current', '.ps-radar'],
    ['smart', 'problem', '.ps-smart']
  ] as const)('draws %s with its own chart', (tool, slot, selector) => {
    const host = document.createElement('div');
    mountCanvas(host).update(session({ define: { runs: [{ id: `r-${tool}`, tool, status: 'active', nodes: [{ id: 'n', slot, text: 'Something specific', state: 'accepted', skills: [], turnId: 't' }], edges: [], ...(tool === 'gap_radar' ? { radar: { snapshots: [] } } : {}) }], finishedEarly: false, exitObjection: null } }));
    expect(host.querySelector(selector)).not.toBeNull();
  });
});
