import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import {
  mapBlockById,
  pulseFill,
  pulseNeed,
  setBlockPulseOff,
  type LessonPulse,
  type PulseCounts
} from '@/blocks/block-pulse';
import { mountStudentBlockPulse } from '@/student/block-pulse';
import { createTeacherBlockPulse } from '@/teacher/block-pulse';

const leaf = (id: string, block_type: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, visibility: 'student_teacher', content: {}, settings: {}, ...extra }) as unknown as Block;

const BLOCKS: Block[] = [
  leaf('b_heading', 'heading'),
  leaf('b_q1', 'question_set'),
  leaf('b_divider', 'divider'),
  leaf('b_quiet', 'rich_text', { settings: { feedback_off: true } }),
  {
    ...leaf('b_tabs', 'tabs'),
    content: { tabs: [{ id: 't1', label: 'One', blocks: [leaf('b_in_tab', 'cloze')] }] }
  } as unknown as Block,
  {
    ...leaf('b_cols', 'columns'),
    content: { columns: [{ id: 'c1', blocks: [leaf('b_in_col', 'quote')] }] }
  } as unknown as Block
];

/** Mirrors what renderBlock draws: a `.block` wrapper per block, children nested inside. */
function page(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="block" data-block-id="b_heading">Act 3</div>
    <div class="block" data-block-id="b_q1">Q1</div>
    <div class="block" data-block-id="b_divider"></div>
    <div class="block" data-block-id="b_quiet">Quiet</div>
    <div class="block" data-block-id="b_tabs"><div class="panel"><div class="block" data-block-id="b_in_tab">Cloze</div></div></div>
    <div class="block" data-block-id="b_cols"><div class="col"><div class="block" data-block-id="b_in_col">Quote</div></div></div>`;
  document.body.append(root);
  return root;
}

const dotted = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.pulse')].map((dot) => (dot.parentElement as HTMLElement).dataset.blockId);

const counts = (partial: Partial<PulseCounts>): PulseCounts => ({
  confused: 0,
  stuck: 0,
  example: 0,
  flat: 0,
  worked: 0,
  ...partial
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('block pulse colour', () => {
  it('is null with no taps, green for praise, red for confusion', () => {
    expect(pulseFill(counts({}))).toBeNull();
    expect(pulseNeed(counts({ worked: 5 }))).toBe(0);
    expect(pulseNeed(counts({ confused: 3, stuck: 1 }))).toBe(1);
    expect(pulseNeed(counts({ flat: 2 }))).toBe(0.5);
    expect(pulseFill(counts({ worked: 5 }))).toContain('var(--success)');
    expect(pulseFill(counts({ confused: 12 }))).toContain('var(--danger) 100%');
  });

  it('grows stronger with more taps', () => {
    expect(pulseFill(counts({ confused: 1 }))).toMatch(/ 38%, var\(--pulse-idle\)/);
    expect(pulseFill(counts({ confused: 12 }))).toMatch(/ 100%, var\(--pulse-idle\)/);
  });
});

describe('mapBlockById / setBlockPulseOff', () => {
  it('switches off a block nested in tabs without touching others', () => {
    const next = mapBlockById(BLOCKS, 'b_in_tab', (block) => setBlockPulseOff(block, true));
    const tabs = next.find((block) => block.id === 'b_tabs') as Extract<Block, { block_type: 'tabs' }>;
    expect((tabs.content.tabs[0].blocks[0] as Block).settings).toEqual({ feedback_off: true });
    expect(next.find((block) => block.id === 'b_q1')).toBe(BLOCKS[1]);
    const back = mapBlockById(next, 'b_in_tab', (block) => setBlockPulseOff(block, false));
    const tabsBack = back.find((block) => block.id === 'b_tabs') as Extract<Block, { block_type: 'tabs' }>;
    expect((tabsBack.content.tabs[0].blocks[0] as Block).settings).toEqual({});
  });
});

describe('student dots', () => {
  it('go on leaf blocks, including inside tabs and columns, never on structure or containers', () => {
    const root = page();
    mountStudentBlockPulse(root, { lessonId: 'lesson_1', blocks: BLOCKS, send: vi.fn() });
    expect(dotted(root)).toEqual(['b_q1', 'b_in_tab', 'b_in_col']);
  });

  it('are absent when the lesson has feedback off', () => {
    const root = page();
    mountStudentBlockPulse(root, { lessonId: 'lesson_1', blocks: BLOCKS, feedbackOff: true, send: vi.fn() });
    expect(dotted(root)).toEqual([]);
  });

  it('tap sends once, shows the label, and a second tap takes it back', async () => {
    const root = page();
    const send = vi.fn().mockResolvedValue({});
    mountStudentBlockPulse(root, { lessonId: 'lesson_1', blocks: BLOCKS, send });
    const host = root.querySelector<HTMLElement>('[data-block-id="b_q1"]')!;
    const dot = host.querySelector<HTMLButtonElement>('.pulse__dot')!;
    dot.click();
    expect(dot.getAttribute('aria-expanded')).toBe('true');

    const stuck = host.querySelector<HTMLButtonElement>('.pulse__option[data-option="stuck"]')!;
    expect(stuck.getAttribute('aria-label')).toBe("I can't get started");
    stuck.click();
    await flush();
    expect(send).toHaveBeenLastCalledWith('lesson_1', { block_id: 'b_q1', option: 'stuck', on: true });
    expect(stuck.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.pulse__caption')!.textContent).toBe("Sent: I can't get started");
    expect(host.querySelector('.pulse')!.classList.contains('pulse--used')).toBe(true);

    stuck.click();
    await flush();
    expect(send).toHaveBeenLastCalledWith('lesson_1', { block_id: 'b_q1', option: 'stuck', on: false });
    expect(stuck.getAttribute('aria-pressed')).toBe('false');
  });

  it('remembers choices on reload and rolls back a failed tap', async () => {
    const root = page();
    const send = vi.fn().mockResolvedValue({});
    mountStudentBlockPulse(root, { lessonId: 'lesson_1', blocks: BLOCKS, send });
    root.querySelector<HTMLButtonElement>('[data-block-id="b_q1"] .pulse__dot')!.click();
    root.querySelector<HTMLButtonElement>('[data-block-id="b_q1"] [data-option="worked"]')!.click();
    await flush();
    document.body.replaceChildren();

    const again = page();
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    mountStudentBlockPulse(again, { lessonId: 'lesson_1', blocks: BLOCKS, send: failing });
    const host = again.querySelector<HTMLElement>('[data-block-id="b_q1"]')!;
    host.querySelector<HTMLButtonElement>('.pulse__dot')!.click();
    expect(host.querySelector('[data-option="worked"]')!.getAttribute('aria-pressed')).toBe('true');

    const confused = host.querySelector<HTMLButtonElement>('[data-option="confused"]')!;
    confused.click();
    await flush();
    expect(confused.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.pulse__caption')!.textContent).toBe("Didn't send. Try again.");
  });

  it('only one panel is open at a time', () => {
    const root = page();
    mountStudentBlockPulse(root, { lessonId: 'lesson_1', blocks: BLOCKS, send: vi.fn() });
    const [a, b] = root.querySelectorAll<HTMLButtonElement>('.pulse__dot');
    a.click();
    b.click();
    expect(a.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('teacher dots', () => {
  function row(): { el: HTMLElement; tabs: Block } {
    const root = page();
    const el = document.createElement('div');
    el.className = 'lesson-page__block';
    el.append(root.querySelector('[data-block-id="b_tabs"]')!);
    document.body.append(el);
    return { el, tabs: BLOCKS[4] };
  }

  it('fill with colour and show the numbers for a nested block', async () => {
    const data: LessonPulse = {
      lesson_id: 'lesson_1',
      blocks: { b_in_tab: { counts: counts({ confused: 9, example: 3 }), total: 12, resets: [] } }
    };
    const pulse = createTeacherBlockPulse({
      lessonId: 'lesson_1',
      isLessonOff: () => false,
      onSetBlockOff: vi.fn(),
      fetchPulse: vi.fn().mockResolvedValue(data)
    });
    const { el, tabs } = row();
    pulse.decorate(el, tabs);
    await flush();

    expect(dotted(el)).toEqual(['b_in_tab']);
    const dot = el.querySelector<HTMLElement>('.pulse')!;
    expect(dot.classList.contains('pulse--filled')).toBe(true);
    expect(dot.style.getPropertyValue('--pulse-fill')).toContain('var(--danger)');

    dot.querySelector<HTMLButtonElement>('.pulse__dot')!.click();
    const confused = dot.querySelector('.pulse__count[data-option="confused"] .pulse__count-n')!;
    expect(confused.textContent).toBe('9');
    expect(dot.querySelector('.pulse__meta')!.textContent).toBe('12 taps since the start.');
    pulse.dispose();
  });

  it('turning a block off calls back with its id', async () => {
    const onSetBlockOff = vi.fn();
    const pulse = createTeacherBlockPulse({
      lessonId: 'lesson_1',
      isLessonOff: () => false,
      onSetBlockOff,
      fetchPulse: vi.fn().mockResolvedValue({ lesson_id: 'lesson_1', blocks: {} })
    });
    const { el, tabs } = row();
    pulse.decorate(el, tabs);
    await flush();
    el.querySelector<HTMLButtonElement>('.pulse__dot')!.click();
    expect(el.querySelector<HTMLButtonElement>('.pulse__reset')!.disabled).toBe(true);
    el.querySelector<HTMLButtonElement>('.pulse__toggle')!.click();
    expect(onSetBlockOff).toHaveBeenCalledWith('b_in_tab', true);
    pulse.dispose();
  });

  it('show the off state when the lesson has feedback off', async () => {
    const pulse = createTeacherBlockPulse({
      lessonId: 'lesson_1',
      isLessonOff: () => true,
      onSetBlockOff: vi.fn(),
      fetchPulse: vi.fn().mockResolvedValue({ lesson_id: 'lesson_1', blocks: {} })
    });
    const { el, tabs } = row();
    pulse.decorate(el, tabs);
    await flush();
    const dot = el.querySelector<HTMLElement>('.pulse')!;
    expect(dot.classList.contains('pulse--off')).toBe(true);
    dot.querySelector<HTMLButtonElement>('.pulse__dot')!.click();
    expect(dot.querySelector('.pulse__note')!.textContent).toContain('Off for this whole lesson');
    expect(dot.querySelector('.pulse__toggle')).toBeNull();
    pulse.dispose();
  });
});
