import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import type { LessonPulse, PulseCounts } from '@/blocks/block-pulse';
import { createTeacherBlockPulse } from '@/teacher/block-pulse';
import { mountPulseSummary, pulseBlocksInOrder, summarisePulse } from '@/teacher/pulse-summary';

const leaf = (id: string, block_type: string, content: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, visibility: 'student_teacher', content, settings: {}, ...extra }) as unknown as Block;

const BLOCKS: Block[] = [
  leaf('h1', 'heading', { text: 'Warm up' }),
  leaf('b_intro', 'rich_text', { html: '<p>Read the poem twice.</p>' }),
  leaf('b_note', 'teacher_note', { html: '<p>Hidden</p>' }),
  leaf('h2', 'heading', { text: 'Main task' }),
  {
    ...leaf('b_tabs', 'tabs'),
    content: { tabs: [{ id: 't1', label: 'One', blocks: [leaf('b_in_tab', 'rich_text', { html: '<p>Inside a tab</p>' })] }] }
  } as unknown as Block,
  leaf('b_quiet', 'rich_text', { html: '<p>No taps here</p>' })
];

const counts = (partial: Partial<PulseCounts>): PulseCounts => ({
  confused: 0,
  stuck: 0,
  example: 0,
  flat: 0,
  worked: 0,
  ...partial
});

const DATA: LessonPulse = {
  lesson_id: 'lesson_1',
  blocks: {
    b_intro: { counts: counts({ worked: 4, flat: 1 }), total: 5, resets: [] },
    b_in_tab: { counts: counts({ confused: 3, stuck: 2 }), total: 5, resets: [] },
    b_gone: { counts: counts({ confused: 7 }), total: 7, resets: [] }
  }
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
});

describe('summarisePulse', () => {
  it('walks leaf blocks in lesson order under their heading', () => {
    expect(pulseBlocksInOrder(BLOCKS).map(({ block, heading }) => [block.id, heading])).toEqual([
      ['b_intro', 'Warm up'],
      ['b_in_tab', 'Main task'],
      ['b_quiet', 'Main task']
    ]);
  });

  it('tallies the lesson, skips deleted blocks and counts the quiet ones', () => {
    const summary = summarisePulse(BLOCKS, DATA, 'lesson');
    expect(summary.rows.map((row) => row.block.id)).toEqual(['b_intro', 'b_in_tab']);
    expect(summary.total).toBe(10);
    expect(summary.totals).toEqual(counts({ worked: 4, flat: 1, confused: 3, stuck: 2 }));
    expect(summary.quiet).toBe(1);
  });

  it('puts the block needing most help first', () => {
    expect(summarisePulse(BLOCKS, DATA, 'need').rows.map((row) => row.block.id)).toEqual(['b_in_tab', 'b_intro']);
  });
});

describe('lesson feedback panel', () => {
  async function mount() {
    const page = document.createElement('div');
    page.innerHTML = `
      <div class="block" data-block-id="b_intro">Intro</div>
      <div class="block" data-block-id="b_tabs"><div class="block" data-block-id="b_in_tab">Tab</div></div>
      <div class="block" data-block-id="b_quiet">Quiet</div>`;
    document.body.append(page);
    const pulse = createTeacherBlockPulse({
      lessonId: 'lesson_1',
      isLessonOff: () => false,
      onSetBlockOff: vi.fn(),
      fetchPulse: vi.fn().mockResolvedValue(DATA)
    });
    for (const block of BLOCKS) {
      const el = page.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`);
      if (el) pulse.decorate(el, block);
    }
    const summary = mountPulseSummary({ pulse, getBlocks: () => BLOCKS, isLessonOff: () => false });
    document.body.append(summary.chip, summary.panel);
    await flush();
    return { page, pulse, summary };
  }

  it('shows the lesson total on the chip and opens on click', async () => {
    const { summary } = await mount();
    expect(summary.chip.textContent).toBe('Feedback · 10');
    expect(summary.panel.hidden).toBe(true);

    summary.chip.click();
    expect(summary.panel.hidden).toBe(false);
    expect(summary.panel.querySelector('.pulse-summary__meta')!.textContent).toBe('10 taps on 2 blocks.');
    const rows = [...summary.panel.querySelectorAll<HTMLElement>('.pulse-summary__row')];
    expect(rows.map((row) => row.dataset.blockId)).toEqual(['b_intro', 'b_in_tab']);
    expect(rows[0]!.textContent).toContain('Read the poem twice.');
    expect(summary.panel.textContent).toContain('1 other block has no taps.');

    summary.panel.querySelector<HTMLButtonElement>('.pulse-summary__sort-btn:last-child')!.click();
    expect(summary.panel.querySelector<HTMLElement>('.pulse-summary__row')!.dataset.blockId).toBe('b_in_tab');
  });

  it('a row opens that block’s own dot', async () => {
    const { page, summary } = await mount();
    Element.prototype.scrollIntoView ??= () => {};
    summary.chip.click();
    summary.panel.querySelector<HTMLButtonElement>('[data-block-id="b_in_tab"]')!.click();
    const dot = page.querySelector<HTMLElement>('[data-block-id="b_in_tab"] > .pulse')!;
    expect(dot.classList.contains('pulse--open')).toBe(true);
  });
});
