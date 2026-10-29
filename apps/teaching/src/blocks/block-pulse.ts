import type { Block } from '@/schemas/block';
import { isTeacherOnlyBlock } from '@/blocks/visibility';

/**
 * Block pulse: a quiet dot in a block's top-right corner. Students tap it to
 * say how a block is going; the teacher's dot fills from green to red as taps
 * come in. Shared pieces for both sides live here.
 *
 * Server twin: netlify/functions/_shared/block-pulse.mjs (keep option ids and
 * the eligibility rule in step).
 */

export type PulseOption = 'confused' | 'stuck' | 'example' | 'flat' | 'worked';

export type PulseCounts = Record<PulseOption, number>;

export interface PulseReset {
  reset_at: string;
  counts: PulseCounts;
  total: number;
}

export interface BlockPulseSummary {
  counts: PulseCounts;
  total: number;
  resets: PulseReset[];
}

export interface LessonPulse {
  lesson_id: string;
  blocks: Record<string, BlockPulseSummary>;
}

const SVG = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Order is the order students see. `weight` is how much a tap says "needs help". */
export const PULSE_OPTIONS: ReadonlyArray<{
  id: PulseOption;
  label: string;
  weight: number;
  icon: string;
}> = [
  {
    id: 'confused',
    label: "I'm confused",
    weight: 1,
    icon: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8"/><path d="M12 17.2h.01"/>')
  },
  {
    id: 'stuck',
    label: 'I need help to get started',
    weight: 1,
    icon: SVG('<path d="M3 20h5v-5h5v-5h5V5h3"/>')
  },
  {
    id: 'example',
    label: 'Show me what good looks like',
    weight: 0.75,
    icon: SVG('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>')
  },
  {
    id: 'flat',
    label: 'Not grabbing me',
    weight: 0.5,
    icon: SVG('<rect x="2.5" y="7.5" width="16" height="9" rx="2"/><path d="M21.5 10.5v3M6 10.5v3"/>')
  },
  {
    id: 'worked',
    label: 'This worked for me',
    weight: 0,
    icon: SVG('<path d="M7 10.5V21"/><path d="M15 5.9 14 10h5.6a2 2 0 0 1 1.9 2.5l-2.2 7.6a2 2 0 0 1-1.9 1.4H4.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.6a2 2 0 0 0 1.8-1.1L12 3a3 3 0 0 1 3 2.9z"/>')
  }
];

export const PULSE_OPTION_IDS = PULSE_OPTIONS.map((option) => option.id);

/** Structure and containers never take feedback; their child blocks do. */
const EXCLUDED_TYPES = new Set<Block['block_type']>([
  'heading',
  'divider',
  'classroom_tools',
  'countdown',
  'spacer',
  'section',
  'columns',
  'tabs',
  'teacher_note'
]);

/** Can this kind of block ever carry a dot? (Ignores the off switches.) */
export function blockTypeTakesPulse(block: Block): boolean {
  return !EXCLUDED_TYPES.has(block.block_type) && !isTeacherOnlyBlock(block);
}

export function blockPulseOff(block: Block): boolean {
  return (block.settings as Record<string, unknown> | undefined)?.feedback_off === true;
}

/** Same rule the server checks before it accepts a tap. */
export function blockTakesPulse(block: Block): boolean {
  return blockTypeTakesPulse(block) && !blockPulseOff(block);
}

export function setBlockPulseOff(block: Block, off: boolean): Block {
  const settings = { ...(block.settings as Record<string, unknown>) };
  if (off) settings.feedback_off = true;
  else delete settings.feedback_off;
  return { ...block, settings } as Block;
}

/** Applies `fn` to the block with `id`, wherever it sits (sections, columns, tabs). */
export function mapBlockById(blocks: Block[], id: string, fn: (block: Block) => Block): Block[] {
  return blocks.map((block) => {
    if (block.id === id) return fn(block);
    if (block.block_type === 'section') {
      return {
        ...block,
        content: { ...block.content, blocks: mapBlockById(block.content.blocks as Block[], id, fn) }
      } as Block;
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: block.content.columns.map((col) => ({
            ...col,
            blocks: mapBlockById(col.blocks as Block[], id, fn)
          }))
        }
      } as Block;
    }
    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          ...block.content,
          tabs: block.content.tabs.map((tab) => ({
            ...tab,
            blocks: mapBlockById(tab.blocks as Block[], id, fn)
          }))
        }
      } as Block;
    }
    return block;
  });
}

/** 0 = all positive, 1 = all "needs help". */
export function pulseNeed(counts: PulseCounts): number {
  let total = 0;
  let weighted = 0;
  for (const option of PULSE_OPTIONS) {
    const n = counts[option.id] ?? 0;
    total += n;
    weighted += n * option.weight;
  }
  return total === 0 ? 0 : weighted / total;
}

/**
 * Fill for the teacher's dot. Hue runs green → amber → red with the share of
 * "needs help" taps; strength grows with the number of taps, so one tap in a
 * class of 25 reads faint and a dozen reads loud.
 */
export function pulseFill(counts: PulseCounts): string | null {
  const total = PULSE_OPTION_IDS.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  if (total === 0) return null;
  const need = pulseNeed(counts);
  const hue =
    need <= 0.5
      ? `color-mix(in oklab, var(--warning) ${Math.round(need * 200)}%, var(--success))`
      : `color-mix(in oklab, var(--danger) ${Math.round((need - 0.5) * 200)}%, var(--warning))`;
  const strength = Math.min(100, Math.round(25 + total * 12.5));
  return `color-mix(in oklab, ${hue} ${strength}%, var(--pulse-idle))`;
}

/** Leaf `.block` elements inside `root` (and `root` itself), keyed to their block. */
export function pulseTargets(
  root: HTMLElement,
  blocks: Block[],
  find: (blocks: Block[], id: string) => Block | null
): Array<{ el: HTMLElement; block: Block }> {
  const out: Array<{ el: HTMLElement; block: Block }> = [];
  const els = [
    ...(root.matches('.block[data-block-id]') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('.block[data-block-id]')
  ];
  for (const el of els) {
    const id = el.dataset.blockId;
    if (!id || el.querySelector(':scope > .pulse')) continue;
    const block = find(blocks, id);
    if (block && blockTypeTakesPulse(block)) out.push({ el, block });
  }
  return out;
}

export function pulseEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Only one panel is open at a time across the page. */
let closeOpenPanel: (() => void) | null = null;

/**
 * The dot plus its panel, pinned to the block's top-right corner. Opening one
 * closes any other; Escape or a click elsewhere closes it.
 */
export function createPulseAnchor(options: {
  label: string;
  buildPanel: (panel: HTMLElement) => void;
}): { root: HTMLElement; dot: HTMLButtonElement; close: () => void; isOpen: () => boolean; repaint: () => void } {
  const root = pulseEl('div', 'pulse');
  const dot = pulseEl('button', 'pulse__dot');
  dot.type = 'button';
  dot.setAttribute('aria-label', options.label);
  dot.setAttribute('aria-expanded', 'false');
  dot.append(pulseEl('span', 'pulse__dot-mark'));
  const panel = pulseEl('div', 'pulse__panel');
  panel.hidden = true;
  root.append(dot, panel);

  const onDocPointer = (event: Event) => {
    if (!root.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
      dot.focus();
    }
  };

  function open(): void {
    if (closeOpenPanel && closeOpenPanel !== close) closeOpenPanel();
    closeOpenPanel = close;
    panel.replaceChildren();
    options.buildPanel(panel);
    panel.hidden = false;
    root.classList.add('pulse--open');
    dot.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function close(): void {
    if (panel.hidden) return;
    if (closeOpenPanel === close) closeOpenPanel = null;
    panel.hidden = true;
    root.classList.remove('pulse--open');
    dot.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('keydown', onKey);
  }

  // Keep taps on the dot from selecting the block underneath (teacher canvas).
  root.addEventListener('click', (event) => event.stopPropagation());
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  dot.addEventListener('click', () => (panel.hidden ? open() : close()));

  return {
    root,
    dot,
    close,
    isOpen: () => !panel.hidden,
    repaint: () => {
      if (panel.hidden) return;
      panel.replaceChildren();
      options.buildPanel(panel);
    }
  };
}
