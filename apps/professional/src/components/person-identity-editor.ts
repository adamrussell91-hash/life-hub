import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntity, searchEntities, updatePerson } from '@/api/entities';
import { fetchSelfPerson } from '@/api/network-ecology';
import {
  changeUniversalLinkRole,
  createUniversalLink,
  endUniversalLink
} from '@/api/universal-links';
import { setPersonWorkplace } from '@/api/people-workplace';
import { fetchOrgStructure } from '@/api/org-structure';
import { ApiClientError } from '@/api/client';
import type { EntityRecord, ProfessionalProfile } from '@/domain/types';

const ROLE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'former_colleague', label: 'Former colleague' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'mentee', label: 'Mentee' },
  { value: 'academic_contact', label: 'Academic contact' },
  { value: 'research_collaborator', label: 'Research collaborator' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'referee', label: 'Referee' },
  { value: 'conference_contact', label: 'Conference contact' },
  { value: 'introduction', label: 'Introduction' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' }
] as const;

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

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError || err instanceof Error ? err.message : fallback;
}

interface SelectedOrg {
  ref: string;
  display_label: string;
}

export interface PersonEditorContext {
  /** Current professional_relationship role toward self (directory role chip). */
  relationshipRole?: string | null;
  /** Existing professional_relationship link id (for change_role). */
  relationshipLinkId?: string | null;
  /** Current workplace organisation from overview. */
  organisation?: SelectedOrg | null;
  /** Existing employee_at / member_of link id (kept for callers; the server finds it). */
  workplaceLinkId?: string | null;
  /** Job title at that organisation — the `role` on the workplace link. */
  jobTitle?: string | null;
}

/** Stay-in-place person editor: identity + profile + relational links.
 * Shared by the legacy person page and the People redesign pane. */
export function mountIdentityEditor(
  person: Extract<EntityRecord, { kind: 'person' }>,
  onSaved: () => void,
  context: PersonEditorContext = {}
): {
  button: HTMLButtonElement;
  form: HTMLFormElement;
} {
  const profile: ProfessionalProfile | undefined = person.professional_profile;
  const initialRole = context.relationshipRole ?? '';
  const initialOrg = context.organisation ?? null;
  const initialWorkplaceText = profile?.current_workplace?.join(', ') ?? '';
  const initialJobTitle = context.jobTitle ?? '';
  const initialNotes = profile?.summary ?? '';
  const initialLinkedin = profile?.contact.linkedin_url ?? '';

  const button = el('button', 'btn btn--secondary', 'Edit') as HTMLButtonElement;
  button.type = 'button';
  button.setAttribute('aria-label', `Edit ${person.display_name}`);

  const form = document.createElement('form');
  form.className = 'add-person-form entity-detail__edit-form person-editor';
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

  const roleSelect = document.createElement('select');
  roleSelect.setAttribute('aria-label', 'How you know them');
  for (const option of ROLE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === initialRole) opt.selected = true;
    roleSelect.append(opt);
  }

  const notesInput = document.createElement('textarea');
  notesInput.rows = 3;
  notesInput.value = initialNotes;
  notesInput.setAttribute('aria-label', 'Notes');

  const workplaceTextInput = document.createElement('input');
  workplaceTextInput.type = 'text';
  workplaceTextInput.value = initialWorkplaceText;
  workplaceTextInput.placeholder = 'e.g. a school not in Life Hub yet';
  workplaceTextInput.setAttribute('aria-label', 'Workplace (not in Life Hub)');
  const workplaceTextLabel = el('label', 'add-person-form__label', 'Workplace (not in Life Hub)');

  // Job title = the role on their workplace link. Suggestions come from the
  // roles already on that organisation's chart; saving updates the chart.
  const jobTitleInput = document.createElement('input');
  jobTitleInput.type = 'text';
  jobTitleInput.value = initialJobTitle;
  jobTitleInput.placeholder = 'e.g. Head of Department Learning Enrichment';
  jobTitleInput.setAttribute('aria-label', 'Job title');
  const jobTitleList = document.createElement('datalist');
  jobTitleList.id = `job-titles-${person.id}`;
  jobTitleInput.setAttribute('list', jobTitleList.id);
  const jobTitleHint = el('p', 'add-person-form__hint');
  const jobTitleLabel = el('label', 'add-person-form__label', 'Job title');
  let titlesFor = '';

  function syncWorkplaceFields(org: SelectedOrg | null): void {
    // With a linked organisation the free-text field is redundant.
    workplaceTextLabel.hidden = Boolean(org);
    workplaceTextInput.hidden = Boolean(org);
    jobTitleHint.textContent = org
      ? `Also puts them on ${org.display_label}’s org chart.`
      : 'Link an organisation to put them on its org chart.';
    const orgId = org?.ref.split(':')[2] ?? '';
    // Suggestions only once the form is open — never a request per profile view.
    if (form.hidden || !orgId || orgId === titlesFor) return;
    titlesFor = orgId;
    void fetchOrgStructure(orgId)
      .then((structure) => {
        if (titlesFor !== orgId) return;
        jobTitleList.replaceChildren(
          ...[...new Set(structure.positions.filter((p) => p.lifecycle_status === 'active').map((p) => p.title))]
            .sort((a, b) => a.localeCompare(b))
            .map((title) => Object.assign(document.createElement('option'), { value: title }))
        );
      })
      .catch(() => undefined);
  }

  let selectedOrg: SelectedOrg | null = initialOrg;
  const orgWrap = el('div', 'add-person-form__field');
  const orgInput = document.createElement('input');
  orgInput.type = 'text';
  orgInput.placeholder = 'Start typing an organisation…';
  orgInput.setAttribute('aria-label', 'Organisation');
  const orgSelectedNote = el('p', 'add-person-form__selected-note');
  orgSelectedNote.hidden = true;
  const orgClear = document.createElement('button');
  orgClear.type = 'button';
  orgClear.className = 'add-person-form__clear';
  orgClear.textContent = 'Clear';

  function setOrg(next: SelectedOrg | null): void {
    selectedOrg = next;
    if (next) {
      orgInput.hidden = true;
      orgSelectedNote.replaceChildren(document.createTextNode(`${next.display_label} `), orgClear);
      orgSelectedNote.hidden = false;
    } else {
      orgInput.value = '';
      orgInput.hidden = false;
      orgSelectedNote.hidden = true;
    }
    syncWorkplaceFields(next);
  }
  orgClear.addEventListener('click', () => setOrg(null));
  setOrg(initialOrg);

  const orgPicker = createEntityPicker({
    input: orgInput,
    mode: 'field',
    allowedKinds: ['organisation'],
    emptyText: 'No matching organisations.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'organisation', { signal });
      return {
        groups: {
          person: result.groups.person ?? [],
          organisation: result.groups.organisation ?? [],
          task: result.groups.task ?? []
        }
      };
    },
    onSelect: (item) => setOrg({ ref: item.ref, display_label: item.display_label }),
    onCreate: (query) => {
      void (async () => {
        try {
          const created = await createEntity({ kind: 'organisation', display_name: query });
          setOrg({ ref: created.ref, display_label: created.display_name });
        } catch (err) {
          status.hidden = false;
          status.textContent = errorMessage(err, `Could not create organisation "${query}".`);
        }
      })();
    }
  });
  orgWrap.append(orgInput, orgPicker.root, orgSelectedNote);

  const linkedinInput = document.createElement('input');
  linkedinInput.type = 'url';
  linkedinInput.value = initialLinkedin;
  linkedinInput.placeholder = 'https://www.linkedin.com/in/…';
  linkedinInput.setAttribute('aria-label', 'LinkedIn');

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
    el('label', 'add-person-form__label', 'Organisation'),
    orgWrap,
    jobTitleLabel,
    jobTitleInput,
    jobTitleList,
    jobTitleHint,
    workplaceTextLabel,
    workplaceTextInput,
    el('label', 'add-person-form__label', 'How you know them'),
    roleSelect,
    el('label', 'add-person-form__label', 'Notes'),
    notesInput,
    el('label', 'add-person-form__label', 'LinkedIn'),
    linkedinInput,
    el('label', 'add-person-form__label', 'Sort name'),
    sortInput,
    el('label', 'add-person-form__label', 'Aliases'),
    aliasesInput,
    status,
    actions
  );

  function open(): void {
    form.hidden = false;
    syncWorkplaceFields(selectedOrg);
    nameInput.focus();
  }

  function resetFields(): void {
    nameInput.value = person.display_name;
    sortInput.value = person.sort_name ?? '';
    aliasesInput.value = person.aliases.join(', ');
    roleSelect.value = initialRole;
    jobTitleInput.value = initialJobTitle;
    notesInput.value = initialNotes;
    workplaceTextInput.value = initialWorkplaceText;
    linkedinInput.value = initialLinkedin;
    setOrg(initialOrg);
  }

  function close(): void {
    form.hidden = true;
    status.hidden = true;
    resetFields();
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
    const linkedinRaw = linkedinInput.value.trim();
    if (linkedinRaw) {
      try {
        const url = new URL(linkedinRaw);
        if (url.protocol !== 'https:') {
          status.hidden = false;
          status.textContent = 'LinkedIn must be an https URL.';
          return;
        }
      } catch {
        status.hidden = false;
        status.textContent = 'LinkedIn must be an https URL.';
        return;
      }
    }

    status.hidden = true;
    save.disabled = true;
    const warnings: string[] = [];

    void (async () => {
      try {
        await updatePerson(person.ref, {
          display_name: displayName,
          sort_name: sortInput.value.trim() || null,
          aliases: parseAliases(aliasesInput.value),
          professional_profile: {
            summary: notesInput.value.trim() || null,
            linkedin_url: linkedinRaw || null,
            current_workplace: workplaceTextInput.value.trim() || null
          }
        });

        const nextRole = roleSelect.value;
        if (nextRole !== initialRole) {
          try {
            const self = await fetchSelfPerson();
            const selfRef = self.self?.ref ?? null;
            if (!selfRef) {
              warnings.push('Could not set role: self person is not configured.');
            } else if (nextRole && context.relationshipLinkId) {
              await changeUniversalLinkRole(context.relationshipLinkId, {
                role: nextRole,
                changed_at: new Date().toISOString()
              });
            } else if (nextRole) {
              await createUniversalLink({
                source_ref: selfRef,
                target_ref: person.ref,
                relationship_type: 'professional_relationship',
                role: nextRole,
                valid_from: new Date().toISOString()
              });
            } else if (context.relationshipLinkId) {
              await endUniversalLink(context.relationshipLinkId, {
                valid_to: new Date().toISOString()
              });
            }
          } catch (err) {
            warnings.push(`Role link failed: ${errorMessage(err, 'unknown error')}`);
          }
        }

        // Organisation + job title in one server call; the org chart follows.
        const nextOrg = selectedOrg;
        const nextTitle = jobTitleInput.value.trim();
        const orgChanged = (nextOrg?.ref ?? null) !== (initialOrg?.ref ?? null);
        if (orgChanged || nextTitle !== initialJobTitle.trim()) {
          try {
            await setPersonWorkplace({
              person_ref: person.ref,
              organisation_ref: nextOrg?.ref ?? null,
              job_title: nextTitle || null,
              replace_organisation_ref: orgChanged ? initialOrg?.ref ?? null : null
            });
          } catch (err) {
            warnings.push(`Workplace / job title failed: ${errorMessage(err, 'unknown error')}`);
          }
        }

        if (warnings.length) {
          window.alert(warnings.join('\n'));
        }
        onSaved();
      } catch (err: unknown) {
        save.disabled = false;
        status.hidden = false;
        status.textContent = errorMessage(err, 'Could not update person.');
      }
    })();
  });

  return { button, form };
}

/** Alias — full person editor (identity + profile + links). */
export const mountPersonEditor = mountIdentityEditor;
