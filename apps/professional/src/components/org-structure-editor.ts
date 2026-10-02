/**
 * Phase 2 — Edit structure sheet on the organisation page.
 * Add units / positions / memberships / exception links; caller reloads section.
 */

import {
  createOrgPosition,
  createOrgStructureLink,
  createOrgUnit,
  type OrgStructurePayload
} from '@/api/org-structure';
import { el } from '@/components/org-ui';

export interface StructureEditorOptions {
  organisationRef: string;
  organisationName: string;
  structure: OrgStructurePayload | null;
  /** Person search results: id + display_name (from directory people on this org). */
  people: Array<{ id: string; display_name: string }>;
  /** Status line to show on open (e.g. "Unit added." after a save reopened the sheet). */
  notice?: string;
  /** The caller refreshes and reopens the sheet; `message` is the status to carry over. */
  onSaved: (message?: string) => void | Promise<void>;
  onClose: () => void;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const lab = el('label', 'orgs-page__field');
  lab.append(document.createTextNode(label), control);
  return lab;
}

function textInput(placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.className = 'orgs-page__input';
  return input;
}

function select(options: Array<{ value: string; label: string }>): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    sel.append(opt);
  }
  return sel;
}

/**
 * Opaque paper sheet (S3). Returns the root sheet element (already in DOM when appended by caller).
 */
export function openStructureEditor(options: StructureEditorOptions): HTMLElement {
  const sheet = el('div', 'orgs-page__sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', `Edit structure — ${options.organisationName}`);

  const inner = el('div', 'orgs-page__sheet-inner');
  inner.append(el('h2', undefined, 'Edit structure'));

  const status = el('p', 'orgs-page__meta', options.notice ?? '');
  status.setAttribute('role', 'status');
  inner.append(status);

  // --- Add unit ---
  const unitName = textInput('e.g. English faculty');
  const unitKind = select([
    { value: 'faculty', label: 'Faculty' },
    { value: 'program', label: 'Program' },
    { value: 'team', label: 'Team' },
    { value: 'leadership', label: 'Leadership' },
    { value: 'department', label: 'Department' },
    { value: 'board', label: 'Board' },
    { value: 'other', label: 'Other' }
  ]);
  const addUnitBtn = el('button', 'btn btn--primary', 'Add unit') as HTMLButtonElement;
  addUnitBtn.type = 'button';
  addUnitBtn.addEventListener('click', () => {
    void (async () => {
      if (!unitName.value.trim()) {
        status.textContent = 'Give the unit a name first.';
        unitName.focus();
        return;
      }
      addUnitBtn.disabled = true;
      status.textContent = 'Saving…';
      try {
        const order = options.structure?.units.length ?? 0;
        await createOrgUnit({
          organisation_ref: options.organisationRef,
          name: unitName.value.trim(),
          unit_kind: unitKind.value,
          order
        });
        const added = `${unitName.value.trim()} added.`;
        unitName.value = '';
        status.textContent = added;
        await options.onSaved(added);
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not add unit.';
      } finally {
        addUnitBtn.disabled = false;
      }
    })();
  });
  inner.append(el('h3', undefined, 'Add unit'), field('Name', unitName), field('Kind', unitKind), addUnitBtn);

  // --- Add position (head) ---
  const posTitle = textInput('e.g. Head of English');
  const unitOptions = [
    { value: '', label: '(no unit)' },
    ...(options.structure?.units.map((u) => ({
      value: `shared:unit:${u.id}`,
      label: u.name
    })) ?? [])
  ];
  const posUnit = select(unitOptions);
  const posHead = document.createElement('input');
  posHead.type = 'checkbox';
  posHead.checked = true;
  const headLab = el('label', 'orgs-page__field');
  headLab.append(posHead, document.createTextNode(' Head of unit'));
  const addPosBtn = el('button', 'btn btn--primary', 'Add position') as HTMLButtonElement;
  addPosBtn.type = 'button';
  addPosBtn.addEventListener('click', () => {
    void (async () => {
      if (!posTitle.value.trim()) {
        status.textContent = 'Give the position a title first.';
        posTitle.focus();
        return;
      }
      addPosBtn.disabled = true;
      status.textContent = 'Saving…';
      try {
        await createOrgPosition({
          organisation_ref: options.organisationRef,
          title: posTitle.value.trim(),
          unit_ref: posUnit.value || null,
          is_head: posHead.checked
        });
        posTitle.value = '';
        status.textContent = 'Position added.';
        await options.onSaved('Position added.');
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not add position.';
      } finally {
        addPosBtn.disabled = false;
      }
    })();
  });
  inner.append(
    el('h3', undefined, 'Add position'),
    field('Title', posTitle),
    field('Unit', posUnit),
    headLab,
    addPosBtn
  );

  // --- Add member ---
  const personSel = select([
    { value: '', label: 'Choose person…' },
    ...options.people.map((p) => ({
      value: `shared:person:${p.id}`,
      label: p.display_name
    }))
  ]);
  const memberUnit = select([
    { value: '', label: 'Choose unit…' },
    ...(options.structure?.units.map((u) => ({
      value: `shared:unit:${u.id}`,
      label: u.name
    })) ?? [])
  ]);
  const memberRole = textInput('Role (optional)');
  const addMemberBtn = el('button', 'btn btn--primary', 'Add member') as HTMLButtonElement;
  addMemberBtn.type = 'button';
  addMemberBtn.addEventListener('click', () => {
    void (async () => {
      if (!personSel.value || !memberUnit.value) {
        status.textContent = 'Choose a person and a unit.';
        return;
      }
      addMemberBtn.disabled = true;
      status.textContent = 'Saving…';
      try {
        await createOrgStructureLink({
          organisation_ref: options.organisationRef,
          relationship_type: 'member_of_unit',
          source_ref: personSel.value,
          target_ref: memberUnit.value,
          role: memberRole.value.trim() || null,
          valid_from: new Date().toISOString()
        });
        status.textContent = 'Member added.';
        await options.onSaved('Member added.');
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not add member.';
      } finally {
        addMemberBtn.disabled = false;
      }
    })();
  });
  inner.append(
    el('h3', undefined, 'Add member'),
    field('Person', personSel),
    field('Unit', memberUnit),
    field('Role', memberRole),
    addMemberBtn
  );

  // --- Exception: reports_to ---
  const reportSource = select([
    { value: '', label: 'Source…' },
    ...(options.structure?.positions.map((p) => ({
      value: `shared:position:${p.id}`,
      label: p.title
    })) ?? []),
    ...(options.structure?.units.map((u) => ({
      value: `shared:unit:${u.id}`,
      label: `Unit: ${u.name}`
    })) ?? [])
  ]);
  const reportTarget = select([
    { value: '', label: 'Reports to…' },
    ...(options.structure?.positions.map((p) => ({
      value: `shared:position:${p.id}`,
      label: p.title
    })) ?? [])
  ]);
  const addReportBtn = el('button', 'btn btn--ghost', 'Add reports-to') as HTMLButtonElement;
  addReportBtn.type = 'button';
  addReportBtn.addEventListener('click', () => {
    void (async () => {
      if (!reportSource.value || !reportTarget.value) {
        status.textContent = 'Choose source and target.';
        return;
      }
      addReportBtn.disabled = true;
      try {
        await createOrgStructureLink({
          organisation_ref: options.organisationRef,
          relationship_type: 'reports_to',
          source_ref: reportSource.value,
          target_ref: reportTarget.value,
          valid_from: new Date().toISOString()
        });
        status.textContent = 'Reporting line added.';
        await options.onSaved('Reporting line added.');
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not add link.';
      } finally {
        addReportBtn.disabled = false;
      }
    })();
  });
  inner.append(
    el('h3', undefined, 'Exception: reports to'),
    field('From', reportSource),
    field('To', reportTarget),
    addReportBtn
  );

  const closeBtn = el('button', 'btn btn--ghost', 'Close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', () => options.onClose());
  inner.append(closeBtn);

  sheet.append(inner);
  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet) options.onClose();
  });

  return sheet;
}
