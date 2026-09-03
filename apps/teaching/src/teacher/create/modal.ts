import { ApiClientError } from '@/api/client';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  postClass,
  postLesson,
  postScopeSequence,
  postSubject,
  postUnit
} from '@/teacher/create/api';
import type { CreateKind, CreatedRecord, EntityCreatedHandler } from '@/teacher/create/types';
import {
  DEFAULT_PEDAGOGICAL_MODE,
  PEDAGOGICAL_MODES,
  PEDAGOGICAL_MODE_LABELS,
  type PedagogicalMode
} from '@/curriculum/pedagogical-mode';

const KIND_TITLES: Record<CreateKind, string> = {
  class: 'New class',
  subject: 'New subject',
  unit: 'New unit',
  lesson: 'New lesson',
  scope_sequence: 'New scope & sequence'
};

function currentAcademicYear(): number {
  return new Date().getFullYear();
}

function fieldValue(root: HTMLElement, name: string): string {
  const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-create-field="${name}"]`
  );
  return el?.value.trim() ?? '';
}

function appendLabeledField(
  form: HTMLElement,
  labelText: string,
  control: HTMLElement
): void {
  const label = document.createElement('label');
  label.className = 'create-modal__field';
  const span = document.createElement('span');
  span.className = 'create-modal__label';
  span.textContent = labelText;
  label.append(span, control);
  form.append(label);
}

function textInput(name: string, opts: { required?: boolean; value?: string } = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'create-modal__input';
  input.dataset.createField = name;
  if (opts.required !== false) input.required = true;
  if (opts.value !== undefined) input.value = opts.value;
  return input;
}

function numberInput(name: string, value: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'create-modal__input';
  input.dataset.createField = name;
  input.required = true;
  input.value = String(value);
  return input;
}

function selectInput(
  name: string,
  options: ReadonlyArray<{ value: string; label: string }>
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'create-modal__select';
  select.dataset.createField = name;
  select.required = true;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select…';
  select.append(placeholder);

  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.append(option);
  }

  if (options.length === 1) {
    select.value = options[0]!.value;
  }

  return select;
}

function allSubjectOptions(
  curriculum: CurriculumResponse
): ReadonlyArray<{ value: string; label: string }> {
  return curriculum.subjects
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((subject) => ({
      value: subject.id,
      label: subject.display_title || subject.title
    }));
}

function buildFields(kind: CreateKind, curriculum: CurriculumResponse): HTMLElement {
  const form = document.createElement('div');
  form.className = 'create-modal__fields';

  const years = curriculum.years
    .slice()
    .sort((a, b) => a.year_level - b.year_level || a.title.localeCompare(b.title))
    .map((y) => ({ value: y.id, label: y.title }));

  const allSubjects = allSubjectOptions(curriculum);

  const units = curriculum.units
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((u) => ({ value: u.id, label: u.title }));

  appendLabeledField(form, 'Title', textInput('title'));

  if (kind === 'subject') {
    return form;
  }

  if (kind === 'class') {
    appendLabeledField(form, 'Code', textInput('code'));
    appendLabeledField(form, 'Academic year', numberInput('academic_year', currentAcademicYear()));
    appendLabeledField(form, 'Year', selectInput('year_id', years));
    appendLabeledField(form, 'Subject', selectInput('subject_id', allSubjects));
  } else if (kind === 'unit') {
    appendLabeledField(form, 'Year', selectInput('year_id', years));
    appendLabeledField(form, 'Subject', selectInput('subject_id', allSubjects));
  } else if (kind === 'lesson') {
    appendLabeledField(form, 'Unit', selectInput('unit_id', units));
    const modeOptions = PEDAGOGICAL_MODES.map((mode) => ({
      value: mode,
      label: PEDAGOGICAL_MODE_LABELS[mode]
    }));
    const modeSelect = selectInput('pedagogical_mode', modeOptions);
    modeSelect.value = DEFAULT_PEDAGOGICAL_MODE;
    appendLabeledField(form, 'Pedagogical mode', modeSelect);
  } else {
    appendLabeledField(form, 'Subject', selectInput('subject_id', allSubjects));
    appendLabeledField(form, 'Academic year', numberInput('academic_year', currentAcademicYear()));
  }

  return form;
}

async function submitKind(
  kind: CreateKind,
  form: HTMLElement
): Promise<{ id: string; entity: CreatedRecord }> {
  if (kind === 'subject') {
    const created = await postSubject({
      title: fieldValue(form, 'title')
    });
    return { id: created.id, entity: created };
  }

  if (kind === 'class') {
    const created = await postClass({
      title: fieldValue(form, 'title'),
      code: fieldValue(form, 'code'),
      academic_year: Number(fieldValue(form, 'academic_year')),
      year_id: fieldValue(form, 'year_id'),
      subject_id: fieldValue(form, 'subject_id')
    });
    return { id: created.id, entity: created };
  }

  if (kind === 'unit') {
    const created = await postUnit({
      title: fieldValue(form, 'title'),
      year_id: fieldValue(form, 'year_id'),
      subject_id: fieldValue(form, 'subject_id')
    });
    return { id: created.id, entity: created };
  }

  if (kind === 'lesson') {
    const modeRaw = fieldValue(form, 'pedagogical_mode') || DEFAULT_PEDAGOGICAL_MODE;
    const pedagogical_mode = modeRaw as PedagogicalMode;
    const created = await postLesson({
      title: fieldValue(form, 'title'),
      unit_id: fieldValue(form, 'unit_id'),
      pedagogical_mode
    });
    return { id: created.id, entity: created };
  }

  const created = await postScopeSequence({
    title: fieldValue(form, 'title'),
    subject_id: fieldValue(form, 'subject_id'),
    academic_year: Number(fieldValue(form, 'academic_year'))
  });
  return { id: created.id, entity: created };
}

export function openCreateModal(options: {
  kind: CreateKind;
  curriculum: CurriculumResponse;
  onCreated: EntityCreatedHandler;
}): void {
  const { kind, curriculum, onCreated } = options;
  let submitting = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'create-modal-backdrop';
  backdrop.dataset.createModal = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'create-modal glass-panel glass-tile';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'create-modal-title');

  const title = document.createElement('h2');
  title.id = 'create-modal-title';
  title.className = 'create-modal__title';
  title.textContent = KIND_TITLES[kind];

  const errorBanner = document.createElement('p');
  errorBanner.className = 'create-modal__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const fields = buildFields(kind, curriculum);

  const footer = document.createElement('div');
  footer.className = 'create-modal__footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.dataset.createAction = 'cancel';
  cancelBtn.textContent = 'Cancel';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--decisive';
  saveBtn.dataset.createAction = 'save';
  saveBtn.textContent = 'Save';

  footer.append(cancelBtn, saveBtn);
  dialog.append(title, errorBanner, fields, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);

  const close = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  cancelBtn.addEventListener('click', () => close());

  const showError = (message: string): void => {
    errorBanner.hidden = false;
    errorBanner.textContent = message;
  };

  const clearError = (): void => {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
  };

  saveBtn.addEventListener('click', async () => {
    if (submitting) return;
    clearError();

    const required = fields.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-create-field][required]'
    );
    for (const el of required) {
      if (!el.value.trim()) {
        showError('Please fill in all required fields.');
        el.focus();
        return;
      }
    }

    submitting = true;
    saveBtn.disabled = true;

    try {
      const { id, entity } = await submitKind(kind, fields);
      close();
      void onCreated(kind, id, entity);
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Create failed';
      showError(message);
      submitting = false;
      saveBtn.disabled = false;
    }
  });
}
