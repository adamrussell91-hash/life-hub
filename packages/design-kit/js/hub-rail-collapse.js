/** Collapsible left rail — one control for every hub.
 *
 * Sets `html.hub-rail-collapsed` and mounts one edge tab on `document.body`.
 * The tab lives outside the rail so it survives shells that re-render their
 * rail (Knowledge) and stays reachable once the rail has slid away.
 * The choice is remembered per browser. Phones (≤720px) never show the rail,
 * so the tab hides there and the class has no effect. Styles: rail.css.
 * Spec: RAIL.md → Collapse.
 */

const STORAGE_KEY = 'hub-rail-collapsed';
const TAB_ID = 'hub-rail-collapse';
const CHEVRON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(collapsed) {
  try {
    if (collapsed) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

function isTyping(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** @param {boolean} collapsed */
export function setRailCollapsed(collapsed, doc = document) {
  const html = doc.documentElement;
  html.classList.toggle('hub-rail-collapsed', collapsed);
  const tab = doc.getElementById(TAB_ID);
  if (tab) {
    tab.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Show the sidebar' : 'Hide the sidebar';
    tab.setAttribute('aria-label', label);
    tab.title = `${label} (Ctrl+\\)`;
  }
  writeStored(collapsed);
}

export function isRailCollapsed(doc = document) {
  return doc.documentElement.classList.contains('hub-rail-collapsed');
}

/** Mount once per page. Safe to call again after a shell re-render. */
export function mountRailCollapse(doc = document) {
  if (doc.getElementById(TAB_ID)) return;
  const html = doc.documentElement;
  html.classList.toggle('hub-rail-collapsed', readStored());

  const tab = doc.createElement('button');
  tab.type = 'button';
  tab.id = TAB_ID;
  tab.className = 'hub-rail-collapse';
  tab.innerHTML = CHEVRON;
  tab.addEventListener('click', () => setRailCollapsed(!isRailCollapsed(doc), doc));
  doc.body.append(tab);
  setRailCollapsed(isRailCollapsed(doc), doc);

  doc.addEventListener('keydown', (event) => {
    if (event.key !== '\\' || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (isTyping(event.target)) return;
    event.preventDefault();
    setRailCollapsed(!isRailCollapsed(doc), doc);
  });

  // Turn the slide on after the first paint so a remembered collapse does not animate in.
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add('hub-rail-animate')));
}
