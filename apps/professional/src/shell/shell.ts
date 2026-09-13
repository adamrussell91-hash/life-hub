import { appendHubSwitcher, hubSwitcherHost } from '../../../../packages/hub-switcher.js';
import { mountMobileChrome } from '../../../../packages/design-kit/js/mount-mobile-chrome.js';
import { railIconFor, refreshIcon, signOutIcon, RAIL_ICON_PATHS } from '@/shell/icons';
import type { RailViewId } from '@/app/router';

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
}

interface NavItem {
  id: RailViewId;
  label: string;
  href: string;
}

const NAV: NavItem[] = [
  { id: 'people', label: 'People', href: '#/people' },
  { id: 'organisations', label: 'Organisations', href: '#/organisations' },
  { id: 'relationships', label: 'Relationships', href: '#/relationships' },
  { id: 'communications', label: 'Communications', href: '#/communications' }
];

export function viewChrome(view: RailViewId): { eyebrow: string; title: string } {
  const item = NAV.find((entry) => entry.id === view);
  return { eyebrow: 'Professional', title: item?.label ?? 'People' };
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

/** Shell from design-kit/snippets/shell.html — Professional brand + labeled rail. */
export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('aside');
  rail.className = 'hub-rail';
  rail.setAttribute('aria-label', 'Professional navigation');

  const top = document.createElement('div');
  top.className = 'hub-rail__brand-block';

  const brand = document.createElement('a');
  brand.className = 'hub-rail__brand';
  brand.href = '#/people';
  brand.textContent = 'Professional Hub';
  top.append(brand);

  const logoutButton = options.onLogout
    ? iconButton('Sign out', signOutIcon(), () => options.onLogout?.())
    : null;
  const refreshButton = options.onRefresh
    ? iconButton('Refresh', refreshIcon(), () => options.onRefresh?.())
    : null;

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

function buildNavLink(item: NavItem, highlight: RailViewId | null): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'hub-rail__link';
  link.href = item.href;
  if (item.id === highlight) link.setAttribute('aria-current', 'page');
  link.append(railIconFor(item.id), document.createTextNode(item.label));
  return link;
}

function syncMobileChrome(shellRoot: HTMLElement, active: RailViewId | null): void {
  mountMobileChrome(shellRoot, {
    currentHub: 'professional',
    primary: [
      {
        id: 'people',
        label: 'People',
        paths: RAIL_ICON_PATHS.people,
        href: '#/people',
        current: active === 'people'
      },
      {
        id: 'organisations',
        label: 'Organisations',
        paths: RAIL_ICON_PATHS.organisations,
        href: '#/organisations',
        current: active === 'organisations'
      },
      {
        id: 'relationships',
        label: 'Relationships',
        paths: RAIL_ICON_PATHS.relationships,
        href: '#/relationships',
        current: active === 'relationships'
      }
    ],
    more: [
      {
        id: 'communications',
        label: 'Communications',
        paths: RAIL_ICON_PATHS.communications,
        href: '#/communications'
      }
    ]
  });
}

export function renderPrimaryNav(railNav: HTMLElement, active: RailViewId | null): void {
  railNav.replaceChildren();
  railNav.append(...NAV.map((item) => buildNavLink(item, active)));

  appendHubSwitcher(hubSwitcherHost(railNav), 'professional');

  const shellRoot = railNav.closest('.hub-layout')?.parentElement ?? railNav.ownerDocument.body;
  if (shellRoot instanceof HTMLElement) syncMobileChrome(shellRoot, active);
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

/** Kit page header: uppercase eyebrow → h1 → optional supporting → actions. */
export function renderPageHeader(refs: HubShellRefs, config: PageHeaderConfig): void {
  refs.pageHeader.replaceChildren();
  const copy = document.createElement('div');
  copy.className = 'page-header__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement('h1');
  title.className = 'page-header__title hub-kinetic';
  title.textContent = config.title;

  copy.append(eyebrow, createTitleRow(title));
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
