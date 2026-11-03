import type { Block } from '@/schemas/block';

/**
 * Think aloud: the teacher's script for modelling their thinking out loud on any block (metacognitive
 * talk). Not a block of its own: it rides in the block's settings like a chosen WalkThru, is written
 * from the block's options, and shows under the block in the teacher's lesson view only. Display and
 * students never get it (visibility.ts strips the setting). The five moves are original wording.
 */

export type ThinkMove = 'task' | 'know' | 'plan' | 'check' | 'review';
export type ThinkAloud = Partial<Record<ThinkMove, string>>;

export const THINK_MOVES: ReadonlyArray<{ id: ThinkMove; label: string; hint: string }> = [
  { id: 'task', label: 'What am I being asked to do?', hint: 'Read the task aloud and name what it wants.' },
  { id: 'know', label: 'What do I already know that helps?', hint: 'Name the knowledge or earlier example you reach for.' },
  { id: 'plan', label: 'What’s my plan, and why this way?', hint: 'Say the steps and why you chose them over another way.' },
  { id: 'check', label: 'Where could this go wrong?', hint: 'Name the likely slip and how you check for it as you go.' },
  { id: 'review', label: 'How did that go?', hint: 'Judge the result and say what you’d do differently next time.' }
];

export const THINK_ALOUD_KEY = 'think_aloud';
export const THINK_LINE_MAX = 400;

const settingsOf = (block: Pick<Block, 'settings'>): Record<string, unknown> => ((block.settings ?? {}) as Record<string, unknown>);

/** The block's script: only known moves with words in them, trimmed and capped. */
export function thinkAloudOf(block: Pick<Block, 'settings'>): ThinkAloud {
  const raw = settingsOf(block)[THINK_ALOUD_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const out: ThinkAloud = {};
  for (const { id } of THINK_MOVES) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === 'string' && v.trim()) out[id] = v.trim().slice(0, THINK_LINE_MAX);
  }
  return out;
}

export const hasThinkAloud = (block: Pick<Block, 'settings'>): boolean => Object.keys(thinkAloudOf(block)).length > 0;

/** The block with this script on it. An empty script takes the setting off. */
export function withThinkAloud<T extends Block>(block: T, script: ThinkAloud): T {
  const { [THINK_ALOUD_KEY]: _old, ...rest } = settingsOf(block);
  const clean = thinkAloudOf({ settings: { [THINK_ALOUD_KEY]: script } } as Pick<Block, 'settings'>);
  return { ...block, settings: Object.keys(clean).length ? { ...rest, [THINK_ALOUD_KEY]: clean } : rest };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Teacher view only: the script under the block, closed to a slim bar until opened. */
export function renderThinkAloud(block: Pick<Block, 'settings'>): HTMLElement | null {
  const script = thinkAloudOf(block);
  const moves = THINK_MOVES.filter((m) => script[m.id]);
  if (!moves.length) return null;
  const details = el('details', 'think-aloud');
  const summary = el('summary', 'think-aloud__sum');
  summary.append(el('span', 'think-aloud__title', 'Think aloud'), el('span', 'think-aloud__meta', `${moves.length} ${moves.length === 1 ? 'move' : 'moves'} · only you see this`));
  const list = el('ol', 'think-aloud__moves');
  for (const move of moves) {
    const item = el('li', 'think-aloud__move');
    item.append(el('p', 'think-aloud__ask', move.label), el('p', 'think-aloud__say', script[move.id]!));
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

/** The editor: one box per move. Empty boxes are fine; only moves with words show in the lesson. */
export function thinkAloudFields(initial: ThinkAloud, onInput: (script: ThinkAloud) => void): HTMLElement {
  const wrap = el('div', 'think-aloud-edit');
  const script: ThinkAloud = { ...initial };
  for (const move of THINK_MOVES) {
    const label = el('label', 'think-aloud-edit__field');
    const box = el('textarea', 'input think-aloud-edit__box');
    box.rows = 2;
    box.maxLength = THINK_LINE_MAX;
    box.value = script[move.id] ?? '';
    box.placeholder = move.hint;
    box.addEventListener('input', () => {
      script[move.id] = box.value;
      onInput({ ...script });
    });
    label.append(el('span', 'think-aloud-edit__label', move.label), box);
    wrap.append(label);
  }
  return wrap;
}
