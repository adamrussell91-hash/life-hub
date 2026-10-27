import { button, el, field } from '@/blocks/peer-feedback-ui';
import type { ContinuumBlock } from './shared';

type Content = ContinuumBlock['content'];

export const MAX_STATEMENTS = 10;

/** Ready-made lines. Custom keeps whatever the teacher typed. */
const PRESETS: Array<{ label: string; left: string; right: string; stops: string[] }> = [
  { label: 'Implied ↔ Not implied', left: 'Implied', right: 'Not implied', stops: [] },
  { label: 'All · Some · None', left: 'All', right: 'None', stops: ['Some'] },
  { label: 'Certain ↔ Impossible', left: 'Certain', right: 'Impossible', stops: [] },
  { label: 'Fact ↔ Opinion', left: 'Fact', right: 'Opinion', stops: [] },
  { label: 'Strong ↔ Weak evidence', left: 'Strong evidence', right: 'Weak evidence', stops: [] },
  { label: 'Agree ↔ Disagree', left: 'Agree', right: 'Disagree', stops: [] },
  { label: 'True ↔ False', left: 'True', right: 'False', stops: [] }
];

let seq = 0;

function chips<T extends string>(label: string, options: Array<{ value: T; label: string }>, value: T, onPick: (v: T) => void): HTMLElement {
  const wrap = el('div', 'pf-field');
  wrap.append(el('p', 'pf-field__label', label));
  const row = el('div', 'cl-chips');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  const paint = (current: T) => {
    for (const b of row.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.value === current));
  };
  for (const o of options) {
    const b = button(o.label, 'ghost', () => {
      paint(o.value);
      onPick(o.value);
    });
    b.className = 'cl-chip';
    b.dataset.value = o.value;
    row.append(b);
  }
  paint(value);
  wrap.append(row);
  return wrap;
}

function input(label: string, value: string, max: number, onInput: (v: string) => void, placeholder = ''): HTMLElement {
  const id = `cl-ed-${++seq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = el('input', 'pf-field__input');
  box.id = id;
  box.type = 'text';
  box.maxLength = max;
  box.value = value;
  box.placeholder = placeholder;
  box.addEventListener('input', () => onInput(box.value));
  wrap.append(lab, box);
  return wrap;
}

function toggle(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const wrap = el('label', 'pf-switch');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, el('span', '', label));
  return wrap;
}

export function createContinuumLineEditor(block: ContinuumBlock, onChange: (b: ContinuumBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor cl-editor');
  let current = block;
  const set = (patch: Partial<Content>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };

  // Stimulus
  const stimulusBox = el('div', 'cl-editor__group');
  const stimulusBody = el('div', 'cl-editor__stack');
  const paintStimulus = () => {
    const st = current.content.stimulus;
    const parts: HTMLElement[] = [];
    if (st.kind !== 'text') {
      parts.push(input(st.kind === 'image' ? 'Image link' : 'Video link (YouTube, Vimeo or a video file)', st.url, 2000, (v) => set({ stimulus: { ...current.content.stimulus, url: v } }), 'https://'));
      if (st.kind === 'image') parts.push(input('Describe the image', st.alt_text, 500, (v) => set({ stimulus: { ...current.content.stimulus, alt_text: v } })));
    }
    const text = field(st.kind === 'text' ? 'Stimulus text' : 'Caption (optional)', st.kind === 'text' ? 'What students read before placing each statement.' : undefined);
    text.input.rows = st.kind === 'text' ? 3 : 2;
    text.input.maxLength = 2000;
    text.input.value = st.text;
    text.input.addEventListener('input', () => set({ stimulus: { ...current.content.stimulus, text: text.input.value } }));
    parts.push(text.wrap);
    stimulusBody.replaceChildren(...parts);
  };
  stimulusBox.append(
    chips('Stimulus', [{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }], current.content.stimulus.kind, (kind) => {
      set({ stimulus: { ...current.content.stimulus, kind } });
      paintStimulus();
    }),
    stimulusBody
  );
  paintStimulus();

  // Line
  const lineBox = el('div', 'cl-editor__group');
  const ends = el('div', 'cl-editor__row');
  const preview = el('div', 'cl-editor__preview');
  const presetValue = () => {
    const s = current.content.scale;
    return PRESETS.find((p) => p.left === s.left && p.right === s.right && p.stops.join('|') === s.stops.join('|'))?.label ?? 'Custom';
  };
  const paintEnds = () => {
    const s = current.content.scale;
    ends.replaceChildren(
      input('Left end', s.left, 40, (v) => (set({ scale: { ...current.content.scale, left: v } }), paintPreview())),
      input('Middle stops (optional, comma between)', s.stops.join(', '), 130, (v) => (set({ scale: { ...current.content.scale, stops: v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3) } }), paintPreview()), 'Some'),
      input('Right end', s.right, 40, (v) => (set({ scale: { ...current.content.scale, right: v } }), paintPreview()))
    );
  };
  const paintPreview = () => {
    const s = current.content.scale;
    preview.replaceChildren(...[s.left, ...s.stops, s.right].map((t) => el('span', '', t || '…')));
  };
  lineBox.append(
    chips('Line', [...PRESETS.map((p) => ({ value: p.label, label: p.label })), { value: 'Custom', label: 'Custom' }], presetValue(), (label) => {
      const p = PRESETS.find((x) => x.label === label);
      if (p) set({ scale: { left: p.left, right: p.right, stops: [...p.stops] } });
      paintEnds();
      paintPreview();
    }),
    ends,
    preview
  );
  paintEnds();
  paintPreview();

  // Statements
  const statementsBox = el('div', 'cl-editor__group');
  const list = el('div', 'cl-editor__statements');
  const count = el('span', 'block-secondary');
  const add = button('+ Add statement', 'ghost', () => {
    if (current.content.statements.length >= MAX_STATEMENTS) return;
    set({ statements: [...current.content.statements, { id: `${current.id}_s${Date.now().toString(36)}`, text: '', snap: false }] });
    paintStatements();
    list.querySelector<HTMLInputElement>('.cl-editor__statement:last-child input[type="text"]')?.focus();
  });
  const paintStatements = () => {
    const all = current.content.statements;
    count.textContent = ` ${all.length} of ${MAX_STATEMENTS}`;
    add.hidden = all.length >= MAX_STATEMENTS;
    list.replaceChildren(
      ...all.map((s, i) => {
        const row = el('div', 'cl-editor__statement');
        const update = (patch: Partial<typeof s>) => set({ statements: current.content.statements.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
        const text = el('input', 'pf-field__input');
        text.type = 'text';
        text.maxLength = 300;
        text.value = s.text;
        text.placeholder = i === 0 ? 'It was a hot day.' : 'Another statement about the same stimulus';
        text.setAttribute('aria-label', `Statement ${i + 1}`);
        text.addEventListener('input', () => update({ text: text.value }));
        const remove = button('×', 'ghost', () => {
          set({ statements: current.content.statements.filter((x) => x.id !== s.id) });
          paintStatements();
        });
        remove.className = 'cl-editor__remove';
        remove.setAttribute('aria-label', `Remove statement ${i + 1}`);
        remove.hidden = all.length <= 1;
        row.append(el('b', 'cl-editor__num', String(i + 1)), text, toggle('Snap to stops', s.snap, (on) => update({ snap: on })), remove);
        return row;
      })
    );
  };
  const statementsHead = el('p', 'pf-field__label', 'Statements');
  statementsHead.append(count);
  statementsBox.append(statementsHead, el('p', 'pf-field__hint block-secondary', 'Snap forces a choice: the symbol lands on an end or a named stop. Use it to make students defend a side.'), list, add);
  paintStatements();

  // Round
  const roundBox = el('div', 'cl-editor__group');
  roundBox.append(
    chips('Pace', [{ value: 'teacher', label: 'Teacher led: I click through' }, { value: 'student', label: 'Student paced: they move on' }, { value: 'self', label: 'Self-run: no code, no teacher steps' }], current.content.pace, (pace) => set({ pace })),
    el('p', 'pf-field__hint block-secondary', 'Self-run: students open the lesson, place each statement with a reason, see where the class put theirs, may move and say why, then go on. Nothing for you to start or reveal; reasons appear on the block as they come in.'),
    toggle('Offer a re-place round after each reveal: students move their symbol and say why', current.content.replace, (on) => set({ replace: on }))
  );

  root.append(
    stimulusBox,
    lineBox,
    statementsBox,
    roundBox,
    el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor and press Start the line on the block.')
  );
  return root;
}
