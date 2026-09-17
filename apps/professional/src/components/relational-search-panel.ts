import { mountEntitySearch, type EntitySearchHandle } from './entity-search';
import { askRelationalSearchQuestion, fetchRelationshipRegistry, searchRelationally } from '@/api/relational-search';
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

/** Mirrors `person-brief.ts`'s established "not configured" pattern for a
 * 503 `people_anthropic_unbound` — an honest, non-scary message rather
 * than a generic server error, for the equivalent 503 this endpoint uses
 * (`people_relational_search_nl_unbound`). */
function messageForNlFailure(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'people_relational_search_nl_unbound') return 'Ask-a-question search is not configured.';
    if (err.code === 'unauthenticated' || err.status === 401) return 'Your session expired. Refresh and sign in again.';
    if (err.code === 'network_error' || err.code === 'timeout') return 'Could not reach the network. Try again.';
    if (err.code === 'relational_search_nl_plan_failed') return 'Could not understand that question. Try rephrasing it.';
    return 'The server could not complete this search. Try again.';
  }
  return 'The server could not complete this search. Try again.';
}

/** Shared by both the structured (Layer 1) and "Ask a question" (Layer 2)
 * modes — the result list shape (`{person_ref, display_name,
 * matched_reasons}`) and its rendering are identical either way, so this
 * is reused rather than duplicated (per the task's explicit instruction).
 */
function renderResultsInto(resultsList: HTMLUListElement, statusEl: HTMLElement, results: RelationalSearchResult[]): void {
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

/** Builds the "resolved filter interpretation" transparency line for a
 * plan response — this app's established "never opaque" principle means
 * the natural-language mode must show what it actually understood the
 * question to mean, not just silently return results. */
function describePlanInterpretation(plan: {
  organisation_name: string;
  organisation_matched: boolean;
  role: string;
  text: string;
}): string {
  const parts: string[] = [];
  if (plan.organisation_name) {
    parts.push(
      plan.organisation_matched
        ? `organisation = ${plan.organisation_name}`
        : `organisation "${plan.organisation_name}" (no match found)`
    );
  }
  if (plan.role) parts.push(`role = ${plan.role}`);
  if (plan.text) parts.push(`text contains "${plan.text}"`);
  return parts.length ? `Searching: ${parts.join(', ')}` : 'No structured filter could be understood from that question.';
}

/**
 * Relational Search (Phase 3, Feature 3.3, layer 1; Phase 5, layer 2).
 * This is a second, different search surface from `mountEntitySearch`'s
 * name/label lookup (still used by "Search by name" in `people-home.ts`'s
 * outer mode toggle) — see `SOURCE-BRIEF.md` section 45. Internally this
 * component itself now has TWO sub-modes, switched by its own tab bar:
 *
 *   - "Structured filters" (Layer 1, unchanged): organisation / role /
 *     text filters, ANDed together. The organisation filter reuses
 *     `mountEntitySearch` itself (scoped to `kinds: 'organisation'`) as a
 *     small embedded picker, per the task's explicit decision, rather
 *     than inventing a name-to-ref resolution path server-side.
 *   - "Ask a question" (Layer 2, Phase 5): a single free-text question,
 *     sent to `POST /api/people/relational-search?action=plan`, which
 *     plans AND executes in one call. The resolved filter interpretation
 *     is shown before the results (transparency), and results reuse the
 *     exact same `renderResultsInto` as the structured mode.
 *
 * (The outer "Search by name" vs "Relational search" toggle in
 * `people-home.ts` is a separate, higher-level mode switch; this
 * component's own internal tab bar is a second-level switch scoped to
 * relational search's two query styles — documented here since the task
 * text describes them together as "three modes".)
 */
export function mountRelationalSearchPanel(container: HTMLElement): RelationalSearchPanelHandle {
  container.replaceChildren();
  container.classList.add('relational-search');

  let destroyed = false;
  let selectedOrgRef: string | null = null;
  let orgPickerHandle: EntitySearchHandle | null = null;

  // --- Sub-mode tab bar (Structured filters / Ask a question) ---------
  const subModeTablist = el('div', 'hub-pills relational-search__submodes');
  subModeTablist.setAttribute('role', 'tablist');
  subModeTablist.setAttribute('aria-label', 'Relational search mode');
  const structuredModeBtn = document.createElement('button');
  structuredModeBtn.type = 'button';
  structuredModeBtn.className = 'hub-pills__btn relational-search__submode-tab';
  structuredModeBtn.textContent = 'Structured filters';
  structuredModeBtn.setAttribute('role', 'tab');
  const nlModeBtn = document.createElement('button');
  nlModeBtn.type = 'button';
  nlModeBtn.className = 'hub-pills__btn relational-search__submode-tab';
  nlModeBtn.textContent = 'Ask a question';
  nlModeBtn.setAttribute('role', 'tab');
  subModeTablist.append(structuredModeBtn, nlModeBtn);

  const structuredPanel = el('div', 'relational-search__submode-panel');
  const nlPanel = el('div', 'relational-search__submode-panel relational-search__nl-panel');
  nlPanel.hidden = true;

  function activateSubMode(mode: 'structured' | 'nl'): void {
    const isStructured = mode === 'structured';
    structuredPanel.hidden = !isStructured;
    nlPanel.hidden = isStructured;
    structuredModeBtn.classList.toggle('is-active', isStructured);
    structuredModeBtn.setAttribute('aria-selected', String(isStructured));
    nlModeBtn.classList.toggle('is-active', !isStructured);
    nlModeBtn.setAttribute('aria-selected', String(!isStructured));
  }

  structuredModeBtn.addEventListener('click', () => activateSubMode('structured'));
  nlModeBtn.addEventListener('click', () => activateSubMode('nl'));

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
      renderResultsInto(resultsList, statusEl, response.results);
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
  structuredPanel.append(form, statusEl, resultsList);

  // --- "Ask a question" (Layer 2, Phase 5) -----------------------------
  const nlForm = el('form', 'relational-search__nl-form');
  nlForm.noValidate = true;

  const nlLabelId = `relational-search-nl-${Math.random().toString(36).slice(2, 8)}`;
  const nlLabelEl = el('label', 'relational-search__label sign-in__label', 'Ask a question');
  nlLabelEl.htmlFor = nlLabelId;
  const nlInput = document.createElement('input');
  nlInput.id = nlLabelId;
  nlInput.type = 'text';
  nlInput.className = 'relational-search__nl-input';
  nlInput.placeholder = 'e.g. Who do I know at UNSW connected to gifted education?';

  const nlSubmitBtn = document.createElement('button');
  nlSubmitBtn.type = 'submit';
  nlSubmitBtn.className = 'btn btn--primary relational-search__nl-submit';
  nlSubmitBtn.textContent = 'Ask';
  nlSubmitBtn.disabled = true;

  nlInput.addEventListener('input', () => {
    nlSubmitBtn.disabled = !nlInput.value.trim();
  });

  const nlInterpretation = el('p', 'relational-search__nl-interpretation');
  nlInterpretation.hidden = true;

  const nlStatusEl = el('p', 'relational-search__nl-status');
  nlStatusEl.hidden = true;

  const nlResultsList = document.createElement('ul');
  nlResultsList.className = 'relational-search__results relational-search__nl-results';

  async function runNlSearch(): Promise<void> {
    const question = nlInput.value.trim();
    if (!question || destroyed) return;
    nlInterpretation.hidden = true;
    nlStatusEl.hidden = false;
    nlStatusEl.textContent = 'Thinking…';
    nlResultsList.replaceChildren();
    nlSubmitBtn.disabled = true;
    try {
      const plan = await askRelationalSearchQuestion(question);
      if (destroyed) return;
      nlStatusEl.hidden = true;
      nlInterpretation.hidden = false;
      nlInterpretation.textContent = plan.unsupported
        ? `This question needs more than organisation/role/keyword filters can express${plan.unsupported_reason ? `: ${plan.unsupported_reason}` : '.'}`
        : describePlanInterpretation(plan);
      renderResultsInto(nlResultsList, nlStatusEl, plan.results);
    } catch (err) {
      if (destroyed) return;
      nlStatusEl.hidden = false;
      nlStatusEl.textContent = messageForNlFailure(err);
    } finally {
      if (!destroyed) nlSubmitBtn.disabled = !nlInput.value.trim();
    }
  }

  nlForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void runNlSearch();
  });

  nlForm.append(nlLabelEl, nlInput, nlSubmitBtn);
  nlPanel.append(nlForm, nlInterpretation, nlStatusEl, nlResultsList);

  activateSubMode('structured');

  container.append(subModeTablist, structuredPanel, nlPanel);

  return {
    destroy() {
      destroyed = true;
      orgPickerHandle?.destroy();
    }
  };
}
