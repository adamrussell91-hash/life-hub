import type { TabDef } from '@/components/entity-detail';
import { fetchObservations } from '@/api/observations';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { computeCollectionGaps } from '@/domain/collection-gaps';
import { formatObservationDate, formatObservationSource } from '@/components/observations-tab';
import type { EntityOverview, ObservationRecord, RelationshipEntry } from '@/domain/types';

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

// Phase 1 scoping (per the build plan): the Evidence tab covers evidence
// about relationships and Observations only, never full per-identity-field
// provenance (Phase 5). A relationship's "evidence" is simply the link data
// already on `entry.link` — nothing fabricated, nothing fetched beyond what
// Overview/History already show through a different lens.
function relationshipEvidenceLine(entry: RelationshipEntry): string {
  const when = entry.link.valid_from ?? entry.link.occurred_at;
  const whenText = when ? formatObservationDate(when) : 'an unknown date';
  const contextText = entry.link.context_key ? `, context: ${entry.link.context_key}` : '';
  return `Evidence for ${entry.endpoint.display_label}: linked via ${entry.link.relationship_type}, since ${whenText}${contextText}`;
}

function observationEvidenceLine(observation: ObservationRecord): string {
  return `Evidence from an observation: "${observation.text}" — source: ${formatObservationSource(observation.source)}, occurred ${formatObservationDate(observation.occurred_at)}`;
}

function renderGapsSection(overview: EntityOverview, observations: ObservationRecord[]): HTMLElement {
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Collection gaps'));
  const gaps = computeCollectionGaps(overview, observations);
  if (!gaps.length) {
    section.append(el('p', 'empty-state', 'No collection gaps detected.'));
    return section;
  }
  const list = document.createElement('ul');
  list.className = 'entity-detail__gap-list';
  for (const gap of gaps) {
    const item = document.createElement('li');
    item.dataset.gapId = gap.id;
    item.textContent = gap.message;
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderEvidenceSection(overview: EntityOverview, observations: ObservationRecord[]): HTMLElement {
  const section = el('div', 'entity-detail__section');
  section.append(el('h2', 'entity-detail__heading', 'Evidence'));

  const relationshipEntries = [...overview.current_relationships, ...overview.historical_relationships];

  if (!relationshipEntries.length && !observations.length) {
    section.append(el('p', 'empty-state', 'No evidence recorded.'));
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'entity-detail__evidence-list';
  for (const entry of relationshipEntries) {
    list.append(el('li', 'entity-detail__evidence-item', relationshipEvidenceLine(entry)));
  }
  for (const observation of observations) {
    list.append(el('li', 'entity-detail__evidence-item', observationEvidenceLine(observation)));
  }
  section.append(list);
  return section;
}

/**
 * Like the Observations tab, Evidence does its own `fetchObservations` call
 * on activation (a separate tab activation, not a second fetch of the
 * shared `EntityOverview`) and must guard `ctx.isCurrent()` before mutating
 * `host` after the await.
 */
async function renderEvidenceTab(
  host: HTMLElement,
  overview: EntityOverview,
  ctx: { isCurrent: () => boolean }
): Promise<void> {
  const aboutRef = overview.entity.ref;

  async function load(): Promise<void> {
    showViewLoading(host, 'Loading evidence…');
    try {
      const result = await fetchObservations(aboutRef);
      if (!ctx.isCurrent()) return;
      renderLoaded(result.observations);
    } catch (err) {
      if (!ctx.isCurrent()) return;
      renderLoadError(host, err, () => void load());
    }
  }

  function renderLoaded(observations: ObservationRecord[]): void {
    host.replaceChildren();
    host.append(renderGapsSection(overview, observations), renderEvidenceSection(overview, observations));
  }

  await load();
}

export function buildEvidenceTab(): TabDef {
  return {
    id: 'evidence',
    label: 'Evidence',
    render: renderEvidenceTab
  };
}
