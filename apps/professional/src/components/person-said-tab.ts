/**
 * "Said in meetings": what this person said in recorded meetings and events,
 * newest first, from `/api/people-said` (written by the server when a write-up
 * finishes). Each entry links back to the meeting, opening the transcript at the line.
 */
import '../styles/meeting-recording.css';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import type { TabDef } from '@/components/entity-detail';
import { eventRoute, meetingRoute } from '@/app/router';
import { listPeopleSaid, type PeopleSaidEntry } from '@/api/meeting-recordings';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { EntityOverview } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** `#/meeting/<id>?line=13` (or the event page): the page opens the transcript at that line. */
export function saidHref(entry: PeopleSaidEntry, withLine: boolean): string {
  const base = entry.kind === 'event' ? eventRoute(entry.meeting_id) : meetingRoute(entry.meeting_id);
  return withLine && Number.isInteger(entry.line) ? `${base}?line=${entry.line}` : base;
}

export function renderPeopleSaid(host: HTMLElement, entries: PeopleSaidEntry[], opts: { heading?: boolean } = {}): void {
  host.replaceChildren();
  const section = el('div', 'entity-detail__section rec-said-list');
  if (opts.heading !== false) section.append(el('h2', 'entity-detail__heading', 'Said in meetings'));
  if (!entries.length) {
    section.append(el('p', 'empty-state', 'Nothing yet. When a recorded meeting with them is written up, what they said lands here.'));
    host.append(section);
    return;
  }
  for (const entry of entries) {
    const item = el('article', 'rec-said');
    item.dataset.meeting = entry.meeting_id;
    const meta = el('div', 'rec-said__meta');
    meta.append(el('b', undefined, entry.meeting_title || (entry.kind === 'event' ? 'Event' : 'Meeting')), ` · ${formatDisplayDate(entry.date)}`);
    if (entry.kind === 'event') meta.append(' ', el('span', 'rec-tag is-plum', 'event'));
    const list = el('ul');
    for (const point of entry.points) {
      const li = el('li');
      if (point.star) li.append(el('span', 'rec-star', '★ '));
      li.append(point.text);
      list.append(li);
    }
    item.append(meta, list);
    if (entry.quote) item.append(el('div', 'rec-said__quote', `“${entry.quote.replace(/^[“"]|[”"]$/g, '')}”`));
    const links = el('div', 'rec-said__links');
    const open = el('a', 'rec-link', `Open the ${entry.kind === 'event' ? 'event' : 'meeting'}`) as HTMLAnchorElement;
    open.href = saidHref(entry, false);
    links.append(open);
    if (Number.isInteger(entry.line)) {
      const words = el('a', 'rec-link', 'Check the words') as HTMLAnchorElement;
      words.href = saidHref(entry, true);
      links.append(' · ', words);
    }
    item.append(links);
    section.append(item);
  }
  section.append(el('p', 'muted rec-said__foot', '★ marks what the write-up thought was worth remembering. Kept in private storage.'));
  host.append(section);
}

export function buildPersonSaidTab(): TabDef {
  return {
    id: 'said',
    label: 'Said in meetings',
    render: async (host: HTMLElement, overview: EntityOverview, ctx: { isCurrent: () => boolean }) => {
      const personRef = `shared:person:${overview.entity.id}`;
      const load = async (): Promise<void> => {
        showViewLoading(host, 'Loading…');
        try {
          const { entries } = await listPeopleSaid(personRef);
          if (!ctx.isCurrent()) return;
          renderPeopleSaid(host, entries);
        } catch (err) {
          if (!ctx.isCurrent()) return;
          renderLoadError(host, err, () => void load());
        }
      };
      await load();
    }
  };
}
