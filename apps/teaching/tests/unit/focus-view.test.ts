import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { HingeStateDetail, TeacherState } from '@/blocks/hinge-question/teacher';
import { talkingPoint, topWrongAnswer, underTheMark } from '@/teacher/focus/checkpoint';
import { mountFocusController, stepTimerStack, type FocusStepView } from '@/teacher/focus/focus-view';
import { focusSteps } from '@/teacher/focus/steps';

type Live = Extract<TeacherState, { phase: 'live' }>;

const live = (picks: Record<string, number>, extra: Partial<Live> = {}): Live => ({
  phase: 'live',
  session: 's1',
  round: 'main',
  backup: null,
  open: false,
  closes_at: null,
  revealed: true,
  prompt: 'What is the main effect of this line?',
  options: [
    { id: 'a', text: 'It shows the speaker is an expert', misconception: 'confident speakers must be experts' },
    { id: 'b', text: 'It creates urgency', misconception: '' },
    { id: 'c', text: 'It uses an appeal to fear', misconception: 'Naming the technique is the same as explaining its effect.' }
  ],
  correct_id: 'b',
  move_on: 65,
  reteach: 40,
  stale: false,
  answered: Object.values(picks).reduce((x, y) => x + y, 0),
  picks,
  ...extra
});

describe('checkpoint rules', () => {
  it('stops only once revealed, answered and under the move-on mark', () => {
    expect(underTheMark(live({ a: 2, b: 15, c: 9 }))).toBe(true); // 58%
    expect(underTheMark(live({ a: 1, b: 17, c: 8 }))).toBe(false); // 65%, at the mark
    expect(underTheMark(live({ a: 2, b: 15, c: 9 }, { revealed: false }))).toBe(false);
    expect(underTheMark(live({ a: 0, b: 0, c: 0 }))).toBe(false);
    expect(underTheMark({ phase: 'idle', stale: false, ready: true })).toBe(false);
  });

  it('names the most picked wrong answer and turns the teacher’s note into a no-names talking point', () => {
    const s = live({ a: 2, b: 15, c: 9 });
    expect(topWrongAnswer(s)?.id).toBe('c');
    const said = talkingPoint(s);
    expect(said).toContain('A few of you went for C');
    expect(said).toContain('naming the technique is the same as explaining its effect');
    expect(said).toContain('why B fits better');
    expect(topWrongAnswer(live({ a: 0, b: 3, c: 0 }))).toBeNull();
  });
});

describe('stepTimerStack', () => {
  it('uses a saved timer on the step, or on a divider just before it', () => {
    const heading = (id: string) => ({ ...createBlock('heading', id), content: { text: id } }) as Block;
    const divider = { ...createBlock('divider', 'd1'), content: { tools: true, timer_stack: [{ label: 'Think', minutes: 1 }] } } as Block;
    const steps = focusSteps([heading('One'), divider, heading('Two'), heading('Three')]);
    expect(stepTimerStack(steps, 0).map((s) => s.label)).toEqual(['Think']);
    expect(stepTimerStack(steps, 1).map((s) => s.label)).toEqual(['Think']);
    expect(stepTimerStack(steps, 2)).toEqual([]);
  });
});

describe('focus controller', () => {
  let surface: HTMLElement;
  let stage: HTMLElement;
  let actions: HTMLElement;
  let steps: FocusStepView[];

  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    surface = document.createElement('div');
    actions = document.createElement('div');
    stage = document.createElement('div');
    surface.append(actions, stage);
    document.body.append(surface);
    steps = ['Start', 'Do now', 'Exit'].map((label) => {
      const el = document.createElement('section');
      el.textContent = label;
      stage.append(el);
      return { label, blocks: [], el };
    });
  });

  const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  const shown = () => steps.filter((s) => !s.el.hidden).map((s) => s.label);

  it('starts in Page with every step showing, and Focus shows one step at a time', () => {
    const focus = mountFocusController({ surface, actions, stage, lessonId: 'l1' });
    focus.setSteps(steps, []);
    expect(shown()).toEqual(['Start', 'Do now', 'Exit']);
    press('ArrowRight');
    expect(shown()).toEqual(['Start', 'Do now', 'Exit']);

    actions.querySelector<HTMLButtonElement>('.fv-mode__btn:nth-child(2)')!.click();
    expect(surface.classList.contains('is-focus')).toBe(true);
    expect(shown()).toEqual(['Start']);
    press('ArrowRight');
    press(' ');
    expect(shown()).toEqual(['Exit']);
    press('ArrowRight');
    expect(shown()).toEqual(['Exit']);
    press('Home');
    expect(shown()).toEqual(['Start']);
    expect(surface.querySelector('.fv-strip__count')!.textContent).toBe('1 / 3');
    expect(localStorage.getItem('teaching-hub.display.mode')).toBe('focus');
    focus.dispose();
  });

  it('leaves keys alone while the teacher is typing', () => {
    localStorage.setItem('teaching-hub.display.mode', 'focus');
    const focus = mountFocusController({ surface, actions, stage, lessonId: 'l1' });
    focus.setSteps(steps, []);
    const input = document.createElement('input');
    steps[0]!.el.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(shown()).toEqual(['Start']);
    focus.dispose();
  });

  it('stops at the checkpoint when a hinge on the step comes in under the mark, then Move on goes forward', () => {
    localStorage.setItem('teaching-hub.display.mode', 'focus');
    const focus = mountFocusController({ surface, actions, stage, lessonId: 'l1' });
    focus.setSteps(steps, []);
    press('ArrowRight');
    const hingeRoot = document.createElement('div');
    steps[1]!.el.append(hingeRoot);
    const send = vi.fn(async () => undefined);
    // Ann would start drafting here: keep the network out of the test.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const detail: HingeStateDetail = { blockId: 'hq1', endpoint: '/api/lessons/l1/hinge/hq1', state: live({ a: 2, b: 15, c: 9 }), send };
    hingeRoot.dispatchEvent(new CustomEvent('hinge-state', { bubbles: true, detail }));
    expect(surface.classList.contains('fv-has-checkpoint')).toBe(true);

    press('ArrowRight');
    expect(shown()).toEqual(['Do now']);
    const panel = surface.querySelector<HTMLElement>('.fv-checkpoint')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('58%');
    expect(panel.textContent).toContain('Ann is drafting a back-up');
    [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Move on')!.click();
    expect(shown()).toEqual(['Exit']);

    // Moving on clears that round: coming back and going forward doesn't stop again.
    press('ArrowLeft');
    press('ArrowRight');
    expect(shown()).toEqual(['Exit']);
    vi.unstubAllGlobals();
    focus.dispose();
  });
});
