import { mountEntitySearch, type EntitySearchHandle } from './entity-search';
import { fetchRelationshipRegistry, searchRelationally } from '@/api/relational-search';
import { ApiClientError } from '@/api/client';
import { parseSharedRef } from '@/domain/ids';
import { personRoute } from '@/app/router';
import type { RelationalSearchResult, SearchResult } from '@/domain/types';

export interface RelationalSearchPanelHandle {
  destroy(): void;
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

function messageForSearchFailure(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'unauthenticated' || err.status === 401) return 'Your session expired. Refresh and sign in again.';
    if (err.code === 'network_error' || err.code === 'timeout') return 'Could not reach the network. Try again.';
    if (err.code === 'missing_filter') return 'Enter at least one filter.';
    return 'The server could not complete this search. Try again.';
  }
  return 'The server could not complete this search. Try again.';
}

/**
 * Relational Search (Phase 3, Feature 3.3), layer 1 — structured
 * organisation / role / text filters, ANDed together, each result showing
 * `matched_reasons`. This is a second, different search mode from
 * `mountEntitySearch`'s name/label lookup (still used by "Search by name"
 * in the same header panel) — see `SOURCE-BRIEF.md` section 45. The
 * organisation filter reuses `mountEntitySearch` itself (scoped to
 * `kinds: 'organisation'`) as a small embedded picker, per the task's
 * explicit decision, rather than inventing a name-to-ref resolution path
 * server-side.
 */
export function mountRelationalSearchPanel(container: HTMLElement): RelationalSearchPanelHandle {
  container.replaceChildren();
  container.classList.add('relational-search');

  let destroyed = false;
  let selectedOrgRef: string | null = null;
  let orgPickerHandle: EntitySearchHandle | null = null;

  const form = el('form', 'relational-search__form');
  form.noValidate = true;

  // Organisation filter — embedded entity-search picker scoped to
  // organisations, per the task's decision (a) over inventing a
  // free-text-name filter server-side.
  const orgField = el('div', 'relational-search__field');
  const orgLabelEl = el('span', 'relational-search__label sign-in__label', 'Organisation');
  const orgPickerContainer = el('div', 'relational-search__org-picker');
  const orgSelectedRow = el('div', 'relational-search__org-selected');
  orgSelectedRow.hidden = true;
  const orgSelectedText = el('span', 'relational-search__org-selected-label');
  const orgClearBtn = document.createElement('button');
  orgClearBtn.type = 'button';
  orgClearBtn.className = 'relational-search__org-clear';
  orgClearBtn.textContent = 'Clear';
  orgSelectedRow.append(orgSelectedText, orgClearBtn);
  orgField.append(orgLabelEl, orgPickerContainer, orgSelectedRow);

  function mountOrgPicker(): void {
    if (orgPickerHandle) return;
    orgPickerHandle = mountEntitySearch(orgPickerContainer, {
      kinds: 'organisation',
      label: 'Search organisations',
      placeholder: 'Search by organisation name',
      emptyHint: 'Search for an organisation by name.',
      onSelect: (result: SearchResult) => {
        selectedOrgRef = result.ref;
        orgPickerContainer.hidden = true;
        orgSelectedRow.hidden = false;
        orgSelectedText.textContent = result.display_label;
        updateSubmitState();
      }
    });
  }

  orgClearBtn.addEventListener('click', () => {
    selectedOrgRef = null;
    orgSelectedRow.hidden = true;
    orgPickerContainer.hidden = false;
    updateSubmitState();
  });

  mountOrgPicker();

  // Role filter — populated from `/api/relationship-registry`'s
  // `professional_relationship` entry's `allowed_roles`, the single
  // source of truth already exposed for this purpose, rather than
  // hardcoding the enum here.
  const roleField = el('div', 'relational-search__field');
  const roleLabelId = `relational-search-role-${Math.random().toString(36).slice(2, 8)}`;
  const roleLabelEl = el('label', 'relational-search__label sign-in__label', 'Role');
  roleLabelEl.htmlFor = roleLabelId;
  const roleSelect = document.createElement('select');
  roleSelect.id = roleLabelId;
  roleSelect.className = 'relational-search__role-select';
  const roleDefaultOption = document.createElement('option');
  roleDefaultOption.value = '';
  roleDefaultOption.textContent = 'Any role';
  roleSelect.append(roleDefaultOption);
  roleField.append(roleLabelEl, roleSelect);

  // Text filter — matches a current professional_relationship link's
  // `human_label` OR any Observation text about the person.
  const textField = el('div', 'relational-search__field');
  const textLabelId = `relational-search-text-${Math.random().toString(36).slice(2, 8)}`;
  const textLabelEl = el('label', 'relational-search__label sign-in__label', 'Keyword');
  textLabelEl.htmlFor = textLabelId;
  const textInput = document.createElement('input');
  textInput.id = textLabelId;
  textInput.type = 'text';
  textInput.className = 'relational-search__text-input';
  textInput.placeholder = 'e.g. gifted education';
  textField.append(textLabelEl, textInput);

  const validationMessage = el('p', 'relational-search__validation', 'Enter at least one filter.');

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn--primary relational-search__submit';
  submitBtn.textContent = 'Search';

  const statusEl = el('p', 'relational-search__status');
  statusEl.hidden = true;

  const resultsList = document.createElement('ul');
  resultsList.className = 'relational-search__results';

  function hasAnyFilter(): boolean {
    return Boolean(selectedOrgRef || roleSelect.value || textInput.value.trim());
  }

  function updateSubmitState(): void {
    const enabled = hasAnyFilter();
    submitBtn.disabled = !enabled;
    validationMessage.hidden = enabled;
  }

  textInput.addEventListener('input', updateSubmitState);
  roleSelect.addEventListener('change', updateSubmitState);

  async function loadRoles(): Promise<void> {
    try {
      const registry = await fetchRelationshipRegistry();
      if (destroyed) return;
      const declaration = registry.relationships.find((entry) => entry.key === 'professional_relationship');
      for (const role of declaration?.allowed_roles ?? []) {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role;
        roleSelect.append(option);
      }
    } catch {
      // Non-fatal: the role dropdown just stays at "Any role" if the
      // registry fetch fails — the organisation and text filters still
      // work standalone.
    }
  }
  void loadRoles();

  function renderResults(results: RelationalSearchResult[]): void {
    resultsList.replaceChildren();
    if (!results.length) {
      statusEl.hidden = false;
      statusEl.textContent = 'No matches.';
      return;
    }
    statusEl.hidden = true;
    for (const result of results) {
      const item = document.createElement('li');
      item.className = 'relational-search__result';

      const parsed = parseSharedRef(result.person_ref);
      const link = document.createElement('a');
      link.className = 'relational-search__result-name';
      link.textContent = result.display_name;
      link.href = parsed?.kind === 'person' ? personRoute(parsed.id) : '#';
      item.append(link);

      const reasonsList = document.createElement('ul');
      reasonsList.className = 'relational-search__result-reasons';
      for (const reason of result.matched_reasons) {
        reasonsList.append(el('li', undefined, reason));
      }
      item.append(reasonsList);
      resultsList.append(item);
    }
  }

  async function runSearch(): Promise<void> {
    if (!hasAnyFilter() || destroyed) return;
    statusEl.hidden = false;
    statusEl.textContent = 'Searching…';
    resultsList.replaceChildren();
    submitBtn.disabled = true;
    try {
      const response = await searchRelationally({
        organisation_ref: selectedOrgRef ?? undefined,
        role: roleSelect.value || undefined,
        text: textInput.value.trim() || undefined
      });
      if (destroyed) return;
      renderResults(response.results);
    } catch (err) {
      if (destroyed) return;
      statusEl.hidden = false;
      statusEl.textContent = messageForSearchFailure(err);
    } finally {
      if (!destroyed) submitBtn.disabled = !hasAnyFilter();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void runSearch();
  });

  updateSubmitState();

  form.append(orgField, roleField, textField, validationMessage, submitBtn);
  container.append(form, statusEl, resultsList);

  return {
    destroy() {
      destroyed = true;
      orgPickerHandle?.destroy();
    }
  };
}
