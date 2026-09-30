/**
 * The Zoom control every calendar view shares (Day · Week · Term · Year · Almanac).
 *
 * One builder so the four renderers can't drift, and one settle step so the
 * paper thumb slides from the zoom you left to the one you landed on. Each view
 * remounts on a zoom change, so the previous box is kept here, per page.
 * Phone layout lives in calendar-zoom-bar.css.
 */
import { applyHubPillsThumb, prefersReducedMotion } from '../hub-motion.js';

export const ZOOM_LABELS = Object.freeze(['Day', 'Week', 'Term', 'Year', 'Almanac']);

/** @type {{ x: string, y: string, w: string, h: string } | null} */
let lastBox = null;

/**
 * @param {Document} doc
 * @param {string} active zoom id: day | week | term | year | almanac
 * @returns {HTMLDivElement}
 */
export function buildZoomPills(doc, active) {
  const group = doc.createElement('div');
  group.className = 'hub-pills';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Zoom');
  group.dataset.part = 'zoom-pills';
  const thumb = doc.createElement('span');
  thumb.className = 'hub-pills__thumb';
  thumb.setAttribute('aria-hidden', 'true');
  group.append(thumb);
  for (const name of ZOOM_LABELS) {
    const id = name.toLowerCase();
    const on = id === active;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `hub-pills__btn${on ? ' is-active' : ''}`;
    button.setAttribute('aria-pressed', String(on));
    button.dataset.zoom = id;
    button.textContent = name;
    group.append(button);
  }
  return group;
}

/**
 * Place the thumb under the active zoom. After a view switch it starts under the
 * zoom you came from and slides across, so the change reads as one control moving.
 * @param {Element | null | undefined} group
 */
export function settleZoomPills(group) {
  if (!group?.style?.setProperty) return null;
  const from = lastBox;
  const box = applyHubPillsThumb(group, { animate: false });
  if (!box || box.w === '0px') return box;
  lastBox = box;
  const moved = from && (from.x !== box.x || from.y !== box.y);
  if (!moved || prefersReducedMotion(group.ownerDocument ?? undefined)) return box;
  const view = group.ownerDocument?.defaultView;
  if (typeof view?.requestAnimationFrame !== 'function') return box;
  group.classList.remove('is-animated');
  group.style.setProperty('--hub-pill-x', from.x);
  group.style.setProperty('--hub-pill-w', from.w);
  void group.getBoundingClientRect();
  view.requestAnimationFrame(() => {
    group.classList.add('is-animated');
    group.style.setProperty('--hub-pill-x', box.x);
    group.style.setProperty('--hub-pill-w', box.w);
  });
  return box;
}

/** Tests only. */
export function resetZoomPillsForTests() {
  lastBox = null;
}
