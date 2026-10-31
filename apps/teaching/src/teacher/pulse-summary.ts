import { createBlockTypeLabel } from '@/blocks/block-meta';
import {
  PULSE_OPTIONS,
  PULSE_OPTION_IDS,
  blockTypeTakesPulse,
  pulseEl,
  pulseFill,
  pulseNeed,
  type BlockPulseSummary,
  type LessonPulse,
  type PulseCounts
} from '@/blocks/block-pulse';
import { blocksToSearchText } from '@/blocks/search-text';
import type { Block } from '@/schemas/block';
import type { TeacherBlockPulseHandle } from '@/teacher/block-pulse';

/**
 * Every block's dot gathered in one place. A chip in the lesson's top row
 * shows the lesson's total; clicking it opens a panel above the canvas with
 * the lesson-wide tally and one row per block that has taps. A row jumps to
 * its block and opens that block's dot.
 */

export interface PulseSummaryOptions {
  pulse: TeacherBlockPulseHandle;
  getBlocks: () => Block[];
  isLessonOff: () => boolean;
  /** A section kept at the foot of the panel (end-of-lesson questions), told when the panel opens. */
  extra?: { element: HTMLElement; onOpen?: () => void };
}

export interface PulseSummaryHandle {
  /** Goes in the lesson's meta row. */
  chip: HTMLButtonElement;
  /** Goes directly above the canvas. */
  panel: HTMLElement;
  /** Redraw after the lesson's blocks change. */
  refresh(): void;
  dispose(): void;
}

type Sort = 'lesson' | 'need';

export interface PulseSummaryRow {
  block: Block;
  heading: string;
  info: BlockPulseSummary;
}

const SNIPPET_MAX = 90;

function taps(n: number): string {
  return `${n} ${n === 1 ? 'tap' : 'taps'}`;
}

function emptyCounts(): PulseCounts {
  return { confused: 0, stuck: 0, example: 0, flat: 0, worked: 0 };
}

function children(block: Block): Block[] {
  if (block.block_type === 'section') return block.content.blocks as Block[];
  if (block.block_type === 'columns') return block.content.columns.flatMap((col) => col.blocks) as Block[];
  if (block.block_type === 'tabs') return block.content.tabs.flatMap((tab) => tab.blocks) as Block[];
  return [];
}

/** Blocks that can carry a dot, in lesson order, each with the heading it sits under. */
export function pulseBlocksInOrder(blocks: Block[]): Array<{ block: Block; heading: string }> {
  const out: Array<{ block: Block; heading: string }> = [];
  let heading = '';
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.block_type === 'heading') {
        heading = String((block.content as { text?: unknown }).text ?? '').trim();
        continue;
      }
      const nested = children(block);
      if (nested.length) walk(nested);
      else if (blockTypeTakesPulse(block)) out.push({ block, heading });
    }
  };
  walk(blocks);
  return out;
}

/** Rows for blocks with taps, plus the lesson-wide tally. Taps on deleted blocks are left out. */
export function summarisePulse(
  blocks: Block[],
  data: LessonPulse | null,
  sort: Sort
): { rows: PulseSummaryRow[]; quiet: number; totals: PulseCounts; total: number } {
  const rows: PulseSummaryRow[] = [];
  const totals = emptyCounts();
  let quiet = 0;
  for (const { block, heading } of pulseBlocksInOrder(blocks)) {
    const info = data?.blocks[block.id];
    if (!info || info.total === 0) {
      quiet += 1;
      continue;
    }
    rows.push({ block, heading, info });
    for (const id of PULSE_OPTION_IDS) totals[id] += info.counts[id] ?? 0;
  }
  if (sort === 'need') {
    rows.sort((a, b) => {
      const score = (row: PulseSummaryRow) =>
        pulseNeed(row.info.counts) * row.info.total;
      return score(b) - score(a);
    });
  }
  const total = PULSE_OPTION_IDS.reduce((sum, id) => sum + totals[id], 0);
  return { rows, quiet, totals, total };
}

function snippet(block: Block): string {
  const text = blocksToSearchText([block]);
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX).trim()}…` : text;
}

function swatch(counts: PulseCounts): HTMLElement {
  const mark = pulseEl('span', 'pulse-summary__swatch');
  const fill = pulseFill(counts);
  if (fill) mark.style.setProperty('--pulse-fill', fill);
  return mark;
}

function countChips(counts: PulseCounts, withLabels: boolean): HTMLElement {
  const list = pulseEl('ul', 'pulse-summary__chips');
  for (const option of PULSE_OPTIONS) {
    const n = counts[option.id] ?? 0;
    if (!withLabels && n === 0) continue;
    const chip = pulseEl('li', `pulse-summary__chip${n === 0 ? ' pulse-summary__chip--zero' : ''}`);
    chip.dataset.option = option.id;
    chip.title = option.label;
    const icon = pulseEl('span', 'pulse-summary__chip-icon');
    icon.innerHTML = option.icon;
    chip.append(icon);
    if (withLabels) chip.append(pulseEl('span', 'pulse-summary__chip-label', option.label));
    else chip.setAttribute('aria-label', `${option.label}: ${n}`);
    chip.append(pulseEl('span', 'pulse-summary__chip-n', String(n)));
    list.append(chip);
  }
  return list;
}

export function mountPulseSummary(options: PulseSummaryOptions): PulseSummaryHandle {
  const { pulse } = options;
  let sort: Sort = 'lesson';

  const chip = pulseEl('button', 'pulse-summary-chip');
  chip.type = 'button';
  chip.setAttribute('aria-expanded', 'false');
  const chipMark = pulseEl('span', 'pulse-summary__swatch');
  const chipText = pulseEl('span', 'pulse-summary-chip__text');
  chip.append(chipMark, chipText);

  const panel = pulseEl('section', 'pulse-summary');
  panel.setAttribute('aria-label', 'Student feedback across this lesson');
  panel.hidden = true;
  chip.addEventListener('click', () => setOpen(panel.hidden));

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    chip.classList.toggle('is-open', open);
    if (open) {
      draw();
      options.extra?.onOpen?.();
    }
  }

  function drawChip(summary: ReturnType<typeof summarisePulse>): void {
    const fill = pulseFill(summary.totals);
    chip.classList.toggle('is-filled', Boolean(fill));
    if (fill) chipMark.style.setProperty('--pulse-fill', fill);
    else chipMark.style.removeProperty('--pulse-fill');
    chipText.textContent = summary.total === 0 ? 'Feedback' : `Feedback · ${summary.total}`;
    chip.title = options.isLessonOff()
      ? 'Student feedback is off for this lesson'
      : `Student feedback: ${summary.total === 0 ? 'no taps yet' : taps(summary.total)}`;
  }

  function sortToggle(): HTMLElement {
    const group = pulseEl('div', 'pulse-summary__sort');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Order');
    for (const [value, label] of [
      ['lesson', 'Lesson order'],
      ['need', 'Most help needed']
    ] as const) {
      const btn = pulseEl('button', 'pulse-summary__sort-btn', label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(sort === value));
      btn.addEventListener('click', () => {
        sort = value;
        draw();
      });
      group.append(btn);
    }
    return group;
  }

  function draw(): void {
    const data = pulse.current();
    const summary = summarisePulse(options.getBlocks(), data, sort);
    drawChip(summary);
    if (panel.hidden) return;

    const head = pulseEl('header', 'pulse-summary__head');
    const titles = pulseEl('div', 'pulse-summary__titles');
    titles.append(pulseEl('h2', 'pulse-summary__title', 'Student feedback'));
    const blocksWithTaps = summary.rows.length;
    titles.append(
      pulseEl(
        'p',
        'pulse-summary__meta',
        !data
          ? 'Loading…'
          : summary.total === 0
            ? 'No taps yet.'
            : `${taps(summary.total)} on ${blocksWithTaps} ${blocksWithTaps === 1 ? 'block' : 'blocks'}.`
      )
    );
    const close = pulseEl('button', 'btn btn--ghost pulse-summary__close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => {
      setOpen(false);
      chip.focus();
    });
    head.append(titles);
    if (summary.rows.length > 1) head.append(sortToggle());
    head.append(close);

    const body: HTMLElement[] = [head];
    if (options.isLessonOff()) {
      body.push(pulseEl('p', 'pulse__note', 'Off for this whole lesson. Turn it back on from Lesson options.'));
    }

    if (summary.total > 0) {
      body.push(countChips(summary.totals, true));
      const list = pulseEl('ol', 'pulse-summary__rows');
      for (const row of summary.rows) {
        const item = pulseEl('li');
        const btn = pulseEl('button', 'pulse-summary__row');
        btn.type = 'button';
        btn.dataset.blockId = row.block.id;
        const what = pulseEl('span', 'pulse-summary__what');
        if (row.heading) what.append(pulseEl('span', 'pulse-summary__heading', row.heading));
        what.append(createBlockTypeLabel(row.block));
        const text = snippet(row.block);
        if (text) what.append(pulseEl('span', 'pulse-summary__snippet', text));
        btn.append(swatch(row.info.counts), what, countChips(row.info.counts, false));
        btn.addEventListener('click', () => pulse.focusBlock(row.block.id));
        item.append(btn);
        list.append(item);
      }
      body.push(list);
    } else if (data) {
      body.push(pulseEl('p', 'pulse-summary__meta', 'Students tap the dot in a block’s corner to say how it’s going.'));
    }

    if (summary.total > 0 && summary.quiet > 0) {
      body.push(
        pulseEl('p', 'pulse-summary__meta', `${summary.quiet} other ${summary.quiet === 1 ? 'block has' : 'blocks have'} no taps.`)
      );
    }
    if (options.extra) body.push(options.extra.element);
    panel.replaceChildren(...body);
  }

  const unsubscribe = pulse.subscribe(() => draw());
  draw();

  return {
    chip,
    panel,
    refresh: draw,
    dispose() {
      unsubscribe();
    }
  };
}
