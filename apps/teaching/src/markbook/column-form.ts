import type { SkillsContinuum } from '@/skills/schema';
import { skillSelect } from '@/skills/select';
import { el } from '@/quiz/dom';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { CriterionSchema, checkColumn, newMarkbookId, type Column, type Criterion } from './schema';
import type { OutcomeLabel } from './types';
import { formatBands, formatOutcomeCodes, outcomeCodeExample, parseBands, parseOutcomeCodes } from './parse';
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
  /** The skills continuum, for linking a criterion to a skill. Null while it loads or if it can't. */
  skills?: SkillsContinuum | null;
  /** The class's unit lessons, for linking a task to the lesson block students hand in through. */
  lessons?: { id: string; title: string }[];
  /** The handed-in-able blocks of one lesson. Without it the link fields stay hidden. */
  loadBlocks?: (lessonId: string) => Promise<{ id: string; label: string }[]>;
  /** Concept keys and names from the syllabus alignment, for tagging a criterion. */
  concepts?: { key: string; name: string }[];
};

const STEP_KEYS = ['starting', 'building', 'secure', 'extending'] as const;
const STEP_LABEL = { starting: 'Starting', building: 'Building', secure: 'Secure', extending: 'Extending' } as const;
const KIND_TITLE = { assessment: 'Assessment task', handin: 'Hand-in', check: 'Check' } as const;

/** A criterion exactly as typed. Text is parsed only when the teacher saves. */
type CriterionDraft = { id: string; label: string; max: string; outcomes: string; concepts: string; bands: string; skill: string; looks: Record<(typeof STEP_KEYS)[number], string> };
type CriterionField = 'label' | 'max' | 'outcomes' | 'concepts' | 'bands';

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
  const blankDraft = (): CriterionDraft => ({ id: newMarkbookId(random), label: '', max: '10', outcomes: '', concepts: '', bands: '', skill: '', looks: { starting: '', building: '', secure: '', extending: '' } });
  const toDraft = (c: Criterion): CriterionDraft => ({
    id: c.id,
    label: c.label,
    max: String(c.max),
    outcomes: formatOutcomeCodes(c.outcomes, o.outcomes),
    concepts: (c.concepts ?? []).join(', '),
    bands: formatBands(c.bands),
    skill: c.skill ?? '',
    looks: { starting: c.steps?.starting ?? '', building: c.steps?.building ?? '', secure: c.steps?.secure ?? '', extending: c.steps?.extending ?? '' }
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
        concepts: input('criterion-concepts', d.concepts),
        bands: input('criterion-bands', d.bands)
      };
      fields.outcomes.placeholder = outcomeCodeExample(o.outcomes);
      fields.concepts.placeholder = (o.concepts ?? []).slice(0, 3).map((c) => c.key).join(', ') || 'Concept keys';
      fields.bands.placeholder = 'A 13, B 10, C 7, D 4, E 0';
      for (const key of Object.keys(fields) as CriterionField[]) {
        fields[key].addEventListener('input', () => {
          d[key] = fields[key].value;
        });
      }
      const skill = skillSelect(d.skill, o.skills ?? null, 'mb-form__input mb-form__skill');
      skill.name = 'criterion-skill';
      skill.addEventListener('change', () => {
        d.skill = skill.value;
      });
      const remove = el('button', 'mb-form__remove-criterion', 'Remove');
      remove.type = 'button';
      remove.disabled = drafts.length === 1;
      remove.addEventListener('click', () => {
        drafts = drafts.filter((x) => x !== d);
        paintCriteria();
      });
      row.append(labelled('Name', fields.label), labelled('Marks', fields.max), labelled('Outcome codes', fields.outcomes), labelled('Concepts (optional)', fields.concepts), labelled('Bands (optional)', fields.bands), labelled('Skill (optional)', skill));
      // One line per step, shown to students as what that step looks like on this criterion.
      for (const key of STEP_KEYS) {
        const line = input(`criterion-looks-${key}`, d.looks[key]);
        line.maxLength = 200;
        line.addEventListener('input', () => {
          d.looks[key] = line.value;
        });
        row.append(labelled(`${STEP_LABEL[key]} looks like`, line));
      }
      row.append(remove);
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
    if (o.lessons?.length && o.loadBlocks) form.append(pieceFields(o.lessons, o.loadBlocks));
  }
  if (o.kind === 'check') form.append(labelled('Scale', scale));

  const error = el('p', 'mb-form__error');
  error.setAttribute('role', 'alert');

  /** Marked through a lesson: which lesson block students hand in through, and a short name for charts. */
  let piece = existing?.kind === 'assessment' ? existing.piece : undefined;
  function pieceFields(lessons: { id: string; title: string }[], loadBlocks: (lessonId: string) => Promise<{ id: string; label: string }[]>): HTMLElement {
    const box = el('fieldset', 'mb-form__piece');
    box.append(el('legend', 'mb-form__label', 'Marked through a lesson'));
    const lesson = el('select', 'mb-form__input');
    lesson.name = 'piece-lesson';
    const none = el('option', undefined, 'Not linked');
    none.value = '';
    lesson.append(none, ...lessons.map((l) => Object.assign(el('option', undefined, l.title), { value: l.id })));
    const block = el('select', 'mb-form__input');
    block.name = 'piece-block';
    const short = input('piece-short', piece?.short ?? '');
    short.maxLength = 40;
    short.placeholder = 'Short name for charts';
    const fill = async (lessonId: string, keep?: string): Promise<void> => {
      block.replaceChildren();
      block.disabled = !lessonId;
      if (!lessonId) {
        piece = undefined;
        return;
      }
      try {
        const blocks = await loadBlocks(lessonId);
        block.replaceChildren(...blocks.map((b) => Object.assign(el('option', undefined, b.label), { value: b.id })));
        if (keep && blocks.some((b) => b.id === keep)) block.value = keep;
      } catch {
        block.replaceChildren(Object.assign(el('option', undefined, 'Couldn’t load the blocks'), { value: '' }));
      }
      piece = block.value ? { lesson_id: lessonId, block_id: block.value, ...(short.value.trim() ? { short: short.value.trim() } : {}) } : undefined;
    };
    const sync = (): void => {
      piece = lesson.value && block.value ? { lesson_id: lesson.value, block_id: block.value, ...(short.value.trim() ? { short: short.value.trim() } : {}) } : undefined;
    };
    lesson.value = piece?.lesson_id ?? '';
    void fill(lesson.value, piece?.block_id);
    lesson.addEventListener('change', () => void fill(lesson.value));
    block.addEventListener('change', sync);
    short.addEventListener('input', sync);
    box.append(labelled('Lesson', lesson), labelled('Block', block), labelled('Short name', short));
    return box;
  }

  function buildCriterion(d: CriterionDraft, index: number): Criterion | string {
    const where = `In ${d.label.trim() || `criterion ${index + 1}`}: `;
    const codes = parseOutcomeCodes(d.outcomes, o.outcomes);
    if (codes.unknown.length) return `${where}${codes.unknown.join(', ')} isn’t an outcome code.`;
    const bands = parseBands(d.bands);
    if ('problem' in bands) return where + bands.problem;
    const max = d.max.trim() === '' ? Number.NaN : Number(d.max);
    if (Number.isNaN(max)) return `${where}Give the marks it is worth.`;
    const conceptKeys = d.concepts.split(/[,\s]+/).map((k) => k.trim()).filter(Boolean);
    const known = new Set((o.concepts ?? []).map((c) => c.key));
    const stray = known.size ? conceptKeys.filter((k) => !known.has(k)) : [];
    if (stray.length) return `${where}${stray.join(', ')} isn’t a concept key.`;
    const steps = Object.fromEntries(STEP_KEYS.filter((k) => d.looks[k].trim()).map((k) => [k, d.looks[k].trim()]));
    const built = { id: d.id, label: d.label, max, outcomes: codes.ids, concepts: conceptKeys, ...(Object.keys(steps).length ? { steps } : {}), ...(bands.bands.length ? { bands: bands.bands } : {}), ...(d.skill ? { skill: d.skill } : {}) };
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
    return { id, kind: 'assessment', title: title.value, date: date.value, weight: w, criteria: built, ...(piece ? { piece } : {}) };
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
      if (!overlay.isConnected) return;
      if (!sure) {
        del.focus();
        return;
      }
      close();
      o.onDelete?.();
    });
    actions.append(del);
  }

  title.focus();
  return overlay;
}
