/**
 * Hub list builder — the one add / rearrange / delete pattern for every
 * repeatable list a person builds in a hub: nested lesson blocks, tab panels,
 * accordion items, quiz questions, gallery images, timeline events, table rows,
 * chart series, travel tips, unit sequences.
 *
 * Row anatomy: drag grip · content · ··· menu. The grip and menu fade in on
 * hover / focus (always visible on touch). Reorder three ways — drag the grip,
 * Move up / Move down in the menu, or Alt + ↑ / ↓ on the grip. Delete lives in
 * the menu as a press-and-hold action, then offers Undo.
 *
 * Paint: hub-list.css. Spec: packages/design-kit/README.md § List builder.
 */
import { offerTimedUndo } from './hub-feedback.js';

export const HUB_HOLD_MS = 650;

const SVG = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

export const HUB_LIST_ICONS = {
  grip: SVG(
    '<g fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>'
  ),
  more: SVG(
    '<g fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></g>'
  ),
  plus: SVG(`<path ${STROKE} stroke-width="2" d="M12 5v14M5 12h14"/>`),
  up: SVG(`<path ${STROKE} d="M12 19V5M6 11l6-6 6 6"/>`),
  down: SVG(`<path ${STROKE} d="M12 5v14M6 13l6 6 6-6"/>`),
  left: SVG(`<path ${STROKE} d="M19 12H5M11 6l-6 6 6 6"/>`),
  right: SVG(`<path ${STROKE} d="M5 12h14M13 6l6 6-6 6"/>`),
  copy: SVG(
    `<g ${STROKE}><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></g>`
  ),
  trash: SVG(`<path ${STROKE} d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>`),
  columns: SVG(`<g ${STROKE}><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16"/></g>`),
  edit: SVG(`<path ${STROKE} d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM14 6l4 4"/>`),
  check: SVG(`<path ${STROKE} stroke-width="2" d="M5 12.5l4.5 4.5L19 7.5"/>`)
};

let listSeq = 0;
/** @type {null | { list: object, key: string, index: number, group: string, data: unknown }} */
let activeDrag = null;

const DRAG_MIME = 'application/x-hub-list';

function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function iconButton(className, icon, label) {
  const btn = el('button', className, { type: 'button', 'aria-label': label, title: label });
  btn.innerHTML = icon;
  return btn;
}

function cap(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/* ── Menu ─────────────────────────────────────────────────────────────── */

let openMenu = null;

export function closeHubMenu() {
  if (!openMenu) return;
  const { panel, anchor, cleanup } = openMenu;
  openMenu = null;
  cleanup();
  panel.remove();
  anchor.setAttribute('aria-expanded', 'false');
  anchor.classList.remove('is-open');
}

/**
 * Press-and-hold confirm. The fill sweeps across the control while held;
 * letting go early cancels. Works with mouse, touch, and Enter / Space.
 * @param {HTMLElement} target
 * @param {{ onConfirm: () => void, ms?: number, onEarlyRelease?: () => void }} opts
 */
export function bindHoldToConfirm(target, { onConfirm, ms = HUB_HOLD_MS, onEarlyRelease }) {
  let timer = 0;
  let holding = false;
  target.style.setProperty('--hub-hold-ms', `${ms}ms`);

  const start = () => {
    if (holding || target.matches(':disabled')) return;
    holding = true;
    target.classList.add('is-holding');
    timer = window.setTimeout(() => {
      holding = false;
      target.classList.remove('is-holding');
      target.classList.add('is-confirmed');
      onConfirm();
    }, ms);
  };
  const cancel = () => {
    if (!holding) return;
    holding = false;
    window.clearTimeout(timer);
    target.classList.remove('is-holding');
    onEarlyRelease?.();
  };

  target.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    start();
  });
  target.addEventListener('pointerup', cancel);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('lostpointercapture', cancel);
  target.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) start();
  });
  target.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' || event.key === ' ') cancel();
  });
  target.addEventListener('blur', cancel);
  // A plain click never deletes — it only teaches the gesture.
  target.addEventListener('click', (event) => event.preventDefault());
  target.addEventListener('contextmenu', (event) => event.preventDefault());
}

/**
 * @typedef {{
 *   label: string,
 *   icon?: string,
 *   hint?: string,
 *   onSelect?: () => void,
 *   disabled?: boolean,
 *   reason?: string,
 *   danger?: boolean,
 *   hold?: boolean,
 *   dataset?: Record<string, string>
 * } | 'separator'} HubMenuItem
 */

/**
 * Opens the shared hub menu under `anchor`. Re-opening the same anchor closes it.
 * @param {HTMLElement} anchor
 * @param {HubMenuItem[]} items
 * @param {{ label?: string }} [opts]
 */
export function openHubMenu(anchor, items, opts = {}) {
  if (openMenu?.anchor === anchor) {
    closeHubMenu();
    return null;
  }
  closeHubMenu();
  const doc = anchor.ownerDocument;
  const panel = el('div', 'hub-action-menu', { role: 'menu' });
  if (opts.label) panel.setAttribute('aria-label', opts.label);

  for (const item of items) {
    if (item === 'separator') {
      panel.append(el('div', 'hub-action-menu__sep', { role: 'separator' }));
      continue;
    }
    const btn = el('button', 'hub-action-menu__item', { type: 'button', role: 'menuitem' });
    if (item.danger) btn.classList.add('hub-action-menu__item--danger');
    if (item.hold) btn.classList.add('hub-action-menu__item--hold');
    if (item.dataset) Object.assign(btn.dataset, item.dataset);
    btn.disabled = Boolean(item.disabled);
    const icon = el('span', 'hub-action-menu__icon');
    icon.innerHTML = item.icon ?? '';
    const text = el('span', 'hub-action-menu__label');
    text.textContent = item.label;
    const hint = el('span', 'hub-action-menu__hint');
    hint.textContent = item.hold ? 'Hold' : (item.hint ?? '');
    btn.append(icon, text, hint);
    panel.append(btn);

    if (item.disabled && item.reason) {
      const why = el('p', 'hub-action-menu__reason');
      why.textContent = item.reason;
      panel.append(why);
    }
    if (item.disabled) continue;

    if (item.hold) {
      btn.setAttribute('aria-label', `${item.label}. Press and hold to confirm`);
      bindHoldToConfirm(btn, {
        onConfirm: () => {
          closeHubMenu();
          item.onSelect?.();
        },
        onEarlyRelease: () => {
          hint.textContent = 'Keep holding';
          btn.classList.add('is-nudged');
        }
      });
    } else {
      btn.addEventListener('click', () => {
        closeHubMenu();
        item.onSelect?.();
      });
    }
  }

  doc.body.append(panel);
  place(panel, anchor);

  const onPointer = (event) => {
    if (panel.contains(event.target) || anchor.contains(event.target)) return;
    closeHubMenu();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHubMenu();
      anchor.focus();
      return;
    }
    if (event.key === 'Tab') {
      closeHubMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const live = [...panel.querySelectorAll('.hub-action-menu__item:not(:disabled)')];
      if (!live.length) return;
      const at = live.indexOf(doc.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      live[(at + step + live.length) % live.length].focus();
    }
  };
  const onScroll = (event) => {
    if (panel.contains(event.target)) return;
    closeHubMenu();
  };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey, true);
  doc.defaultView?.addEventListener('scroll', onScroll, true);
  doc.defaultView?.addEventListener('resize', closeHubMenu);

  openMenu = {
    panel,
    anchor,
    cleanup: () => {
      doc.removeEventListener('pointerdown', onPointer, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.defaultView?.removeEventListener('scroll', onScroll, true);
      doc.defaultView?.removeEventListener('resize', closeHubMenu);
    }
  };
  anchor.setAttribute('aria-expanded', 'true');
  anchor.classList.add('is-open');
  panel.querySelector('.hub-action-menu__item:not(:disabled)')?.focus({ preventScroll: true });
  return panel;
}

function place(panel, anchor) {
  const view = anchor.ownerDocument.defaultView;
  const r = anchor.getBoundingClientRect();
  const w = panel.offsetWidth || 224;
  const h = panel.offsetHeight || 0;
  const vw = view?.innerWidth ?? 1024;
  const vh = view?.innerHeight ?? 768;
  // Wide anchors (an "Add …" row) open under their start; icon triggers align right.
  const ideal = r.width > w ? r.left : r.right - w;
  const left = Math.min(vw - w - 12, Math.max(12, ideal));
  let top = r.bottom + 6;
  if (h && top + h > vh - 12) top = Math.max(12, r.top - h - 6);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

/**
 * A ··· trigger that opens the hub menu with fresh items each time.
 * @param {() => HubMenuItem[]} getItems
 * @param {{ label?: string, className?: string }} [opts]
 */
export function createHubMenuButton(getItems, opts = {}) {
  const label = opts.label ?? 'More options';
  const btn = iconButton(['hub-list__more', opts.className].filter(Boolean).join(' '), HUB_LIST_ICONS.more, label);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    openHubMenu(btn, getItems(), { label });
  });
  return btn;
}

/* ── List ─────────────────────────────────────────────────────────────── */

/**
 * @template T
 * @param {import('./hub-list').HubListOptions<T>} options
 * @returns {import('./hub-list').HubListHandle<T>}
 */
export function createHubList(options) {
  const id = `hub-list-${(listSeq += 1)}`;
  const noun = options.noun ?? 'item';
  const group = options.group ?? id;
  const min = options.min ?? 0;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const reorderable = options.reorderable !== false;
  const autoKeys = new WeakMap();
  let autoSeq = 0;

  let items = [...options.items];

  const root = el('div', `hub-list hub-list--${options.variant ?? 'items'}`, { role: 'list' });
  root.setAttribute('aria-label', options.label ?? `${cap(noun)}s`);
  root.dataset.hubList = id;

  const keyOf = (item) => {
    if (options.getKey) return String(options.getKey(item));
    if (item && typeof item === 'object') {
      if (!autoKeys.has(item)) autoKeys.set(item, `k${(autoSeq += 1)}`);
      return autoKeys.get(item);
    }
    return String(item);
  };

  /** Direct children with a class (no :scope — keeps test DOMs and old engines happy). */
  const own = (cls) => [...root.children].filter((child) => child.classList.contains(cls));

  const api = {
    el: root,
    get items() {
      return items;
    },
    setItems(next) {
      items = [...next];
      render();
    },
    refresh: () => render(),
    focusItem(index) {
      own('hub-list__row')[index]?.querySelector('input, textarea, select, [contenteditable="true"], button')?.focus();
    },
    insert: (index, item) => insertAt(index, item),
    dispose() {
      if (activeDrag?.list === api) activeDrag = null;
      root.remove();
    }
  };

  function commit(next, focus) {
    items = next;
    options.onChange([...items]);
    render(focus);
  }

  function minReason() {
    return options.minReason ?? `Keep at least ${min} ${min === 1 ? noun : `${noun}s`}.`;
  }
  function maxReason() {
    return options.maxReason ?? `This holds up to ${max} ${noun}s.`;
  }

  function move(from, to, focusGrip = false) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next, { key: keyOf(moved), grip: focusGrip, flash: true });
  }

  function insertAt(index, item) {
    if (!item || items.length >= max) return;
    const next = [...items];
    const at = Math.max(0, Math.min(index, next.length));
    next.splice(at, 0, item);
    commit(next, { key: keyOf(item), field: true, flash: true });
  }

  function requestInsert(index, anchor) {
    if (items.length >= max) return;
    if (options.pick) {
      options.pick(anchor, (item) => insertAt(index, item), index);
      return;
    }
    insertAt(index, options.create?.(index));
  }

  function removeAt(index) {
    if (items.length <= min) return;
    const gone = items[index];
    const next = items.filter((_, i) => i !== index);
    commit(next, { index: Math.min(index, next.length - 1), grip: true });
    options.onRemove?.(gone, index);
    if (options.undo === false) return;
    const name = options.describe?.(gone, index) ?? cap(noun);
    offerTimedUndo({
      message: `${name} deleted`,
      onUndo: () => {
        const current = options.read ? [...options.read()] : [...items];
        current.splice(Math.min(index, current.length), 0, gone);
        if (!root.isConnected && options.read) {
          options.onChange(current);
          return;
        }
        commit(current, { key: keyOf(gone), flash: true });
      }
    });
  }

  function duplicateAt(index) {
    if (!options.duplicate || items.length >= max) return;
    const copy = options.duplicate(items[index], index);
    if (copy) insertAt(index + 1, copy);
  }

  function menuItems(item, index) {
    const atMin = items.length <= min;
    const atMax = items.length >= max;
    const vertical = options.axis !== 'horizontal';
    /** @type {any[]} */
    const list = [];
    if (reorderable) {
      list.push(
        {
          label: vertical ? 'Move up' : 'Move left',
          icon: vertical ? HUB_LIST_ICONS.up : HUB_LIST_ICONS.left,
          hint: vertical ? 'Alt ↑' : 'Alt ←',
          disabled: index === 0,
          dataset: { listAction: 'up' },
          onSelect: () => move(index, index - 1)
        },
        {
          label: vertical ? 'Move down' : 'Move right',
          icon: vertical ? HUB_LIST_ICONS.down : HUB_LIST_ICONS.right,
          hint: vertical ? 'Alt ↓' : 'Alt →',
          disabled: index === items.length - 1,
          dataset: { listAction: 'down' },
          onSelect: () => move(index, index + 1)
        }
      );
    }
    for (const extra of options.extraMenuItems?.(item, index) ?? []) list.push(extra);
    if (options.duplicate) {
      list.push({
        label: 'Duplicate',
        icon: HUB_LIST_ICONS.copy,
        disabled: atMax,
        reason: atMax ? maxReason() : undefined,
        dataset: { listAction: 'duplicate' },
        onSelect: () => duplicateAt(index)
      });
    }
    const blocked = options.canRemove?.(item, index);
    list.push('separator', {
      label: `Delete ${noun}`,
      icon: HUB_LIST_ICONS.trash,
      danger: true,
      hold: true,
      disabled: atMin || typeof blocked === 'string',
      reason: atMin ? minReason() : typeof blocked === 'string' ? blocked : undefined,
      dataset: { listAction: 'delete' },
      onSelect: () => removeAt(index)
    });
    return list;
  }

  /* drag */

  function dropIndexFor(row, index, event) {
    const r = row.getBoundingClientRect();
    if (options.axis === 'horizontal') return event.clientX > r.left + r.width / 2 ? index + 1 : index;
    return event.clientY > r.top + r.height / 2 ? index + 1 : index;
  }

  function accepts() {
    if (!activeDrag || activeDrag.group !== group) return false;
    return activeDrag.list === api || Boolean(options.onTransfer);
  }

  function showDrop(index) {
    own('hub-list__gap--drop').forEach((g) => g.classList.remove('hub-list__gap--drop'));
    own('hub-list__gap').find((g) => g.dataset.index === String(index))?.classList.add('hub-list__gap--drop');
  }

  function clearDrop() {
    own('hub-list__gap--drop').forEach((g) => g.classList.remove('hub-list__gap--drop'));
  }

  function bindDrop(target, indexFor) {
    target.addEventListener('dragover', (event) => {
      if (!accepts()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      showDrop(indexFor(event));
    });
    target.addEventListener('drop', (event) => {
      if (!accepts()) return;
      event.preventDefault();
      event.stopPropagation();
      clearDrop();
      const to = indexFor(event);
      const drag = activeDrag;
      activeDrag = null;
      if (!drag) return;
      if (drag.list === api) {
        const from = drag.index;
        move(from, from < to ? to - 1 : to);
      } else {
        options.onTransfer?.({ data: drag.data, index: drag.index }, to);
      }
    });
  }

  root.addEventListener('dragleave', (event) => {
    if (!root.contains(/** @type {Node} */ (event.relatedTarget))) clearDrop();
  });

  /* render */

  function gap(index) {
    const g = el('div', 'hub-list__gap');
    g.dataset.index = String(index);
    if (options.insertBetween && items.length < max) {
      const b = iconButton('hub-list__insert', HUB_LIST_ICONS.plus, `Insert ${noun} here`);
      b.addEventListener('click', () => requestInsert(index, b));
      g.append(b);
    }
    bindDrop(g, () => index);
    return g;
  }

  function render(focus) {
    root.replaceChildren();
    root.classList.toggle('hub-list--empty', items.length === 0);

    if (items.length === 0 && options.empty) {
      root.append(
        options.empty(
          (item) => insertAt(0, item),
          (anchor) => requestInsert(0, anchor)
        )
      );
      return;
    }

    root.append(gap(0));
    items.forEach((item, index) => {
      const key = keyOf(item);
      const row = el('div', 'hub-list__row', { role: 'listitem' });
      row.dataset.key = key;
      row.dataset.index = String(index);

      const grip = iconButton(
        'hub-list__grip',
        HUB_LIST_ICONS.grip,
        `Move ${noun} ${index + 1}. Drag, or press Alt and an arrow key`
      );
      grip.title = 'Drag to reorder';
      if (!reorderable || items.length < 2) grip.disabled = true;
      grip.draggable = reorderable && items.length > 1;
      grip.addEventListener('click', (event) => event.stopPropagation());
      grip.addEventListener('dragstart', (event) => {
        event.stopPropagation();
        activeDrag = { list: api, key, index, group, data: options.dragData?.(item, index) };
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(DRAG_MIME, group);
          event.dataTransfer.setData('text/plain', options.describe?.(item, index) ?? noun);
          event.dataTransfer.setDragImage?.(row, 20, 16);
        }
        requestAnimationFrame(() => row.classList.add('hub-list__row--dragging'));
      });
      grip.addEventListener('dragend', () => {
        row.classList.remove('hub-list__row--dragging');
        if (activeDrag?.list === api) activeDrag = null;
        clearDrop();
      });
      grip.addEventListener('keydown', (event) => {
        if (!event.altKey) return;
        const back = options.axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
        const fwd = options.axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
        if (event.key === back) {
          event.preventDefault();
          move(index, index - 1, true);
        } else if (event.key === fwd) {
          event.preventDefault();
          move(index, index + 1, true);
        }
      });

      const body = el('div', 'hub-list__body');
      const label = options.itemLabel?.(item, index);
      if (label) {
        const head = el('div', 'hub-list__label');
        if (typeof label === 'string') head.textContent = label;
        else head.append(label);
        body.append(head);
      }
      body.append(
        options.renderItem(item, {
          index,
          update(nextItem) {
            const at = items.findIndex((x) => keyOf(x) === key);
            if (at < 0) return;
            if (nextItem && typeof nextItem === 'object' && !options.getKey) autoKeys.set(nextItem, key);
            items = items.map((x, i) => (i === at ? nextItem : x));
            options.onChange([...items]);
          },
          get current() {
            return items.find((x) => keyOf(x) === key) ?? item;
          }
        })
      );

      const more = createHubMenuButton(() => menuItems(items.find((x) => keyOf(x) === key) ?? item, index), {
        label: `${cap(noun)} ${index + 1} options`
      });

      row.append(grip, body, more);
      bindDrop(row, (event) => dropIndexFor(row, index, event));
      root.append(row, gap(index + 1));
    });

    if (options.addLabel !== false) {
      const add = el('button', 'hub-list__add', { type: 'button' });
      add.innerHTML = `${HUB_LIST_ICONS.plus}<span>${options.addLabel ?? `Add ${noun}`}</span>`;
      add.disabled = items.length >= max;
      if (add.disabled) add.title = maxReason();
      add.addEventListener('click', () => requestInsert(items.length, add));
      root.append(add);
    }

    if (focus) applyFocus(focus);
  }

  function applyFocus(focus) {
    const rows = own('hub-list__row');
    const row = focus.key ? rows.find((r) => r.dataset.key === focus.key) : rows[focus.index ?? -1];
    if (!row) {
      own('hub-list__add')[0]?.focus({ preventScroll: true });
      return;
    }
    if (focus.flash) {
      row.classList.add('hub-list__row--flash');
      setTimeout(() => row.classList.remove('hub-list__row--flash'), 900);
    }
    if (focus.grip) row.querySelector('.hub-list__grip')?.focus({ preventScroll: true });
    else if (focus.field) {
      row
        .querySelector('.hub-list__body input:not([type="checkbox"]), .hub-list__body textarea, .hub-list__body [contenteditable="true"]')
        ?.focus({ preventScroll: true });
    }
  }

  render();
  return api;
}

/* ── Insert picker ────────────────────────────────────────────────────── */

/**
 * Searchable picker for typed inserts (block types). Same groups, names and
 * icons as the page palette, filtered to what the container allows.
 * @param {HTMLElement} anchor
 * @param {{ groups: Array<{ label: string, options: Array<{ value: string, label: string, description?: string, iconSrc?: string }> }>, onPick: (value: string) => void, placeholder?: string }} opts
 */
export function openHubInsertPicker(anchor, opts) {
  if (openMenu?.anchor === anchor) {
    closeHubMenu();
    return;
  }
  closeHubMenu();
  const doc = anchor.ownerDocument;
  const panel = el('div', 'hub-action-menu hub-insert', { role: 'dialog', 'aria-label': 'Add block' });
  const search = el('input', 'hub-insert__search', {
    type: 'search',
    placeholder: opts.placeholder ?? 'Search blocks',
    'aria-label': opts.placeholder ?? 'Search blocks'
  });
  const list = el('div', 'hub-insert__list', { role: 'listbox' });
  panel.append(search, list);

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const group of opts.groups) {
      const hits = group.options.filter((o) => !q || `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      const head = el('p', 'hub-insert__group');
      head.textContent = group.label;
      list.append(head);
      for (const option of hits) {
        const b = el('button', 'hub-action-menu__item hub-insert__option', { type: 'button', role: 'option' });
        b.dataset.value = option.value;
        const icon = el('span', 'hub-insert__icon');
        if (option.iconSrc) {
          const img = el('img', '', { alt: '', src: option.iconSrc });
          img.onerror = () => {
            img.remove();
            icon.textContent = option.label.slice(0, 1);
          };
          icon.append(img);
        } else icon.textContent = option.label.slice(0, 1);
        const copy = el('span', 'hub-insert__copy');
        const name = el('span', 'hub-insert__name');
        name.textContent = option.label;
        copy.append(name);
        if (option.description) {
          const desc = el('span', 'hub-insert__desc');
          desc.textContent = option.description;
          copy.append(desc);
        }
        b.append(icon, copy);
        b.addEventListener('click', () => {
          closeHubMenu();
          opts.onPick(option.value);
        });
        list.append(b);
      }
    }
    if (!list.children.length) {
      const none = el('p', 'hub-action-menu__reason');
      none.textContent = 'No block matches that.';
      list.append(none);
    }
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      /** @type {HTMLButtonElement | null} */ (list.querySelector('.hub-insert__option'))?.click();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      /** @type {HTMLElement | null} */ (list.querySelector('.hub-insert__option'))?.focus();
    }
  });
  draw();

  doc.body.append(panel);
  place(panel, anchor);
  const onPointer = (event) => {
    if (panel.contains(event.target) || anchor.contains(event.target)) return;
    closeHubMenu();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHubMenu();
      anchor.focus();
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && doc.activeElement !== search) {
      event.preventDefault();
      const live = [...list.querySelectorAll('.hub-insert__option')];
      const at = live.indexOf(doc.activeElement);
      const next = at + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) search.focus();
      else live[Math.min(next, live.length - 1)]?.focus();
    }
  };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey, true);
  openMenu = {
    panel,
    anchor,
    cleanup: () => {
      doc.removeEventListener('pointerdown', onPointer, true);
      doc.removeEventListener('keydown', onKey, true);
    }
  };
  anchor.setAttribute('aria-expanded', 'true');
  search.focus({ preventScroll: true });
}

/* ── Tab strip editor ─────────────────────────────────────────────────── */

/**
 * Editable tab strip: rename on the tab, drag sideways, ··· for move /
 * duplicate / hold-to-delete, + to add. The caller renders the active panel.
 * @template T
 * @param {import('./hub-list').HubTabStripOptions<T>} options
 */
export function createHubTabStrip(options) {
  const root = el('div', 'hub-tabstrip');
  const bar = el('div', 'hub-tabstrip__bar', { role: 'tablist', 'aria-label': options.label ?? 'Tabs' });
  const panel = el('div', 'hub-tabstrip__panel', { role: 'tabpanel' });
  root.append(bar, panel);

  let tabs = [...options.tabs];
  let active = Math.min(options.active ?? 0, Math.max(0, tabs.length - 1));
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  let dragFrom = -1;
  // Panels edit their own content through the caller, so re-read before every
  // structural change or a rename would write back stale panel content.
  const sync = () => {
    if (options.read) tabs = [...options.read()];
    return tabs;
  };

  function commit(next, nextActive, focusTab = false) {
    tabs = next;
    active = Math.max(0, Math.min(nextActive, tabs.length - 1));
    options.onChange([...tabs]);
    render(focusTab);
  }

  function moveTab(from, to) {
    sync();
    if (to < 0 || to >= tabs.length || from === to) return;
    const next = [...tabs];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    commit(next, to, true);
  }

  function removeTab(index) {
    sync();
    if (tabs.length <= min) return;
    const gone = tabs[index];
    const prevActive = active;
    commit(tabs.filter((_, i) => i !== index), Math.min(index, tabs.length - 2));
    const label = options.getLabel(gone).trim() || `Tab ${index + 1}`;
    const count = options.countChildren?.(gone) ?? 0;
    offerTimedUndo({
      message: `“${label}” deleted${count ? ` with ${count} block${count === 1 ? '' : 's'}` : ''}`,
      onUndo: () => {
        const current = [...sync()];
        current.splice(Math.min(index, current.length), 0, gone);
        commit(current, prevActive);
      }
    });
  }

  function render(focusTab = false) {
    sync();
    bar.replaceChildren();
    tabs.forEach((tab, index) => {
      const on = index === active;
      const t = el('div', `hub-tabstrip__tab${on ? ' is-active' : ''}`, {
        role: 'tab',
        'aria-selected': String(on)
      });
      t.draggable = tabs.length > 1;
      const input = el('input', 'hub-tabstrip__name', {
        type: 'text',
        'aria-label': `Tab ${index + 1} name`,
        placeholder: `Tab ${index + 1}`
      });
      input.value = options.getLabel(tab);
      const size = () => {
        input.size = Math.max(4, (input.value || input.placeholder).length + 1);
      };
      size();
      input.readOnly = !on;
      input.addEventListener('pointerdown', (event) => {
        if (on) return;
        event.preventDefault();
        active = index;
        render(true);
      });
      input.addEventListener('focus', () => {
        if (on) return;
        active = index;
        render(true);
      });
      input.addEventListener('input', () => {
        size();
        sync();
        const next = options.setLabel(tabs[index], input.value);
        tabs = tabs.map((x, i) => (i === index ? next : x));
        options.onChange([...tabs]);
      });
      input.addEventListener('keydown', (event) => {
        if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          moveTab(index, index + (event.key === 'ArrowLeft' ? -1 : 1));
        } else if (!event.altKey && on && input.selectionStart === input.selectionEnd) {
          // Plain arrows at the text edge step between tabs, like a tablist.
          if (event.key === 'ArrowLeft' && input.selectionStart === 0 && index > 0) {
            event.preventDefault();
            active = index - 1;
            render(true);
          } else if (event.key === 'ArrowRight' && input.selectionStart === input.value.length && index < tabs.length - 1) {
            event.preventDefault();
            active = index + 1;
            render(true);
          }
        }
      });

      const atMin = tabs.length <= min;
      const atMax = tabs.length >= max;
      const more = createHubMenuButton(
        () => [
          { label: 'Move left', icon: HUB_LIST_ICONS.left, hint: 'Alt ←', disabled: index === 0, dataset: { listAction: 'left' }, onSelect: () => moveTab(index, index - 1) },
          { label: 'Move right', icon: HUB_LIST_ICONS.right, hint: 'Alt →', disabled: index === tabs.length - 1, dataset: { listAction: 'right' }, onSelect: () => moveTab(index, index + 1) },
          ...(options.duplicate
            ? [{
                label: 'Duplicate tab',
                icon: HUB_LIST_ICONS.copy,
                disabled: atMax,
                reason: atMax ? options.maxReason : undefined,
                dataset: { listAction: 'duplicate' },
                onSelect: () => {
                  const next = [...sync()];
                  next.splice(index + 1, 0, options.duplicate(next[index]));
                  commit(next, index + 1, true);
                }
              }]
            : []),
          'separator',
          {
            label: 'Delete tab',
            icon: HUB_LIST_ICONS.trash,
            danger: true,
            hold: true,
            disabled: atMin,
            reason: atMin ? options.minReason : undefined,
            dataset: { listAction: 'delete' },
            onSelect: () => removeTab(index)
          }
        ],
        { label: `Tab ${index + 1} options`, className: 'hub-tabstrip__more' }
      );
      more.tabIndex = on ? 0 : -1;

      t.addEventListener('dragstart', (event) => {
        event.stopPropagation();
        dragFrom = index;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', input.value || `Tab ${index + 1}`);
        }
        requestAnimationFrame(() => t.classList.add('is-dragging'));
      });
      t.addEventListener('dragend', () => {
        dragFrom = -1;
        t.classList.remove('is-dragging');
        bar.querySelectorAll('.is-drop-before, .is-drop-after').forEach((x) => x.classList.remove('is-drop-before', 'is-drop-after'));
      });
      t.addEventListener('dragover', (event) => {
        if (dragFrom < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const r = t.getBoundingClientRect();
        const before = event.clientX < r.left + r.width / 2;
        bar.querySelectorAll('.is-drop-before, .is-drop-after').forEach((x) => x.classList.remove('is-drop-before', 'is-drop-after'));
        t.classList.add(before ? 'is-drop-before' : 'is-drop-after');
      });
      t.addEventListener('drop', (event) => {
        if (dragFrom < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const r = t.getBoundingClientRect();
        let to = event.clientX < r.left + r.width / 2 ? index : index + 1;
        const from = dragFrom;
        dragFrom = -1;
        if (from < to) to -= 1;
        moveTab(from, to);
      });

      t.append(input, more);
      bar.append(t);
    });

    const add = iconButton('hub-tabstrip__add', HUB_LIST_ICONS.plus, 'Add tab');
    add.disabled = tabs.length >= max;
    if (add.disabled && options.maxReason) add.title = options.maxReason;
    add.addEventListener('click', () => {
      sync();
      if (tabs.length >= max) return;
      commit([...tabs, options.create(tabs.length)], tabs.length, true);
    });
    bar.append(add);

    panel.replaceChildren();
    if (tabs[active]) panel.append(options.renderPanel(tabs[active], active));
    options.onActiveChange?.(active);
    if (focusTab) bar.querySelector('.hub-tabstrip__tab.is-active .hub-tabstrip__name')?.focus({ preventScroll: true });
  }

  render();
  return {
    el: root,
    get active() {
      return active;
    },
    setTabs(next) {
      tabs = [...next];
      render();
    }
  };
}
