import { el } from '@/quiz/dom';
import { checkColumn, newMarkbookId, type Column, type Criterion } from './schema';
import type { OutcomeLabel } from './types';
import { formatBands, formatOutcomeCodes, parseBands, parseOutcomeCodes } from './parse';

/** A small overlay form for adding or editing one teacher column. */

export type ColumnFormOptions = {
  kind: Column['kind'];
  column?: Column;
  outcomes: OutcomeLabel[];
  today: string;
  onSave: (column: Column) => Promise<void> | void;
  onDelete?: () => void;
  random?: () => number;
};

const KIND_TITLE = { assessment: 'Assessment task', handin: 'Hand-in', check: 'Check' } as const;

function input(name: string, value: string, type = 'text'): HTMLInputElement {
  const i = el('input', 'mb-form__input');
  i.name = name;
  i.type = type;
  i.value = value;
  return i;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label', 'mb-form__field');
  l.append(el('span', 'mb-form__label', text), control);
  return l;
}

export function openColumnForm(o: ColumnFormOptions): HTMLElement {
  const random = o.random ?? Math.random;
  const existing = o.column;
  const overlay = el('div', 'mb-overlay');
  const form = el('form', 'mb-form');
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');
  form.setAttribute('aria-label', `${existing ? 'Edit' : 'Add'} ${KIND_TITLE[o.kind].toLowerCase()}`);
  form.noValidate = true;
  const close = () => overlay.remove();

  const title = input('title', existing?.title ?? '');
  const date = input('date', existing ? (existing.kind === 'handin' ? existing.due : existing.date) : o.today, 'date');
  form.append(el('h3', 'mb-form__title', `${existing ? 'Edit' : 'Add'} ${KIND_TITLE[o.kind].toLowerCase()}`), labelled('Title', title), labelled(o.kind === 'handin' ? 'Due' : 'Date', date));

  const weight = input('weight', existing?.kind === 'assessment' ? String(existing.weight) : '0', 'number');
  const scale = el('select', 'mb-form__input');
  scale.name = 'scale';
  for (const [value, text] of [['tick', 'Tick or cross'], ['four', '1 to 4']] as const) {
    const opt = el('option', undefined, text);
    opt.value = value;
    scale.append(opt);
  }
  scale.value = existing?.kind === 'check' ? existing.scale : 'tick';

  const criteriaHost = el('div', 'mb-form__criteria');
  const blankCriterion = (): Criterion => ({ id: newMarkbookId(random), label: '', max: 10, outcomes: [] });
  let criteria: Criterion[] = existing?.kind === 'assessment' ? existing.criteria.map((c) => ({ ...c })) : [blankCriterion()];
  const drafts = new Map<string, { label: HTMLInputElement; max: HTMLInputElement; outcomes: HTMLInputElement; bands: HTMLInputElement }>();

  function paintCriteria(): void {
    criteriaHost.replaceChildren();
    drafts.clear();
    for (const c of criteria) {
      const row = el('fieldset', 'mb-form__criterion');
      row.append(el('legend', 'mb-form__label', 'Criterion'));
      const fields = {
        label: input('criterion-label', c.label),
        max: input('criterion-max', String(c.max), 'number'),
        outcomes: input('criterion-outcomes', formatOutcomeCodes(c.outcomes, o.outcomes)),
        bands: input('criterion-bands', formatBands(c.bands))
      };
      fields.outcomes.placeholder = 'EN12-1, EN12-3';
      fields.bands.placeholder = 'A 13, B 10, C 7, D 4, E 0';
      drafts.set(c.id, fields);
      const remove = el('button', 'mb-form__remove-criterion', 'Remove');
      remove.type = 'button';
      remove.disabled = criteria.length === 1;
      remove.addEventListener('click', () => {
        criteria = criteria.filter((x) => x.id !== c.id);
        paintCriteria();
      });
      row.append(labelled('Name', fields.label), labelled('Marks', fields.max), labelled('Outcome codes', fields.outcomes), labelled('Bands (optional)', fields.bands), remove);
      criteriaHost.append(row);
    }
  }

  if (o.kind === 'assessment') {
    const add = el('button', 'btn btn--secondary mb-form__add-criterion', 'Add criterion');
    add.type = 'button';
    add.addEventListener('click', () => {
      criteria = [...readCriteriaLoose(), blankCriterion()];
      paintCriteria();
    });
    paintCriteria();
    form.append(labelled('Weight (% of the course mark)', weight), criteriaHost, add);
  }
  if (o.kind === 'check') form.append(labelled('Scale', scale));

  /** Keep typed text when the criteria list is redrawn. */
  function readCriteriaLoose(): Criterion[] {
    return criteria.map((c) => {
      const f = drafts.get(c.id);
      if (!f) return c;
      const bands = parseBands(f.bands.value);
      return { ...c, label: f.label.value, max: Number(f.max.value) || 0, outcomes: parseOutcomeCodes(f.outcomes.value, o.outcomes).ids, bands: 'bands' in bands ? bands.bands : c.bands };
    });
  }

  const error = el('p', 'mb-form__error');
  error.setAttribute('role', 'alert');

  function build(): Column | string {
    const id = existing?.id ?? newMarkbookId(random);
    if (o.kind === 'handin') return { id, kind: 'handin', title: title.value, due: date.value };
    if (o.kind === 'check') return { id, kind: 'check', title: title.value, date: date.value, scale: scale.value === 'four' ? 'four' : 'tick' };
    const built: Criterion[] = [];
    for (const c of criteria) {
      const f = drafts.get(c.id)!;
      const codes = parseOutcomeCodes(f.outcomes.value, o.outcomes);
      if (codes.unknown.length) return `${codes.unknown.join(', ')} isn’t an outcome code.`;
      const bands = parseBands(f.bands.value);
      if ('problem' in bands) return bands.problem;
      built.push({ id: c.id, label: f.label.value, max: Number(f.max.value), outcomes: codes.ids, ...(bands.bands.length ? { bands: bands.bands } : {}) });
    }
    return { id, kind: 'assessment', title: title.value, date: date.value, weight: Number(weight.value), criteria: built };
  }

  const actions = el('div', 'mb-form__actions');
  const save = el('button', 'btn btn--primary mb-form__save', 'Save');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const draft = build();
    if (typeof draft === 'string') {
      error.textContent = draft;
      return;
    }
    const checked = checkColumn(draft);
    if ('problem' in checked) {
      error.textContent = checked.problem;
      return;
    }
    error.textContent = '';
    save.disabled = true;
    try {
      await o.onSave(checked.column);
      close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Couldn’t save that.';
      save.disabled = false;
    }
  });
  const cancel = el('button', 'btn btn--secondary', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', close);
  actions.append(save, cancel);
  if (existing && o.onDelete) {
    const del = el('button', 'btn btn--secondary mb-form__delete', 'Delete column');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (typeof window.confirm === 'function' && !window.confirm(`Delete ${existing.title} and every mark in it?`)) return;
      o.onDelete?.();
      close();
    });
    actions.append(del);
  }
  form.append(error, actions);
  // Enter in a field must never navigate away; Save does the work.
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  overlay.append(form);
  document.body.append(overlay);
  title.focus();
  return overlay;
}
