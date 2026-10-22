import { filterOutcomeCatalog, groupOutcomeCatalog } from '@/curriculum/outcome-catalog';
import type { CurriculumOutcome } from '@/schemas/outcome';
import { uniqueOutcomeIds } from '@/curriculum/outcome-ids';
import { ApiClientError } from '@/api/client';
import { createCustomOutcome } from '@/outcomes/api';
import { showOutcomesInLibrary } from '@/teacher/sections/resources';

export interface OutcomePickerOptions {
  catalog: CurriculumOutcome[];
  selectedIds: string[];
  subjectId: string;
  onApply: (ids: string[]) => void | Promise<void>;
  onCreated?: (outcome: CurriculumOutcome) => void;
}

export function openOutcomePicker(options: OutcomePickerOptions): void {
  const existing = document.querySelector('dialog.outcome-picker');
  existing?.remove();

  let selected = new Set(options.selectedIds);
  let catalog = [...options.catalog];

  const dialog = document.createElement('dialog');
  dialog.className = 'outcome-picker';
  dialog.setAttribute('aria-labelledby', 'outcome-picker-title');

  const title = document.createElement('h2');
  title.id = 'outcome-picker-title';
  title.className = 'outcome-picker__title';
  title.textContent = 'Outcomes';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'outcome-picker__search';
  search.placeholder = 'Search codes or wording…';
  search.setAttribute('aria-label', 'Search outcomes');

  const list = document.createElement('div');
  list.className = 'outcome-picker__list';

  const custom = document.createElement('details');
  custom.className = 'outcome-picker__custom';
  const summary = document.createElement('summary');
  summary.textContent = 'Add custom…';
  custom.append(summary);

  const code = fieldInput('Code', 'AOTFW-CR');
  const customTitle = fieldInput('Title', 'Short label');
  const customGroup = fieldInput('Group', 'Custom');
  const groupList = document.createElement('datalist');
  groupList.id = 'outcome-picker-groups';
  customGroup.input.setAttribute('list', groupList.id);
  const description = document.createElement('textarea');
  description.className = 'outcome-picker__textarea';
  description.placeholder = 'Full wording';
  description.setAttribute('aria-label', 'Description');
  const addCustom = document.createElement('button');
  addCustom.type = 'button';
  addCustom.className = 'btn btn--secondary';
  addCustom.textContent = 'Add to library';
  const customError = document.createElement('p');
  customError.className = 'outcome-picker__error';
  customError.setAttribute('role', 'alert');
  customError.hidden = true;
  custom.append(code.wrap, customTitle.wrap, customGroup.wrap, groupList, description, customError, addCustom);

  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'btn btn--ghost outcome-picker__manage';
  manage.textContent = 'Manage outcomes';
  manage.addEventListener('click', () => {
    dialog.close();
    showOutcomesInLibrary();
  });

  const actions = document.createElement('div');
  actions.className = 'outcome-picker__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'btn btn--primary';
  apply.textContent = 'Apply';
  actions.append(manage, cancel, apply);

  dialog.append(title, search, list, custom, actions);
  document.body.append(dialog);

  function paint(): void {
    list.replaceChildren();
    groupList.replaceChildren(
      ...[...new Set(catalog.map((outcome) => outcome.group))].map((name) => {
        const option = document.createElement('option');
        option.value = name;
        return option;
      })
    );
    const filtered = filterOutcomeCatalog(catalog, search.value);
    const groups = groupOutcomeCatalog(filtered);
    if (groups.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'outcome-picker__empty';
      empty.textContent = 'No matching outcomes.';
      list.append(empty);
      return;
    }
    for (const group of groups) {
      const heading = document.createElement('p');
      heading.className = 'outcome-picker__group';
      heading.textContent = group.group;
      list.append(heading);
      for (const outcome of group.outcomes) {
        const label = document.createElement('label');
        label.className = 'outcome-picker__row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = selected.has(outcome.id);
        box.addEventListener('change', () => {
          if (box.checked) selected.add(outcome.id);
          else selected.delete(outcome.id);
        });
        const codeEl = document.createElement('strong');
        codeEl.textContent = outcome.code;
        const copy = document.createElement('span');
        copy.className = 'outcome-picker__copy';
        const wording = document.createElement('span');
        wording.className = 'outcome-picker__wording';
        wording.textContent = outcome.description;
        copy.append(codeEl, document.createTextNode(` ${outcome.title}`), wording);
        label.append(box, copy);
        list.append(label);
      }
    }
  }

  search.addEventListener('input', paint);
  paint();

  addCustom.addEventListener('click', () => {
    const codeValue = code.input.value.trim();
    const titleValue = customTitle.input.value.trim();
    const groupValue = customGroup.input.value.trim();
    const descriptionValue = description.value.trim();
    customError.hidden = true;
    if (!codeValue || !titleValue || !descriptionValue) {
      customError.hidden = false;
      customError.textContent = 'Code, title and full wording are all needed.';
      return;
    }
    addCustom.disabled = true;
    void createCustomOutcome({
      subject_id: options.subjectId,
      code: codeValue,
      title: titleValue,
      description: descriptionValue,
      ...(groupValue ? { group: groupValue } : {})
    })
      .then((created) => {
        catalog = [...catalog, created];
        selected.add(created.id);
        options.onCreated?.(created);
        code.input.value = '';
        customTitle.input.value = '';
        customGroup.input.value = '';
        description.value = '';
        custom.open = false;
        paint();
      })
      .catch((error: unknown) => {
        customError.hidden = false;
        customError.textContent =
          error instanceof ApiClientError && error.code === 'conflict'
            ? `${codeValue} is already in this subject's outcomes.`
            : error instanceof Error
              ? error.message
              : 'Could not add the outcome.';
      })
      .finally(() => {
        addCustom.disabled = false;
      });
  });

  cancel.addEventListener('click', () => dialog.close());
  apply.addEventListener('click', () => {
    void Promise.resolve(options.onApply(uniqueOutcomeIds([...selected]))).then(() => {
      dialog.close();
    });
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  search.focus();
}

function fieldInput(label: string, placeholder: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement('label');
  wrap.className = 'outcome-picker__field';
  wrap.append(label);
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  wrap.append(input);
  return { wrap, input };
}
