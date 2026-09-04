import { appendHubSwitcher, hubSwitcherHost } from '../../../../packages/hub-switcher.js';
import { railIconFor, refreshIcon, signOutIcon } from '@/shell/icons';
import { createRailDisclosureState, type RailSectionId } from '@/shell/rail-disclosure';

export interface HubShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  canvas: HTMLElement;
  reminderHost: HTMLElement;
  pageHeader: HTMLElement;
  headerActions: HTMLElement;
  logoutButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
}

export interface HubShellOptions {
  onLogout?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

export type HubViewId =
  | 'board'
  | 'goals'
  | 'someday'
  | 'clare'
  | 'graph'
  | 'maps'
  | 'gantt'
  | 'orbit'
  | 'universe'
  | 'branch'
  | 'constellation'
  | 'day'
  | 'week'
  | 'month'
  | 'list'
  | 'search'
  | 'templates'
  | 'projects'
  | 'excursions'
  | 'programs'
  | 'stress'
  | 'corey'
  | 'properties';

type NavItem = { id: HubViewId; label: string; href: string };

type NavSection = {
  id: RailSectionId;
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'home',
    title: 'Home',
    items: [
      { id: 'board', label: 'Dashboard', href: '#/board' },
      { id: 'clare', label: 'Chat', href: '#/clare' }
    ]
  },
  {
    id: 'views',
    title: 'Views',
    items: [
      { id: 'day', label: 'Today', href: '#/day' },
      { id: 'week', label: 'Week', href: '#/week' },
      { id: 'month', label: 'Month', href: '#/month' },
      { id: 'list', label: 'Backlog', href: '#/list' },
      { id: 'graph', label: 'Graph', href: '#/graph' },
      { id: 'gantt', label: 'Gantt', href: '#/gantt' }
    ]
  },
  {
    id: 'plan',
    title: 'Plan',
    items: [
      { id: 'goals', label: 'Goals', href: '#/goals' },
      { id: 'someday', label: 'Someday', href: '#/someday' },
      { id: 'templates', label: 'Templates', href: '#/templates' }
    ]
  },
  {
    id: 'work',
    title: 'Work',
    items: [
      { id: 'projects', label: 'Projects', href: '#/projects' },
      { id: 'excursions', label: 'Excursions', href: '#/excursions' },
      { id: 'programs', label: 'Programs', href: '#/programs' }
    ]
  },
  {
    id: 'network',
    title: 'Network',
    items: [
      { id: 'stress', label: 'Network', href: '#/stress' },
      { id: 'corey', label: 'Corey', href: '#/corey' }
    ]
  },
  {
    id: 'tools',
    title: 'Tools',
    items: [
      { id: 'maps', label: 'Maps', href: '#/maps' },
      { id: 'search', label: 'Search', href: '#/search' },
      { id: 'properties', label: 'Properties', href: '#/properties' }
    ]
  }
];

const railDisclosure = createRailDisclosureState();

export function resetRailDisclosureStateForTests(): void {
  railDisclosure.reset();
}

const STRETCH_VIEWS: HubViewId[] = ['orbit', 'universe', 'branch', 'constellation'];

const NAV: NavItem[] = [
  ...NAV_SECTIONS.flatMap((section) => section.items),
  { id: 'orbit', label: 'Orbit', href: '#/orbit' },
  { id: 'universe', label: 'Universe', href: '#/universe' },
  { id: 'branch', label: 'Branch', href: '#/branch' },
  { id: 'constellation', label: 'Sky', href: '#/constellation' }
];

export function railHighlightId(view: HubViewId): HubViewId {
  return STRETCH_VIEWS.includes(view) ? 'graph' : view;
}

/** Page header is the rail group, then the tab (or stretch) name. Nothing else. */
export function viewChrome(view: HubViewId): { eyebrow: string; title: string } {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((entry) => entry.id === view);
    if (item) return { eyebrow: section.title, title: item.label };
  }
  const stretch = NAV.find((item) => item.id === view);
  if (stretch) return { eyebrow: 'Views', title: stretch.label };
  return { eyebrow: 'Home', title: 'Dashboard' };
}

function fitTitleField(field: HTMLTextAreaElement): void {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

/** One name in the header — editable. Do not put a second title on the card. */
export function bindEditablePageTitle(
  header: HTMLElement | undefined,
  value: string,
  handlers: {
    onChange: (value: string) => void;
    current: () => string;
  }
): void {
  if (!header) return;
  const existing = header.querySelector('.page-header__title');
  if (!existing) return;
  const input = document.createElement('textarea');
  input.className = 'page-header__title page-header__title-input';
  input.value = value;
  input.rows = 1;
  input.setAttribute('aria-label', 'Title');
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[\r\n]+/g, ' ');
    if (input.value !== cleaned) input.value = cleaned;
    fitTitleField(input);
    const next = cleaned.trim();
    if (next) handlers.onChange(next);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  });
  input.addEventListener('blur', () => {
    if (!input.value.trim()) input.value = handlers.current();
    fitTitleField(input);
  });
  existing.replaceWith(input);
  fitTitleField(input);
}

function iconButton(
  label: string,
  icon: SVGSVGElement,
  onClick: () => void | Promise<void>
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hub-icon-btn';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon);
  button.addEventListener('click', () => {
    button.disabled = true;
    void Promise.resolve(onClick()).finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = `#${targetId}`;
  a.textContent = 'Skip to content';
  a.addEventListener('click', (event) => {
    event.preventDefault();
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) return;
    target.tabIndex = -1;
    target.focus();
  });
  return a;
}

function mountUtilities(refs: HubShellRefs): HTMLElement {
  const utilities = document.createElement('div');
  utilities.className = 'hub-utilities';
  if (refs.refreshButton) utilities.append(refs.refreshButton);
  if (refs.logoutButton) utilities.append(refs.logoutButton);
  return utilities;
}

/** Shell from design-kit/snippets/shell.html — Tasks brand + labeled rail. */
export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('aside');
  rail.className = 'hub-rail';
  rail.setAttribute('aria-label', 'Tasks navigation');

  const top = document.createElement('div');
  top.className = 'hub-rail__brand-block';

  const brand = document.createElement('a');
  brand.className = 'hub-rail__brand';
  brand.href = '#/board';
  brand.textContent = 'Tasks Hub';
  top.append(brand);

  const logoutButton = options.onLogout
    ? iconButton('Sign out', signOutIcon(), () => options.onLogout?.())
    : null;
  const refreshButton = options.onRefresh
    ? iconButton('Refresh', refreshIcon(), () => options.onRefresh?.())
    : null;

  const railNav = document.createElement('div');
  railNav.className = 'hub-rail__nav';
  rail.append(top, railNav);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'hub-canvas';
  canvasWrap.id = 'hub-main';
  canvasWrap.tabIndex = -1;

  const pageHeader = document.createElement('header');
  pageHeader.className = 'page-header';

  const headerActions = document.createElement('div');
  headerActions.className = 'page-header__actions';

  const canvas = document.createElement('div');
  canvas.className = 'hub-canvas__body';

  const reminderHost = document.createElement('div');
  reminderHost.className = 'reminder-strip-host';
  reminderHost.hidden = true;

  const refs: HubShellRefs = {
    root,
    rail,
    railNav,
    canvas,
    reminderHost,
    pageHeader,
    headerActions,
    logoutButton,
    refreshButton
  };

  headerActions.append(mountUtilities(refs));
  pageHeader.append(headerActions);
  canvasWrap.append(pageHeader, reminderHost, canvas);
  layout.append(rail, canvasWrap);
  root.append(createSkipLink('hub-main'), layout);

  return refs;
}

function syncRailHighlight(root: HTMLElement, highlight: HubViewId): boolean {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.hub-rail__link')];
  if (!links.length) return false;
  for (const link of links) {
    const id = hashViewId(link.getAttribute('href') ?? '');
    if (id === highlight) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  return true;
}

function buildNavLink(item: NavItem, highlight: HubViewId): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'hub-rail__link';
  link.href = item.href;
  if (item.id === highlight) link.setAttribute('aria-current', 'page');
  if (item.id === 'clare') link.dataset.clareNav = 'true';
  link.append(railIconFor(item.id), document.createTextNode(item.label));
  return link;
}

function buildSectionButton(section: NavSection, panelId: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hub-rail__section';
  button.dataset.sectionToggle = section.id;
  button.setAttribute('aria-controls', panelId);
  const label = document.createElement('span');
  label.textContent = section.title;
  const chevron = document.createElement('span');
  chevron.className = 'hub-rail__section-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';
  button.append(label, chevron);
  return button;
}

function syncSectionDom(root: HTMLElement, id: RailSectionId): void {
  const open = railDisclosure.isOpen(id);
  root.querySelectorAll<HTMLElement>(`[data-section-toggle="${id}"]`).forEach((control) => {
    control.setAttribute('aria-expanded', String(open));
  });
  root.querySelectorAll<HTMLElement>(`[data-section-panel="${id}"]`).forEach((panel) => {
    panel.dataset.open = String(open);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
  });
}

function sectionIdForView(view: HubViewId): RailSectionId {
  const highlight = railHighlightId(view);
  return NAV_SECTIONS.find((section) => section.items.some((item) => item.id === highlight))?.id ?? 'home';
}

export function renderPrimaryNav(railNav: HTMLElement, active: HubViewId): void {
  const highlight = railHighlightId(active);
  railDisclosure.syncActive(sectionIdForView(active));
  if (railNav.querySelector('.hub-rail__list') && syncRailHighlight(railNav, highlight)) {
    for (const section of NAV_SECTIONS) syncSectionDom(railNav, section.id);
    appendHubSwitcher(hubSwitcherHost(railNav), 'tasks');
    return;
  }

  railNav.replaceChildren();

  const desktop = document.createElement('nav');
  desktop.className = 'hub-rail__list hub-rail__list--desktop';
  desktop.setAttribute('aria-label', 'Primary');

  for (const section of NAV_SECTIONS) {
    const panelId = `rail-section-${section.id}`;
    const group = document.createElement('section');
    group.dataset.navSection = section.id;

    const button = buildSectionButton(section, panelId);
    button.addEventListener('click', () => {
      railDisclosure.toggle(section.id);
      syncSectionDom(railNav, section.id);
    });

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'hub-rail__section-panel';
    panel.dataset.sectionPanel = section.id;

    const inner = document.createElement('div');
    inner.className = 'hub-rail__section-panel-inner';
    inner.append(...section.items.map((item) => buildNavLink(item, highlight)));
    panel.append(inner);

    group.append(button, panel);
    desktop.append(group);
  }

  const mobile = document.createElement('nav');
  mobile.className = 'hub-rail__mobile';
  mobile.dataset.mobileRail = 'true';
  mobile.setAttribute('aria-label', 'Primary');

  const tabs = document.createElement('div');
  tabs.className = 'hub-rail__mobile-tabs';
  tabs.setAttribute('aria-label', 'Navigation sections');

  const items = document.createElement('div');
  items.className = 'hub-rail__mobile-items';
  items.setAttribute('aria-label', 'Open section destinations');

  for (const section of NAV_SECTIONS) {
    const panelId = `rail-mobile-section-${section.id}`;
    const button = buildSectionButton(section, panelId);
    button.addEventListener('click', () => {
      railDisclosure.toggle(section.id);
      syncSectionDom(railNav, section.id);
    });
    tabs.append(button);

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'hub-rail__mobile-panel';
    panel.dataset.sectionPanel = section.id;
    panel.append(...section.items.map((item) => buildNavLink(item, highlight)));
    items.append(panel);
  }

  mobile.append(tabs, items);
  railNav.append(desktop, mobile);
  for (const section of NAV_SECTIONS) syncSectionDom(railNav, section.id);
  appendHubSwitcher(hubSwitcherHost(railNav), 'tasks');
}

export interface PageHeaderConfig {
  eyebrow: string;
  title: string;
  supporting?: string;
  actions?: HTMLElement | null;
}

function restoreHeaderTitle(existing: Element): HTMLElement {
  if (existing instanceof HTMLHeadingElement && existing.tagName === 'H1') {
    existing.className = 'page-header__title';
    return existing;
  }
  const heading = document.createElement('h1');
  heading.className = 'page-header__title';
  existing.replaceWith(heading);
  return heading;
}

function syncPageHeaderCopy(refs: HubShellRefs, config: PageHeaderConfig): boolean {
  const copy = refs.pageHeader.querySelector('.page-header__copy');
  const eyebrow = copy?.querySelector('.page-header__eyebrow');
  const existingTitle = copy?.querySelector('.page-header__title');
  if (!copy || !eyebrow || !existingTitle || !refs.pageHeader.contains(refs.headerActions)) {
    return false;
  }

  eyebrow.textContent = config.eyebrow;
  const title = restoreHeaderTitle(existingTitle);
  title.textContent = config.title;
  let supporting = copy.querySelector('.page-header__supporting');
  if (config.supporting) {
    if (!supporting) {
      supporting = document.createElement('p');
      supporting.className = 'page-header__supporting';
      copy.append(supporting);
    }
    supporting.textContent = config.supporting;
  } else {
    supporting?.remove();
  }
  if ('actions' in config) {
    refs.headerActions.replaceChildren();
    if (config.actions) refs.headerActions.append(config.actions);
    refs.headerActions.append(mountUtilities(refs));
  }
  return true;
}

/** Kit page header: uppercase eyebrow → h1 → optional supporting → actions. */
export function renderPageHeader(refs: HubShellRefs, config: PageHeaderConfig): void {
  refs.pageHeader.classList.remove('page-header--cover');
  if (syncPageHeaderCopy(refs, config)) return;

  refs.pageHeader.replaceChildren();
  const copy = document.createElement('div');
  copy.className = 'page-header__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement('h1');
  title.className = 'page-header__title';
  title.textContent = config.title;

  copy.append(eyebrow, title);
  if (config.supporting) {
    const supporting = document.createElement('p');
    supporting.className = 'page-header__supporting';
    supporting.textContent = config.supporting;
    copy.append(supporting);
  }

  refs.pageHeader.append(copy);
  refs.headerActions.replaceChildren();
  if (config.actions) refs.headerActions.append(config.actions);
  refs.headerActions.append(mountUtilities(refs));
  refs.pageHeader.append(refs.headerActions);
}

const KNOWN_VIEWS: HubViewId[] = NAV.map((item) => item.id);

export function knownHubViews(): readonly HubViewId[] {
  return KNOWN_VIEWS;
}

export function hashViewId(hash = location.hash): string {
  return hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'board';
}

export function hashQuery(): URLSearchParams {
  const query = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

/** Full task/project page: `#/task/:id` or `#/project/:id` — not rail destinations. */
export function parseEntityPage(hash = location.hash): { kind: 'task' | 'project'; id: string } | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const parts = path.split('/');
  if ((parts[0] === 'task' || parts[0] === 'project') && parts[1]) {
    return { kind: parts[0], id: decodeURIComponent(parts[1]) };
  }
  return null;
}

/** New excursion page: `#/excursions/new` — not the list. */
export function parseNewExcursionPage(hash = location.hash): boolean {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return path === 'excursions/new';
}

/** Full map card: `#/maps/:mapId/station/:id` or `#/maps/:mapId/event/:id`. */
export function parseMapItemPage(
  hash = location.hash
): { mapId: string; kind: 'station' | 'event'; id: string } | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const parts = path.split('/');
  if (parts[0] === 'maps' && parts[1] && (parts[2] === 'station' || parts[2] === 'event') && parts[3]) {
    return {
      mapId: decodeURIComponent(parts[1]),
      kind: parts[2],
      id: decodeURIComponent(parts[3])
    };
  }
  return null;
}

export function isKnownHashView(hash = location.hash): boolean {
  const id = hashViewId(hash);
  if (id === 'capacity') return true;
  if (parseEntityPage(hash)) return true;
  if (parseNewExcursionPage(hash)) return true;
  if (parseMapItemPage(hash)) return true;
  return KNOWN_VIEWS.includes(id as HubViewId);
}

export function parseHashRoute(): HubViewId {
  const id = hashViewId() as HubViewId;
  return KNOWN_VIEWS.includes(id) ? id : 'board';
}

const CALENDAR_VIEWS = new Set<HubViewId>(['week', 'month']);

/** Shared paint surface — week/month stay on one calendar, query-only changes stay on the same view. */
export function viewSurface(view: HubViewId): string {
  return CALENDAR_VIEWS.has(view) ? 'calendar' : view;
}

export function isSoftViewChange(from: HubViewId | null, to: HubViewId): boolean {
  return from !== null && viewSurface(from) === viewSurface(to);
}

/** Public Corey share: `#/capacity/<token>` */
export function parseCapacityShareToken(): string | null {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  if (parts[0] === 'capacity' && parts[1]) return parts[1];
  return null;
}
