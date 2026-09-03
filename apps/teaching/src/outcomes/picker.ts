import { filterOutcomeCatalog, groupOutcomeCatalog } from '@/curriculum/outcome-catalog';
import type { CurriculumOutcome } from '@/schemas/outcome';
import { uniqueOutcomeIds } from '@/curriculum/outcome-ids';
import { createCustomOutcome } from '@/outcomes/api';

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
  const description = document.createElement('textarea');
  description.className = 'outcome-picker__textarea';
  description.placeholder = 'Full wording';
  description.setAttribute('aria-label', 'Description');
  const addCustom = document.createElement('button');
  addCustom.type = 'button';
  addCustom.className = 'btn btn--secondary';
  addCustom.textContent = 'Add to library';
  custom.append(code.wrap, customTitle.wrap, description, addCustom);

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
  actions.append(cancel, apply);

  dialog.append(title, search, list, custom, actions);
  document.body.append(dialog);

  function paint(): void {
    list.replaceChildren();
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
        copy.append(codeEl, document.createTextNode(` ${outcome.title}`));
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
    const descriptionValue = description.value.trim();
    if (!codeValue || !titleValue || !descriptionValue) return;
    addCustom.disabled = true;
    void createCustomOutcome({
      subject_id: options.subjectId,
      code: codeValue,
      title: titleValue,
      description: descriptionValue
    })
      .then((created) => {
        catalog = [...catalog, created];
        selected.add(created.id);
        options.onCreated?.(created);
        code.input.value = '';
        customTitle.input.value = '';
        description.value = '';
        custom.open = false;
        paint();
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
