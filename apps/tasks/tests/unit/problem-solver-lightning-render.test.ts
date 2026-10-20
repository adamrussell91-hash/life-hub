import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLightningView } from '../../../../packages/problem-solver/render/lightning';
import { LIGHTNING_NODE_IDS, again, applyStep, newLightning } from '../../../../packages/problem-solver/lightning.mjs';
import type { PsLightningState } from '../../../../packages/problem-solver/types';

const AT = '2026-10-20T09:00:00.000Z';
type Step = { node: string; answer?: 'yes' | 'no'; note?: string };
const walk = (steps: Step[], state: PsLightningState = newLightning(AT)): PsLightningState => steps.reduce((s, step) => applyStep(s, step, AT), state);
const OPEN: Step[] = [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Print a full page.' }];
const ALL_FAIL: Step[] = [
  ...OPEN,
  { node: 'subtract', answer: 'no' },
  { node: 'one_step', answer: 'no' },
  { node: 'diagram', answer: 'no' },
  { node: 'work_backwards', answer: 'no' },
  { node: 'make_list', answer: 'no' },
  { node: 'take_break', answer: 'no' },
  { node: 'analogy', answer: 'no' }
];

type View = ReturnType<typeof createLightningView>;
const box = (view: View, id: string) => view.el.querySelector<HTMLElement>(`[data-lnode="${id}"]`)!;
const spot = (view: View, id: string) => view.el.querySelector<HTMLElement>(`[data-spot="${id}"][data-lnode]`)!;
const edge = (view: View, key: string) => view.el.querySelector<SVGGElement>(`[data-edge="${key}"]`)!;
const answer = (view: View, a: 'yes' | 'no') => view.el.querySelector<HTMLButtonElement>(`[data-answer="${a}"]`)!;
const asking = (view: View) => !view.el.querySelector<HTMLElement>('.ps-ltn__ask')!.hidden;

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  const made: Array<{ cancel: ReturnType<typeof vi.fn> }> = [];
  proto.animate = () => null;
  const spy = vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
    const anim = { cancel: vi.fn(), finish() {}, onfinish: null };
    made.push(anim);
    return anim as unknown as Animation;
  });
  return { spy, made };
}

describe('Lightning chart', () => {
  it('draws every box once (Relax three times), all ghost, with named containers', () => {
    const view = createLightningView();
    for (const id of LIGHTNING_NODE_IDS) expect(view.el.querySelectorAll(`[data-lnode="${id}"]`).length).toBe(id === 'relax' ? 3 : 1);
    expect([...view.el.querySelectorAll('[data-spot][data-lnode]')].map((n) => n.getAttribute('data-spot')).sort()).toEqual(['relax_bottom', 'relax_middle', 'relax_start']);
    const all = [...view.el.querySelectorAll<HTMLElement>('[data-lnode]')];
    expect(all.every((n) => n.getAttribute('data-state') === 'ghost')).toBe(true);
    expect([...view.el.querySelectorAll('[data-edge]')].every((e) => e.getAttribute('data-state') === 'ghost' && !e.hasAttribute('data-inked'))).toBe(true);
    expect(view.el.getAttribute('role')).toBe('group');
    expect(view.el.querySelector('[aria-label="Lightning chart"]')!.getAttribute('role')).toBe('region');
    expect(view.el.querySelector('[aria-label="Flowchart boxes"]')!.getAttribute('role')).toBe('list');
    expect(all.every((n) => n.getAttribute('role') === 'listitem')).toBe(true);
    expect(view.el.querySelector('.ps-ltn__ask')!.getAttribute('role')).toBe('group');
  });

  it('styles boxes by kind and keeps text in a data-shape', () => {
    const view = createLightningView();
    expect(box(view, 'goal').getAttribute('data-kind')).toBe('check');
    expect(box(view, 'subtract').getAttribute('data-kind')).toBe('choice');
    expect(box(view, 'diagram').querySelector('.ps-ltn__name')!.textContent).toBe('Draw a diagram');
    expect(box(view, 'learn').getAttribute('data-kind')).toBe('close');
    expect(spot(view, 'relax_start').getAttribute('data-kind')).toBe('end');
    for (const n of view.el.querySelectorAll('[data-lnode]')) expect(n.querySelector('[data-shape] .ps-ltn__title')).not.toBeNull();
  });

  it('inks the path: start no and the goal done, subtract current', () => {
    const view = createLightningView();
    view.update(walk(OPEN));
    expect(box(view, 'start').getAttribute('data-state')).toBe('done');
    expect(box(view, 'goal').getAttribute('data-state')).toBe('done');
    expect(box(view, 'subtract').getAttribute('data-state')).toBe('current');
    expect(box(view, 'subtract').getAttribute('aria-current')).toBe('step');
    expect(box(view, 'goal').hasAttribute('aria-current')).toBe(false);
    expect(box(view, 'one_step').getAttribute('data-state')).toBe('ghost');
    expect(edge(view, 'start>goal').getAttribute('data-inked')).toBe('true');
    expect(edge(view, 'goal>subtract').getAttribute('data-inked')).toBe('true');
    expect(edge(view, 'start>relax').hasAttribute('data-inked')).toBe(false);
    expect(box(view, 'goal').querySelector('[data-shape]')!.getAttribute('data-fill')).toBe('ink');
    expect(view.el.querySelector('[data-mark="start>goal"]')!.getAttribute('data-state')).toBe('done');
    expect(view.el.querySelector('[data-mark="start>relax"]')!.getAttribute('data-state')).toBe('ghost');
  });

  it('keeps element identity across updates', () => {
    const view = createLightningView(document, { onAnswer() {} });
    const before = [...view.el.querySelectorAll('[data-lnode], [data-edge], [data-answer], [data-mark]')];
    view.update(walk(OPEN));
    const li = view.el.querySelector('[aria-label="Lightning path"] li');
    view.update(walk([...OPEN, { node: 'subtract', answer: 'no' }]));
    const after = [...view.el.querySelectorAll('[data-lnode], [data-edge], [data-answer], [data-mark]')];
    expect(after.length).toBe(before.length);
    expect(after.every((node) => before.includes(node))).toBe(true);
    expect(view.el.querySelector('[aria-label="Lightning path"] li')).toBe(li);
  });

  it('answer buttons call onAnswer once and wait for the next update', () => {
    const onAnswer = vi.fn();
    const view = createLightningView(document, { onAnswer });
    view.update(newLightning(AT));
    expect(asking(view)).toBe(true);
    answer(view, 'no').click();
    answer(view, 'no').click();
    answer(view, 'yes').click();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('start', 'no');
    expect(answer(view, 'yes').getAttribute('aria-disabled')).toBe('true');
    // The page's answer arrives: the same buttons move to the next question, enabled.
    const yes = answer(view, 'yes');
    view.update(walk([...OPEN]));
    expect(answer(view, 'yes')).toBe(yes);
    expect(yes.hasAttribute('aria-disabled')).toBe(false);
    answer(view, 'yes').click();
    expect(onAnswer).toHaveBeenLastCalledWith('subtract', 'yes');
    // The circles of the box being asked give way to the buttons.
    expect(view.el.querySelector<HTMLElement>('[data-mark="subtract>one_step"]')!.hidden).toBe(true);
    expect(view.el.querySelector<HTMLElement>('[data-mark="start>goal"]')!.hidden).toBe(false);
  });

  it('shows no answer buttons without onAnswer or at a strategy', () => {
    const readOnly = createLightningView();
    readOnly.update(newLightning(AT));
    expect(asking(readOnly)).toBe(false);
    const view = createLightningView(document, { onAnswer() {} });
    view.update(walk([...OPEN, { node: 'subtract', answer: 'yes' }]));
    expect(box(view, 'via_negativa').getAttribute('data-state')).toBe('current');
    expect(asking(view)).toBe(false);
  });

  it('a click on the box being asked focuses its Yes button', () => {
    const view = createLightningView(document, { onAnswer() {} });
    document.body.append(view.el);
    view.update(newLightning(AT));
    box(view, 'start').querySelector<HTMLElement>('.ps-ltn__title')!.click();
    expect(document.activeElement).toBe(answer(view, 'yes'));
    view.el.remove();
  });

  it('inks the Relax spot the path reached', () => {
    const fromStart = createLightningView();
    fromStart.update(walk([{ node: 'start', answer: 'yes' }]));
    expect(spot(fromStart, 'relax_start').getAttribute('data-state')).toBe('done');
    expect(spot(fromStart, 'relax_middle').getAttribute('data-state')).toBe('ghost');
    expect(edge(fromStart, 'start>relax').getAttribute('data-inked')).toBe('true');
    expect(fromStart.el.querySelector('[data-edge="relax>learn"][data-spot="relax_start"]')!.getAttribute('data-inked')).toBe('true');
    expect(box(fromStart, 'learn').getAttribute('data-state')).toBe('current');

    const fromFirst = createLightningView();
    fromFirst.update(walk([...OPEN, { node: 'subtract', answer: 'yes' }, { node: 'via_negativa', answer: 'yes' }]));
    expect(spot(fromFirst, 'relax_bottom').getAttribute('data-state')).toBe('done');
    expect(spot(fromFirst, 'relax_start').getAttribute('data-state')).toBe('ghost');
    expect(fromFirst.el.querySelector('[data-edge="relax>learn"][data-spot="relax_middle"]')!.hasAttribute('data-inked')).toBe(false);

    const fromThird = createLightningView();
    fromThird.update(walk([...OPEN, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', answer: 'no' }, { node: 'work_backwards', answer: 'no' }, { node: 'make_list', answer: 'yes' }]));
    expect(spot(fromThird, 'relax_middle').getAttribute('data-state')).toBe('done');
    expect(spot(fromThird, 'relax_bottom').getAttribute('data-state')).toBe('ghost');
    expect(edge(fromThird, 'solved_3>relax').getAttribute('data-inked')).toBe('true');
  });

  it('shows ×2 on a reframing loop', () => {
    const view = createLightningView();
    const badge = view.el.querySelector<HTMLElement>('.ps-ltn__badge')!;
    view.update(walk(ALL_FAIL));
    expect(badge.hidden).toBe(true);
    view.update(walk([...ALL_FAIL, { node: 'reframing', answer: 'yes' }]));
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('×2');
    expect(edge(view, 'reframing>goal').getAttribute('data-inked')).toBe('true');
    expect(edge(view, 'solved_5>reframing').getAttribute('data-inked')).toBe('true');
  });

  it('greys the earlier round after "It came back"', () => {
    const first = walk([{ node: 'start', answer: 'yes' }, { node: 'learn' }, { node: 'next' }]);
    const view = createLightningView();
    view.update(first);
    expect(box(view, 'next').getAttribute('data-state')).toBe('done');
    expect(view.el.querySelector('[data-state="current"]')).toBeNull();
    view.update(again(first, AT));
    expect(box(view, 'learn').getAttribute('data-round')).toBe('old');
    expect(spot(view, 'relax_start').getAttribute('data-round')).toBe('old');
    expect(edge(view, 'start>relax').getAttribute('data-round')).toBe('old');
    expect(box(view, 'start').getAttribute('data-state')).toBe('current');
    expect(box(view, 'start').hasAttribute('data-round')).toBe(false);
    const steps = [...view.el.querySelectorAll('[aria-label="Lightning path"] li')].map((li) => li.textContent);
    expect(steps[0]).toContain('Round 1: ');
    expect(steps.at(-1)).toContain('Round 2: ');
  });

  it('reads the path out in a hidden list', () => {
    const view = createLightningView();
    view.update(walk(OPEN));
    const list = view.el.querySelector('[aria-label="Lightning path"]')!;
    expect(list.tagName).toBe('OL');
    expect(list.getAttribute('role')).toBe('list');
    const items = [...list.querySelectorAll('li')].map((li) => li.textContent);
    expect(items.length).toBe(3);
    expect(items[0]).toContain('Answer: No.');
    expect(items[1]).toContain('Note: Print a full page.');
    expect(items[2]).toContain('(now)');
  });

  it('an undo un-inks the steps that went, without animation', () => {
    const { spy } = spyAnimate();
    const view = createLightningView();
    view.update(newLightning(AT));
    view.update(walk([...OPEN, { node: 'subtract', answer: 'no' }]));
    expect(view.el.querySelectorAll('[data-edge~="subtract>one_step"][data-inked]').length).toBe(1);
    spy.mockClear();
    view.update(walk(OPEN));
    expect(spy).not.toHaveBeenCalled();
    expect(view.el.querySelectorAll('[data-edge~="subtract>one_step"][data-inked]').length).toBe(0);
    expect(box(view, 'one_step').getAttribute('data-state')).toBe('ghost');
    expect(box(view, 'subtract').getAttribute('data-state')).toBe('current');
    expect(view.el.querySelectorAll('[aria-label="Lightning path"] li').length).toBe(3);
  });

  it('draws new arrows in, and starts no animation on a no-op update', () => {
    const { spy } = spyAnimate();
    const view = createLightningView();
    view.update(newLightning(AT));
    expect(spy).not.toHaveBeenCalled();
    view.update(walk(OPEN));
    const lines = spy.mock.contexts.filter((ctx) => (ctx as Element).classList?.contains('ps-ltn__line'));
    expect(lines.length).toBe(2);
    spy.mockClear();
    view.update(walk(OPEN));
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const { spy } = spyAnimate();
    const view = createLightningView();
    view.update(walk(ALL_FAIL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('respects reduced motion', () => {
    const { spy } = spyAnimate();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const view = createLightningView();
    view.update(newLightning(AT));
    view.update(walk(OPEN));
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('destroy cancels running animations and ignores later updates', () => {
    const { made } = spyAnimate();
    const view = createLightningView();
    view.update(newLightning(AT));
    view.update(walk(OPEN));
    expect(made.length).toBeGreaterThan(0);
    view.destroy();
    expect(made.every((a) => a.cancel.mock.calls.length > 0)).toBe(true);
    view.update(walk([...OPEN, { node: 'subtract', answer: 'no' }]));
    expect(box(view, 'one_step').getAttribute('data-state')).toBe('ghost');
  });

  it('fits the stage to its content and keeps text at 12px or more', () => {
    const view = createLightningView();
    const stage = view.el.querySelector<HTMLElement>('.ps-ltn__stage')!;
    expect(parseInt(stage.style.width, 10)).toBeGreaterThan(900);
    expect(parseInt(stage.style.height, 10)).toBeLessThan(760);
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const section = css.slice(css.indexOf('/* Lightning problem solving'));
    const sizes = [...section.matchAll(/font(?:-size)?:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it('names its container in every phone rule and uses ink and paper only', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Lightning problem solving');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z0-9][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: ltn / inline-size');
    expect(section).toContain('@container ltn (');
    expect(section).not.toMatch(/@container \(/);
    expect(section).not.toMatch(/--ps-(red|yellow|blue)|#[0-9a-f]{3,6}\b/i);
  });
});
