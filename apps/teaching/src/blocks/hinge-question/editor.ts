import { button, el, field } from '@/blocks/peer-feedback-ui';
import { LETTERS, MAX_OPTIONS, MIN_OPTIONS, type HingeBlock, type HingeContent, type HingeOption } from './shared';

const TIMES: Array<{ value: HingeContent['seconds']; label: string }> = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 90, label: '90 seconds' },
  { value: 120, label: '2 minutes' },
  { value: 0, label: 'No limit' }
];

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function numberField(label: string, value: number, min: number, max: number, onInput: (n: number) => void): HTMLElement {
  const id = nextId('hq-num');
  const wrap = el('div', 'pf-field hq-threshold');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const row = el('div', 'hq-threshold__row');
  const input = el('input', 'hq-threshold__input');
  input.id = id;
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.addEventListener('input', () => {
    const n = Math.round(Number(input.value));
    if (Number.isFinite(n) && n >= min && n <= max) onInput(n);
  });
  row.append(input, el('span', 'block-secondary', '% right'));
  wrap.append(lab, row);
  return wrap;
}

export function createHingeQuestionEditor(block: HingeBlock, onChange: (b: HingeBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor hq-editor');
  let current = block;
  const set = (patch: Partial<HingeContent>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };
  const setOption = (id: string, patch: Partial<HingeOption>) =>
    set({ options: current.content.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const q = field('Question', 'Ask at the point the lesson turns on. Every student should answer in under a minute.');
  q.input.rows = 2;
  q.input.maxLength = 500;
  q.input.value = current.content.prompt;
  q.input.addEventListener('input', () => set({ prompt: q.input.value }));

  const optionsWrap = el('fieldset', 'hq-editor__options');
  const groupName = nextId('hq-right');
  function paintOptions(): void {
    const legend = el('legend', 'pf-field__label', 'Answers');
    const hint = el('p', 'pf-field__hint block-secondary', 'Mark the right one. For each wrong one, note the misconception a student who picks it probably holds. Only you see the notes.');
    const rows = current.content.options.map((o, i) => {
      const right = o.id === current.content.correct_id;
      const row = el('div', 'hq-editor__option');
      row.dataset.right = String(right);
      const letter = el('span', 'hq-letter', LETTERS[i] ?? '?');
      letter.setAttribute('aria-hidden', 'true');
      const text = el('input', 'hq-editor__text');
      text.type = 'text';
      text.maxLength = 300;
      text.placeholder = `Answer ${LETTERS[i]}`;
      text.setAttribute('aria-label', `Answer ${LETTERS[i]}`);
      text.value = o.text;
      text.addEventListener('input', () => setOption(o.id, { text: text.value }));

      const pick = el('label', 'hq-editor__right');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = groupName;
      radio.checked = right;
      radio.addEventListener('change', () => {
        set({ correct_id: o.id });
        paintOptions();
      });
      pick.append(radio, el('span', '', 'Right answer'));

      const head = el('div', 'hq-editor__head');
      head.append(letter, text, pick);
      if (current.content.options.length > MIN_OPTIONS) {
        const remove = button('Remove', 'ghost', () => {
          const options = current.content.options.filter((x) => x.id !== o.id);
          set({ options, correct_id: current.content.correct_id === o.id ? '' : current.content.correct_id });
          paintOptions();
        });
        remove.setAttribute('aria-label', `Remove answer ${LETTERS[i]}`);
        head.append(remove);
      }
      row.append(head);
      if (!right) {
        const note = el('input', 'hq-editor__note');
        note.type = 'text';
        note.maxLength = 300;
        note.placeholder = 'Picking this means they think…';
        note.setAttribute('aria-label', `Misconception behind answer ${LETTERS[i]}`);
        note.value = o.misconception;
        note.addEventListener('input', () => setOption(o.id, { misconception: note.value }));
        row.append(note);
      }
      return row;
    });
    optionsWrap.replaceChildren(legend, hint, ...rows);
    if (current.content.options.length < MAX_OPTIONS) {
      optionsWrap.append(
        button('Add an answer', 'secondary', () => {
          set({ options: [...current.content.options, { id: `${current.id}_${Date.now().toString(36)}`, text: '', misconception: '' }] });
          paintOptions();
        })
      );
    }
  }
  paintOptions();

  const timeId = nextId('hq-time');
  const time = el('div', 'pf-field');
  const timeLabel = el('label', 'pf-field__label', 'Time to answer');
  timeLabel.htmlFor = timeId;
  const select = el('select', 'bs-select');
  select.id = timeId;
  TIMES.forEach((t, i) => {
    const o = el('option', undefined, t.label);
    o.value = String(i);
    o.selected = t.value === current.content.seconds;
    select.append(o);
  });
  select.addEventListener('change', () => set({ seconds: TIMES[Number(select.value)]!.value }));
  time.append(timeLabel, select);

  const thresholds = el('div', 'hq-editor__thresholds');
  thresholds.append(
    el('p', 'pf-field__label', 'Your next step'),
    el('p', 'pf-field__hint block-secondary', 'Only you see this, on your own screen. It never shows on the board or to students.'),
    (() => {
      const row = el('div', 'bs-editor__row');
      row.append(
        numberField('Move on at or above', current.content.move_on, 1, 100, (n) => set({ move_on: n })),
        numberField('Reteach below', current.content.reteach, 0, 99, (n) => set({ reteach: n }))
      );
      return row;
    })(),
    el('p', 'pf-field__hint block-secondary', 'In between, it suggests splitting the class.')
  );

  root.append(
    q.wrap,
    optionsWrap,
    time,
    thresholds,
    el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor and press Ask the class on the block.')
  );
  return root;
}
