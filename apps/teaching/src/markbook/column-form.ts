import { el } from '@/quiz/dom';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { CriterionSchema, checkColumn, newMarkbookId, type Column, type Criterion } from './schema';
import type { OutcomeLabel } from './types';
import { formatBands, formatOutcomeCodes, parseBands, parseOutcomeCodes } from './parse';
import { openOverlay } from './overlay';

/** A small overlay form for adding or editing one teacher column. */

export type ColumnFormOptions = {
  kind: Column['kind'];
  column?: Column;
  outcomes: OutcomeLabel[];
  today: string;
  onSave: (column: Column) => Promise<void> | void;
  onDelete?: () => void;
  random?: () => number;
  /** Where focus goes on close if the control that opened the form is gone. */
  returnFocus?: () => HTMLElement | null;
};

const KIND_TITLE = { assessment: 'Assessment task', handin: 'Hand-in', check: 'Check' } as const;

/** A criterion exactly as typed. Text is parsed only when the teacher saves. */
type CriterionDraft = { id: string; label: string; max: string; outcomes: string; bands: string };
type CriterionField = Exclude<keyof CriterionDraft, 'id'>;

let formCount = 0;

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
  const form = el('form', 'mb-form');
  form.noValidate = true;
  let saving = false;

  const heading = el('h3', 'mb-form__title', `${existing ? 'Edit' : 'Add'} ${KIND_TITLE[o.kind].toLowerCase()}`);
  formCount += 1;
  heading.id = `mb-form-title-${formCount}`;

  const title = input('title', existing?.title ?? '');
  const date = input('date', existing ? (existing.kind === 'handin' ? existing.due : existing.date) : o.today, 'date');
  form.append(heading, labelled('Title', title), labelled(o.kind === 'handin' ? 'Due' : 'Date', date));

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
  const blankDraft = (): CriterionDraft => ({ id: newMarkbookId(random), label: '', max: '10', outcomes: '', bands: '' });
  const toDraft = (c: Criterion): CriterionDraft => ({
    id: c.id,
    label: c.label,
    max: String(c.max),
    outcomes: formatOutcomeCodes(c.outcomes, o.outcomes),
    bands: formatBands(c.bands)
  });
  let drafts: CriterionDraft[] = existing?.kind === 'assessment' ? existing.criteria.map(toDraft) : [blankDraft()];

  function paintCriteria(): void {
    criteriaHost.replaceChildren();
    for (const d of drafts) {
      const row = el('fieldset', 'mb-form__criterion');
      row.append(el('legend', 'mb-form__label', 'Criterion'));
      const fields: Record<CriterionField, HTMLInputElement> = {
        label: input('criterion-label', d.label),
        max: input('criterion-max', d.max, 'number'),
        outcomes: input('criterion-outcomes', d.outcomes),
        bands: input('criterion-bands', d.bands)
      };
      fields.outcomes.placeholder = 'EN12-1, EN12-3';
      fields.bands.placeholder = 'A 13, B 10, C 7, D 4, E 0';
      for (const key of Object.keys(fields) as CriterionField[]) {
        fields[key].addEventListener('input', () => {
          d[key] = fields[key].value;
        });
      }
      const remove = el('button', 'mb-form__remove-criterion', 'Remove');
      remove.type = 'button';
      remove.disabled = drafts.length === 1;
      remove.addEventListener('click', () => {
        drafts = drafts.filter((x) => x !== d);
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
      drafts = [...drafts, blankDraft()];
      paintCriteria();
    });
    paintCriteria();
    form.append(labelled('Weight (% of the course mark)', weight), criteriaHost, add);
  }
  if (o.kind === 'check') form.append(labelled('Scale', scale));

  const error = el('p', 'mb-form__error');
  error.setAttribute('role', 'alert');

  function buildCriterion(d: CriterionDraft, index: number): Criterion | string {
    const where = `In ${d.label.trim() || `criterion ${index + 1}`}: `;
    const codes = parseOutcomeCodes(d.outcomes, o.outcomes);
    if (codes.unknown.length) return `${where}${codes.unknown.join(', ')} isn’t an outcome code.`;
    const bands = parseBands(d.bands);
    if ('problem' in bands) return where + bands.problem;
    const max = d.max.trim() === '' ? Number.NaN : Number(d.max);
    if (Number.isNaN(max)) return `${where}Give the marks it is worth.`;
    const built = { id: d.id, label: d.label, max, outcomes: codes.ids, ...(bands.bands.length ? { bands: bands.bands } : {}) };
    const checked = CriterionSchema.safeParse(built);
    if (!checked.success) return where + (checked.error.issues[0]?.message ?? 'Check this criterion.');
    return built;
  }

  function build(): Column | string {
    const id = existing?.id ?? newMarkbookId(random);
    if (o.kind === 'handin') return { id, kind: 'handin', title: title.value, due: date.value };
    if (o.kind === 'check') return { id, kind: 'check', title: title.value, date: date.value, scale: scale.value === 'four' ? 'four' : 'tick' };
    const w = weight.value.trim() === '' ? Number.NaN : Number(weight.value);
    if (Number.isNaN(w)) return 'Give a weight from 0 to 100.';
    const built: Criterion[] = [];
    for (const [i, d] of drafts.entries()) {
      const c = buildCriterion(d, i);
      if (typeof c === 'string') return c;
      built.push(c);
    }
    return { id, kind: 'assessment', title: title.value, date: date.value, weight: w, criteria: built };
  }

  const actions = el('div', 'mb-form__actions');
  const save = el('button', 'btn btn--primary mb-form__save', 'Save');
  save.type = 'button';
  const cancel = el('button', 'btn btn--secondary', 'Cancel');
  cancel.type = 'button';
  actions.append(save, cancel);
  form.append(error, actions);
  // Enter in a field must never navigate away; Save does the work.
  form.addEventListener('submit', (event) => event.preventDefault());

  const { overlay, close } = openOverlay(form, { labelledBy: heading.id, returnFocus: o.returnFocus, canClose: () => !saving });

  save.addEventListener('click', async () => {
    if (saving) return;
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
    saving = true;
    save.disabled = true;
    try {
      await o.onSave(checked.column);
      saving = false;
      close();
    } catch (e) {
      saving = false;
      error.textContent = e instanceof Error ? e.message : 'Couldn’t save that.';
      save.disabled = false;
    }
  });
  cancel.addEventListener('click', () => {
    if (!saving) close();
  });
  if (existing && o.onDelete) {
    const del = el('button', 'btn btn--secondary mb-form__delete', 'Delete column');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (saving) return;
      const sure = await askConfirmCard({ title: `Delete ${existing.title} and every mark in it?`, confirmLabel: 'Delete column' });
      if (!sure || !overlay.isConnected) return;
      close();
      o.onDelete?.();
    });
    actions.append(del);
  }

  title.focus();
  return overlay;
}
