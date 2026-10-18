import type { Block } from '@/schemas/block';
import type { DiscernInitialType, DiscernMode, DiscernQualifier, DiscernScalePreset } from '@/schemas/discern';
import { canHaveKaplanQualifier } from './kaplan';
import { loadActivityState, saveActivityState, storageKey } from './learning-activity';

/** Step names, as students see them on the tabs and the graph's x-axis. */
export const DISCERN_STEP_NAMES = ['Initial', 'Against', 'For', 'Step back', 'Confirm'] as const;
export const DISCERN_LABEL_MAX = 32;
export const DISCERN_INITIAL_MAX = 60;

export const DISCERN_SCALES: Record<DiscernScalePreset, { name: string; options: [string, string, string, string] }> = {
  agree: { name: 'Agree', options: ['Disagree', 'Partly agree', 'Mostly agree', 'Fully agree'] },
  extent: { name: 'Extent', options: ['Not at all', 'To a small extent', 'To a large extent', 'Completely'] },
  effect: { name: 'Effectiveness', options: ['Ineffective', 'Somewhat effective', 'Effective', 'Highly effective'] },
  verdict: { name: 'Verdict', options: ['Unjustified', 'Questionable', 'Defensible', 'Justified'] }
};

/** Same blocks as Kaplan. A block can carry both. */
export function canHaveDiscern(block: Block): boolean {
  return block.block_type !== 'discern_confirm' && canHaveKaplanQualifier(block);
}

/** The words the setup reads to suggest an initial answer type. */
export function discernQuestionText(block: Block): string {
  if (block.block_type === 'question_set') return block.content.questions[0]?.prompt ?? '';
  const content = block.content as Record<string, unknown>;
  const text = [content.prompt, content.title, content.text].find((v) => typeof v === 'string' && v.trim());
  return typeof text === 'string' ? text : '';
}

export function suggestDiscernInitial(question: string, mode: DiscernMode): { type: DiscernInitialType; preset: DiscernScalePreset } {
  if (mode === 'theirs') return { type: 'scale', preset: 'verdict' };
  if (/how much do you agree|do you agree/i.test(question)) return { type: 'scale', preset: 'agree' };
  if (/to what extent/i.test(question)) return { type: 'scale', preset: 'extent' };
  if (/how effective/i.test(question)) return { type: 'scale', preset: 'effect' };
  if (/^\s*(?:q\d+\.?\s*)?which\b/i.test(question)) return { type: 'choose', preset: 'agree' };
  return { type: 'write', preset: 'agree' };
}

export function defaultDiscern(block: Block): DiscernQualifier {
  const suggestion = suggestDiscernInitial(discernQuestionText(block), 'own');
  return {
    mode: 'own', who: '', focus: '', source: '',
    initial: { type: suggestion.type, preset: suggestion.preset, options: suggestion.type === 'choose' ? ['', ''] : [] }
  };
}

/** What students tap at the Initial step. Write mode has none. */
export function discernOptions(q: DiscernQualifier): string[] {
  if (q.initial.type === 'write') return [];
  if (q.initial.type === 'choose') return q.initial.options.map((o) => o.trim()).filter(Boolean);
  const preset = DISCERN_SCALES[q.initial.preset].options;
  return preset.map((fallback, i) => q.initial.options[i]?.trim() || fallback);
}

export type DiscernStep = { name: string; title: string; prompt: string; defaultPrompt: string; jot: string };

export function discernSteps(q: DiscernQualifier): DiscernStep[] {
  const own = q.mode === 'own';
  const who = q.who.trim() || 'they';
  const focus = q.focus.trim() || (own ? 'the question' : `${who}’s choice`);
  const source = q.source.trim();
  const evidence = source ? `one moment from ${source}` : 'one piece of evidence';
  const other = source ? `a different moment from ${source}` : 'a different piece of evidence';
  const verb = q.initial.type === 'write' ? 'Write' : 'Tap';
  const defaults: Array<[string, string]> = own ? [
    ['Your initial answer, and what’s behind it', `${verb} your initial answer. Then be honest: why do you want that to be the answer? Maybe it feels right, sounds clever, or is what you think your teacher wants.`],
    ['Argue against it first', `Make the strongest case that your initial answer on ${focus} is wrong. Use ${evidence} that pushes hardest against you.`],
    ['Now argue for it', `Make the strongest case that your initial answer is right. Use ${other}.`],
    ['Step back', `Pretend neither argument is yours. Judging only these two, where do you now stand on ${focus}?`],
    ['Reread and confirm', 'Is that pull still what holds your answer up, or is your evidence doing the work now? Does your answer feel settled, or uneasy?']
  ] : [
    [`Your initial verdict, and what pulled ${who}`, `${verb} your initial verdict on ${focus}. Then: what was pulling ${who} towards that choice?`],
    ['Argue against the choice', `Make the strongest case that ${who}’s choice was wrong. Use ${evidence}.`],
    ['Now argue for it', `Make the strongest case that ${who}’s choice was right. Use ${other}.`],
    ['Step back', `Pretend you have no feelings about ${who} at all. Judging only these two arguments, where do you now stand?`],
    ['Reread and confirm', `Did you judge the choice, or how you feel about ${who}? Does your verdict feel settled, or uneasy?`]
  ];
  return defaults.map(([title, defaultPrompt], i) => ({
    name: DISCERN_STEP_NAMES[i]!,
    title,
    defaultPrompt,
    prompt: q.prompts?.[i]?.trim() || defaultPrompt,
    jot: i === 0 ? (own ? 'What’s pulling you towards it?' : `What was pulling ${who}?`) : 'Jot it in a few words'
  }));
}

/** Key moments for the character's own tail; empty when the option is off. */
export function characterMoments(q: DiscernQualifier): string[] {
  if (q.mode !== 'theirs' || !q.character_tail?.enabled) return [];
  const moments = q.character_tail.moments.map((m) => m.trim()).filter(Boolean);
  return moments.length >= 2 ? moments : [];
}

/* ── Reading a tail ─────────────────────────────────────────────────── */

export type DiscernShape = 'tested' | 'stuck' | 'rose' | 'fell' | 'flat' | 'wander';

export const DISCERN_SHAPES: Record<DiscernShape, { name: string; icon: string; reading: string }> = {
  tested: { name: 'Tested, came back', icon: 'M2 3 L10 12 L18 5 L30 3', reading: 'The case against shook you, then you came back. That is what testing looks like. Name the moment that brought you back in your answer.' },
  stuck: { name: 'Against stuck', icon: 'M2 3 L10 12 L18 10 L30 11', reading: 'The case against shook you and you never fully recovered. Your Against note might be closer to your real answer. Does your answer admit that?' },
  rose: { name: 'Rose', icon: 'M2 12 L10 9 L18 6 L30 3', reading: 'You grew more settled the whole way. Check: did anything really test you, or was your case against a soft one?' },
  fell: { name: 'Ended lower', icon: 'M2 3 L10 6 L18 9 L30 12', reading: 'You finished less settled than you started. Follow the unease: what is it pointing at? Change one sentence, or explain why you are keeping it.' },
  flat: { name: 'Flat', icon: 'M2 7 L10 8 L18 7 L30 7', reading: 'Your line barely moved. Were you free at the start, or decided before you began? Try Against again with the hardest evidence you can find.' },
  wander: { name: 'Wandered', icon: 'M2 7 L10 3 L18 12 L30 6', reading: 'Your line moved around. Find the step where it jumped most: that note is doing the most work in your thinking.' }
};

/** Shape of a full five-dot tail (1 = uneasy, 5 = settled). */
export function classifyTail(dots: number[]): DiscernShape {
  const v = dots.slice(0, 5);
  const max = Math.max(...v);
  const min = Math.min(...v);
  if (max - min <= 1) return 'flat';
  if (v[1]! < v[0]! && v[1] === min) return v[4]! >= v[0]! ? 'tested' : 'stuck';
  if (v[4]! > v[0]!) return 'rose';
  if (v[4]! < v[0]!) return 'fell';
  return 'wander';
}

/* ── Attaching, removing and the linked Confirm card ────────────────── */

export function withDiscern<T extends Block>(block: T, discern: DiscernQualifier): T {
  return { ...block, discern };
}

export function withoutDiscern<T extends Block>(block: T): T {
  const { discern: _removed, ...rest } = block;
  return rest as T;
}

export function createDiscernConfirmBlock(id: string, targetBlockId: string, now = new Date().toISOString()): Block {
  return {
    id, type: 'block', block_type: 'discern_confirm', variant: 'medium', visibility: 'student_teacher',
    content: { target_block_id: targetBlockId },
    layout: {}, print: {}, settings: {},
    created_at: now, updated_at: now, schema_version: 1
  } as Block;
}

/** Applies `fn` to every block list in the tree: the page and each section, column and tab. */
function mapLists(blocks: Block[], fn: (list: Block[]) => Block[]): Block[] {
  const inner = fn(blocks).map((block) => {
    if (block.block_type === 'section') {
      return { ...block, content: { ...block.content, blocks: mapLists(block.content.blocks as Block[], fn) } } as Block;
    }
    if (block.block_type === 'columns') {
      return { ...block, content: { ...block.content, columns: block.content.columns.map((col) => ({ ...col, blocks: mapLists(col.blocks as Block[], fn) })) } } as Block;
    }
    if (block.block_type === 'tabs') {
      return { ...block, content: { ...block.content, tabs: block.content.tabs.map((tab) => ({ ...tab, blocks: mapLists(tab.blocks as Block[], fn) })) } } as Block;
    }
    return block;
  });
  return inner;
}

function eachBlock(blocks: Block[], visit: (block: Block) => void): void {
  mapLists(blocks, (list) => { list.forEach(visit); return list; });
}

export function findDiscernConfirm(blocks: Block[], hostId: string): Block | null {
  let found: Block | null = null;
  eachBlock(blocks, (block) => {
    if (!found && block.block_type === 'discern_confirm' && block.content.target_block_id === hostId) found = block;
  });
  return found;
}

/** Puts the Confirm card straight after its block, in the same list. */
export function insertDiscernConfirm(blocks: Block[], hostId: string, confirm: Block): Block[] {
  let placed = false;
  const next = mapLists(blocks, (list) => {
    const at = list.findIndex((block) => block.id === hostId);
    if (at < 0 || placed) return list;
    placed = true;
    return [...list.slice(0, at + 1), confirm, ...list.slice(at + 1)];
  });
  return placed ? next : [...blocks, confirm];
}

export function removeDiscernConfirms(blocks: Block[], hostId: string): Block[] {
  return mapLists(blocks, (list) => list.filter((block) => !(block.block_type === 'discern_confirm' && block.content.target_block_id === hostId)));
}

/* ── A student's working, kept on their device ──────────────────────── */

export type DiscernState = {
  step: number;
  position: string;
  notes: string[];
  dots: number[];
  /** True once the four steps are drawn; the Confirm card opens after this. */
  drawn: boolean;
  character: { notes: string[]; dots: number[]; drawn: boolean };
};

export function emptyDiscernState(): DiscernState {
  return { step: 0, position: '', notes: ['', '', '', '', ''], dots: [0, 0, 0, 0, 0], drawn: false, character: { notes: [], dots: [], drawn: false } };
}

export function discernStateKey(lessonId: string, blockId: string): string {
  return `${storageKey(lessonId, blockId)}.discern`;
}

const clampDot = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 5 ? (v as number) : 0);
const clampText = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function loadDiscernState(key?: string): DiscernState {
  const base = emptyDiscernState();
  const saved = key ? loadActivityState<Record<string, unknown>>(key) : null;
  if (!saved || typeof saved !== 'object') return base;
  const notes = Array.isArray(saved.notes) ? saved.notes : [];
  const dots = Array.isArray(saved.dots) ? saved.dots : [];
  const character = (saved.character && typeof saved.character === 'object' ? saved.character : {}) as Record<string, unknown>;
  return {
    step: Number.isInteger(saved.step) ? Math.max(0, Math.min(3, saved.step as number)) : 0,
    position: clampText(saved.position, DISCERN_INITIAL_MAX),
    notes: base.notes.map((_, i) => clampText(notes[i], DISCERN_LABEL_MAX)),
    dots: base.dots.map((_, i) => clampDot(dots[i])),
    drawn: saved.drawn === true,
    character: {
      notes: (Array.isArray(character.notes) ? character.notes : []).slice(0, 6).map((n) => clampText(n, DISCERN_LABEL_MAX)),
      dots: (Array.isArray(character.dots) ? character.dots : []).slice(0, 6).map(clampDot),
      drawn: character.drawn === true
    }
  };
}

export const DISCERN_STATE_EVENT = 'discern-state';

/** Saves on this device and tells the linked Confirm card to redraw. */
export function saveDiscernState(key: string | undefined, state: DiscernState): void {
  if (!key) return;
  saveActivityState(key, state);
  document.dispatchEvent(new CustomEvent(DISCERN_STATE_EVENT, { detail: { key } }));
}

export function stepsComplete(state: DiscernState, count: number): boolean {
  return state.dots.slice(0, count).every((d) => d > 0) && state.notes.slice(0, count).every((n) => n.trim());
}
