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
  onRenameMap?: (title: string) => void;
};

function toolbarButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', className, label) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

/** Visible edit controls: map name, add buttons, join toggle and Done. */
function createMapEditBar(options: {
  title: string;
  joining: boolean;
  handlers: MapToolbarHandlers;
}): HTMLElement {
  const bar = el('div', 'map-editbar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Edit map');

  if (options.handlers.onRenameMap) {
    const name = el('label', 'map-editbar__name');
    name.append(el('span', 'map-editbar__name-label', 'Map name'));
    const input = el('input', 'map-editbar__name-input') as HTMLInputElement;
    input.type = 'text';
    input.value = options.title;
    input.setAttribute('aria-label', 'Map name');
    input.addEventListener('change', () => {
      const next = input.value.trim();
      if (!next) {
        input.value = options.title;
        return;
      }
      if (next !== options.title) options.handlers.onRenameMap?.(next);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
    name.append(input);
    bar.append(name);
  }

  const join = toolbarButton(
    options.joining ? 'Stop joining' : 'Join',
    `btn btn--ghost map-editbar__join${options.joining ? ' is-on' : ''}`,
    options.handlers.onJoin
  );
  join.setAttribute('aria-pressed', options.joining ? 'true' : 'false');
  join.title = 'Drag from one item to another to connect them';

  bar.append(
    toolbarButton('+ Line', 'btn btn--ghost', options.handlers.onAddLine),
    toolbarButton('+ Program', 'btn btn--ghost', options.handlers.onAddProgram),
    toolbarButton('+ Competition', 'btn btn--ghost', options.handlers.onAddCompetition),
    join,
    toolbarButton('Done', 'btn btn--primary map-editbar__done', () => options.handlers.onMode('view'))
  );
  return bar;
}

export function createMapToolbar(options: {
  maps: Array<{ id: string; title: string }>;
  currentId: string;
  mode: MapMode;
  fullscreen: boolean;
  joining: boolean;
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

  toolbar.append(select.el, renderCardMenu('Map menu', items, { heading: 'Map', inline: true }));

  if (options.mode === 'edit') {
    const title = options.maps.find((map) => map.id === options.currentId)?.title ?? '';
    toolbar.append(createMapEditBar({ title, joining: options.joining, handlers: options.handlers }));
  }

  return toolbar;
}
