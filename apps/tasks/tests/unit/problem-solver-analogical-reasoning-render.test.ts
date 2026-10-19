import { describe, expect, it } from 'vitest';
import { createAnalogicalReasoningView } from '../../../../packages/problem-solver/render/analogical-reasoning';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'analogical_reasoning', status: 'active', nodes, edges, ...extra });
const station = (view: { el: HTMLElement }, key: string) => view.el.querySelector<HTMLElement>(`[data-station="${key}"]`)!;
const face = (view: { el: HTMLElement }, key: string) => station(view, key).querySelector<HTMLButtonElement>('button:not([hidden])');
const lit = (view: { el: HTMLElement }, key: string) => station(view, key).classList.contains('is-lit');

const source = node('s', 'source');
const target1 = node('t1', 'target:1', { title: 'Hospital triage' });
const rules1 = [node('r1', 'rule:1', { title: 'Sort by urgency' }), node('r2', 'rule:2', { title: 'Book a slot' })];
const filtered1 = node('f1', 'filtered:1');
const assess1 = node('a1', 'assess:1', { tag: 'unsolved' });
const target2 = node('t2', 'target:2', { title: 'Airport check-in' });
const rule3 = node('r3', 'rule:3');
const filtered2 = node('f2', 'filtered:2');
const assess2 = node('a2', 'assess:2', { tag: 'solved' });
const retain = node('k', 'retain');

describe('Analogical reasoning view', () => {
  it('renders no stations and no chart for an empty run', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-analogy__chart')).toBeNull();
    expect(view.el.querySelector('[data-station]')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Analogical reasoning');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source, target1]));
    const item = view.el.querySelector('[data-node="s"]');
    const button = face(view, 'source');
    const chart = view.el.querySelector('.ps-analogy__chart');
    view.update(run([source, target1, ...rules1, filtered1, assess1, target2]));
    expect(view.el.querySelector('[data-node="s"]')).toBe(item);
    expect(face(view, 'source')).toBe(button);
    expect(view.el.querySelector('.ps-analogy__chart')).toBe(chart);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source, node('t1', 'target:1', { state: 'contested', objection: 'Does it share the cause, or only the look?' })]));
    const item = view.el.querySelector('[data-node="t1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(view.el.querySelector('[data-node="s"]')!.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Does it share the cause, or only the look?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Does it share the cause, or only the look?');
  });

  it('opens one details card at a time', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source, target1, ...rules1]));
    face(view, 'source')!.click();
    expect(station(view, 'source').classList.contains('is-open')).toBe(true);
    face(view, 'analogue')!.click();
    expect([...view.el.querySelectorAll('[data-station].is-open')].map((n) => n.getAttribute('data-station'))).toEqual(['analogue']);
    expect(face(view, 'source')!.getAttribute('aria-expanded')).toBe('false');
    expect(face(view, 'analogue')!.getAttribute('aria-expanded')).toBe('true');
    const card = view.el.querySelector(`#${face(view, 'analogue')!.getAttribute('aria-controls')}`)!;
    expect(card.classList.contains('is-open')).toBe(true);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
  });

  it('shows the short title in the station and the full answer only in details', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([node('s', 'source', { title: 'Queue at the pantry', text: 'People wait outside the food pantry for an hour before it opens.' })]));
    expect(view.el.querySelector('[data-node="s"] .ps-analogy__title')!.textContent).toBe('Queue at the pantry');
    expect(face(view, 'source')!.textContent).not.toContain('wait outside');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('wait outside'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('lights the source station once the source exists, and leaves unplaced stations as plain labels', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source]));
    expect(lit(view, 'source')).toBe(true);
    expect(station(view, 'source').getAttribute('data-node')).toBe('s');
    expect(lit(view, 'analogue')).toBe(false);
    expect(face(view, 'analogue')).toBeNull();
    expect(station(view, 'analogue').textContent).toContain('Analogue');
    expect(station(view, 'analogue').hasAttribute('data-node')).toBe(false);
  });

  it('shows a count of 2 on Match after two rules, and lists both rules in its details', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source, target1, rules1[0]]));
    expect(lit(view, 'match')).toBe(true);
    expect(station(view, 'match').querySelector('.ps-analogy__count')!.textContent).toBe('1');
    view.update(run([source, target1, ...rules1]));
    expect(station(view, 'match').querySelector('.ps-analogy__count')!.textContent).toBe('2');
    const card = view.el.querySelector(`#${face(view, 'match')!.getAttribute('aria-controls')}`)!;
    expect([...card.querySelectorAll('.ps-analogy__rule-title')].map((el) => el.textContent)).toEqual(['Sort by urgency', 'Book a slot']);
  });

  it('lights Revise and Search when a round ends unsolved, and not when it is solved', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source, target1, ...rules1, filtered1]));
    expect(lit(view, 'revise')).toBe(false);
    expect(lit(view, 'search')).toBe(false);
    view.update(run([source, target1, ...rules1, filtered1, assess1]));
    expect(lit(view, 'solved')).toBe(true);
    expect(station(view, 'solved').getAttribute('data-result')).toBe('unsolved');
    expect(lit(view, 'revise')).toBe(true);
    expect(lit(view, 'search')).toBe(true);
    // Revise and Search hold no node, so they never become buttons.
    expect(face(view, 'revise')).toBeNull();

    const solved = createAnalogicalReasoningView();
    solved.update(run([source, target1, ...rules1, filtered1, node('a1', 'assess:1', { tag: 'solved' })]));
    expect(station(solved, 'solved').getAttribute('data-result')).toBe('solved');
    expect(lit(solved, 'revise')).toBe(false);
    expect(lit(solved, 'search')).toBe(false);
  });

  it('adds round tabs once there are two analogues, and round 1 shows its own analogue', () => {
    const view = createAnalogicalReasoningView();
    view.update(run([source, target1, ...rules1, filtered1, assess1]));
    expect(view.el.querySelectorAll('[role="tab"]').length).toBe(0);
    view.update(run([source, target1, ...rules1, filtered1, assess1, target2, rule3]));
    const tabs = [...view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(view.el.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
    expect(station(view, 'analogue').querySelector('.ps-analogy__title')!.textContent).toBe('Airport check-in');
    expect(station(view, 'match').querySelector('.ps-analogy__count')!.textContent).toBe('1');

    tabs[0].click();
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(station(view, 'analogue').querySelector('.ps-analogy__title')!.textContent).toBe('Hospital triage');
    expect(station(view, 'analogue').getAttribute('data-node')).toBe('t1');
    expect(station(view, 'match').querySelector('.ps-analogy__count')!.textContent).toBe('2');
    expect(station(view, 'solved').getAttribute('data-result')).toBe('unsolved');

    // Arrow keys move along the tabs and select as they go (roving tabindex).
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
    expect(station(view, 'analogue').querySelector('.ps-analogy__title')!.textContent).toBe('Airport check-in');
    expect(lit(view, 'filter')).toBe(false);
  });

  it('lights Retain only after the retain node', () => {
    const view = createAnalogicalReasoningView();
    const done = [source, target1, ...rules1, filtered1, assess1, target2, rule3, filtered2, assess2];
    view.update(run(done));
    expect(lit(view, 'solved')).toBe(true);
    expect(lit(view, 'retain')).toBe(false);
    expect(face(view, 'retain')).toBeNull();
    view.update(run([...done, retain]));
    expect(lit(view, 'retain')).toBe(true);
    expect(station(view, 'retain').getAttribute('data-node')).toBe('k');
    // Round 1 ended unsolved, so viewing it does not show the retained lesson.
    view.el.querySelector<HTMLButtonElement>('[role="tab"]')!.click();
    expect(lit(view, 'retain')).toBe(false);
  });
});
