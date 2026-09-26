import { getPdGroup } from '@/api/pd-groups';
import { getEvent } from '@/api/events';
import { listUniversalLinksForEntity } from '@/api/universal-links';
import { groupTotals } from '@/lib/pd-totals';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { EventRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderPdGroupPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  try {
    const { group } = await getPdGroup(id);
    const incoming = (await listUniversalLinksForEntity(`professional:pd_group:${id}`)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_pd_group' && entry.link.status === 'current');
    const events: EventRecord[] = await Promise.all(incoming.map(async (entry) => (await getEvent(entry.link.source_ref.split(':').pop()!)).event));
    if (!options.isCurrent()) return;
    options.onTitleReady(group.title);
    const totals = groupTotals(events);
    const byId = new Map(events.map((event) => [event.id, event]));

    const root = el('div', 'pd-group-page');
    root.append(el('p', 'eyebrow', group.shape === 'series' ? 'PD series' : 'PD program'),
      el('p', 'pd-group-page__hours', `${totals.hoursDone}/${totals.hoursTotal} h`));
    const list = el('ol', 'pd-group-page__sessions');
    for (const session of totals.sessions) {
      const item = el('li', `pd-group-page__session${session.done ? ' is-done' : ''}`);
      item.dataset.part = 'session';
      const link = el('a', undefined, `${session.label} · ${byId.get(session.id)?.title ?? ''}`) as HTMLAnchorElement;
      link.href = `#/event/${encodeURIComponent(session.id)}`;
      item.append(link, el('span', 'muted', session.hours == null ? '' : ` · ${session.hours} h`));
      if (session.gapAfter) item.append(el('span', 'pd-group-page__gap', ` then ${session.gapAfter}`));
      list.append(item);
    }
    const add = el('a', 'btn btn--secondary', group.shape === 'program' ? '＋ Next day' : '＋ Next session') as HTMLAnchorElement;
    add.href = `#/event/new?pd_group=${encodeURIComponent(id)}`;
    root.append(list, add);
    canvas.replaceChildren(root);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderPdGroupPage(canvas, id, options));
  }
}
