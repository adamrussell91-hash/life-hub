import { ApiClientError } from '@/api/client';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Lesson, LessonTemplateSummary, Unit } from '@/schemas';
import { listLessonTemplates, useLessonTemplate } from '@/teacher/template-api';

function labeledSelect(
  name: string,
  labelText: string,
  options: ReadonlyArray<{ value: string; label: string }>
): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'create-modal__field';
  const span = document.createElement('span');
  span.className = 'create-modal__label';
  span.textContent = labelText;

  const select = document.createElement('select');
  select.className = 'create-modal__select';
  select.dataset.fromTemplateField = name;
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

  field.append(span, select);
  return field;
}

function openFromTemplateDialog(options: {
  body: HTMLElement;
  confirm?: { label: string; onConfirm: () => Promise<Lesson> };
}): Promise<Lesson | null> {
  return new Promise((resolve) => {
    let settled = false;

    const backdrop = document.createElement('div');
    backdrop.className = 'create-modal-backdrop';
    backdrop.dataset.fromTemplateModal = 'backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'create-modal glass-panel glass-tile';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'from-template-title');

    const heading = document.createElement('h2');
    heading.id = 'from-template-title';
    heading.className = 'create-modal__title';
    heading.textContent = 'From template';

    const errorBanner = document.createElement('p');
    errorBanner.className = 'create-modal__error';
    errorBanner.hidden = true;
    errorBanner.setAttribute('role', 'alert');

    const footer = document.createElement('div');
    footer.className = 'create-modal__footer';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'btn btn--ghost';
    dismissBtn.dataset.fromTemplateAction = options.confirm ? 'cancel' : 'close';
    dismissBtn.textContent = options.confirm ? 'Cancel' : 'Close';

    footer.append(dismissBtn);

    let saveBtn: HTMLButtonElement | null = null;
    if (options.confirm) {
      saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn--decisive';
      saveBtn.dataset.fromTemplateAction = 'create';
      saveBtn.textContent = options.confirm.label;
      footer.append(saveBtn);
    }

    dialog.append(heading, errorBanner, options.body, footer);
    backdrop.append(dialog);
    document.body.append(backdrop);

    const finish = (lesson: Lesson | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      resolve(lesson);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(null);
    });
    dismissBtn.addEventListener('click', () => finish(null));

    saveBtn?.addEventListener('click', () => {
      void (async () => {
        if (!options.confirm || !saveBtn) return;
        saveBtn.disabled = true;
        errorBanner.hidden = true;
        errorBanner.textContent = '';
        try {
          const created = await options.confirm.onConfirm();
          finish(created);
        } catch (error) {
          const message =
            error instanceof ApiClientError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Unable to create from template.';
          errorBanner.hidden = false;
          errorBanner.textContent = message;
          saveBtn.disabled = false;
        }
      })();
    });
  });
}

function openFromTemplateMessage(message: string): Promise<Lesson | null> {
  const body = document.createElement('p');
  body.className = 'create-modal__message';
  body.textContent = message;
  return openFromTemplateDialog({ body });
}

function openFromTemplatePicker(
  templates: LessonTemplateSummary[],
  units: Unit[]
): Promise<Lesson | null> {
  const fields = document.createElement('div');
  fields.className = 'create-modal__fields';
  fields.append(
    labeledSelect(
      'template_id',
      'Template',
      templates.map((row) => ({ value: row.id, label: row.title }))
    ),
    labeledSelect(
      'unit_id',
      'Unit',
      units.map((row) => ({ value: row.id, label: row.title }))
    )
  );

  return openFromTemplateDialog({
    body: fields,
    confirm: {
      label: 'Create',
      onConfirm: async () => {
        const templateId =
          fields.querySelector<HTMLSelectElement>('[data-from-template-field="template_id"]')
            ?.value ?? '';
        const unitId =
          fields.querySelector<HTMLSelectElement>('[data-from-template-field="unit_id"]')?.value ??
          '';
        if (!templateId || !unitId) {
          throw new Error('Please fill in all required fields.');
        }
        return useLessonTemplate({ templateId, unitId });
      }
    }
  });
}

export async function promptLessonFromTemplate(
  curriculum: CurriculumResponse
): Promise<Lesson | null> {
  const units = curriculum.units.filter((unit) => unit.status === 'active');
  if (units.length === 0) {
    return openFromTemplateMessage('Create a unit before using a lesson template.');
  }

  try {
    const { templates } = await listLessonTemplates();
    if (templates.length === 0) {
      return openFromTemplateMessage(
        'No lesson templates yet. Save one from a lesson editor.'
      );
    }
    return openFromTemplatePicker(templates, units);
  } catch {
    return openFromTemplateMessage('Unable to create from template.');
  }
}
