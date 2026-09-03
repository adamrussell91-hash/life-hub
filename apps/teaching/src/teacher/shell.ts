import { createSkipLink } from '@/app/failure';
import { readTeacherRailPrefs, writeTeacherRailPrefs } from '@/teacher/rail-prefs';

export interface TeacherShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  main: HTMLElement;
  contextBar: HTMLElement;
  canvas: HTMLElement;
  logoutButton: HTMLButtonElement | null;
}

export interface TeacherShellOptions {
  onLogout?: () => void | Promise<void>;
}

const SIGN_OUT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
    <path d="M15 12H3" />
    <path d="m7 8-4 4 4 4" />
  </svg>
`.trim();

const CHEVRON_LEFT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
`.trim();

const CHEVRON_RIGHT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
`.trim();

const MOBILE_RAIL_QUERY = '(max-width: 768px)';

function isMobileRailViewport(): boolean {
  return window.matchMedia(MOBILE_RAIL_QUERY).matches;
}

function applyRailCollapsed(
  layout: HTMLElement,
  toggle: HTMLButtonElement,
  collapsed: boolean
): void {
  const effectiveCollapsed = isMobileRailViewport() ? false : collapsed;
  layout.classList.toggle('teacher-layout--rail-collapsed', effectiveCollapsed);
  toggle.setAttribute('aria-expanded', effectiveCollapsed ? 'false' : 'true');
  const label = effectiveCollapsed ? 'Show navigation' : 'Hide navigation';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.innerHTML = effectiveCollapsed ? CHEVRON_RIGHT_ICON : CHEVRON_LEFT_ICON;
}

/**
 * Builds the teacher chrome (rail / main / context bar / canvas) and returns
 * references to the mount points callers render into. Replaces any existing
 * content in `root`.
 */
export function renderTeacherShell(
  root: HTMLElement,
  options: TeacherShellOptions = {}
): TeacherShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'teacher-layout';

  const rail = document.createElement('nav');
  rail.className = 'teacher-layout__rail hub-rail';
  rail.setAttribute('aria-label', 'Curriculum navigation');

  const brandRow = document.createElement('div');
  brandRow.className = 'teacher-layout__rail-brand-row';

  const brand = document.createElement('a');
  brand.className = 'teacher-layout__rail-brand hub-rail__brand';
  brand.href = '/';
  brand.textContent = 'Teaching Hub';

  const railNav = document.createElement('div');
  railNav.className = 'teacher-layout__rail-nav';
  railNav.id = 'teacher-rail-nav';

  const railToggle = document.createElement('button');
  railToggle.type = 'button';
  railToggle.className = 'hub-icon-btn teacher-layout__rail-toggle';
  railToggle.setAttribute('aria-controls', 'teacher-rail-nav');
  applyRailCollapsed(layout, railToggle, readTeacherRailPrefs().collapsed);
  railToggle.addEventListener('click', () => {
    const next = !layout.classList.contains('teacher-layout--rail-collapsed');
    applyRailCollapsed(layout, railToggle, next);
    writeTeacherRailPrefs({ collapsed: next });
  });

  brandRow.append(brand, railToggle);

  rail.append(brandRow, railNav);

  const main = document.createElement('div');
  main.className = 'teacher-layout__main';
  main.id = 'teacher-main';

  const contextBar = document.createElement('div');
  contextBar.className = 'teacher-layout__context-bar';
  contextBar.hidden = true;

  const canvas = document.createElement('div');
  canvas.className = 'teacher-layout__canvas';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    const utilities = document.createElement('div');
    utilities.className = 'hub-utilities teacher-layout__utilities';

    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'hub-icon-btn';
    logoutButton.setAttribute('aria-label', 'Sign out');
    logoutButton.title = 'Sign out';
    logoutButton.dataset.hubSignOut = '';
    logoutButton.innerHTML = SIGN_OUT_ICON;
    logoutButton.addEventListener('click', () => {
      if (!logoutButton) return;
      logoutButton.disabled = true;
      void Promise.resolve(options.onLogout?.()).finally(() => {
        if (logoutButton) logoutButton.disabled = false;
      });
    });

    utilities.append(logoutButton);
    main.append(utilities, contextBar, canvas);
  } else {
    main.append(contextBar, canvas);
  }

  layout.append(rail, main);
  root.append(createSkipLink('teacher-main'), layout);

  return { root, rail, railNav, main, contextBar, canvas, logoutButton };
}

export interface ContextBarConfig {
  title: string;
  /** Placeholder text for the save-state indicator; wired up fully in Task 15. */
  saveState?: string;
  /** Optional breadcrumb above the title (class · unit). */
  crumb?: string;
  /** Editor chrome: stacked title + save status, actions on the right. */
  variant?: 'default' | 'editor';
}

/**
 * Renders the context bar title + a stable save-state slot. Task 15's
 * save/publish controls locate the slot via `[data-save-slot]`.
 */
export function renderContextBar(refs: TeacherShellRefs, config: ContextBarConfig): void {
  refs.contextBar.hidden = false;
  refs.contextBar.replaceChildren();
  refs.contextBar.classList.toggle(
    'teacher-layout__context-bar--editor',
    config.variant === 'editor'
  );

  const left = document.createElement('div');
  left.className = 'teacher-layout__context-bar-left';

  const crumb = document.createElement('p');
  crumb.className = 'teacher-layout__context-bar-crumb';
  crumb.hidden = !config.crumb;
  crumb.textContent = config.crumb ?? '';

  const title = document.createElement('h1');
  title.className = 'teacher-layout__context-bar-title';
  title.textContent = config.title;

  const saveSlot = document.createElement('span');
  saveSlot.className = 'teacher-layout__context-bar-save-slot';
  saveSlot.dataset.saveSlot = 'true';
  saveSlot.textContent = config.saveState ?? '';

  left.append(crumb, title, saveSlot);
  refs.contextBar.append(left);
}

/** Renders a lightweight status line into the rail nav mount point. */
export function renderRailStatus(railNav: HTMLElement, text: string): void {
  railNav.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__rail-status';
  status.textContent = text;
  railNav.append(status);
}

/** Renders a lightweight status line into the canvas mount point. */
export function renderCanvasStatus(canvas: HTMLElement, text: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  canvas.append(status);
}
