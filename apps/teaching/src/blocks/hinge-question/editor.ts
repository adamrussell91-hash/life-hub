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

type Answers = { options: HingeOption[]; correct_id: string };

/** The answers list with a right-answer pick and a misconception note per wrong answer. */
function answersEditor(opts: {
  legend: string;
  hint: string;
  newId: () => string;
  get: () => Answers;
  set: (patch: Partial<Answers>) => void;
}): HTMLFieldSetElement {
  const wrap = el('fieldset', 'hq-editor__options');
  const groupName = nextId('hq-right');
  const setOption = (id: string, patch: Partial<HingeOption>) =>
    opts.set({ options: opts.get().options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  function paint(): void {
    const { options, correct_id: correctId } = opts.get();
    const legend = el('legend', 'pf-field__label', opts.legend);
    const hint = el('p', 'pf-field__hint block-secondary', opts.hint);
    const rows = options.map((o, i) => {
      const right = o.id === correctId;
      const row = el('div', 'hq-editor__option');
      row.dataset.right = String(right);
      const letter = el('span', 'hq-letter', LETTERS[i] ?? '?');
      letter.setAttribute('aria-hidden', 'true');
      const text = el('input', 'hq-editor__text');
      text.type = 'text';
      text.maxLength = 300;
      text.placeholder = `Answer ${LETTERS[i]}`;
      text.setAttribute('aria-label', `${opts.legend}: answer ${LETTERS[i]}`);
      text.value = o.text;
      text.addEventListener('input', () => setOption(o.id, { text: text.value }));

      const pick = el('label', 'hq-editor__right');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = groupName;
      radio.checked = right;
      radio.addEventListener('change', () => {
        opts.set({ correct_id: o.id });
        paint();
      });
      pick.append(radio, el('span', '', 'Right answer'));

      const head = el('div', 'hq-editor__head');
      head.append(letter, text, pick);
      if (options.length > MIN_OPTIONS) {
        const remove = button('Remove', 'ghost', () => {
          const now = opts.get();
          opts.set({ options: now.options.filter((x) => x.id !== o.id), correct_id: now.correct_id === o.id ? '' : now.correct_id });
          paint();
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
    wrap.replaceChildren(legend, hint, ...rows);
    if (options.length < MAX_OPTIONS) {
      wrap.append(
        button('Add an answer', 'secondary', () => {
          opts.set({ options: [...opts.get().options, { id: opts.newId(), text: '', misconception: '' }] });
          paint();
        })
      );
    }
  }
  paint();
  return wrap;
}

export function createHingeQuestionEditor(block: HingeBlock, onChange: (b: HingeBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor hq-editor');
  let current = block;
  const set = (patch: Partial<HingeContent>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };
  const q = field('Question', 'Ask at the point the lesson turns on. Every student should answer in under a minute.');
  q.input.rows = 2;
  q.input.maxLength = 500;
  q.input.value = current.content.prompt;
  q.input.addEventListener('input', () => set({ prompt: q.input.value }));

  const optionsWrap = answersEditor({
    legend: 'Answers',
    hint: 'Mark the right one. For each wrong one, note the misconception a student who picks it probably holds. Only you see the notes.',
    newId: () => `${current.id}_${Date.now().toString(36)}`,
    get: () => ({ options: current.content.options, correct_id: current.content.correct_id }),
    set: (patch) => set(patch)
  });

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
    el('p', 'pf-field__hint block-secondary', 'In between, it suggests splitting the class. In focus view, the next arrow stops at a checkpoint when the class comes in under your move-on mark.')
  );

  // The back-up: a parallel question for the re-check after re-teaching.
  const backup = el('details', 'hq-editor__backup');
  // An empty back-up starts with four blank answers, like a new hinge question.
  const getBackup = (): NonNullable<HingeContent['backup']> => {
    const b = current.content.backup;
    if (b?.options.length) return b;
    const options = ['a', 'b', 'c', 'd'].map((k) => ({ id: `${current.id}_bk${k}`.slice(0, 40), text: '', misconception: '' }));
    return { prompt: b?.prompt ?? '', options, correct_id: b?.correct_id ?? '', source: 'teacher' };
  };
  const setBackup = (patch: Partial<NonNullable<HingeContent['backup']>>) =>
    set({ backup: { ...getBackup(), ...patch, source: 'teacher' } });
  backup.open = !!current.content.backup?.prompt;
  const summary = el('summary', 'pf-field__label', 'Back-up question (optional)');
  const backupHint = el(
    'p',
    'pf-field__hint block-secondary',
    current.content.backup?.source === 'ann'
      ? 'Ann drafted this in focus view after a class came in under your mark. Edit it as you like.'
      : 'Same idea, new wording, same traps. Asked from the focus view checkpoint after you re-teach. Leave it empty and Ann drafts one when it’s needed.'
  );
  const bq = field('Back-up question', '');
  bq.input.rows = 2;
  bq.input.maxLength = 500;
  bq.input.value = getBackup().prompt;
  bq.input.addEventListener('input', () => setBackup({ prompt: bq.input.value }));
  const backupAnswers = answersEditor({
    legend: 'Back-up answers',
    hint: 'Mark the right one, and keep the wrong ones as tempting as the originals.',
    newId: () => `${current.id}_bk${Date.now().toString(36)}`.slice(0, 40),
    get: () => ({ options: getBackup().options, correct_id: getBackup().correct_id }),
    set: (patch) => setBackup(patch)
  });
  backup.append(summary, backupHint, bq.wrap, backupAnswers);

  root.append(
    q.wrap,
    optionsWrap,
    time,
    thresholds,
    backup,
    el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor and press Ask the class on the block.')
  );
  return root;
}
