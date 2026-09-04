import { formatDisplayDate } from '../core/time.js';
import { morphFromRect } from '../../../../packages/design-kit/js/morphing-dialog.js';

const AGENT_LABEL = {
  vera: 'Vera',
  penelope: 'Penelope'
};

function sheetOf(root) {
  return root?.querySelector?.('#mind-thread-sheet') ?? null;
}

function hostTile(anchor) {
  if (!anchor) return null;
  if (typeof anchor.closest === 'function') {
    return anchor.closest('.mind-tile') || anchor.closest('.metric-card') || null;
  }
  let node = anchor;
  while (node) {
    const classes = String(node.className || '').split(/\s+/);
    if (classes.includes('mind-tile') || classes.includes('metric-card')) return node;
    node = node.parentNode;
  }
  return null;
}

function releaseTile(sheet) {
  sheet._tile?.classList?.remove?.('mind-tile--thread-open');
  sheet._tile = null;
}

function bindOnce(root, sheet) {
  if (sheet.dataset.bound) return;
  sheet.dataset.bound = '1';
  const close = () => closeMindThreadSheet(root);
  sheet.querySelector('[data-role="close"]')?.addEventListener('click', close);
  sheet.querySelector('[data-role="scrim"]')?.addEventListener('click', close);
  const target = globalThis.document ?? root;
  target.addEventListener?.('keydown', event => {
    if (event.key === 'Escape' && !sheet.hidden) close();
  });
  sheet.querySelector('[data-role="continue"]')?.addEventListener('click', () => {
    const slug = sheet._continueAgent;
    if (slug) sheet._onContinue?.(slug);
  });
}

export function openMindThreadSheet(root, { title, rows, continueAgent, onContinue, onClose, anchor } = {}) {
  const sheet = sheetOf(root);
  if (!sheet) return;
  if (!sheet._home) sheet._home = sheet.parentNode ?? root;
  sheet.hidden = false;
  sheet._onContinue = onContinue;
  sheet._onClose = onClose;
  sheet._continueAgent = continueAgent ?? null;

  releaseTile(sheet);
  const tile = hostTile(anchor);
  if (tile) {
    tile.classList?.add?.('mind-tile--thread-open');
    sheet._tile = tile;
    tile.append(sheet);
  } else {
    sheet._home?.append?.(sheet);
  }

  const titleEl = sheet.querySelector('[data-role="title"]');
  if (titleEl) titleEl.textContent = title ?? '';

  const host = sheet.querySelector('[data-role="rows"]');
  if (host) {
    const nodes = (rows ?? []).map(row => {
      const item = root.createElement('article');
      item.textContent = [formatDisplayDate(row.date), row.title, row.excerpt].filter(Boolean).join(' ');
      return item;
    });
    host.replaceChildren(...nodes);
  }

  const continueBtn = sheet.querySelector('[data-role="continue"]');
  if (continueBtn) {
    if (!continueAgent) {
      continueBtn.hidden = true;
    } else {
      continueBtn.hidden = false;
      continueBtn.textContent = `Continue with ${AGENT_LABEL[continueAgent] ?? continueAgent}`;
    }
  }

  bindOnce(root, sheet);
  const from = tile?.getBoundingClientRect?.();
  if (from?.width > 0 && from?.height > 0) morphFromRect(from, sheet);
}

export function closeMindThreadSheet(root) {
  const sheet = sheetOf(root);
  if (!sheet) return;
  releaseTile(sheet);
  sheet._home?.append?.(sheet);
  sheet.hidden = true;
  sheet._onClose?.();
}
