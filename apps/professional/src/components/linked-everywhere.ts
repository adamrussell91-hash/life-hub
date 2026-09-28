import type { LinkedRecords, RelationshipEndpoint } from '@/domain/types';

/**
 * "Linked everywhere" — every record anywhere in Life Hub that is linked to
 * this person/organisation (tagged in a note, attached to a task, invited to
 * a meeting…), grouped by what it is. People and organisations are left out
 * on purpose: those are the relationships list, not the work.
 *
 * One renderer for the People pane, the Person tabs and the Organisation
 * page, so a new bucket on `/api/entities/overview` shows up everywhere.
 */
const GROUPS: Array<{ key: keyof LinkedRecords; label: string }> = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Knowledge notes' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'events', label: 'Events' },
  { key: 'communications', label: 'Communications' },
  { key: 'projects', label: 'Projects & goals' },
  { key: 'teaching', label: 'Teaching' },
  { key: 'applications', label: 'Applications' },
  { key: 'other', label: 'Other' }
];

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

function kindWord(kind: string): string {
  return kind.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function linkedEverywhereCount(records: LinkedRecords): number {
  return GROUPS.reduce((sum, g) => sum + ((records[g.key] as RelationshipEndpoint[] | undefined)?.length ?? 0), 0);
}

export function renderLinkedEverywhere(
  host: HTMLElement,
  records: LinkedRecords,
  emptyMessage = 'Nothing is linked yet. Tag this person from a note, task, meeting or event, or add a tag below.'
): void {
  host.replaceChildren();
  if (!linkedEverywhereCount(records)) {
    host.append(el('p', 'empty-state linked-everywhere__empty', emptyMessage));
    return;
  }
  const wrap = el('div', 'linked-everywhere');
  for (const group of GROUPS) {
    const items = (records[group.key] as RelationshipEndpoint[] | undefined) ?? [];
    if (!items.length) continue;
    const section = el('div', 'linked-everywhere__group');
    section.append(el('h3', 'linked-everywhere__h', `${group.label} · ${items.length}`));
    const list = el('ul', 'linked-everywhere__list');
    for (const item of items) {
      const li = el('li', 'linked-everywhere__item');
      const label = item.display_label || item.ref;
      if (item.href) {
        const a = el('a', 'linked-everywhere__link', label);
        a.href = item.href;
        li.append(a);
      } else {
        li.append(el('span', 'linked-everywhere__link', label));
      }
      const sub = group.key === 'other' || group.key === 'teaching' || group.key === 'projects'
        ? kindWord(item.kind)
        : item.supporting_label;
      if (sub) li.append(el('span', 'linked-everywhere__sub', sub));
      list.append(li);
    }
    section.append(list);
    wrap.append(section);
  }
  host.append(wrap);
}
