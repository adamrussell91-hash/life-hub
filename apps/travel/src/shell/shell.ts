import { appendHubSwitcher, hubSwitcherHost } from '../../../../packages/hub-switcher.js';
import { mountMobileChrome } from '../../../../packages/design-kit/js/mount-mobile-chrome.js';
import { railIconFor, refreshIcon, signOutIcon, RAIL_ICON_PATHS } from '@/shell/icons';

export type RailHighlight = 'trip' | 'today' | 'trips' | null;

export interface HubShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  canvas: HTMLElement;
  pageHeader: HTMLElement;
  headerActions: HTMLElement;
  logoutButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
}

export interface HubShellOptions {
  onLogout?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onAdd?: () => void | Promise<void>;
  tripHref?: string;
}

function iconButton(label: string, icon: SVGSVGElement, onClick: () => void | Promise<void>): HTMLButtonElement {
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

/** Travel's own chrome (§2.2): desktop rail with "Life Hub · Travel" brand,
 * a "← Life" link at the top, then Trip / Today / Trips. */
export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('aside');
  rail.className = 'hub-rail';
  rail.setAttribute('aria-label', 'Travel navigation');

  const top = document.createElement('div');
  top.className = 'hub-rail__brand-block';

  const backToLife = document.createElement('a');
  backToLife.className = 'hub-rail__back';
  backToLife.href = '/';
  backToLife.textContent = '← Life';

  const brand = document.createElement('span');
  brand.className = 'hub-rail__brand';
  brand.textContent = 'Life Hub · Travel';

  const logoutButton = options.onLogout
    ? iconButton('Sign out', signOutIcon(), () => options.onLogout?.())
    : null;
  const refreshButton = options.onRefresh
    ? iconButton('Refresh', refreshIcon(), () => options.onRefresh?.())
    : null;

  top.append(backToLife, brand);

  const railNav = document.createElement('nav');
  railNav.className = 'hub-rail__nav';
  railNav.setAttribute('aria-label', 'Primary');
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

  const refs: HubShellRefs = {
    root,
    rail,
    railNav,
    canvas,
    pageHeader,
    headerActions,
    logoutButton,
    refreshButton
  };

  headerActions.append(mountUtilities(refs));
  pageHeader.append(headerActions);
  canvasWrap.append(pageHeader, canvas);
  layout.append(rail, canvasWrap);
  root.append(createSkipLink('hub-main'), layout);

  return refs;
}

interface NavItem {
  id: RailHighlight;
  label: string;
  href: string;
  iconId: string;
}

function navItems(tripHref: string): NavItem[] {
  return [
    { id: 'trip', label: 'Trip', href: tripHref, iconId: 'trip' },
    { id: 'today', label: 'Today', href: '#/today', iconId: 'today' },
    { id: 'trips', label: 'Trips', href: '#/', iconId: 'trips' }
  ];
}

function buildNavLink(item: NavItem, highlight: RailHighlight): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'hub-rail__link';
  link.href = item.href;
  if (item.id === highlight) link.setAttribute('aria-current', 'page');
  link.append(railIconFor(item.iconId), document.createTextNode(item.label));
  return link;
}

function syncMobileChrome(shellRoot: HTMLElement, active: RailHighlight, tripHref: string, onAdd?: () => void | Promise<void>): void {
  mountMobileChrome(shellRoot, {
    currentHub: 'life',
    primary: [
      { id: 'trip', label: 'Trip', paths: RAIL_ICON_PATHS.trip, href: tripHref, current: active === 'trip' },
      { id: 'today', label: 'Today', paths: RAIL_ICON_PATHS.today, href: '#/today', current: active === 'today' },
      {
        id: 'add',
        label: 'Add',
        paths: RAIL_ICON_PATHS.add,
        onSelect: () => onAdd?.()
      }
    ],
    more: [
      { id: 'trips', label: 'Trips', paths: RAIL_ICON_PATHS.trips, href: '#/' },
      { id: 'public', label: 'Public link', paths: RAIL_ICON_PATHS.trips, href: tripHref }
    ]
  });
}

/** Renders the rail nav for the given highlight and re-mounts phone chrome. */
export function renderPrimaryNav(shell: HubShellRefs, active: RailHighlight, options: HubShellOptions = {}): void {
  const tripHref = options.tripHref ?? '#/';
  shell.railNav.replaceChildren();
  const items = navItems(tripHref);
  shell.railNav.append(...items.map((item) => buildNavLink(item, active)));

  appendHubSwitcher(hubSwitcherHost(shell.railNav), 'life');

  const shellRoot = shell.railNav.closest('.hub-layout')?.parentElement ?? shell.railNav.ownerDocument.body;
  if (shellRoot instanceof HTMLElement) syncMobileChrome(shellRoot, active, tripHref, options.onAdd);
}

export interface PageHeaderConfig {
  eyebrow: string;
  title: string;
  supporting?: string;
  actions?: HTMLElement | null;
}

function createTitleRow(title: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'page-header__title-row';
  row.append(title);
  return row;
}

export function renderPageHeader(refs: HubShellRefs, config: PageHeaderConfig): void {
  refs.pageHeader.replaceChildren();
  const copy = document.createElement('div');
  copy.className = 'page-header__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = config.eyebrow;

  copy.append(eyebrow);
  if (config.title) {
    const title = document.createElement('h1');
    title.className = 'page-header__title hub-kinetic';
    title.textContent = config.title;
    copy.append(createTitleRow(title));
  }
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
