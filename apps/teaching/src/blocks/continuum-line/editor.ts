import { button, el, field } from '@/blocks/peer-feedback-ui';
import type { Block } from '@/schemas/block';
import { nearestStop, returnSources, type ContinuumBlock } from './shared';

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

/** Where a statement really sits, as a 0 to 100 slider; snapped statements land on a stop. */
function answerSlider(label: string, value: number | undefined, stops: readonly string[], snap: boolean, onSet: (v: number) => void): HTMLElement {
  const wrap = el('label', 'cl-editor__answer');
  const range = el('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = String(Math.round((value ?? 0.5) * 100));
  range.setAttribute('aria-label', label);
  const shown = el('span', 'block-secondary', value == null ? 'Answer not set' : `Answer at ${Math.round(value * 100)}`);
  range.addEventListener('input', () => {
    const raw = Number(range.value) / 100;
    const v = snap ? nearestStop(raw, stops) : raw;
    shown.textContent = `Answer at ${Math.round(v * 100)}`;
    onSet(v);
  });
  wrap.append(range, shown);
  return wrap;
}

export function createContinuumLineEditor(block: ContinuumBlock, onChange: (b: ContinuumBlock) => void, getLessonBlocks?: () => Block[]): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor cl-editor');
  let current = block;
  const set = (patch: Partial<Content>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };

  // A return line: everything but pace and re-place comes from the earlier line.
  const returnBox = el('div', 'cl-editor__group');
  const ownParts: HTMLElement[] = [];
  const paintReturn = () => {
    const sources = returnSources(getLessonBlocks?.() ?? [], current.id);
    const id = `cl-ed-${++seq}`;
    const lab = el('label', 'pf-field__label', 'Returns to');
    lab.htmlFor = id;
    const pick = el('select', 'pf-field__input');
    pick.id = id;
    const none = el('option', '', 'Nothing: this is a new line');
    none.value = '';
    pick.append(none);
    for (const [i, s] of sources.entries()) {
      const first = s.content.statements.find((x) => x.text.trim())?.text ?? 'No statements yet';
      const o = el('option', '', `Line ${i + 1}: ${first.slice(0, 60)}`);
      o.value = s.id;
      pick.append(o);
    }
    const missing = current.content.returns_to && !sources.some((s) => s.id === current.content.returns_to);
    if (missing) {
      const o = el('option', '', 'A line that is no longer in the lesson');
      o.value = current.content.returns_to!;
      pick.append(o);
    }
    pick.value = current.content.returns_to ?? '';
    pick.addEventListener('change', () => {
      const { returns_to: _old, ...rest } = current.content;
      current = { ...current, content: pick.value ? { ...rest, returns_to: pick.value } : rest };
      onChange(current);
      paintReturn();
    });
    const hint = current.content.returns_to
      ? 'Students meet the earlier line again and place once more, seeing where they first put their symbol. Its stimulus, line and statements come from that line.'
      : sources.length
        ? 'Bring an earlier line back at the end of the lesson: where would they put it now?'
        : 'Add another continuum line to this lesson to bring it back here later.';
    returnBox.replaceChildren(lab, pick, el('p', 'pf-field__hint block-secondary', hint));
    if (missing) returnBox.append(el('p', 'pf-alert', 'The line this returns to has gone. Pick another, or choose Nothing.'));
    for (const p of ownParts) p.hidden = !!current.content.returns_to;
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
        if (current.content.mode === 'predict') {
          row.append(answerSlider(`Answer for statement ${i + 1}`, s.answer, current.content.scale.stops, s.snap, (v) => update({ answer: v })));
        }
        return row;
      })
    );
  };
  const statementsHead = el('p', 'pf-field__label', 'Statements');
  statementsHead.append(count);
  statementsBox.append(statementsHead, el('p', 'pf-field__hint block-secondary', 'Snap forces a choice: the symbol lands on an end or a named stop. Use it to make students defend a side.'), list, add);
  paintStatements();

  // Mode
  const modeBox = el('div', 'cl-editor__group');
  modeBox.append(
    chips('Kind of line', [{ value: 'opinion', label: 'Opinion: no right answer' }, { value: 'predict', label: 'Predict: there is an answer' }], current.content.mode ?? 'opinion', (mode) => {
      set({ mode });
      paintStatements();
    }),
    el('p', 'pf-field__hint block-secondary', 'Predict: set where each statement really sits. Students commit to a guess first; after the reveal you show the answer on the line. Students never see it before you do.')
  );

  // Round
  const roundBox = el('div', 'cl-editor__group');
  roundBox.append(
    chips('Pace', [{ value: 'teacher', label: 'Teacher led: I click through' }, { value: 'student', label: 'Student paced: they move on' }, { value: 'self', label: 'Self-run: no code, no teacher steps' }], current.content.pace, (pace) => set({ pace })),
    el('p', 'pf-field__hint block-secondary', 'Self-run: students open the lesson, place each statement with a reason and go on. No code and nothing to start. Nothing shows until you press Reveal on the block, the same as Student paced.'),
    toggle('Offer a re-place round after each reveal: students move their symbol and say why', current.content.replace, (on) => set({ replace: on }))
  );

  ownParts.push(stimulusBox, lineBox, modeBox, statementsBox);
  paintReturn();
  root.append(
    returnBox,
    stimulusBox,
    lineBox,
    modeBox,
    statementsBox,
    roundBox,
    el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor and press Start the line on the block.')
  );
  return root;
}
