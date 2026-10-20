/**
 * Roles and education on a person's profile. Each row is a link to an
 * Organisation with a role (or qualification) and a date range, and has
 * Edit, End and Remove. "Add role" and "Add education" open an inline row.
 */

import { addPersonRole, editPersonRole, endPersonRole, removePersonRole } from '@/api/people-roles';
import { buildRoleFields, type RoleFields, type RoleFieldsValue } from '@/components/role-fields';
import { formatRange, type PersonRole } from '@/domain/person-roles';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className = 'btn btn--ghost'): HTMLButtonElement {
  const b = el('button', className, text) as HTMLButtonElement;
  b.type = 'button';
  return b;
}

export interface RolesEditorOptions {
  personRef: string;
  roles: PersonRole[];
  crest: (orgRef: string, orgName: string) => HTMLElement;
  /** A write landed; reload the person. */
  onChanged: () => void;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'That didn’t save.';
}

export function renderRolesEditor(host: HTMLElement, options: RolesEditorOptions): void {
  host.replaceChildren();
  const status = el('p', 'roles-editor__status');
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const showError = (message: string) => {
    status.hidden = false;
    status.textContent = message;
  };

  const roles = options.roles.filter((r) => r.kind === 'role');
  const education = options.roles.filter((r) => r.kind === 'education');

  function rowFor(role: PersonRole): HTMLElement {
    const row = el('div', `roles-editor__row${role.current ? '' : ' is-past'}`);
    row.dataset.linkId = role.linkId;
    const main = el('div', 'roles-editor__main');
    main.append(options.crest(role.orgRef, role.orgName));
    const text = el('div', 'roles-editor__text');
    text.append(el('span', 'roles-editor__title', role.title ?? (role.kind === 'education' ? 'Studied' : 'Role not set')));
    const range = formatRange(role);
    text.append(el('span', 'roles-editor__sub', [role.orgName, range].filter(Boolean).join(' · ')));
    main.append(text);
    const acts = el('div', 'roles-editor__acts');
    const edit = button('Edit', 'roles-editor__act');
    edit.addEventListener('click', () => openEdit(row, role));
    acts.append(edit);
    if (role.current) {
      const end = button('End', 'roles-editor__act');
      end.title = 'Mark this as finished today';
      end.addEventListener('click', () => {
        end.disabled = true;
        void endPersonRole({ person_ref: options.personRef, link_id: role.linkId })
          .then(() => options.onChanged())
          .catch((err) => {
            end.disabled = false;
            showError(errorText(err));
          });
      });
      acts.append(end);
    }
    if (!role.imported) {
      const remove = button('Remove', 'roles-editor__act');
      remove.addEventListener('click', () => {
        const confirm = el('span', 'roles-editor__confirm', 'Remove? ');
        const yes = button('Yes', 'roles-editor__act roles-editor__act--danger');
        const no = button('No', 'roles-editor__act');
        confirm.append(yes, no);
        remove.replaceWith(confirm);
        no.addEventListener('click', () => confirm.replaceWith(remove));
        yes.addEventListener('click', () => {
          yes.disabled = true;
          void removePersonRole({ person_ref: options.personRef, link_id: role.linkId })
            .then(() => options.onChanged())
            .catch((err) => {
              confirm.replaceWith(remove);
              showError(errorText(err));
            });
        });
      });
      acts.append(remove);
    }
    row.append(main, acts);
    return row;
  }

  function inlineForm(fields: RoleFields, saveLabel: string, onSave: (value: RoleFieldsValue) => Promise<unknown>, onCancel: () => void): HTMLElement {
    const form = el('div', 'roles-editor__form');
    const save = button(saveLabel, 'btn btn--primary');
    const cancel = button('Cancel');
    const actions = el('div', 'roles-editor__form-acts');
    actions.append(save, cancel);
    form.append(fields.root, actions);
    cancel.addEventListener('click', onCancel);
    save.addEventListener('click', () => {
      const read = fields.read();
      if ('error' in read) {
        showError(read.error);
        return;
      }
      status.hidden = true;
      save.disabled = true;
      void onSave(read.value)
        .then(() => options.onChanged())
        .catch((err) => {
          save.disabled = false;
          showError(errorText(err));
        });
    });
    return form;
  }

  function openEdit(row: HTMLElement, role: PersonRole): void {
    const fields = buildRoleFields({ kind: role.kind, withOrganisation: false, initial: role, onError: showError });
    const form = inlineForm(
      fields,
      'Save',
      (value) => editPersonRole({
        person_ref: options.personRef,
        link_id: role.linkId,
        role: value.title,
        valid_from: value.from,
        valid_to: value.to
      }),
      () => form.replaceWith(row)
    );
    form.prepend(el('div', 'roles-editor__form-org', role.orgName));
    row.replaceWith(form);
    form.querySelector<HTMLInputElement>('input')?.focus();
  }

  function openAdd(kind: 'role' | 'education', anchor: HTMLElement): void {
    const fields = buildRoleFields({ kind, withOrganisation: true, onError: showError });
    const form = inlineForm(
      fields,
      kind === 'education' ? 'Add education' : 'Add role',
      (value) => addPersonRole({
        person_ref: options.personRef,
        organisation_ref: value.organisation!.ref,
        relationship_type: value.type,
        role: value.title,
        valid_from: value.from,
        valid_to: value.to
      }),
      () => {
        form.remove();
        anchor.hidden = false;
      }
    );
    anchor.hidden = true;
    anchor.before(form);
    form.querySelector<HTMLInputElement>('input')?.focus();
  }

  const roleList = el('div', 'roles-editor__list');
  for (const role of roles) roleList.append(rowFor(role));
  if (!roles.length) roleList.append(el('p', 'people-pane__empty', 'No roles yet.'));
  const addRole = button('+ Add role', 'roles-editor__add');
  addRole.addEventListener('click', () => openAdd('role', addRole));

  const eduHead = el('div', 'roles-editor__subhead', 'Education');
  const eduList = el('div', 'roles-editor__list');
  for (const role of education) eduList.append(rowFor(role));
  const addEdu = button('+ Add education', 'roles-editor__add');
  addEdu.addEventListener('click', () => openAdd('education', addEdu));

  host.append(roleList, addRole, eduHead, eduList, addEdu, status);
}
