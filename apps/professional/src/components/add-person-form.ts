import { createEntity } from '@/api/entities';
import { buildSingleEntityField, errorMessage, type SelectedEntity } from '@/components/entity-field';
import { createUniversalLink } from '@/api/universal-links';
import { addPersonRole } from '@/api/people-roles';
import { buildRoleFields } from '@/components/role-fields';
import { createObservation } from '@/api/observations';
import type { EntityRecord } from '@/domain/types';

export { buildSingleEntityField, type SelectedEntity };

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

export interface AddPersonResult {
  person: EntityRecord;
  /** Non-fatal write failures after the person itself was created — the
   * person always exists once this callback fires; a warning means one of
   * the optional follow-up writes (organisation link, introduction link,
   * observation) didn't make it and can be added later from their page. */
  warnings: string[];
  /** Short labels of the writes that didn't save ("Workplace"), for the toast. */
  failed: string[];
  /** The first role entered, so the new directory row can show it at once. */
  role: { organisation: SelectedEntity; title: string | null; current: boolean } | null;
}

export interface AddPersonFormOptions {
  onCreated: (result: AddPersonResult) => void;
  onCancel?: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rapid Person Capture (SOURCE-BRIEF.md section 5): "adding a new person
 * must require minimal effort" — one Name field required, everything else
 * optional. On submit this creates the Person first (always succeeds or
 * the whole submission fails), then attempts the optional organisation
 * link, introduction link, and observation independently — a failure in
 * any of those is reported as a warning rather than rolled back, since the
 * person already exists and the brief itself expects a lightweight, often
 * incomplete initial record ("additional structure appears through later
 * activity").
 */
export function mountAddPersonForm(
  host: HTMLElement,
  options: AddPersonFormOptions
): { focusName: () => void; reset: () => void } {
  const form = document.createElement('form');
  form.className = 'add-person-form';
  form.setAttribute('aria-label', 'Add person');

  const status = el('p', 'add-person-form__status');
  status.hidden = true;
  function showError(message: string): void {
    status.hidden = false;
    status.textContent = message;
  }

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.setAttribute('aria-label', 'Name');

  const whereInput = document.createElement('input');
  whereInput.type = 'text';
  whereInput.setAttribute('aria-label', 'Where you met');

  // The first role row: organisation, role, dates. Optional.
  const roleFields = buildRoleFields({ kind: 'role', withOrganisation: true, onError: showError });

  const introducerField = buildSingleEntityField({
    kind: 'person',
    placeholder: 'Start typing a name…',
    emptyText: 'No matching people.',
    ariaLabel: 'Who introduced you',
    onError: showError
  });

  const observationInput = document.createElement('textarea');
  observationInput.rows = 2;
  observationInput.setAttribute('aria-label', 'One optional observation');

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.required = true;
  dateInput.value = todayIsoDate();
  dateInput.setAttribute('aria-label', 'Date');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn--primary';
  submit.textContent = 'Add person';

  const actions = el('div', 'add-person-form__actions');
  actions.append(submit);
  if (options.onCancel) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => options.onCancel?.());
    actions.append(cancel);
  }

  form.append(
    el('label', 'add-person-form__label', 'Name'),
    nameInput,
    el('label', 'add-person-form__label', 'Where you met'),
    whereInput,
    el('label', 'add-person-form__label', 'Who introduced you'),
    introducerField.root,
    el('label', 'add-person-form__label', 'Role, when known'),
    roleFields.root,
    el('label', 'add-person-form__label', 'One optional observation'),
    observationInput,
    el('label', 'add-person-form__label', 'Date'),
    dateInput,
    status,
    actions
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      showError('Name is required.');
      return;
    }
    const roleRead = roleFields.isEmpty() ? null : roleFields.read();
    if (roleRead && 'error' in roleRead) {
      showError(roleRead.error);
      return;
    }
    const firstRole = roleRead && 'value' in roleRead ? roleRead.value : null;
    status.hidden = true;
    submit.disabled = true;

    void (async () => {
      const dateValue = dateInput.value || todayIsoDate();
      const occurredAt = new Date(`${dateValue}T00:00:00.000Z`).toISOString();
      const warnings: string[] = [];

      let person: EntityRecord;
      try {
        person = await createEntity({ kind: 'person', display_name: name });
      } catch (err) {
        submit.disabled = false;
        showError(errorMessage(err, 'Could not create person.'));
        return;
      }

      // The person exists now; the optional writes run together, and a
      // failure in one is a warning, never a rollback.
      const introducer = introducerField.getSelected();
      const whereMet = whereInput.value.trim();
      const observationText = observationInput.value.trim();
      const combinedText = [whereMet ? `Met at ${whereMet}.` : '', observationText].filter(Boolean).join(' ');
      const writes: Array<{ label: string; detail: string; run: () => Promise<unknown> }> = [];
      if (firstRole?.organisation) {
        const organisation = firstRole.organisation;
        writes.push({
          label: 'Workplace',
          detail: `Linking to ${organisation.display_label}`,
          run: () => addPersonRole({
            person_ref: person.ref,
            organisation_ref: organisation.ref,
            relationship_type: firstRole.type,
            role: firstRole.title,
            valid_from: firstRole.from,
            valid_to: firstRole.to
          })
        });
      }
      if (introducer) {
        writes.push({
          label: 'Introduction',
          detail: `Recording the introduction from ${introducer.display_label}`,
          // Source = the introducer (the earlier-known party), target =
          // the new person, per BUILD-PLAN.md Feature 1.1's documented
          // direction choice for `professional_relationship`.
          run: () => createUniversalLink({
            source_ref: introducer.ref,
            target_ref: person.ref,
            relationship_type: 'professional_relationship',
            role: 'introduction',
            valid_from: occurredAt
          })
        });
      }
      if (combinedText) {
        writes.push({
          label: 'Observation',
          detail: 'Saving the observation',
          run: () => createObservation({
            about_ref: person.ref,
            text: combinedText,
            occurred_at: occurredAt,
            source: 'manual',
            linked_ref: null
          })
        });
      }
      const failed: string[] = [];
      const settled = await Promise.allSettled(writes.map((w) => w.run()));
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') return;
        const write = writes[i]!;
        failed.push(write.label);
        warnings.push(`${write.detail} failed: ${errorMessage(result.reason, 'unknown error')}`);
      });

      submit.disabled = false;
      options.onCreated({
        person,
        warnings,
        failed,
        role: firstRole?.organisation
          ? { organisation: firstRole.organisation, title: firstRole.title, current: !firstRole.to }
          : null
      });
    })();
  });

  function reset(): void {
    form.reset();
    dateInput.value = todayIsoDate();
    roleFields.reset();
    introducerField.reset();
    status.hidden = true;
  }

  host.append(form);
  return { focusName: () => nameInput.focus(), reset };
}
