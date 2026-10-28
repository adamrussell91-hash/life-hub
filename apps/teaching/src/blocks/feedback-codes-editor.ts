import { apiGet, apiPut } from '@/api/client';
import { button, el, errorText } from '@/blocks/peer-feedback-ui';
import type { CodeColour } from '@/blocks/peer-annotate';
import {
  FEEDBACK_CODES_ENDPOINT,
  CRITERION_LABELS,
  GROUP_LABELS,
  PROBLEM_TYPE_LABELS,
  codeInk,
  primeFeedbackCodes,
  type CodeProblemType,
  type Criterion,
  type FeedbackCode,
  type FeedbackCodeGroup
} from '@/blocks/feedback-codes';

/**
 * Editor for the feedback code library. One library for every lesson, so it
 * saves on its own (not with the lesson) by its own button, like the peer
 * feedback bank. Each code folds away to one line so 25 codes stay scannable.
 */

const COLOURS: CodeColour[] = ['lilac', 'blue', 'gold', 'peach', 'sage'];
const COLOUR_NAMES: Record<CodeColour, string> = { blue: 'Blue', sage: 'Green', peach: 'Peach', gold: 'Gold', lilac: 'Purple' };
const GROUPS: FeedbackCodeGroup[] = ['composition', 'viva', 'speaking'];
const MAX_CODES = 60;

let seq = 0;
function input(label: string, value: string, max: number, onInput: (v: string) => void, opts: { multiline?: boolean; placeholder?: string } = {}): HTMLElement {
  const id = `fc-edit-${++seq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = opts.multiline ? el('textarea', 'pa-input') : el('input', 'pa-input');
  box.id = id;
  if (box instanceof HTMLInputElement) box.type = 'text';
  else box.rows = 2;
  box.value = value;
  box.maxLength = max;
  box.placeholder = opts.placeholder ?? '';
  box.addEventListener('input', () => onInput(box.value));
  wrap.append(lab, box);
  return wrap;
}

function pills<T extends string | number>(label: string, options: Array<{ value: T; label: string }>, current: T | null, onPick: (v: T) => void): HTMLElement {
  const wrap = el('div', 'pf-field');
  wrap.append(el('span', 'pf-field__label', label));
  const group = el('div', 'pa-mode');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const o of options) {
    const b = button(o.label, 'ghost', () => onPick(o.value));
    b.className = 'pa-mode__option';
    b.setAttribute('aria-pressed', String(o.value === current));
    group.append(b);
  }
  wrap.append(group);
  return wrap;
}

export function mountFeedbackCodesEditor(): HTMLElement {
  const root = el('section', 'pa-bank fc-editor');
  root.append(
    el('p', 'pf-field__label', 'Feedback codes'),
    el('p', 'pf-field__hint', 'Shared by every Voice block and annotation in every lesson. Students see the description when they tap a code.')
  );
  const rows = el('ul', 'pa-bank__rows fc-editor__rows');
  const status = el('p', 'pa-bank__status');
  status.setAttribute('role', 'status');
  const actions = el('div', 'pf-actions');
  root.append(rows, actions, status);

  let codes: FeedbackCode[] = [];
  let dirty = false;
  let openIndex: number | null = null;

  const say = (text: string, tone: 'info' | 'error' = 'info') => {
    status.textContent = text;
    status.dataset.tone = tone;
  };
  const change = (index: number, patch: Partial<FeedbackCode>, repaint = false) => {
    codes = codes.map((c, i) => (i === index ? { ...c, ...patch } : c));
    dirty = true;
    say('Unsaved changes.');
    if (repaint) paint();
  };

  function row(code: FeedbackCode, index: number): HTMLElement {
    const item = el('li', 'fc-editor__row');
    const head = button('', 'ghost', () => {
      openIndex = openIndex === index ? null : index;
      paint();
    });
    head.className = 'fc-editor__head';
    head.setAttribute('aria-expanded', String(openIndex === index));
    const chip = el('span', 'fc-chip', code.code || '?');
    chip.style.setProperty('--fc-ink', codeInk(code.colour));
    const where = code.criterion ? CRITERION_LABELS[code.criterion] : GROUP_LABELS[code.group];
    head.append(chip, el('span', 'fc-editor__name', code.label || 'New code'), el('span', 'fc-editor__where block-secondary', code.key ? `${where} · shortcut ${code.key}` : where));
    if (code.hidden) head.append(el('span', 'fc-editor__hidden', 'Hidden'));
    item.append(head);
    if (openIndex !== index) return item;

    const body = el('div', 'fc-editor__body');
    body.append(
      input('Code', code.code, 3, (v) => change(index, { code: v.toUpperCase() }), { placeholder: 'AR' }),
      input('Name', code.label, 60, (v) => change(index, { label: v }), { placeholder: 'Analysis – relevance' }),
      pills('Group', GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] })), code.group, (g) =>
        change(index, { group: g, criterion: g === 'speaking' ? null : (code.criterion ?? 1), key: g === 'speaking' ? code.key : undefined }, true)
      )
    );
    if (code.group !== 'speaking') {
      body.append(
        pills('Rubric criterion', ([1, 2, 3] as Criterion[]).map((n) => ({ value: n, label: CRITERION_LABELS[n] })), code.criterion, (n) => change(index, { criterion: n }, true))
      );
    } else {
      const taken = new Set(codes.filter((c, i) => i !== index && c.key).map((c) => c.key));
      body.append(
        pills(
          'Number key while marking',
          ['1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((k) => !taken.has(k) || k === code.key).map((k) => ({ value: k, label: k })),
          code.key ?? null,
          (k) => change(index, { key: code.key === k ? undefined : k }, true)
        )
      );
    }

    const colour = el('div', 'pf-field');
    colour.append(el('span', 'pf-field__label', 'Colour'));
    const swatches = el('div', 'pa-swatches');
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', `Colour for ${code.code || 'this code'}`);
    for (const c of COLOURS) {
      const s = button('', 'ghost', () => change(index, { colour: c }, true));
      s.className = 'pa-swatch';
      s.dataset.colour = c;
      s.setAttribute('aria-label', COLOUR_NAMES[c]);
      s.setAttribute('aria-pressed', String(code.colour === c));
      swatches.append(s);
    }
    colour.append(swatches);
    body.append(colour);

    const descriptor = input('What the student reads', code.descriptor, 600, (v) => change(index, { descriptor: v }), { multiline: true });
    const strength = input('As a strength (Shift + code, optional)', code.strength_descriptor ?? '', 600, (v) => change(index, { strength_descriptor: v || undefined }), {
      multiline: true,
      placeholder: 'Leave empty to show “Strength: …”'
    });
    descriptor.classList.add('pa-bank__wide');
    strength.classList.add('pa-bank__wide');
    body.append(descriptor, strength);
    if (code.group !== 'speaking') {
      body.append(
        pills(
          'Problem it points to (WalkThrus, optional)',
          (Object.keys(PROBLEM_TYPE_LABELS) as CodeProblemType[]).map((t) => ({ value: t, label: PROBLEM_TYPE_LABELS[t] })),
          code.problem_type ?? null,
          (t) => change(index, { problem_type: code.problem_type === t ? undefined : t }, true)
        )
      );
    }

    const tools = el('div', 'pa-bank__row-actions pa-bank__wide');
    tools.append(
      button(code.hidden ? 'Show this code' : 'Hide this code', 'ghost', () => change(index, { hidden: code.hidden ? undefined : true }, true)),
      Object.assign(
        button('Remove code', 'ghost', () => {
          codes = codes.filter((_, i) => i !== index);
          openIndex = null;
          dirty = true;
          say('Unsaved changes. Old feedback keeps showing a removed code by its letters.');
          paint();
        }),
        { disabled: codes.length <= 1 }
      )
    );
    body.append(tools);
    item.append(body);
    return item;
  }

  const add = button('Add a code', 'secondary', () => {
    codes = [...codes, { id: '', code: '', label: '', group: 'composition', criterion: 1, colour: 'lilac', descriptor: '' }];
    openIndex = codes.length - 1;
    dirty = true;
    paint();
    rows.querySelector<HTMLInputElement>('.fc-editor__row:last-child input')?.focus();
  });
  const save = button('Save codes', 'primary', async function () {
    this.disabled = true;
    say('Saving…');
    try {
      const saved = await apiPut<{ codes: FeedbackCode[] }>(FEEDBACK_CODES_ENDPOINT, { codes });
      codes = saved.codes;
      primeFeedbackCodes(codes);
      dirty = false;
      paint();
      say('Saved. Every Voice block and annotation uses these now.');
    } catch (error) {
      say(errorText(error), 'error');
    } finally {
      this.disabled = false;
    }
  });
  actions.append(add, save);

  function paint(): void {
    rows.replaceChildren(...codes.map(row));
    add.disabled = codes.length >= MAX_CODES;
  }

  say('Loading codes…');
  void apiGet<{ codes: FeedbackCode[] }>(FEEDBACK_CODES_ENDPOINT)
    .then((data) => {
      if (dirty) return;
      codes = data.codes;
      paint();
      say('');
    })
    .catch((error) => say(errorText(error), 'error'));
  return root;
}
