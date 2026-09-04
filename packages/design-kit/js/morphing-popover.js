import { prefersReducedMotion } from './hub-motion.js';

const DURATION_MS = 250;
const EASE = 'ease-out';
const VIEW_PAD = 12;

/** @type {{ close: (opts?: { restoreFocus?: boolean }) => void } | null} */
let openPopover = null;

function addClass(el, name) {
  if (!el) return;
  if (el.classList?.add) {
    el.classList.add(name);
    return;
  }
  const current = String(el.className || '');
  if (!current.split(/\s+/).includes(name)) el.className = `${current} ${name}`.trim();
}

function removeClass(el, name) {
  if (!el) return;
  if (el.classList?.remove) {
    el.classList.remove(name);
    return;
  }
  el.className = String(el.className || '')
    .split(/\s+/)
    .filter(token => token && token !== name)
    .join(' ');
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = hidden;
  if (hidden) el.setAttribute?.('hidden', '');
  else el.removeAttribute?.('hidden');
}

function textOf(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function viewOf(root) {
  const doc = ownerDoc(root);
  return doc?.defaultView ?? globalThis;
}

function canMeasure(el) {
  return typeof el?.getBoundingClientRect === 'function';
}

function firstFocusable(scope) {
  if (!scope?.querySelector) return null;
  return scope.querySelector('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
}

function uniqueLayoutId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampPanel(rect, width, height, view) {
  const vw = view.innerWidth ?? 800;
  const vh = view.innerHeight ?? 600;
  const maxW = Math.min(width, vw - VIEW_PAD * 2);
  const maxH = Math.min(height, vh - VIEW_PAD * 2);
  let left = rect.left;
  let top = rect.bottom + 6;
  if (top + maxH > vh - VIEW_PAD && rect.top > maxH + VIEW_PAD) {
    top = rect.top - maxH - 6;
  }
  left = Math.min(Math.max(VIEW_PAD, left), vw - maxW - VIEW_PAD);
  top = Math.min(Math.max(VIEW_PAD, top), vh - maxH - VIEW_PAD);
  return { left, top, width: maxW, height: maxH };
}

function animateBox(el, from, to, reduced) {
  if (reduced || typeof el.animate !== 'function') return Promise.resolve();
  const animation = el.animate(
    [
      {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        borderRadius: from.radius
      },
      {
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        borderRadius: to.radius
      }
    ],
    { duration: DURATION_MS, easing: EASE, fill: 'forwards' }
  );
  return animation.finished.catch(() => undefined);
}

function flipLabel(fromEl, toEl, reduced) {
  if (reduced || !canMeasure(fromEl) || !canMeasure(toEl) || typeof toEl.animate !== 'function') {
    return;
  }
  const first = fromEl.getBoundingClientRect();
  const last = toEl.getBoundingClientRect();
  toEl.animate(
    [
      { transform: `translate(${first.left - last.left}px, ${first.top - last.top}px)` },
      { transform: 'none' }
    ],
    { duration: DURATION_MS, easing: EASE }
  );
}

function closeOpen(opts) {
  if (!openPopover) return;
  const current = openPopover;
  openPopover = null;
  current.close(opts);
}

/**
 * Trigger that expands into a compact editor. Use for short notes, quick text,
 * and dimension / value edits.
 *
 * @param {object} options
 * @param {{ createElement: Function, querySelector?: Function }} options.root
 * @param {string} [options.triggerLabel]
 * @param {string} [options.title]
 * @param {string} [options.supporting]
 * @param {string} [options.layoutId]
 * @param {string} [options.triggerClass]
 * @param {string} [options.className]
 * @param {HTMLElement} [options.trigger]
 * @param {HTMLElement} [options.content]
 * @param {(body: HTMLElement, api: { close: Function, open: Function }) => void} [options.renderContent]
 * @param {boolean} [options.autoFocus]
 * @param {() => void} [options.onOpen]
 * @param {() => void} [options.onClose]
 */
export function createMorphingPopover({
  root,
  triggerLabel = 'Open',
  title,
  supporting = '',
  layoutId,
  triggerClass = 'btn btn--ghost',
  className = '',
  trigger: existingTrigger,
  content: existingContent,
  wrap: existingWrap,
  renderContent,
  autoFocus = true,
  onOpen,
  onClose
} = {}) {
  const host = root ?? globalThis.document;
  const doc = ownerDoc(host);
  const wrap = existingWrap ?? host.createElement('div');
  if (!existingWrap) {
    wrap.className = ['morphing-popover', className].filter(Boolean).join(' ');
    wrap.dataset.morphingPopover = '1';
  } else if (className) {
    addClass(wrap, className);
  }

  const labelId = layoutId || uniqueLayoutId('morphing-popover');
  const headingText = textOf(title, triggerLabel);

  const trigger = existingTrigger ?? host.createElement('button');
  if (!existingTrigger) {
    trigger.type = 'button';
    trigger.className = `${triggerClass} morphing-popover__trigger`.trim();
    const label = host.createElement('span');
    label.dataset.morphingLabel = labelId;
    label.textContent = triggerLabel;
    trigger.append(label);
  } else {
    addClass(trigger, 'morphing-popover__trigger');
    if (!trigger.querySelector?.('[data-morphing-label]')) {
      const label = host.createElement('span');
      label.dataset.morphingLabel = labelId;
      label.textContent = trigger.textContent || triggerLabel;
      if (trigger.replaceChildren) trigger.replaceChildren(label);
      else trigger.append(label);
    } else {
      const label = trigger.querySelector('[data-morphing-label]');
      if (label && !label.dataset.morphingLabel) label.dataset.morphingLabel = labelId;
    }
  }
  trigger.setAttribute?.('aria-expanded', 'false');
  trigger.setAttribute?.('aria-haspopup', 'dialog');

  const panel = existingContent ?? host.createElement('div');
  addClass(panel, 'morphing-popover__panel');
  panel.setAttribute?.('role', 'dialog');
  panel.setAttribute?.('aria-label', headingText);
  setHidden(panel, true);

  let body = panel.querySelector?.('[data-morphing-body]') ?? null;
  if (!existingContent) {
    const head = host.createElement('div');
    head.className = 'morphing-popover__head';
    const heading = host.createElement('h4');
    heading.className = 'morphing-popover__title';
    heading.dataset.morphingLabel = labelId;
    heading.textContent = headingText;
    head.append(heading);
    if (supporting) {
      const copy = host.createElement('p');
      copy.className = 'morphing-popover__supporting';
      copy.textContent = supporting;
      head.append(copy);
    }
    body = host.createElement('div');
    body.className = 'morphing-popover__body';
    body.dataset.morphingBody = '1';
    panel.append(head, body);
    renderContent?.(body, api());
  } else {
    addClass(panel, 'morphing-popover__panel');
    if (!panel.querySelector?.('.morphing-popover__title') && headingText) {
      const heading = host.createElement('h4');
      heading.className = 'morphing-popover__title';
      heading.dataset.morphingLabel = labelId;
      heading.textContent = headingText;
      panel.insertBefore?.(heading, panel.firstChild) ?? panel.append(heading);
    }
    body = panel.querySelector?.('[data-morphing-body]') ?? panel;
  }

  if (trigger.parentNode !== wrap || panel.parentNode !== wrap) {
    wrap.append(trigger, panel);
  }

  const home = { parent: null, next: null };
  let opened = false;

  function api() {
    return { open, close, isOpen: () => opened };
  }

  function restoreHome() {
    if (!home.parent) return;
    if (home.next?.parentNode === home.parent) home.parent.insertBefore?.(panel, home.next);
    else home.parent.append?.(panel);
    home.parent = null;
    home.next = null;
  }

  function portal() {
    const dest = doc?.body;
    if (!dest || panel.parentNode === dest) return;
    home.parent = panel.parentNode ?? wrap;
    home.next = panel.nextSibling ?? null;
    dest.append?.(panel);
  }

  function finishClose({ restoreFocus = true } = {}) {
    opened = false;
    if (openPopover === apiRef) openPopover = null;
    removeClass(wrap, 'is-open');
    removeClass(panel, 'is-floating');
    removeClass(panel, 'is-animating');
    removeClass(panel, 'is-ready');
    panel.style && (panel.style.cssText = '');
    setHidden(panel, true);
    restoreHome();
    trigger.setAttribute?.('aria-expanded', 'false');
    onClose?.();
    if (restoreFocus) trigger.focus?.();
  }

  function close(opts = {}) {
    if (!opened) return;
    const reduced = prefersReducedMotion(host);
    const triggerRect = canMeasure(trigger) ? trigger.getBoundingClientRect() : null;
    const panelRect = canMeasure(panel) ? panel.getBoundingClientRect() : null;
    removeClass(panel, 'is-ready');
    addClass(panel, 'is-animating');

    const run = () => finishClose(opts);
    if (!reduced && triggerRect && panelRect && typeof panel.animate === 'function') {
      const radius = viewOf(host).getComputedStyle?.(trigger)?.borderRadius || '0.875rem';
      animateBox(
        panel,
        { left: panelRect.left, top: panelRect.top, width: panelRect.width, height: panelRect.height, radius: viewOf(host).getComputedStyle?.(panel)?.borderRadius || '1.25rem' },
        { left: triggerRect.left, top: triggerRect.top, width: triggerRect.width, height: triggerRect.height, radius },
        reduced
      ).then(run);
      return;
    }
    run();
  }

  function open() {
    if (opened) return;
    closeOpen({ restoreFocus: false });
    opened = true;
    openPopover = apiRef;
    trigger.setAttribute?.('aria-expanded', 'true');
    addClass(wrap, 'is-open');
    setHidden(panel, false);
    addClass(panel, 'is-floating');
    addClass(panel, 'is-animating');
    portal();

    const reduced = prefersReducedMotion(host);
    const triggerRect = canMeasure(trigger) ? trigger.getBoundingClientRect() : null;
    if (triggerRect && panel.style) {
      panel.style.left = `${triggerRect.left}px`;
      panel.style.top = `${triggerRect.top}px`;
      panel.style.width = `${triggerRect.width}px`;
      panel.style.height = `${triggerRect.height}px`;
    }

    const focusFirst = () => {
      if (!autoFocus) return;
      firstFocusable(panel)?.focus?.();
    };
    focusFirst();

    const settle = () => {
      removeClass(panel, 'is-animating');
      addClass(panel, 'is-ready');
      focusFirst();
      onOpen?.();
    };

    const measureAndPlay = () => {
      if (!canMeasure(panel) || !triggerRect) {
        settle();
        return;
      }
      panel.style.width = '';
      panel.style.height = '';
      const natural = panel.getBoundingClientRect();
      const view = viewOf(host);
      const to = clampPanel(triggerRect, natural.width || 320, natural.height || 160, view);
      const radius = view.getComputedStyle?.(panel)?.borderRadius || '1.25rem';
      const triggerRadius = view.getComputedStyle?.(trigger)?.borderRadius || '0.875rem';
      panel.style.left = `${to.left}px`;
      panel.style.top = `${to.top}px`;
      panel.style.width = `${to.width}px`;
      panel.style.height = `${to.height}px`;
      const titleEl = panel.querySelector?.('[data-morphing-label]') ?? panel.querySelector?.('.morphing-popover__title');
      const triggerLabelEl = trigger.querySelector?.('[data-morphing-label]') ?? trigger;
      flipLabel(triggerLabelEl, titleEl, reduced);
      animateBox(
        panel,
        {
          left: triggerRect.left,
          top: triggerRect.top,
          width: triggerRect.width,
          height: triggerRect.height,
          radius: triggerRadius
        },
        { left: to.left, top: to.top, width: to.width, height: to.height, radius },
        reduced
      ).then(settle);
    };

    const frame = viewOf(host).requestAnimationFrame;
    if (typeof frame === 'function') frame(() => frame(measureAndPlay));
    else measureAndPlay();
  }

  function onTriggerClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (opened) close();
    else open();
  }

  function onDocPointer(event) {
    if (!opened) return;
    const target = event?.target;
    if (!target) return;
    if (panel.contains?.(target) || trigger.contains?.(target) || wrap.contains?.(target)) return;
    close({ restoreFocus: false });
  }

  function onDocKey(event) {
    if (event?.key === 'Escape' && opened) {
      event.preventDefault?.();
      close();
    }
  }

  trigger.addEventListener?.('click', onTriggerClick);
  const listenDoc = doc;
  listenDoc?.addEventListener?.('pointerdown', onDocPointer);
  listenDoc?.addEventListener?.('keydown', onDocKey);

  const apiRef = {
    el: wrap,
    trigger,
    content: panel,
    open,
    close,
    isOpen: () => opened,
    setTriggerLabel(next) {
      const label = trigger.querySelector?.('[data-morphing-label]');
      if (label) label.textContent = next;
      else trigger.textContent = next;
    },
    destroy() {
      if (opened) finishClose({ restoreFocus: false });
      trigger.removeEventListener?.('click', onTriggerClick);
      listenDoc?.removeEventListener?.('pointerdown', onDocPointer);
      listenDoc?.removeEventListener?.('keydown', onDocKey);
    }
  };

  return apiRef;
}

/**
 * Wire a declarative morphing popover already in the tree.
 * @param {HTMLElement} el
 */
export function mountMorphingPopover(el, options = {}) {
  if (!el || el.dataset?.morphingBound === '1') return null;
  const root = el.ownerDocument ?? options.root ?? globalThis.document;
  const trigger = el.querySelector?.('[data-morphing-trigger]') ?? el.querySelector?.('.morphing-popover__trigger');
  const content = el.querySelector?.('[data-morphing-content]') ?? el.querySelector?.('.morphing-popover__panel');
  if (!trigger || !content) return null;
  el.dataset.morphingBound = '1';
  return createMorphingPopover({
    root: {
      createElement: name => root.createElement(name),
      ownerDocument: root,
      defaultView: root.defaultView,
      querySelector: sel => el.querySelector?.(sel)
    },
    wrap: el,
    trigger,
    content,
    title: el.dataset.morphingTitle || options.title,
    supporting: el.dataset.morphingSupporting || options.supporting,
    layoutId: el.dataset.morphingLayoutId || options.layoutId,
    autoFocus: options.autoFocus,
    onOpen: options.onOpen,
    onClose: options.onClose
  });
}

/**
 * Mount every `[data-morphing-popover]` under a document or subtree.
 * @param {ParentNode} [scope]
 */
export function mountMorphingPopovers(scope = globalThis.document) {
  const nodes = scope.querySelectorAll?.('[data-morphing-popover]') ?? [];
  return [...nodes].map(node => mountMorphingPopover(node)).filter(Boolean);
}

/**
 * Short note / text editor that morphs out of a trigger.
 */
export function createMorphingNotePopover({
  root,
  label = 'Notes',
  title,
  supporting = '',
  placeholder = '',
  value = '',
  rows = 3,
  className = '',
  layoutId,
  triggerClass,
  extra,
  onChange,
  onDone
} = {}) {
  let textarea = null;
  const popover = createMorphingPopover({
    root,
    triggerLabel: label,
    title: title ?? label,
    supporting,
    layoutId,
    triggerClass,
    className,
    renderContent(body, api) {
      textarea = root.createElement('textarea');
      textarea.className = 'morphing-popover__note';
      textarea.rows = rows;
      textarea.value = value ?? '';
      if (placeholder) textarea.placeholder = placeholder;
      textarea.setAttribute?.('aria-label', title ?? label);
      textarea.addEventListener?.('input', () => onChange?.(textarea.value));
      body.append(textarea);
      extra?.(body, api, { textarea });
      const actions = root.createElement('div');
      actions.className = 'morphing-popover__actions';
      const done = root.createElement('button');
      done.type = 'button';
      done.className = 'btn btn--primary';
      done.textContent = 'Done';
      done.addEventListener?.('click', () => {
        onDone?.(textarea.value);
        api.close();
      });
      actions.append(done);
      body.append(actions);
    }
  });
  return { ...popover, textarea };
}

/**
 * Compact labelled-value form — the Dimensions-style editor.
 */
export function createMorphingValuesPopover({
  root,
  label = 'Edit',
  title,
  supporting = '',
  fields = [],
  submitLabel = 'Save',
  className = '',
  layoutId,
  triggerClass,
  onSubmit
} = {}) {
  const inputs = [];
  const popover = createMorphingPopover({
    root,
    triggerLabel: label,
    title: title ?? label,
    supporting,
    layoutId,
    triggerClass,
    className,
    renderContent(body, api) {
      for (const field of fields) {
        const row = root.createElement('label');
        row.className = 'morphing-popover__field';
        if (field.id) row.setAttribute?.('for', field.id);
        const caption = root.createElement('span');
        caption.textContent = field.label ?? field.name ?? '';
        const input = root.createElement('input');
        input.type = field.type ?? 'text';
        if (field.id) input.id = field.id;
        if (field.name) input.name = field.name;
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.value != null) input.value = field.value;
        if (field.inputMode) input.inputMode = field.inputMode;
        if (field.step != null) input.step = field.step;
        if (field.min != null) input.min = field.min;
        if (field.max != null) input.max = field.max;
        if (field.autoFocus) input.autofocus = true;
        input.setAttribute?.('aria-label', field.label ?? field.name ?? label);
        row.append(caption, input);
        body.append(row);
        inputs.push({ field, input });
      }
      const actions = root.createElement('div');
      actions.className = 'morphing-popover__actions';
      const submit = root.createElement('button');
      submit.type = 'button';
      submit.className = 'btn btn--primary';
      submit.textContent = submitLabel;
      submit.addEventListener?.('click', () => {
        const values = {};
        for (const { field, input } of inputs) {
          values[field.name ?? field.id ?? field.label] = input.value;
        }
        onSubmit?.(values, api);
      });
      actions.append(submit);
      body.append(actions);
    }
  });
  return { ...popover, inputs };
}

/** Test helper — drop the singleton so suites can start clean. */
export function resetMorphingPopoverForTests() {
  openPopover = null;
}
