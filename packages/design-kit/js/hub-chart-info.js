/**
 * Discreet "i" after a chart label. Hover on a fine pointer, tap on touch.
 * The note is opaque and appears instantly — no fade, so the chart never shows through.
 */
import { positionHubFloating } from './hub-floating.js';

let openApi = null;
const boundDocs = new WeakSet();

const FLOAT = { placement: 'bottom-start', strategy: 'fixed', offset: 8 };

function hoverable() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
}

function place(api) {
  positionHubFloating(api.button, api.note, FLOAT).catch(() => {});
}

function closeApi(api, { restoreFocus = false } = {}) {
  if (!api) return;
  api.pinned = false;
  api.note.hidden = true;
  api.button.setAttribute('aria-expanded', 'false');
  if (openApi === api) openApi = null;
  if (restoreFocus) api.button.focus();
}

function bindDocument(doc) {
  if (!doc || boundDocs.has(doc) || typeof doc.addEventListener !== 'function') return;
  boundDocs.add(doc);
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openApi?.button?.ownerDocument === doc) {
      closeApi(openApi, { restoreFocus: true });
    }
  });
  doc.addEventListener('pointerdown', event => {
    if (!openApi || openApi.button.ownerDocument !== doc) return;
    const target = event.target;
    if (openApi.button.contains(target) || openApi.note.contains(target)) return;
    closeApi(openApi);
  }, true);
  doc.addEventListener('scroll', event => {
    if (!openApi || openApi.button.ownerDocument !== doc) return;
    if (openApi.note.contains(event.target)) return;
    if (openApi.pinned || !hoverable()) closeApi(openApi);
  }, true);
  window.addEventListener?.('resize', () => {
    if (openApi?.button?.ownerDocument === doc && !openApi.note.hidden) place(openApi);
  });
}

function show(api, pin) {
  if (openApi && openApi !== api) closeApi(openApi);
  if (pin) api.pinned = true;
  api.note.hidden = false;
  api.button.setAttribute('aria-expanded', 'true');
  openApi = api;
  place(api);
}

function ensureRow(anchorEl) {
  const parent = anchorEl.parentNode;
  if (!parent?.insertBefore) return null;
  if (parent.classList?.contains('hub-chart-info-label')) return parent;
  const row = anchorEl.ownerDocument.createElement('span');
  row.className = 'hub-chart-info-label';
  parent.insertBefore(row, anchorEl);
  row.append(anchorEl);
  return row;
}

/**
 * @param {Element} anchorEl  the chart's label
 * @param {{ id: string, title: string, what: string, how: string }} spec
 */
export function mountChartInfo(anchorEl, spec) {
  if (!anchorEl?.ownerDocument?.createElement || !spec?.what || !spec?.how) return null;
  if (anchorEl._hubChartInfo) {
    anchorEl._hubChartInfo.setCopy(spec);
    return anchorEl._hubChartInfo;
  }

  const doc = anchorEl.ownerDocument;
  const row = ensureRow(anchorEl);
  if (!row) return null;

  const noteId = `hub-chart-info-${String(spec.id || 'chart').replace(/[^a-z0-9_-]+/gi, '-')}`;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'hub-chart-info';
  button.textContent = 'i';
  button.setAttribute('aria-label', 'About this chart');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', noteId);

  const note = doc.createElement('div');
  note.className = 'hub-chart-info__note';
  note.id = noteId;
  note.hidden = true;
  note.setAttribute('role', 'dialog');
  note.setAttribute('aria-modal', 'false');
  const whatHead = doc.createElement('h3');
  const whatBody = doc.createElement('p');
  const howHead = doc.createElement('h3');
  const howBody = doc.createElement('p');
  whatHead.textContent = 'What this shows';
  howHead.textContent = "How it's worked out";
  note.append(whatHead, whatBody, howHead, howBody);
  (doc.body || doc.documentElement).append(note);
  row.append(button);

  const api = {
    button,
    note,
    pinned: false,
    setCopy({ id, title, what, how }) {
      const nextId = `hub-chart-info-${String(id || 'chart').replace(/[^a-z0-9_-]+/gi, '-')}`;
      note.id = nextId;
      button.setAttribute('aria-controls', nextId);
      note.setAttribute('aria-label', title || 'About this chart');
      whatBody.textContent = what;
      howBody.textContent = how;
    }
  };
  api.setCopy(spec);
  anchorEl._hubChartInfo = api;
  bindDocument(doc);

  const hideUnlessPinned = () => {
    if (!api.pinned) closeApi(api);
  };
  button.addEventListener('mouseenter', () => { if (hoverable()) show(api, false); });
  button.addEventListener('mouseleave', hideUnlessPinned);
  button.addEventListener('focus', () => show(api, false));
  button.addEventListener('blur', hideUnlessPinned);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (api.pinned) closeApi(api);
    else show(api, true);
  });
  return api;
}
