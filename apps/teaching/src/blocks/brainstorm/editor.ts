import { el, field } from '@/blocks/peer-feedback-ui';
import type { BrainstormBlock } from './shared';

type Content = BrainstormBlock['content'];

const SAFETY: Array<{ value: Content['safety']; label: string; hint: string }> = [
  { value: 'approve', label: 'I approve each answer', hint: 'Every answer waits for you before it reaches the board. Safest, best for juniors.' },
  { value: 'instant', label: 'Instant, unless flagged', hint: 'Answers go straight up. Anything the word check flags waits for you.' },
  { value: 'reveal', label: 'Hidden until I reveal', hint: 'Answers collect as shapes only. Revealing shows them all at once and closes answering, so nobody copies.' }
];
const PER_STUDENT: Array<{ value: Content['per_student']; label: string }> = [
  { value: 1, label: '1 answer' },
  { value: 3, label: '3 answers' },
  { value: 5, label: '5 answers' },
  { value: 0, label: 'Unlimited' }
];
const LENGTHS = [60, 140, 280];
const LAYOUTS: Array<{ value: Content['layout']; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'cloud', label: 'Word cloud' },
  { value: 'groups', label: 'Groups (AI sorts them)' }
];

function option(text: string, value: string, selected = false): HTMLOptionElement {
  const o = el('option', undefined, text);
  o.value = value;
  o.selected = selected;
  return o;
}

let seq = 0;
function picker<T extends string | number>(label: string, options: Array<{ value: T; label: string }>, value: T, onPick: (v: T) => void, hint?: (v: T) => string): HTMLElement {
  const id = `bs-pick-${++seq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const select = el('select', 'bs-select');
  select.id = id;
  options.forEach((o, i) => {
    select.append(option(o.label, String(i), o.value === value));
  });
  const help = el('p', 'pf-field__hint block-secondary');
  const paintHint = (v: T) => {
    help.textContent = hint?.(v) ?? '';
    help.hidden = !hint;
  };
  select.addEventListener('change', () => {
    const picked = options[Number(select.value)]!.value;
    paintHint(picked);
    onPick(picked);
  });
  paintHint(value);
  wrap.append(lab, select, help);
  return wrap;
}

export function createBrainstormEditor(block: BrainstormBlock, onChange: (b: BrainstormBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor bs-editor');
  let current = block;
  const set = (patch: Partial<Content>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };

  const q = field('Question', 'One short question students can answer in a line.');
  q.input.rows = 2;
  q.input.maxLength = 500;
  q.input.value = current.content.question;
  q.input.addEventListener('input', () => set({ question: q.input.value }));

  const row = el('div', 'bs-editor__row');
  row.append(
    picker('Answers per student', PER_STUDENT, current.content.per_student, (v) => set({ per_student: v })),
    picker('Answer length', LENGTHS.map((n) => ({ value: n, label: `Up to ${n} characters` })), current.content.max_length, (v) => set({ max_length: v })),
    picker('Reveal as', LAYOUTS, current.content.layout, (v) => set({ layout: v }))
  );

  root.append(
    q.wrap,
    picker('Safety', SAFETY, current.content.safety, (v) => set({ safety: v }), (v) => SAFETY.find((s) => s.value === v)?.hint ?? ''),
    row,
    el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor and press Start brainstorm on the block.')
  );
  return root;
}
