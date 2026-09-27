import { updatePerson } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import type { EntityRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function parseAliases(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Stay-in-place identity editor (name / sort name / aliases). Shared by
 * the legacy person page and the People redesign pane. */
export function mountIdentityEditor(
  person: Extract<EntityRecord, { kind: 'person' }>,
  onSaved: () => void
): {
  button: HTMLButtonElement;
  form: HTMLFormElement;
} {
  const button = el('button', 'btn btn--secondary', 'Edit') as HTMLButtonElement;
  button.type = 'button';
  button.setAttribute('aria-label', `Edit ${person.display_name}`);

  const form = document.createElement('form');
  form.className = 'add-person-form entity-detail__edit-form';
  form.setAttribute('aria-label', 'Edit person');
  form.hidden = true;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.value = person.display_name;
  nameInput.setAttribute('aria-label', 'Name');

  const sortInput = document.createElement('input');
  sortInput.type = 'text';
  sortInput.value = person.sort_name ?? '';
  sortInput.setAttribute('aria-label', 'Sort name');

  const aliasesInput = document.createElement('input');
  aliasesInput.type = 'text';
  aliasesInput.value = person.aliases.join(', ');
  aliasesInput.setAttribute('aria-label', 'Aliases');

  const status = el('p', 'add-person-form__status');
  status.hidden = true;

  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  const actions = el('div', 'add-person-form__actions');
  actions.append(save, cancel);

  form.append(
    el('label', 'add-person-form__label', 'Name'),
    nameInput,
    el('label', 'add-person-form__label', 'Sort name'),
    sortInput,
    el('label', 'add-person-form__label', 'Aliases'),
    aliasesInput,
    status,
    actions
  );

  function open(): void {
    form.hidden = false;
    nameInput.focus();
  }

  function close(): void {
    form.hidden = true;
    status.hidden = true;
    nameInput.value = person.display_name;
    sortInput.value = person.sort_name ?? '';
    aliasesInput.value = person.aliases.join(', ');
  }

  button.addEventListener('click', () => {
    if (form.hidden) open();
    else close();
  });
  cancel.addEventListener('click', close);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const displayName = nameInput.value.trim();
    if (!displayName) {
      status.hidden = false;
      status.textContent = 'Name is required.';
      return;
    }
    status.hidden = true;
    save.disabled = true;
    void updatePerson(person.ref, {
      display_name: displayName,
      sort_name: sortInput.value.trim() || null,
      aliases: parseAliases(aliasesInput.value)
    })
      .then(() => onSaved())
      .catch((err: unknown) => {
        save.disabled = false;
        status.hidden = false;
        status.textContent = err instanceof ApiClientError ? err.message : 'Could not update person.';
      });
  });

  return { button, form };
}
