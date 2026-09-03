import type { MapColorToken, MapLine, MapPlanning, YearTrack } from '@/schemas/map';
import { mapItemKindLabel, planningOf, type MapItemKind } from '@/domain/maps-planning';
import { formatRelativeUpdated, statusBadgeClass } from '@/domain/cards';
import { YEAR_TRACK_LABELS } from '@/domain/maps-layout';
import { discCss, letterCss } from '@/domain/maps-colors';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { cardTransitionName, runContainerTransform } from '@/views/container-transform';
import { closeCardMenu, renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import { createMapIndexSearch, createMapIndexShell } from '@/views/map-chrome';

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

function calendarIcon(): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML =
    '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>';
  return node;
}

function dateBadge(due: string | null, prefix = ''): HTMLElement | null {
  if (!due) return null;
  const badge = el('span', 'date-badge');
  badge.append(calendarIcon(), document.createTextNode(`${prefix}${formatDisplayDate(due)}`));
  return badge;
}

export type MapLineMark = Pick<MapLine, 'id' | 'letter' | 'name' | 'color'>;

export type MapCardModel = {
  id: string;
  kind: MapItemKind;
  label: string;
  planning: MapPlanning;
  starts_on: string | null;
  ends_on: string | null;
  tracks: string[];
  updated_at: string;
  line: MapLineMark | null;
  lines: MapLineMark[];
  linkedTitle?: string | null;
};

export type MapCardHandlers = {
  onDelete?: () => void;
  onTogglePlanning?: () => void;
  onOpenPage?: () => void;
  onExpand?: () => void;
  onCollapse?: () => void;
};

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, label'));
}

export function renderLineRail(lines: MapLineMark[], activeId: string | null): HTMLElement {
  const rail = el('div', 'map-card__rail hub-chips');
  rail.setAttribute('aria-label', 'Line');
  for (const line of lines) {
    const disc = el('span', 'map-card__disc', line.letter);
    disc.title = `${line.letter} · ${line.name} Line`;
    disc.style.background = discCss(line.color as MapColorToken);
    disc.style.color = letterCss(line.color as MapColorToken);
    if (line.color === 'yellow' || line.color === 'high-sea') {
      disc.style.boxShadow = `inset 0 0 0 2px ${discCss(line.color)}`;
    }
    const on = !activeId || line.id === activeId;
    disc.classList.toggle('is-on', on);
    disc.classList.toggle('is-dim', !on);
    disc.setAttribute('aria-hidden', 'true');
    rail.append(disc);
  }
  return rail;
}

function cardMenuItems(model: MapCardModel, handlers: MapCardHandlers): CardMenuItem[] {
  const items: CardMenuItem[] = [];
  if (handlers.onExpand) {
    items.push({ id: 'expand', label: 'Expand', onSelect: () => handlers.onExpand?.() });
  }
  if (handlers.onCollapse) {
    items.push({ id: 'collapse', label: 'Collapse', onSelect: () => handlers.onCollapse?.() });
  }
  items.push({ id: 'page', label: 'Full page', onSelect: () => handlers.onOpenPage?.() });
  if (handlers.onTogglePlanning) {
    items.push({
      id: 'planning',
      label: planningOf(model) === 'active' ? 'Make planned' : 'Make active',
      onSelect: () => handlers.onTogglePlanning?.()
    });
  }
  if (handlers.onDelete) {
    items.push({ id: 'delete', label: 'Delete', danger: true, onSelect: () => handlers.onDelete?.() });
  }
  return items;
}

export function renderMapMicroCard(model: MapCardModel, handlers: MapCardHandlers = {}): HTMLElement {
  const row = el('article', 'hub-row map-card map-card--micro');
  row.dataset.mapItemId = model.id;
  row.dataset.cardKind = model.kind;
  row.dataset.planning = planningOf(model);
  if (planningOf(model) === 'planned') {
    row.append(renderLineRail(model.lines, model.line?.id ?? null));
  }
  const title = el('p', 'hub-row__title card-title', model.label);
  const chips = el('div', 'hub-chips');
  chips.append(el('span', 'hub-chip', mapItemKindLabel(model.kind)));
  const planning = el('span', statusBadgeClass(planningOf(model)), planningOf(model));
  chips.append(planning);
  const foot = el('div', 'hub-row__foot');
  const meta = el('div', 'hub-row__foot-meta');
  const start = dateBadge(model.starts_on);
  if (start) meta.append(start);
  if (model.kind === 'station' && model.ends_on && model.ends_on !== model.starts_on) {
    const end = dateBadge(model.ends_on);
    if (end) meta.append(end);
  }
  meta.append(el('span', 'hub-row__updated', formatRelativeUpdated(model.updated_at)));
  foot.append(meta);
  row.append(title, chips, foot);
  row.append(renderCardMenu(`${model.label} card menu`, cardMenuItems(model, handlers)));
  return row;
}

export function renderMapExpandedCard(
  model: MapCardModel,
  handlers: MapCardHandlers = {},
  editor?: HTMLElement | null
): HTMLElement {
  const card = el('article', 'hub-card map-card map-card--expanded');
  card.dataset.mapItemId = model.id;
  card.dataset.cardKind = model.kind;
  card.dataset.planning = planningOf(model);
  card.setAttribute('aria-label', `${model.label} ${mapItemKindLabel(model.kind).toLowerCase()} card`);
  card.append(renderLineRail(model.lines, model.line?.id ?? null));
  const head = el('header', 'task-card__head');
  head.append(
    el('span', 'hub-card__eyebrow', mapItemKindLabel(model.kind)),
    el('span', statusBadgeClass(planningOf(model)), planningOf(model))
  );
  const title = el('h2', 'hub-card__title card-title', model.label);
  const tags = el('div', 'task-card__tags-row');
  const chips = el('div', 'hub-chips');
  if (model.line) chips.append(el('span', 'hub-chip', `${model.line.letter} · ${model.line.name}`));
  if (model.kind === 'station') {
    for (const track of model.tracks) {
      const label = (YEAR_TRACK_LABELS as Record<string, string>)[track] ?? track;
      chips.append(el('span', 'hub-chip', label));
    }
  }
  if (model.linkedTitle) chips.append(el('span', 'hub-chip', model.linkedTitle));
  tags.append(chips);
  const due = dateBadge(
    model.kind === 'station' ? model.ends_on ?? model.starts_on : model.starts_on,
    model.kind === 'station' ? 'Ends ' : ''
  );
  if (due) tags.append(due);
  card.append(head, title, tags);
  if (model.starts_on && model.kind === 'station') {
    card.append(el('p', 'hub-card__meta', `Starts ${formatDisplayDate(model.starts_on)}`));
  }
  if (editor) {
    editor.classList.add('map-card__editor');
    card.append(editor);
  }
  const foot = el('footer', 'task-card__foot');
  foot.append(el('span', 'hub-card__meta', formatRelativeUpdated(model.updated_at)));
  card.append(foot);
  card.append(renderCardMenu(`${model.label} card menu`, cardMenuItems(model, handlers)));
  return card;
}

export function mountMapCard(
  host: HTMLElement,
  model: MapCardModel,
  handlers: MapCardHandlers,
  options: { expanded?: boolean; editor?: HTMLElement | null } = {}
): HTMLElement {
  const slot = el('div', 'hub-card-slot map-card-slot');
  slot.dataset.mapItemId = model.id;
  slot.style.viewTransitionName = cardTransitionName(model.id);
  const guard = { current: false };
  let expanded = Boolean(options.expanded);

  function cardHandlers(): MapCardHandlers {
    return {
      ...handlers,
      onExpand: expanded
        ? undefined
        : () => {
            toggle();
          },
      onCollapse: expanded
        ? () => {
            toggle();
          }
        : undefined
    };
  }

  function paint(): void {
    closeCardMenu();
    slot.replaceChildren(
      expanded
        ? renderMapExpandedCard(model, cardHandlers(), options.editor)
        : renderMapMicroCard(model, cardHandlers())
    );
    slot.dataset.state = expanded ? 'expanded' : 'compact';
    const trigger = slot.querySelector<HTMLElement>(expanded ? '.hub-card' : '.hub-row');
    if (trigger && !expanded) {
      trigger.setAttribute('role', 'button');
      trigger.tabIndex = 0;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', `Expand ${model.label} ${mapItemKindLabel(model.kind).toLowerCase()} card`);
    }
    trigger?.addEventListener('click', (event) => {
      if (isInteractive(event.target)) return;
      toggle();
    });
    trigger?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isInteractive(event.target)) return;
        toggle();
      }
    });
  }

  function toggle(): void {
    runContainerTransform(() => {
      expanded = !expanded;
      if (expanded) handlers.onExpand?.();
      else handlers.onCollapse?.();
      paint();
    }, guard);
  }

  host.append(slot);
  paint();
  return slot;
}

export type MapCardIndexSearch = {
  query?: string;
  open?: boolean;
  onQuery?: (query: string) => void;
  onOpen?: (open: boolean) => void;
};

export function mountMapCardIndex(
  items: MapCardModel[],
  selectedId: string | null,
  handlersFor: (model: MapCardModel) => MapCardHandlers,
  editorFor?: (model: MapCardModel) => HTMLElement | null,
  searchState: MapCardIndexSearch = {}
): HTMLElement {
  let query = searchState.query ?? '';
  const shell = createMapIndexShell({
    open: searchState.open ?? Boolean(query),
    onOpenChange: searchState.onOpen
  });
  shell.root.classList.add('map-card-index');
  const search = createMapIndexSearch({
    placeholder: 'Programs & competitions…',
    ariaLabel: 'Search map cards',
    value: query,
    onInput: (value) => {
      query = value;
      searchState.onQuery?.(value);
      paint(value);
    }
  });

  const list = el('div', 'map-index__list map-card-index__list');

  const paint = (nextQuery: string) => {
    query = nextQuery;
    list.replaceChildren();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((item) => {
          const hay = [
            item.label,
            item.kind,
            mapItemKindLabel(item.kind),
            planningOf(item),
            item.line?.letter ?? '',
            item.line?.name ?? ''
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : items;
    if (!filtered.length) {
      list.append(el('p', 'map-index__empty', q ? 'No matches.' : 'Nothing on this map yet.'));
      return;
    }
    for (const model of filtered) {
      mountMapCard(list, model, handlersFor(model), {
        expanded: model.id === selectedId,
        editor: editorFor?.(model) ?? null
      });
    }
  };

  paint(query);
  shell.inner.append(search.root, list);
  return shell.root;
}
