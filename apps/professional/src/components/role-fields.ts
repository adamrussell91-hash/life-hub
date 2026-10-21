/**
 * One role or education row's fields, shared by the profile roles editor and
 * the Add person form's first role row.
 */

import { buildSingleEntityField, type SelectedEntity } from '@/components/entity-field';
import { monthYearInput, parseMonthYear, type PersonRole, type RoleLinkType } from '@/domain/person-roles';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface RoleFieldsValue {
  organisation: SelectedEntity | null;
  type: RoleLinkType;
  title: string | null;
  from: string | null;
  to: string | null;
}

export interface RoleFields {
  root: HTMLElement;
  /** The typed row, or an error message to show. */
  read: () => { value: RoleFieldsValue } | { error: string };
  /** True when nothing has been entered (an untouched optional row). */
  isEmpty: () => boolean;
  reset: () => void;
}

/**
 * One role or education row: organisation (search or create), role text,
 * from / to as month and year (or year alone), and a Current checkbox.
 * Without `withOrganisation` the organisation is fixed (editing a row).
 */
export function buildRoleFields(options: {
  kind: 'role' | 'education';
  withOrganisation: boolean;
  initial?: Partial<Pick<PersonRole, 'type' | 'title' | 'from' | 'to' | 'current'>>;
  onError?: (message: string) => void;
}): RoleFields {
  const root = el('div', 'role-fields');
  const education = options.kind === 'education';
  const orgField = options.withOrganisation
    ? buildSingleEntityField({
        kind: 'organisation',
        placeholder: education ? 'School or university…' : 'Organisation…',
        emptyText: 'No matching organisations.',
        ariaLabel: education ? 'Institution' : 'Organisation',
        onError: options.onError ?? (() => {})
      })
    : null;

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'role-fields__title';
  title.placeholder = education ? 'Qualification' : 'Role';
  title.setAttribute('aria-label', education ? 'Qualification' : 'Role');
  title.value = options.initial?.title ?? '';

  let typeSelect: HTMLSelectElement | null = null;
  if (!education && !options.initial?.type) {
    typeSelect = document.createElement('select');
    typeSelect.className = 'role-fields__type';
    typeSelect.setAttribute('aria-label', 'Kind of role');
    for (const [value, label] of [['employee_at', 'Works there'], ['member_of', 'Member or board']] as const) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      typeSelect.append(opt);
    }
  }

  const from = document.createElement('input');
  from.type = 'text';
  from.inputMode = 'numeric';
  from.className = 'role-fields__date';
  from.placeholder = 'From (2016 or 2016-03)';
  from.setAttribute('aria-label', 'From');
  from.value = monthYearInput(options.initial?.from ?? null);

  const to = document.createElement('input');
  to.type = 'text';
  to.inputMode = 'numeric';
  to.className = 'role-fields__date';
  to.placeholder = 'To';
  to.setAttribute('aria-label', 'To');
  to.value = monthYearInput(options.initial?.to ?? null);

  const currentLabel = el('label', 'role-fields__current');
  const current = document.createElement('input');
  current.type = 'checkbox';
  current.setAttribute('aria-label', 'Current');
  current.checked = options.initial ? Boolean(options.initial.current) : !education;
  currentLabel.append(current, document.createTextNode(' Current'));

  function syncCurrent(): void {
    if (current.checked) to.value = '';
    to.disabled = current.checked;
  }
  current.addEventListener('change', syncCurrent);
  syncCurrent();

  const dates = el('div', 'role-fields__dates');
  dates.append(from, to, currentLabel);
  if (orgField) root.append(orgField.root);
  root.append(title);
  if (typeSelect) root.append(typeSelect);
  root.append(dates);

  return {
    root,
    isEmpty: () => !orgField?.getSelected() && !title.value.trim() && !from.value.trim() && !to.value.trim(),
    reset: () => {
      orgField?.reset();
      title.value = '';
      from.value = '';
      to.value = '';
      current.checked = !education;
      syncCurrent();
      if (typeSelect) typeSelect.value = 'employee_at';
    },
    read: () => {
      const organisation = orgField?.getSelected() ?? null;
      if (orgField && !organisation) return { error: education ? 'Pick an institution.' : 'Pick an organisation.' };
      const fromIso = parseMonthYear(from.value);
      const toIso = current.checked ? null : parseMonthYear(to.value);
      if (fromIso === undefined || toIso === undefined) return { error: 'Dates look like 2016 or 2016-03.' };
      if (fromIso && toIso && Date.parse(toIso) < Date.parse(fromIso)) return { error: 'The end is before the start.' };
      const type: RoleLinkType = education
        ? 'studied_at'
        : options.initial?.type ?? ((typeSelect?.value as RoleLinkType | undefined) ?? 'employee_at');
      return { value: { organisation, type, title: title.value.trim() || null, from: fromIso, to: toIso } };
    }
  };
}
