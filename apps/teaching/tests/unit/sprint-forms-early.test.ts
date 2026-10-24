// apps/teaching/tests/unit/sprint-forms-early.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountUnderstand } from '@/sprint/phase-understand';
import { mountSketch } from '@/sprint/phase-sketch';
import type { FormContext } from '@/sprint/form-kit';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }], requirements: [{ id: 'r1', text: 'Two sources', phases: ['sketch'] }] });
const ctx = (over: Partial<FormContext> = {}): FormContext => ({
  status: { identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, notes: [{ id: 'n1', text: 'How might we a?', mine: false }], mine: {} },
  sprint, blocks: [], row: { key: 'understand', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 },
  editable: true,
  client: { save: vi.fn(async () => ({})), submit: vi.fn(async () => ({})) } as never,
  frames: ['What if ___?'], valueCheck: { question: 'Is there another way to look at this?', asks: 'Name a different view.' }, support: 'guided', onStatus: vi.fn(),
  ...over
});

const brief = [{ id: 'h1', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher', content: { text: 'Design a viva for Year 12, fairly.' } }] as never;
const withSteps = (layout: 'slides' | 'vertical', off: string[] = []) => ({ ...sprint, understand: { layout, steps: Object.fromEntries(Object.keys(sprint.understand.steps).map((k) => [k, !off.includes(k)])) as typeof sprint.understand.steps } });
const visible = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.su-step')].filter((s) => !s.hidden).map((s) => s.dataset.step);

describe('understand form', () => {
  it('as slides, shows one step at a time, alone steps first, then the group’s space', () => {
    const f = mountUnderstand(ctx({ sprint: withSteps('slides'), blocks: brief }));
    expect(visible(f.el)).toEqual(['spot']);
    const next = [...f.el.querySelectorAll<HTMLButtonElement>('.su-nav button')].find((b) => b.textContent === 'Next')!;
    for (let i = 0; i < 5; i += 1) next.click();
    expect(visible(f.el)).toEqual(['vote']);
    expect(f.el.querySelector('.su-nav__where')?.textContent).toBe('Step 6 of 10 · Your group’s space');
  });

  it('down the page, shows every step that is switched on, and leaves out the rest', () => {
    const f = mountUnderstand(ctx({ sprint: withSteps('vertical', ['dig', 'grid']), blocks: brief }));
    expect(visible(f.el)).toEqual(['spot', 'audience', 'say', 'limits', 'vote', 'merge', 'ask', 'expert']);
    expect(f.el.querySelector('.su-divider')?.textContent).toBe('Your group’s space');
    expect(f.el.querySelector('.su-nav')).toBeNull();
  });

  it('spots words in the brief, and stars a statement in the group’s space', () => {
    const f = mountUnderstand(ctx({ sprint: withSteps('vertical'), blocks: brief }));
    const word = [...f.el.querySelectorAll<HTMLButtonElement>('.su-word')].find((b) => b.textContent === 'fairly.')!;
    word.click();
    expect(word.getAttribute('aria-pressed')).toBe('true');
    expect(f.el.textContent).toContain('You picked: fairly');
    const star = f.el.querySelector<HTMLButtonElement>('[data-step="vote"] .sprint-star')!;
    star.click();
    expect(f.el.querySelector('[data-step="vote"] .sprint-star')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('lists what to add before it submits, only for the steps that are on', () => {
    const c = ctx({ sprint: withSteps('vertical', ['spot']), blocks: brief });
    const f = mountUnderstand(c);
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    const checks = f.el.querySelector('.sprint-checks')?.textContent ?? '';
    expect(checks).toContain('Audience: say who this is for.');
    expect(checks).toContain('Say it: write the problem in your own words');
    expect(checks).toContain('Vote: star the problem statement');
    expect(checks).not.toContain('Spot');
    expect(c.client.submit).not.toHaveBeenCalled();
  });

  it('updates the group’s space from a new status without rebuilding, and stars a question for the expert', () => {
    const askPick = vi.fn(async () => ({}));
    const c = ctx({ sprint: withSteps('vertical'), blocks: brief, client: { save: vi.fn(), submit: vi.fn(), askPick } as never });
    const f = mountUnderstand(c);
    expect(f.el.querySelector('[data-step="ask"]')?.textContent).toContain('Questions show here once your group adds unknowns');
    const typed = f.el.querySelector<HTMLInputElement>('#su-who')!;
    typed.value = 'Year 12';
    f.update!({ ...c.status, understand_group: { who: [], why: [], audience: null, limits: { can_known: [], cant_known: [], can_unknown: [{ text: 'What a Band 6 answer sounds like', count: 2 }], cant_unknown: [] }, questions: [{ id: 'q1', text: 'What a Band 6 answer sounds like', count: 2, picked: false, sent: false }], sent: [] } });
    expect(f.el.querySelector<HTMLInputElement>('#su-who')!.value).toBe('Year 12');
    expect(f.el.querySelector('[data-step="grid"]')?.textContent).toContain('What a Band 6 answer sounds like ×2');
    f.el.querySelector<HTMLButtonElement>('[data-step="ask"] .sprint-star')!.click();
    expect(askPick).toHaveBeenCalledWith('q1');
  });
});

const sketchRow = { key: 'sketch', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 } as const;
const typeIdea = (root: HTMLElement, text: string) => {
  const input = root.querySelector<HTMLInputElement>('.sk-rapid')!.closest('section')!.querySelector<HTMLInputElement>('input')!;
  input.value = text;
  input.form!.requestSubmit();
};

describe('sketch form', () => {
  it('opens the rapid ideas box with the timer, counts each idea, and locks it when time is up', () => {
    vi.useFakeTimers();
    try {
      const f = mountSketch(ctx({ row: sketchRow }));
      const box = () => f.el.querySelector('.sk-rapid')!.closest('section')!.querySelector<HTMLInputElement>('input')!;
      expect(box().disabled).toBe(true);
      [...f.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start the 8-minute timer')!.click();
      expect(box().disabled).toBe(false);
      typeIdea(f.el, 'A five-object panel');
      typeIdea(f.el, 'a five-object panel');
      typeIdea(f.el, 'Then and now streets');
      expect(f.el.querySelectorAll('.sk-rapid li')).toHaveLength(2);
      expect(f.el.querySelector('.sk-timer__count')?.textContent).toBe('2 ideas');
      vi.advanceTimersByTime(8 * 60_000 + 1000);
      expect(box().disabled).toBe(true);
      expect(f.el.querySelector('.sk-timer')?.textContent).toContain('Time’s up. 2 ideas.');
      f.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stars up to the number put forward, and each star becomes a card to develop and justify', () => {
    const f = mountSketch(ctx({ row: sketchRow, sprint: { ...sprint, sketch_timer: 0 } }));
    for (const t of ['Objects', 'Streets', 'Letters']) typeIdea(f.el, t);
    const stars = () => [...f.el.querySelectorAll<HTMLButtonElement>('.sk-pick .sprint-star')];
    stars()[0]!.click();
    stars()[2]!.click();
    expect(f.el.querySelectorAll('.sprint-tab')).toHaveLength(2);
    expect(stars()[1]!.disabled).toBe(true);
    expect(f.el.querySelector<HTMLInputElement>('.sprint-card-pane input')!.value).toBe('Objects');
    expect(f.el.textContent).toContain('It solves our problem for the audience because…');
    expect(f.el.textContent).toContain('Two sources');
    expect(f.el.textContent).toContain('Is there another way to look at this?');
    expect(f.el.querySelector<HTMLElement>('.sprint-strongest')!.hidden).toBe(false);
    stars()[0]!.click();
    expect(f.el.querySelectorAll('.sprint-tab')).toHaveLength(1);
    expect(f.el.querySelector<HTMLElement>('.sprint-strongest')!.hidden).toBe(true);
  });
});
