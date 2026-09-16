import { renderRelationshipList, type TabDef } from '@/components/entity-detail';
import { renderRelationshipTimeline } from '@/components/relationship-timeline';
import { classifyRelationshipState, type RelationshipStateInput } from '@/domain/relationship-state';
import type { EntityOverview, PersonRecord, RelationshipEndpoint, RelationshipEntry } from '@/domain/types';

/**
 * The five Person Profile tabs (Feature 1.2). Observations and Evidence are
 * a separate, already-planned follow-up (they need new server data / a new
 * pure-function module that doesn't exist yet) — this array is the clean
 * extension point for that task to append two more `TabDef`s to.
 */
export function buildPersonTabs(onRoleChanged: () => void): TabDef[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      render: (host, overview) => renderOverviewTab(host, overview, onRoleChanged)
    },
    {
      id: 'timeline',
      label: 'Timeline',
      render: (host, overview) => renderTimelineTab(host, overview)
    },
    {
      id: 'shared-work',
      label: 'Shared Work',
      render: (host, overview) => renderSharedWorkTab(host, overview)
    },
    {
      id: 'network',
      label: 'Network',
      render: (host, overview) => renderNetworkTab(host, overview)
    },
    {
      id: 'history',
      label: 'History',
      render: (host, overview) => renderHistoryTab(host, overview)
    }
  ];
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

const STATE_LABELS: Record<string, string> = {
  active: 'Active',
  cooling: 'Cooling',
  dormant: 'Dormant',
  reactivated: 'Reactivated',
  new: 'New'
};

/**
 * Overview tab: today's "Current relationships" section content, plus
 * Feature 1.3's human relationship labels and Relationship Activity State
 * word for each `professional_relationship` entry. The person header
 * (sort name / "Self" indicator) is rendered once, above the tab bar,
 * by `EntityDetailConfig.renderExtraFields` — it applies to every tab, not
 * just this one, so it is not duplicated here.
 */
function renderOverviewTab(host: HTMLElement, overview: EntityOverview, onRoleChanged: () => void): void {
  host.replaceChildren();
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Current relationships'));
  const listHost = el('div');
  section.append(listHost);

  renderRelationshipList(listHost, overview.current_relationships, 'No current relationships.', {
    editableRoles: true,
    onRoleChanged
  });
  augmentProfessionalRelationships(listHost, overview);

  host.append(section);
}

// `renderRelationshipList` renders one `<li>` per entry, in the same order
// as `overview.current_relationships` — walking both in lockstep lets this
// stay a pure addition on top of the shared renderer rather than a fork of
// it, so role editing (including for the new `professional_relationship`
// type) keeps working with zero duplicated logic.
function augmentProfessionalRelationships(listHost: HTMLElement, overview: EntityOverview): void {
  const items = listHost.querySelectorAll('li');
  overview.current_relationships.forEach((entry, index) => {
    if (entry.link.relationship_type !== 'professional_relationship') return;
    const li = items[index];
    if (!li) return;

    const humanLabel = entry.link.metadata?.human_label;
    if (typeof humanLabel === 'string' && humanLabel) {
      li.append(document.createTextNode(' · '), el('span', 'entity-detail__human-label', humanLabel));
    }

    const { state, reasons } = classifyRelationshipState(deriveRelationshipStateInput(entry, overview));
    const stateLabel = STATE_LABELS[state] ?? state;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn--ghost entity-detail__state-toggle';
    toggle.textContent = stateLabel;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `${stateLabel} — why?`);

    const reasonsEl = el('p', 'entity-detail__state-reasons', reasons.join(' '));
    reasonsEl.hidden = true;

    // A plain disclosure button, per Principle 6 (the build plan's "never
    // render the state word without exposing why on interaction"): reasons
    // are hidden until the person asks for them, never a tooltip/hover-only
    // affordance.
    toggle.addEventListener('click', () => {
      reasonsEl.hidden = !reasonsEl.hidden;
      toggle.setAttribute('aria-expanded', String(!reasonsEl.hidden));
    });

    li.append(document.createTextNode(' · '), toggle, reasonsEl);
  });
}

// Minimal-but-honest mapping from what `EntityOverview` actually has today
// to `RelationshipStateInput` — documented simplifications (Feature 1.6
// integration, not a new capability):
//  - lastMeaningfulInteraction/previousMeaningfulInteraction: the two most
//    recent timeline entries that involve this relationship's counterpart
//    person — matched on EITHER `source_ref` or `target_ref`, since a
//    timeline entry's underlying link can have the counterpart on either
//    side (e.g. a direct person-to-person link records whichever side was
//    "known first" as `source_ref`, per Feature 1.1's direction
//    convention — not tied to interaction recency — while a Task/
//    Communication/Meeting/Event-derived entry's `source_ref` is that
//    record itself, never the counterpart). Matching only `source_ref`
//    left `matches` empty for nearly every real relationship, so this
//    checks both fields. `overview.timeline` is already sorted newest
//    first by the server.
//  - upcomingInteraction: always null — no upcoming-interaction data source
//    exists yet in `EntityOverview`. Follow-up: surface scheduled
//    meetings/events involving this counterpart.
//  - activeSharedContexts: always 0 — no shared-context count exists yet in
//    `EntityOverview`. Follow-up: derive from shared current relationships/
//    active linked records.
function deriveRelationshipStateInput(entry: RelationshipEntry, overview: EntityOverview): RelationshipStateInput {
  const counterpartRef = entry.endpoint.ref;
  const matches = overview.timeline.filter(
    (item) => item.source_ref === counterpartRef || item.target_ref === counterpartRef
  );
  return {
    lastMeaningfulInteraction: matches[0]?.date ?? null,
    previousMeaningfulInteraction: matches[1]?.date ?? null,
    upcomingInteraction: null,
    activeSharedContexts: 0,
    personCreatedAt: (overview.entity as PersonRecord).created_at
  };
}

function renderTimelineTab(host: HTMLElement, overview: EntityOverview): void {
  host.replaceChildren();
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Relationship timeline'));
  const timelineHost = el('div');
  section.append(timelineHost);
  renderRelationshipTimeline(timelineHost, overview.timeline);
  host.append(section);
}

// Direct port of today's "Linked activity" section — flattens
// tasks/communications/meetings/events/applications into one list.
function renderSharedWorkTab(host: HTMLElement, overview: EntityOverview): void {
  host.replaceChildren();
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Linked activity'));
  const activityHost = el('div');
  section.append(activityHost);

  const activityBits: Array<{ label: string; href: string | null }> = [];
  for (const item of overview.linked_records.communications) {
    activityBits.push({ label: `Communication · ${item.display_label}`, href: item.href });
  }
  for (const item of overview.linked_records.tasks) {
    activityBits.push({ label: `Task · ${item.display_label}`, href: item.href });
  }
  for (const item of overview.linked_records.meetings ?? []) {
    activityBits.push({ label: `Meeting · ${item.display_label}`, href: item.href });
  }
  for (const item of overview.linked_records.events ?? []) {
    activityBits.push({ label: `Event · ${item.display_label}`, href: item.href });
  }
  for (const item of overview.linked_records.applications ?? []) {
    activityBits.push({ label: `Application · ${item.display_label}`, href: item.href });
  }

  if (!activityBits.length) {
    activityHost.append(
      el('p', 'empty-state', 'No linked communications, tasks, meetings, events, or applications.')
    );
  } else {
    const list = document.createElement('ul');
    list.className = 'entity-detail__relationship-list';
    for (const bit of activityBits) {
      const item = document.createElement('li');
      if (bit.href) {
        const link = document.createElement('a');
        link.href = bit.href;
        link.textContent = bit.label;
        item.append(link);
      } else {
        item.textContent = bit.label;
      }
      list.append(item);
    }
    activityHost.append(list);
  }

  host.append(section);
}

// Network tab scoping decision: renders `linked_records.people` and
// `.organisations` — the two arrays the server has always returned in
// `EntityOverview` but that no existing UI rendered. Zero new server calls;
// same single fetch as every other tab.
//
// Known overlap, not a bug: these two lists are built from the same
// underlying `entries` array as Overview's current relationships and
// History's historical relationships (deduped only by ref, with no status/
// role context of their own) — so "Network" today largely just re-lists
// "everyone connected," current or historical, rather than a distinct
// notion of network. Left as-is for Phase 1; a later phase can decide
// whether to scope Network down to something narrower (e.g. current-only,
// or annotated with relationship status).
function renderNetworkTab(host: HTMLElement, overview: EntityOverview): void {
  host.replaceChildren();
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Network'));
  section.append(renderNetworkGroup('People', overview.linked_records.people, 'No linked people.'));
  section.append(
    renderNetworkGroup('Organisations', overview.linked_records.organisations, 'No linked organisations.')
  );
  host.append(section);
}

function renderNetworkGroup(heading: string, entries: RelationshipEndpoint[], emptyMessage: string): HTMLElement {
  const wrap = el('div', 'entity-detail__network-group');
  wrap.append(el('h3', 'entity-detail__subheading', heading));
  if (!entries.length) {
    wrap.append(el('p', 'empty-state', emptyMessage));
    return wrap;
  }
  const list = document.createElement('ul');
  list.className = 'entity-detail__relationship-list';
  for (const entry of entries) {
    const item = document.createElement('li');
    if (entry.href) {
      const link = document.createElement('a');
      link.href = entry.href;
      link.textContent = entry.display_label;
      item.append(link);
    } else {
      item.textContent = entry.display_label;
    }
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

// Direct port of today's "Historical relationships" section.
function renderHistoryTab(host: HTMLElement, overview: EntityOverview): void {
  host.replaceChildren();
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Historical relationships'));
  const listHost = el('div');
  section.append(listHost);
  renderRelationshipList(listHost, overview.historical_relationships, 'No historical relationships.');
  host.append(section);
}
