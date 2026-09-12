import { fetchEntityOverview } from '@/api/entities';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { renderRelationshipTimeline } from '@/components/relationship-timeline';
import type { EntityOverview, RelationshipEntry } from '@/domain/types';

export interface EntityDetailConfig {
  ref: string;
  backHref: string;
  backLabel: string;
  onTitleReady?: (title: string) => void;
  isCurrent?: () => boolean;
  /** Person-only: sort name + a quiet "Self" indicator. Organisation-only: legal name. */
  renderExtraFields?: (overview: EntityOverview, host: HTMLElement) => void;
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

function renderRelationshipList(host: HTMLElement, entries: RelationshipEntry[], emptyMessage: string): void {
  host.replaceChildren();
  if (!entries.length) {
    host.append(el('p', 'empty-state', emptyMessage));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'entity-detail__relationship-list';
  for (const entry of entries) {
    const item = document.createElement('li');
    const label = el('span', 'entity-detail__relationship-label', entry.link.relationship_type);
    const endpoint = el('span', 'entity-detail__relationship-endpoint', entry.endpoint.display_label);
    item.append(label, document.createTextNode(' · '), endpoint);
    list.append(item);
  }
  host.append(list);
}

export async function renderEntityDetail(canvas: HTMLElement, config: EntityDetailConfig): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const overview = await fetchEntityOverview(config.ref);
      if (config.isCurrent && !config.isCurrent()) return;
      renderLoaded(overview);
    } catch (err) {
      if (config.isCurrent && !config.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function renderLoaded(overview: EntityOverview): void {
    canvas.replaceChildren();
    config.onTitleReady?.(overview.entity.display_name);

    const back = el('a', 'btn btn--ghost entity-detail__back', config.backLabel);
    back.href = config.backHref;

    const summary = el('div', 'entity-detail__summary');
    const kindLine = el(
      'p',
      'entity-detail__kind',
      `${overview.entity.kind === 'person' ? 'Person' : 'Organisation'} · ${overview.entity.lifecycle_status}`
    );
    summary.append(kindLine);
    if (config.renderExtraFields) config.renderExtraFields(overview, summary);

    const currentSection = el('section', 'entity-detail__section');
    currentSection.append(el('h2', 'entity-detail__heading', 'Current relationships'));
    const currentHost = el('div');
    currentSection.append(currentHost);
    renderRelationshipList(currentHost, overview.current_relationships, 'No current relationships.');

    const activitySection = el('section', 'entity-detail__section');
    activitySection.append(el('h2', 'entity-detail__heading', 'Linked activity'));
    const activityHost = el('div');
    activitySection.append(activityHost);
    const activityBits: string[] = [];
    for (const item of overview.linked_records.communications) {
      activityBits.push(`Communication · ${item.display_label}`);
    }
    for (const item of overview.linked_records.tasks) {
      activityBits.push(`Task · ${item.display_label}`);
    }
    if (!activityBits.length) {
      activityHost.append(el('p', 'empty-state', 'No linked communications or tasks.'));
    } else {
      const list = document.createElement('ul');
      list.className = 'entity-detail__relationship-list';
      for (const bit of activityBits) {
        const item = document.createElement('li');
        if (bit.startsWith('Communication')) {
          const match = overview.linked_records.communications.find((c) =>
            bit.endsWith(c.display_label)
          );
          if (match?.href) {
            const link = document.createElement('a');
            link.href = match.href;
            link.textContent = bit;
            item.append(link);
          } else {
            item.textContent = bit;
          }
        } else {
          item.textContent = bit;
        }
        list.append(item);
      }
      activityHost.append(list);
    }

    const timelineSection = el('section', 'entity-detail__section');
    timelineSection.append(el('h2', 'entity-detail__heading', 'Relationship timeline'));
    const timelineHost = el('div');
    timelineSection.append(timelineHost);
    renderRelationshipTimeline(timelineHost, overview.timeline);

    const historicalSection = el('section', 'entity-detail__section');
    historicalSection.append(el('h2', 'entity-detail__heading', 'Historical relationships'));
    const historicalHost = el('div');
    historicalSection.append(historicalHost);
    renderRelationshipList(historicalHost, overview.historical_relationships, 'No historical relationships.');

    canvas.append(back, summary, currentSection, activitySection, timelineSection, historicalSection);
  }

  await load();
}
