import { mountEntitySearch, type EntitySearchHandle } from '@/components/entity-search';
import { mountRelationalSearchPanel, type RelationalSearchPanelHandle } from '@/components/relational-search-panel';
import { mountAddPersonForm } from '@/components/add-person-form';
import { fetchPeopleActivity, fetchPeopleCohorts, fetchPeopleHomeSignals } from '@/api/people-home';
import { organisationRoute, personRoute } from '@/app/router';
import { parseSharedRef } from '@/domain/ids';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type {
  DormantReviewEntry,
  DynamicCohort,
  NewConnectionEntry,
  PeopleActivityItem,
  PeopleHomeSignalCounts,
  ReconnectSuggestion,
  RelationshipChangeEntry,
  RelationshipCounterpart
} from '@/domain/types';

export interface PeopleHomeOptions {
  isCurrent?: () => boolean;
}

const ACTIVITY_PAGE_LIMIT = 25;

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

/** Links a `{ref, display_name}` counterpart to its Person page when the ref
 * resolves to a person; falls back to plain text for anything else (an
 * organisation ref, or an unresolved ref) rather than guessing a route. */
function counterpartNode(counterpart: RelationshipCounterpart): HTMLElement {
  const parsed = parseSharedRef(counterpart.ref);
  const label = counterpart.display_name ?? counterpart.ref;
  if (parsed?.kind === 'person') {
    const link = document.createElement('a');
    link.href = personRoute(parsed.id);
    link.textContent = label;
    return link;
  }
  return el('span', undefined, label);
}

function personLinkFromRef(ref: string, displayName: string | null): HTMLElement {
  const parsed = parseSharedRef(ref);
  const label = displayName ?? ref;
  if (parsed?.kind === 'person') {
    const link = document.createElement('a');
    link.href = personRoute(parsed.id);
    link.textContent = label;
    return link;
  }
  return el('span', undefined, label);
}

function formatActiveSharedContexts(count: number): string {
  return count === 1 ? '1 active shared context remains.' : `${count} active shared contexts remain.`;
}

function formatDaysSince(days: number | null): string {
  if (days === null) return 'No prior interaction on record.';
  if (days === 0) return 'Last meaningful interaction was today.';
  if (days === 1) return 'Last meaningful interaction was 1 day ago.';
  return `Last meaningful interaction was ${days} days ago.`;
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  opened: 'Started',
  closed: 'Ended',
  role_changed: 'Role changed'
};

/** Builds the static header row: title, subtitle, Add person, Search. The
 * Search action reveals/mounts `mountEntitySearch` (the reusable widget
 * Phase 1's plain search page used) in a collapsible panel rather than a
 * separate page — Decision (a) recorded in PHASE-1-PROGRESS.md / the task
 * brief: People Home is the entry point, search becomes a header action. */
function buildHeader(): HTMLElement {
  const header = el('div', 'people-home__header');
  const copy = el('div', 'people-home__header-copy');
  copy.append(
    el('h1', 'people-home__title', 'People'),
    el('p', 'people-home__subtitle', 'Your professional relationships, activity and network.')
  );

  const actions = el('div', 'people-home__header-actions');

  // Rapid Person Capture (SOURCE-BRIEF.md section 5). The status paragraph
  // is reused for post-submit warnings (a link/observation write that
  // failed after the person itself was created successfully) rather than
  // adding a second element — there is only ever one outstanding message
  // at a time here.
  const addPersonStatus = el('p', 'people-home__add-person-status');
  addPersonStatus.hidden = true;
  const addPersonStatusId = 'people-home-add-person-status';
  addPersonStatus.id = addPersonStatusId;

  const addPersonPanel = el('div', 'people-home__add-person-panel');
  addPersonPanel.hidden = true;
  let addPersonMounted: { focusName: () => void } | null = null;

  const addPerson = document.createElement('button');
  addPerson.type = 'button';
  addPerson.className = 'btn btn--primary people-home__add-person';
  addPerson.textContent = 'Add person';
  addPerson.setAttribute('aria-describedby', addPersonStatusId);
  addPerson.setAttribute('aria-expanded', 'false');
  addPerson.addEventListener('click', () => {
    const opening = addPersonPanel.hidden;
    addPersonPanel.hidden = !opening;
    addPerson.setAttribute('aria-expanded', String(opening));
    if (!opening) return;
    addPersonStatus.hidden = true;
    if (!addPersonMounted) {
      addPersonMounted = mountAddPersonForm(addPersonPanel, {
        onCreated: ({ person, warnings }) => {
          const parsed = parseSharedRef(person.ref);
          if (warnings.length === 0) {
            if (parsed?.kind === 'person') location.hash = personRoute(parsed.id);
            return;
          }
          // A link/observation write failed after the person itself was
          // created — stay on the page and surface it, with a way to
          // still reach the new profile, rather than silently losing the
          // warning by navigating away.
          addPersonPanel.hidden = true;
          addPerson.setAttribute('aria-expanded', 'false');
          addPersonStatus.hidden = false;
          addPersonStatus.replaceChildren(document.createTextNode(`${warnings.join(' ')} `));
          if (parsed?.kind === 'person') {
            const link = document.createElement('a');
            link.href = personRoute(parsed.id);
            link.textContent = `Open ${person.display_name}’s profile`;
            addPersonStatus.append(link);
          }
        },
        onCancel: () => {
          addPersonPanel.hidden = true;
          addPerson.setAttribute('aria-expanded', 'false');
        }
      });
    }
    addPersonMounted.focusName();
  });

  const searchPanel = el('div', 'people-home__search-panel');
  searchPanel.hidden = true;
  let searchHandle: EntitySearchHandle | null = null;
  let relationalSearchHandle: RelationalSearchPanelHandle | null = null;

  // Two search modes sharing one panel: "Search by name" (Phase 1's
  // MiniSearch-backed name/label lookup, unchanged) and "Relational
  // search" (Phase 3, Feature 3.3 layer 1 — structured organisation/
  // role/text filters). They are a genuinely different query shape (see
  // `SOURCE-BRIEF.md` section 45's "who do I know at UNSW connected to
  // gifted education" example, which a name search cannot answer), not
  // a restyle of the same widget — hence a mode toggle rather than
  // merging them into one input.
  const modeTablist = el('div', 'hub-pills people-home__search-modes');
  modeTablist.setAttribute('role', 'tablist');
  modeTablist.setAttribute('aria-label', 'Search mode');

  const nameSearchContainer = el('div', 'people-home__search-mode-panel');
  const relationalSearchContainer = el('div', 'people-home__search-mode-panel');
  relationalSearchContainer.hidden = true;

  const nameModeButton = document.createElement('button');
  nameModeButton.type = 'button';
  nameModeButton.className = 'hub-pills__btn people-home__search-mode-tab';
  nameModeButton.textContent = 'Search by name';
  nameModeButton.setAttribute('role', 'tab');

  const relationalModeButton = document.createElement('button');
  relationalModeButton.type = 'button';
  relationalModeButton.className = 'hub-pills__btn people-home__search-mode-tab';
  relationalModeButton.textContent = 'Relational search';
  relationalModeButton.setAttribute('role', 'tab');

  function activateMode(mode: 'name' | 'relational'): void {
    const isName = mode === 'name';
    nameSearchContainer.hidden = !isName;
    relationalSearchContainer.hidden = isName;
    nameModeButton.setAttribute('aria-selected', String(isName));
    nameModeButton.classList.toggle('is-active', isName);
    relationalModeButton.setAttribute('aria-selected', String(!isName));
    relationalModeButton.classList.toggle('is-active', !isName);

    if (isName && !searchHandle) {
      searchHandle = mountEntitySearch(nameSearchContainer, {
        kinds: 'person,organisation',
        label: 'Search people and organisations',
        placeholder: 'Search by name',
        emptyHint: 'Search for a person or organisation by name.',
        onSelect: (result) => {
          const parsed = parseSharedRef(result.ref);
          if (parsed?.kind === 'person') location.hash = personRoute(parsed.id);
          else if (parsed?.kind === 'organisation') location.hash = organisationRoute(parsed.id);
        }
      });
    }
    if (!isName && !relationalSearchHandle) {
      relationalSearchHandle = mountRelationalSearchPanel(relationalSearchContainer);
    }
    searchPanel.querySelector<HTMLInputElement>(`${isName ? '.entity-search__input' : '.relational-search__text-input'}`)?.focus();
  }

  nameModeButton.addEventListener('click', () => activateMode('name'));
  relationalModeButton.addEventListener('click', () => activateMode('relational'));
  modeTablist.append(nameModeButton, relationalModeButton);

  let panelInitialized = false;
  const searchButton = document.createElement('button');
  searchButton.type = 'button';
  searchButton.className = 'btn btn--secondary people-home__search-toggle';
  searchButton.textContent = 'Search';
  searchButton.setAttribute('aria-expanded', 'false');
  searchButton.addEventListener('click', () => {
    const opening = searchPanel.hidden;
    searchPanel.hidden = !opening;
    searchButton.setAttribute('aria-expanded', String(opening));
    if (!opening) return;
    // Default to "Search by name" the first time the panel opens; a
    // later reopen keeps whichever mode the operator last had active
    // rather than resetting it.
    if (!panelInitialized) {
      panelInitialized = true;
      activateMode('name');
    } else {
      searchPanel
        .querySelector<HTMLInputElement>(
          relationalSearchContainer.hidden ? '.entity-search__input' : '.relational-search__text-input'
        )
        ?.focus();
    }
  });

  searchPanel.append(modeTablist, nameSearchContainer, relationalSearchContainer);
  actions.append(addPerson, searchButton);
  header.append(copy, actions, addPersonStatus, addPersonPanel, searchPanel);
  return header;
}

const SIGNAL_LABELS: Array<{ key: keyof PeopleHomeSignalCounts; label: string }> = [
  { key: 'active_relationships', label: 'Active relationships' },
  { key: 'upcoming_interactions', label: 'Upcoming interactions' },
  { key: 'recent_relationship_changes', label: 'Recent relationship changes' },
  { key: 'current_opportunity_windows', label: 'Current opportunity windows' }
];

/** Four plain count cards — "descriptive rather than evaluative" per brief
 * section 4, so no colour-coded good/bad styling, just a label and a
 * number. */
function renderSignals(host: HTMLElement, signals: PeopleHomeSignalCounts): void {
  host.replaceChildren();
  for (const { key, label } of SIGNAL_LABELS) {
    const value = signals[key];
    const card = el('div', 'people-home__signal-card');
    card.setAttribute('aria-label', `${label}: ${value}`);
    card.append(el('p', 'people-home__signal-label', label), el('p', 'people-home__signal-value', String(value)));
    host.append(card);
  }
}

function renderReconnectModule(host: HTMLElement, suggestions: ReconnectSuggestion[]): void {
  host.replaceChildren();
  host.append(el('h2', 'people-home__module-heading', 'Reconnect suggestions'));
  if (!suggestions.length) {
    host.append(el('p', 'empty-state', 'No reconnect suggestions right now.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'people-home__list';
  for (const suggestion of suggestions) {
    const item = document.createElement('li');
    item.className = 'people-home__list-item';
    item.append(personLinkFromRef(suggestion.person_ref, suggestion.display_name));

    if (suggestion.reasons.length) {
      const reasons = document.createElement('ul');
      reasons.className = 'people-home__reasons';
      for (const reason of suggestion.reasons) {
        reasons.append(el('li', undefined, reason));
      }
      item.append(reasons);
    }

    item.append(el('p', 'people-home__meta', formatDaysSince(suggestion.days_since_last_interaction)));
    if (suggestion.active_shared_contexts > 0) {
      item.append(el('p', 'people-home__meta', formatActiveSharedContexts(suggestion.active_shared_contexts)));
    }
    list.append(item);
  }
  host.append(list);
}

function renderRecentChangesModule(host: HTMLElement, changes: RelationshipChangeEntry[]): void {
  host.replaceChildren();
  host.append(el('h2', 'people-home__module-heading', 'Recent relationship changes'));
  if (!changes.length) {
    host.append(el('p', 'empty-state', 'No recent relationship changes.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'people-home__list';
  for (const change of changes) {
    const item = document.createElement('li');
    item.className = 'people-home__list-item';
    item.append(counterpartNode(change.source), document.createTextNode(' ↔ '), counterpartNode(change.target));
    const label = CHANGE_TYPE_LABEL[change.change_type] ?? change.change_type;
    const metaBits = [label, change.human_label ?? change.role, formatDisplayDate(change.changed_at)].filter(
      (bit): bit is string => Boolean(bit)
    );
    item.append(el('p', 'people-home__meta', metaBits.join(' · ')));
    list.append(item);
  }
  host.append(list);
}

function renderNewConnectionsModule(host: HTMLElement, connections: NewConnectionEntry[]): void {
  host.replaceChildren();
  host.append(el('h2', 'people-home__module-heading', 'New connections'));
  if (!connections.length) {
    host.append(el('p', 'empty-state', 'No new connections recently.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'people-home__list';
  for (const connection of connections) {
    const item = document.createElement('li');
    item.className = 'people-home__list-item';
    item.append(personLinkFromRef(connection.ref, connection.display_name));
    item.append(el('p', 'people-home__meta', `Connected ${formatDisplayDate(connection.created_at)}`));
    list.append(item);
  }
  host.append(list);
}

function renderDormantModule(host: HTMLElement, dormant: DormantReviewEntry[]): void {
  host.replaceChildren();
  host.append(el('h2', 'people-home__module-heading', 'Dormant relationships worth reviewing'));
  if (!dormant.length) {
    host.append(el('p', 'empty-state', 'No dormant relationships to review.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'people-home__list';
  for (const entry of dormant) {
    const item = document.createElement('li');
    item.className = 'people-home__list-item';
    // The endpoint reports both sides of the link, not a pre-picked
    // "counterpart" (unlike reconnect_suggestions) — there is no is_self
    // flag on either side in this payload to determine which one to treat
    // as the operator, so both sides are linked rather than guessing.
    item.append(counterpartNode(entry.source), document.createTextNode(' ↔ '), counterpartNode(entry.target));
    if (entry.reasons.length) {
      const reasons = document.createElement('ul');
      reasons.className = 'people-home__reasons';
      for (const reason of entry.reasons) reasons.append(el('li', undefined, reason));
      item.append(reasons);
    }
    item.append(el('p', 'people-home__meta', formatDaysSince(entry.days_since_last_interaction)));
    list.append(item);
  }
  host.append(list);
}

function renderCohorts(host: HTMLElement, cohorts: DynamicCohort[]): void {
  host.replaceChildren();
  host.append(el('h2', 'people-home__module-heading', 'Dynamic Cohorts'));
  if (!cohorts.length) {
    host.append(el('p', 'empty-state', 'No shared-context cohorts detected yet.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'people-home__cohort-list';
  for (const cohort of cohorts) {
    const chip = document.createElement('li');
    chip.className = 'people-home__cohort';
    chip.append(
      el('p', 'people-home__cohort-label', cohort.label),
      el('p', 'people-home__cohort-count', `${cohort.members.length} member${cohort.members.length === 1 ? '' : 's'}`)
    );
    if (cohort.members.length) {
      const members = document.createElement('ul');
      members.className = 'people-home__cohort-members';
      for (const member of cohort.members) {
        const memberItem = document.createElement('li');
        memberItem.append(personLinkFromRef(member.ref, member.display_name));
        members.append(memberItem);
      }
      chip.append(members);
    }
    list.append(chip);
  }
  host.append(list);
}

function renderActivityItems(list: HTMLElement, items: PeopleActivityItem[]): void {
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'people-home__activity-item';
    if (item.href) {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      li.append(link);
    } else {
      li.append(el('span', undefined, item.label));
    }
    const date = formatDisplayDate(item.date);
    if (date) li.append(el('p', 'people-home__meta', date));
    list.append(li);
  }
}

/**
 * Renders People Home (Phase 2, Feature 2.1): four signal cards, the four
 * People Today modules, Dynamic Cohorts, and a Recent Activity strip.
 * "Upcoming meetings and events" and "Newly detected organisation changes"
 * (brief section 4's other two modules) are deliberately absent — the
 * backend never built them (PHASE-1-PROGRESS.md Phase 2 decision #11), so
 * there is no data to render here; not a client-side omission.
 *
 * The three aggregation fetches (home-signals, cohorts, activity) are each
 * independent: none awaits another before starting, so they run in
 * parallel, and a single section's `renderLoadError` never blocks the
 * other two from rendering their own successful data.
 */
export async function renderPeopleHomeView(canvas: HTMLElement, options: PeopleHomeOptions = {}): Promise<void> {
  canvas.replaceChildren();
  const isCurrent = () => options.isCurrent?.() ?? true;

  const root = el('div', 'people-home');
  const header = buildHeader();

  const signalsHost = el('section', 'people-home__signals');
  signalsHost.setAttribute('aria-label', 'Signals');

  const todayHost = el('section', 'people-home__today');
  todayHost.setAttribute('aria-label', 'People Today');
  const reconnectHost = el('div', 'people-home__module');
  const recentChangesHost = el('div', 'people-home__module');
  const newConnectionsHost = el('div', 'people-home__module');
  const dormantHost = el('div', 'people-home__module');
  todayHost.append(reconnectHost, recentChangesHost, newConnectionsHost, dormantHost);

  const cohortsHost = el('section', 'people-home__cohorts');
  cohortsHost.setAttribute('aria-label', 'Dynamic Cohorts');

  const activitySection = el('section', 'people-home__activity');
  activitySection.setAttribute('aria-label', 'Recent Activity');
  activitySection.append(el('h2', 'people-home__module-heading', 'Recent Activity'));
  const activityListHost = el('div', 'people-home__activity-body');
  const loadMore = document.createElement('button');
  loadMore.type = 'button';
  loadMore.className = 'btn btn--secondary people-home__load-more';
  loadMore.textContent = 'Load more';
  loadMore.hidden = true;
  activitySection.append(activityListHost, loadMore);

  root.append(header, signalsHost, todayHost, cohortsHost, activitySection);
  canvas.append(root);

  showViewLoading(signalsHost, 'Loading signals…');
  showViewLoading(todayHost, 'Loading…');
  showViewLoading(cohortsHost, 'Loading cohorts…');
  showViewLoading(activityListHost, 'Loading activity…');

  async function loadSignals(): Promise<void> {
    showViewLoading(signalsHost, 'Loading signals…');
    showViewLoading(todayHost, 'Loading…');
    try {
      const data = await fetchPeopleHomeSignals();
      if (!isCurrent()) return;
      renderSignals(signalsHost, data.signals);
      todayHost.replaceChildren(reconnectHost, recentChangesHost, newConnectionsHost, dormantHost);
      renderReconnectModule(reconnectHost, data.reconnect_suggestions);
      renderRecentChangesModule(recentChangesHost, data.recent_changes);
      renderNewConnectionsModule(newConnectionsHost, data.new_connections);
      renderDormantModule(dormantHost, data.dormant_for_review);
    } catch (err) {
      if (!isCurrent()) return;
      renderLoadError(signalsHost, err, () => void loadSignals());
      renderLoadError(todayHost, err, () => void loadSignals());
    }
  }

  async function loadCohorts(): Promise<void> {
    showViewLoading(cohortsHost, 'Loading cohorts…');
    try {
      const data = await fetchPeopleCohorts();
      if (!isCurrent()) return;
      renderCohorts(cohortsHost, data.cohorts);
    } catch (err) {
      if (!isCurrent()) return;
      renderLoadError(cohortsHost, err, () => void loadCohorts());
    }
  }

  let nextCursor: string | null = null;

  function renderActivityEmptyOrList(items: PeopleActivityItem[]): void {
    activityListHost.replaceChildren();
    if (!items.length) {
      // "No relationship events recorded yet." is SOURCE-BRIEF.md section
      // 50's exact "Empty Timeline" copy for the Person Profile Timeline
      // tab. Recent Activity is the page-level aggregate of that same
      // concept (a union of per-person timeline entries, per
      // PHASE-1-PROGRESS.md decision #13) with no data of its own when
      // empty, so the same copy is reused here rather than inventing a
      // second string for what is, structurally, the same "no events yet"
      // case.
      activityListHost.append(el('p', 'empty-state', 'No relationship events recorded yet.'));
      return;
    }
    const list = document.createElement('ul');
    list.className = 'people-home__activity-list';
    renderActivityItems(list, items);
    activityListHost.append(list);
  }

  async function loadActivity(since: string | null): Promise<void> {
    if (since === null) showViewLoading(activityListHost, 'Loading activity…');
    else loadMore.disabled = true;
    try {
      const data = await fetchPeopleActivity({ since: since ?? undefined, limit: ACTIVITY_PAGE_LIMIT });
      if (!isCurrent()) return;
      nextCursor = data.next_cursor;
      if (since === null) {
        renderActivityEmptyOrList(data.items);
      } else {
        let list = activityListHost.querySelector<HTMLElement>('.people-home__activity-list');
        if (!list) {
          list = document.createElement('ul');
          list.className = 'people-home__activity-list';
          activityListHost.replaceChildren(list);
        }
        renderActivityItems(list, data.items);
      }
      loadMore.hidden = !nextCursor;
      loadMore.disabled = false;
    } catch (err) {
      if (!isCurrent()) return;
      if (since === null) {
        renderLoadError(activityListHost, err, () => void loadActivity(null));
      } else {
        loadMore.disabled = false;
      }
    }
  }

  loadMore.addEventListener('click', () => {
    if (nextCursor) void loadActivity(nextCursor);
  });

  // Fire all three independently — none awaits another, so they run in
  // parallel — but await their combined settlement before this function
  // itself resolves, so a caller (main.ts, tests) can rely on `await
  // renderPeopleHomeView(...)` meaning "the page has finished its initial
  // load," matching every other async view in this app. Each loader
  // catches its own errors internally (via `renderLoadError`), so none of
  // these ever rejects — `Promise.all` never short-circuits on a single
  // section's failure.
  await Promise.all([loadSignals(), loadCohorts(), loadActivity(null)]);
}
