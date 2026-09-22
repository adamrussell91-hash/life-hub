import { renderEntityDetail, renderPersonSummaryCard } from '@/components/entity-detail';
import { buildPersonTabs } from '@/components/person-tabs';
import { personBriefRoute } from '@/app/router';
import { personRef } from '@/domain/ids';
import { updatePerson } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import type { EntityOverview, EntityRecord } from '@/domain/types';

export interface PersonDetailHeader {
  title: string;
  actions: HTMLElement;
}

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

function mountIdentityEditor(person: Extract<EntityRecord, { kind: 'person' }>, onSaved: () => void): {
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

export async function renderPersonPage(
  canvas: HTMLElement,
  personId: string,
  options: {
    onTitleReady?: (title: string) => void;
    onHeaderReady?: (header: PersonDetailHeader) => void;
    isCurrent?: () => boolean;
  } = {}
): Promise<void> {
  // A role edit needs a full overview refetch, exactly like today's flat
  // page — re-invoking `renderPersonPage` itself achieves that without
  // `entity-detail.ts` needing to expose any reload hook beyond the
  // `TabDef` contract's `{ isCurrent }`.
  const reload = (): void => {
    void renderPersonPage(canvas, personId, options);
  };

  await renderEntityDetail(canvas, {
    ref: personRef(personId),
    backHref: '#/people',
    backLabel: 'Back to People',
    onTitleReady: options.onTitleReady,
    isCurrent: options.isCurrent,
    tabs: buildPersonTabs(reload),
    renderExtraFields: (overview: EntityOverview, host: HTMLElement) => {
      const person = overview.entity;
      if (person.kind !== 'person') return;
      if (person.sort_name) {
        const sortName = document.createElement('p');
        sortName.className = 'entity-detail__sort-name';
        sortName.textContent = person.sort_name;
        host.append(sortName);
      }
      if (person.is_self) {
        const self = document.createElement('p');
        self.className = 'entity-detail__self-indicator';
        self.textContent = 'Self';
        host.append(self);
      }
      const shared = overview.shared_contexts_with_self ?? [];
      if (!person.is_self && shared.length) {
        const connection = document.createElement('p');
        connection.className = 'entity-detail__shared-context';
        const names = shared.map((item) => item.display_label);
        connection.textContent =
          names.length === 1
            ? `You know them through ${names[0]}.`
            : `You know them through ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
        host.append(connection);
      }
      // Brief section 19 / BUILD-PLAN.md Feature 1.3's "Open Person Brief"
      // quick action — links to the Phase 3 Person Brief reading sheet
      // (`#/person/<id>/brief`, `views/person-brief.ts`).
      const brief = document.createElement('a');
      brief.className = 'btn btn--secondary entity-detail__brief-link';
      brief.href = personBriefRoute(person.id);
      brief.textContent = 'Open Person Brief';

      const editor = mountIdentityEditor(person, reload);
      const actions = el('div', 'entity-detail__profile-actions');
      actions.append(brief, editor.button);
      if (options.onHeaderReady) {
        options.onHeaderReady({ title: person.display_name, actions });
      } else {
        host.append(actions);
      }
      host.append(editor.form);
      renderPersonSummaryCard(host, overview, brief.href, reload);
    }
  });
}
