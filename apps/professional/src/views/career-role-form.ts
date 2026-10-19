import { buildSingleEntityField } from '@/components/add-person-form';
import { createUniversalLink, endUniversalLink } from '@/api/universal-links';

function todayIso(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/**
 * Career → Add a role. Writes the same `employee_at` Universal Link the
 * river's swimlanes and the Work list read (self Person → organisation,
 * role, valid_from). A past role is then ended at its end date; a current
 * role stays open. Concurrent roles at one workplace are separate links
 * because the link id includes role and start date.
 */
export function openAddRoleSheet(root: HTMLElement, selfRef: string | null, onSaved: () => void): void {
  if (root.querySelector('.career-sheet')) return;
  const previousFocus = document.activeElement as HTMLElement | null;
  const sheet = document.createElement('div');
  sheet.className = 'career-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add a role');
  const form = document.createElement('form');
  form.className = 'career-sheet__inner';
  form.noValidate = true;
  const heading = document.createElement('h2');
  heading.className = 'career-page__heading';
  heading.textContent = 'Add a role';
  form.append(heading);

  const status = document.createElement('p');
  status.className = 'career-page__meta';
  status.setAttribute('role', 'status');

  const orgLabel = document.createElement('div');
  orgLabel.className = 'career-sheet__field';
  orgLabel.append('Workplace or organisation');
  const orgField = buildSingleEntityField({
    kind: 'organisation',
    placeholder: 'Start typing a workplace…',
    emptyText: 'No match. Keep typing to create it.',
    ariaLabel: 'Workplace or organisation',
    onError: (message) => {
      status.textContent = message;
    }
  });
  orgLabel.append(orgField.root);
  form.append(orgLabel);

  function field(label: string, type = 'text'): HTMLInputElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'career-sheet__field';
    wrapper.append(label);
    const input = document.createElement('input');
    input.type = type;
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  const roleInput = field('Role title');
  roleInput.maxLength = 200;
  roleInput.placeholder = 'English Teacher';
  const fromInput = field('Started', 'date');

  const currentWrap = document.createElement('label');
  currentWrap.className = 'career-sheet__check';
  const current = document.createElement('input');
  current.type = 'checkbox';
  current.checked = true;
  currentWrap.append(current, ' I still do this role');
  form.append(currentWrap);

  const toInput = field('Finished', 'date');
  const toField = toInput.parentElement as HTMLElement;
  toField.hidden = true;
  current.addEventListener('change', () => {
    toField.hidden = current.checked;
    if (!current.checked && !toInput.value) toInput.value = todayIso();
  });

  const actions = document.createElement('div');
  actions.className = 'career-sheet__actions';
  const save = document.createElement('button');
  save.className = 'btn btn--primary';
  save.type = 'submit';
  save.textContent = 'Save role';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn--ghost';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(save, cancel);
  form.append(actions, status);

  let saving = false;
  function close(): void {
    if (saving) return;
    sheet.remove();
    previousFocus?.focus();
  }
  cancel.addEventListener('click', close);
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  if (!selfRef) {
    status.textContent =
      'Your own profile is not set up in People yet, so a role has nowhere to attach. Add yourself in People first.';
    save.disabled = true;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (saving || !selfRef) return;
    const org = orgField.getSelected();
    const roleTitle = roleInput.value.trim();
    const from = fromInput.value;
    const to = current.checked ? null : toInput.value || null;
    if (!org) {
      status.textContent = 'Choose or create the workplace.';
      (orgField.root.querySelector('input') as HTMLInputElement | null)?.focus();
      return;
    }
    if (!roleTitle) {
      status.textContent = 'Enter the role title.';
      roleInput.focus();
      return;
    }
    if (!from) {
      status.textContent = 'Enter the start date.';
      fromInput.focus();
      return;
    }
    if (!current.checked && !to) {
      status.textContent = 'Enter the finish date, or tick "I still do this role".';
      toInput.focus();
      return;
    }
    if (to && to < from) {
      status.textContent = 'The finish date is before the start date.';
      toInput.focus();
      return;
    }
    saving = true;
    save.disabled = true;
    cancel.disabled = true;
    status.textContent = 'Saving…';
    void (async () => {
      try {
        const { link, created } = await createUniversalLink({
          source_ref: selfRef,
          target_ref: org.ref,
          relationship_type: 'employee_at',
          role: roleTitle,
          valid_from: from
        });
        if (!created) {
          saving = false;
          save.disabled = false;
          cancel.disabled = false;
          status.textContent = 'That role, with that start date, is already on file.';
          return;
        }
        if (to) await endUniversalLink(link.id, { valid_to: to });
        saving = false;
        close();
        onSaved();
      } catch (error) {
        saving = false;
        save.disabled = false;
        cancel.disabled = false;
        status.textContent = error instanceof Error ? error.message : 'Could not save. Try again.';
      }
    })();
  });

  sheet.append(form);
  root.append(sheet);
  (orgField.root.querySelector('input') as HTMLInputElement | null)?.focus();
}
