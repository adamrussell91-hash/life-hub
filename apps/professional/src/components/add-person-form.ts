import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntity, searchEntities } from '@/api/entities';
import { createUniversalLink } from '@/api/universal-links';
import { createObservation } from '@/api/observations';
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

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError || err instanceof Error ? err.message : fallback;
}

interface SelectedEntity {
  ref: string;
  display_label: string;
}

/**
 * One `@`-picker field that resolves to a single Person or Organisation,
 * with inline "Create X '<name>'" support via the picker's own `onCreate`
 * (SOURCE-BRIEF.md section 5's "Organisation, when known" / "Who
 * introduced you" — unlike every other `@`-picker in this app, these two
 * genuinely may not exist yet, so typing a name with no match can create
 * one on the spot via `POST /api/entities` rather than requiring the
 * organisation/person to already exist).
 */
function buildSingleEntityField(options: {
  kind: 'organisation' | 'person';
  placeholder: string;
  emptyText: string;
  ariaLabel: string;
  onError: (message: string) => void;
}): { root: HTMLElement; getSelected: () => SelectedEntity | null; reset: () => void } {
  const wrap = el('div', 'add-person-form__field');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = options.placeholder;
  input.setAttribute('aria-label', options.ariaLabel);

  let selected: SelectedEntity | null = null;

  const selectedNote = el('p', 'add-person-form__selected-note');
  selectedNote.hidden = true;
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'add-person-form__clear';
  clearBtn.textContent = 'Clear';

  function setSelected(next: SelectedEntity | null): void {
    selected = next;
    if (next) {
      input.hidden = true;
      selectedNote.replaceChildren(document.createTextNode(`${next.display_label} `), clearBtn);
      selectedNote.hidden = false;
    } else {
      input.value = '';
      input.hidden = false;
      selectedNote.hidden = true;
    }
  }

  clearBtn.addEventListener('click', () => setSelected(null));

  const picker = createEntityPicker({
    input,
    allowedKinds: [options.kind],
    emptyText: options.emptyText,
    search: async (query, signal) => {
      const result = await searchEntities(query, options.kind, { signal });
      return {
        groups: {
          person: result.groups.person ?? [],
          organisation: result.groups.organisation ?? [],
          task: result.groups.task ?? []
        }
      };
    },
    onSelect: (item) => setSelected({ ref: item.ref, display_label: item.display_label }),
    onCreate: (query, createdKind) => {
      void (async () => {
        try {
          const created = await createEntity({
            kind: createdKind as 'person' | 'organisation',
            display_name: query
          });
          setSelected({ ref: created.ref, display_label: created.display_name });
        } catch (err) {
          options.onError(errorMessage(err, `Could not create ${createdKind} "${query}".`));
        }
      })();
    }
  });

  wrap.append(input, picker.root, selectedNote);
  return { root: wrap, getSelected: () => selected, reset: () => setSelected(null) };
}

export interface AddPersonResult {
  person: EntityRecord;
  /** Non-fatal write failures after the person itself was created — the
   * person always exists once this callback fires; a warning means one of
   * the optional follow-up writes (organisation link, introduction link,
   * observation) didn't make it and can be added later from their page. */
  warnings: string[];
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
export function mountAddPersonForm(host: HTMLElement, options: AddPersonFormOptions): { focusName: () => void } {
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

  const orgField = buildSingleEntityField({
    kind: 'organisation',
    placeholder: 'Type @ to search or create an organisation',
    emptyText: 'No matching organisations.',
    ariaLabel: 'Organisation, when known',
    onError: showError
  });

  const introducerField = buildSingleEntityField({
    kind: 'person',
    placeholder: 'Type @ to search or create a person',
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
    el('label', 'add-person-form__label', 'Organisation, when known'),
    orgField.root,
    el('label', 'add-person-form__label', 'Who introduced you'),
    introducerField.root,
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

      const organisation = orgField.getSelected();
      if (organisation) {
        try {
          // `member_of` rather than `employee_at` — a quick capture rarely
          // knows employment status, just that this org came up.
          await createUniversalLink({
            source_ref: person.ref,
            target_ref: organisation.ref,
            relationship_type: 'member_of',
            valid_from: occurredAt
          });
        } catch (err) {
          warnings.push(
            `Linking to ${organisation.display_label} failed: ${errorMessage(err, 'unknown error')}`
          );
        }
      }

      const introducer = introducerField.getSelected();
      if (introducer) {
        try {
          // Source = the introducer (the earlier-known party), target =
          // the new person, per BUILD-PLAN.md Feature 1.1's documented
          // direction choice for `professional_relationship`.
          await createUniversalLink({
            source_ref: introducer.ref,
            target_ref: person.ref,
            relationship_type: 'professional_relationship',
            role: 'introduction',
            valid_from: occurredAt
          });
        } catch (err) {
          warnings.push(
            `Recording the introduction from ${introducer.display_label} failed: ${errorMessage(err, 'unknown error')}`
          );
        }
      }

      const whereMet = whereInput.value.trim();
      const observationText = observationInput.value.trim();
      const combinedText = [whereMet ? `Met at ${whereMet}.` : '', observationText].filter(Boolean).join(' ');
      if (combinedText) {
        try {
          await createObservation({
            about_ref: person.ref,
            text: combinedText,
            occurred_at: occurredAt,
            source: 'manual',
            linked_ref: null
          });
        } catch (err) {
          warnings.push(`Saving the observation failed: ${errorMessage(err, 'unknown error')}`);
        }
      }

      submit.disabled = false;
      options.onCreated({ person, warnings });
    })();
  });

  host.append(form);
  return { focusName: () => nameInput.focus() };
}
