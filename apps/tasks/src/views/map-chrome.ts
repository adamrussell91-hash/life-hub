import type { MapLine } from '@/schemas/map';
import { missingStandardYearTracks } from '@/domain/maps-layout';
import { createOutlineIcon, RAIL_ICON_PATHS } from '@/shell/icons';
import { renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import { createHubFilter, createHubToolbar, el } from '@/views/hub-kit';

export type MapMode = 'view' | 'edit';

export type MapIndexShellOptions = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type MapIndexShell = {
  root: HTMLElement;
  inner: HTMLElement;
  setOpen: (open: boolean) => void;
};

/** Collapsed search icon that expands into the map index — same motion as the universe key. */
export function createMapIndexShell(options: MapIndexShellOptions = {}): MapIndexShell {
  let open = Boolean(options.open);
  const root = el('aside', `map-index${open ? ' is-open' : ''}`);
  root.setAttribute('aria-label', 'On this map');
  root.setAttribute('data-map-index', '');

  const toggle = el('button', 'map-index__toggle') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.setAttribute('data-map-index-toggle', '');
  toggle.setAttribute('aria-controls', 'map-index-panel');
  toggle.title = 'On this map';
  toggle.append(createOutlineIcon(RAIL_ICON_PATHS.search ?? []));
  toggle.append(el('span', 'map-index__title', 'On this map'));

  const panel = el('div', 'map-index__panel');
  panel.id = 'map-index-panel';
  const inner = el('div', 'map-index__panel-inner');
  panel.append(inner);

  const sync = () => {
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Collapse map index' : 'On this map');
  };

  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    sync();
    options.onOpenChange?.(open);
    if (open) inner.querySelector<HTMLInputElement>('.hub-search__input')?.focus();
    else toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!open));
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    event.preventDefault();
    setOpen(false);
  });

  sync();
  root.append(toggle, panel);
  return { root, inner, setOpen };
}

export function createMapIndexSearch(options: {
  placeholder: string;
  ariaLabel: string;
  value?: string;
  onInput: (value: string) => void;
}): { root: HTMLElement; input: HTMLInputElement } {
  const root = el('label', 'hub-search map-index__search');
  root.append(el('span', 'visually-hidden', options.ariaLabel));
  const input = el('input', 'hub-search__input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = options.placeholder;
  input.setAttribute('aria-label', options.ariaLabel);
  if (options.value) input.value = options.value;
  input.addEventListener('input', () => options.onInput(input.value));
  root.append(input);
  return { root, input };
}

export type MapToolbarHandlers = {
  onSelectMap: (id: string) => void;
  onMode: (mode: MapMode) => void;
  onExport: () => void;
  onNewMap: () => void;
  onFullscreen: () => void;
  onAddLine: () => void;
  onAddProgram: () => void;
  onAddCompetition: () => void;
  onJoin: () => void;
  onMove?: (id: string, delta: -1 | 1) => void;
  onAddYearLine?: (line: MapLine) => void;
};

export function createMapToolbar(options: {
  maps: Array<{ id: string; title: string }>;
  currentId: string;
  mode: MapMode;
  fullscreen: boolean;
  joining: boolean;
  lines?: MapLine[];
  handlers: MapToolbarHandlers;
}): HTMLElement {
  const toolbar = createHubToolbar('map-toolbar');
  const select = createHubFilter({
    key: 'Map',
    label: 'Map',
    defaultValue: options.currentId,
    options: options.maps.map((map) => ({ value: map.id, label: map.title })),
    value: options.currentId,
    onChange: options.handlers.onSelectMap
  });

  const items: CardMenuItem[] = [
    {
      id: 'view',
      label: options.mode === 'view' ? 'Viewing' : 'View',
      onSelect: () => options.handlers.onMode('view')
    },
    {
      id: 'edit',
      label: options.mode === 'edit' ? 'Editing' : 'Edit',
      onSelect: () => options.handlers.onMode('edit')
    },
    { id: 'export', label: 'Export', onSelect: options.handlers.onExport },
    { id: 'new', label: 'New map', onSelect: options.handlers.onNewMap },
    {
      id: 'fullscreen',
      label: options.fullscreen ? 'Exit full screen' : 'Full screen',
      onSelect: options.handlers.onFullscreen
    }
  ];
  if (options.mode === 'edit') {
    items.push(
      { id: 'add-line', label: 'Add line', onSelect: options.handlers.onAddLine },
      { id: 'add-program', label: 'Add program', onSelect: options.handlers.onAddProgram },
      { id: 'add-competition', label: 'Add competition', onSelect: options.handlers.onAddCompetition },
      {
        id: 'join',
        label: options.joining ? 'Stop joining' : 'Join',
        onSelect: options.handlers.onJoin
      }
    );
  }

  toolbar.append(select.el, renderCardMenu('Map menu', items, { heading: 'Map', inline: true }));

  const lines = options.lines ?? [];
  if (options.mode === 'edit' && lines.length && options.handlers.onMove && options.handlers.onAddYearLine) {
    const lineItems: CardMenuItem[] = [];
    for (const [index, line] of lines.entries()) {
      if (index > 0) {
        lineItems.push({
          id: `left-${line.id}`,
          label: `Move ${line.name} left`,
          onSelect: () => options.handlers.onMove?.(line.id, -1)
        });
      }
      if (index < lines.length - 1) {
        lineItems.push({
          id: `right-${line.id}`,
          label: `Move ${line.name} right`,
          onSelect: () => options.handlers.onMove?.(line.id, 1)
        });
      }
      lineItems.push({
        id: `year-${line.id}`,
        label: missingStandardYearTracks(line).length
          ? `Add year line to ${line.name}`
          : `Add extra year line to ${line.name}`,
        onSelect: () => options.handlers.onAddYearLine?.(line)
      });
    }
    toolbar.append(renderCardMenu('Lines menu', lineItems, { heading: 'Lines', inline: true }));
  }

  return toolbar;
}
