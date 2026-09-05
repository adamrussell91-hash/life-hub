/** Adaptive slider — vanilla port of the spring range control.
 * Tokens only. Same strength on every hub. Respects prefers-reduced-motion.
 *
 * Markup: snippets/adaptive-slider.html
 * Mount: mountAdaptiveSliders() or createAdaptiveSlider()
 */

import { prefersReducedMotion } from './hub-motion.js';

export const DEFAULT_MIN = 50;
export const DEFAULT_MAX = 350;
export const DEFAULT_STEP = 25;
export const DEFAULT_VALUE = 200;
export const DEFAULT_DOTS = 6;

const mounted = new WeakMap();

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function sliderPercentage(value, min, max) {
  if (!(max > min)) return 0;
  return ((Number(value) - min) / (max - min)) * 100;
}

/**
 * @param {number} percentage 0–1 (or 0–100 if greater than 1)
 * @returns {'low' | 'mid' | 'high'}
 */
export function sliderBand(percentage) {
  const unit = percentage > 1 ? percentage / 100 : percentage;
  if (unit < 0.5) return 'low';
  if (unit < 0.7) return 'mid';
  return 'high';
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} [step]
 * @returns {number}
 */
export function clampSliderValue(value, min, max, step = 0) {
  const lo = Number(min);
  const hi = Number(max);
  let next = Number(value);
  if (!Number.isFinite(next)) next = lo;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return next;
  const clamped = Math.min(hi, Math.max(lo, next));
  if (!(step > 0)) return clamped;
  const stepped = lo + Math.round((clamped - lo) / step) * step;
  return Math.min(hi, Math.max(lo, stepped));
}

/**
 * @param {number} value
 * @param {number} target
 * @param {number} [step]
 * @returns {number}
 */
export function sliderCeiling(value, target, step = DEFAULT_STEP) {
  const size = step > 0 ? step : DEFAULT_STEP;
  const ceiling = Math.max(Number(target) || 0, Number(value) || 0, size);
  return Math.ceil(ceiling / size) * size;
}

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function numAttr(el, name, fallback) {
  const raw = el?.getAttribute?.(name) ?? el?.dataset?.[camel(name)];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function camel(name) {
  return name.replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function readNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function paintDigits(host, text, reduced) {
  if (!host) return;
  const chars = String(text).split('').map(ch => (ch === ' ' ? '\u00A0' : ch));
  const kids = [...(host.children ?? [])];
  if (
    kids.length === chars.length
    && kids.every((node, index) => node.textContent === chars[index])
  ) {
    return;
  }
  if (reduced || typeof host.replaceChildren !== 'function') {
    host.textContent = chars.join('');
    return;
  }
  const doc = ownerDoc(host);
  host.replaceChildren(...chars.map(ch => {
    const span = doc.createElement('span');
    span.className = 'hub-slider__digit';
    span.textContent = ch;
    return span;
  }));
}

function ensureDots(track, count, doc) {
  let row = track.querySelector?.('.hub-slider__dots');
  if (!row) {
    row = doc.createElement('div');
    row.className = 'hub-slider__dots';
    row.setAttribute('aria-hidden', 'true');
    track.insertBefore(row, track.firstChild);
  }
  const need = Math.max(0, Number(count) || 0);
  if (row.children?.length === need) return row;
  row.replaceChildren?.();
  if (!row.replaceChildren) row.textContent = '';
  for (let i = 0; i < need; i += 1) {
    const dot = doc.createElement('div');
    dot.className = 'hub-slider__dot';
    row.append(dot);
  }
  return row;
}

function applyState(el, input, digits, state, reduced) {
  const pct = sliderPercentage(state.value, state.min, state.max);
  el.dataset.band = sliderBand(pct / 100);
  el.style?.setProperty?.('--hub-slider-pct', String(pct));
  if (input) {
    input.min = String(state.min);
    input.max = String(state.max);
    input.step = String(state.step);
    input.value = String(state.value);
    input.disabled = Boolean(state.readonly);
  }
  paintDigits(digits, String(state.value), reduced);
}

function buildSlider(doc, options) {
  const el = doc.createElement('div');
  el.className = ['hub-slider', options.className].filter(Boolean).join(' ');
  el.dataset.adaptiveSlider = '';

  const label = doc.createElement('p');
  label.className = 'hub-slider__label';
  label.textContent = options.label;

  const valueRow = doc.createElement('div');
  valueRow.className = 'hub-slider__value';

  const digits = doc.createElement('span');
  digits.className = 'hub-slider__digits';
  digits.dataset.sliderDigits = '';

  const unit = doc.createElement('span');
  unit.className = 'hub-slider__unit';
  unit.textContent = options.unit;

  valueRow.append(digits, unit);

  const track = doc.createElement('div');
  track.className = 'hub-slider__track';

  const fill = doc.createElement('div');
  fill.className = 'hub-slider__fill';
  fill.setAttribute('aria-hidden', 'true');

  const input = doc.createElement('input');
  input.className = 'hub-slider__input';
  input.type = 'range';
  input.title = options.label;

  const thumb = doc.createElement('div');
  thumb.className = 'hub-slider__thumb';
  thumb.setAttribute('aria-hidden', 'true');
  const knob = doc.createElement('div');
  knob.className = 'hub-slider__knob';
  thumb.append(knob);

  track.append(fill, input, thumb);
  el.append(label, valueRow, track);
  return { el, label, digits, unit, track, input };
}

function enhanceExisting(el, options) {
  const doc = ownerDoc(el);
  let label = el.querySelector?.('.hub-slider__label');
  if (!label) {
    label = doc.createElement('p');
    label.className = 'hub-slider__label';
    el.prepend(label);
  }
  if (options.label) label.textContent = options.label;

  let valueRow = el.querySelector?.('.hub-slider__value');
  if (!valueRow) {
    valueRow = doc.createElement('div');
    valueRow.className = 'hub-slider__value';
    label.after(valueRow);
  }

  let digits = el.querySelector?.('[data-slider-digits], .hub-slider__digits');
  if (!digits) {
    digits = doc.createElement('span');
    digits.className = 'hub-slider__digits';
    digits.dataset.sliderDigits = '';
    valueRow.prepend(digits);
  }

  let unit = el.querySelector?.('.hub-slider__unit');
  if (!unit) {
    unit = doc.createElement('span');
    unit.className = 'hub-slider__unit';
    valueRow.append(unit);
  }
  if (options.unit) unit.textContent = options.unit;

  let track = el.querySelector?.('.hub-slider__track');
  if (!track) {
    track = doc.createElement('div');
    track.className = 'hub-slider__track';
    el.append(track);
  }

  if (!track.querySelector?.('.hub-slider__fill')) {
    const fill = doc.createElement('div');
    fill.className = 'hub-slider__fill';
    fill.setAttribute('aria-hidden', 'true');
    track.append(fill);
  }

  let input = track.querySelector?.('input[type="range"], .hub-slider__input');
  if (!input) {
    input = doc.createElement('input');
    input.className = 'hub-slider__input';
    input.type = 'range';
    track.append(input);
  }
  input.classList?.add?.('hub-slider__input');
  input.title = options.label;

  if (!track.querySelector?.('.hub-slider__thumb')) {
    const thumb = doc.createElement('div');
    thumb.className = 'hub-slider__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const knob = doc.createElement('div');
    knob.className = 'hub-slider__knob';
    thumb.append(knob);
    track.append(thumb);
  }

  return { el, label, digits, unit, track, input };
}

function bindSlider(parts, options) {
  const { el, input, digits, track, label } = parts;
  const existing = mounted.get(el);
  if (existing) {
    if (options.value != null) existing.setValue(options.value);
    return existing;
  }

  const reduced = prefersReducedMotion(el);
  const state = {
    min: readNumber(options.min, DEFAULT_MIN),
    max: readNumber(options.max, DEFAULT_MAX),
    step: readNumber(options.step, DEFAULT_STEP),
    value: readNumber(options.value ?? options.defaultValue, DEFAULT_VALUE),
    readonly: Boolean(options.readonly),
    dots: readNumber(options.dots, DEFAULT_DOTS)
  };
  state.value = clampSliderValue(state.value, state.min, state.max, state.step);

  let dragging = false;
  const doc = ownerDoc(el);

  const announce = () => {
    input?.setAttribute?.('aria-valuemin', String(state.min));
    input?.setAttribute?.('aria-valuemax', String(state.max));
    input?.setAttribute?.('aria-valuenow', String(state.value));
    input?.setAttribute?.('aria-label', `${label?.textContent || options.label || 'Value'}, ${options.unit || 'kcal'}`);
  };

  const paint = () => {
    applyState(el, input, digits, state, reduced);
    announce();
  };

  const setValue = (next, opts = {}) => {
    if (dragging && !opts.force) return state.value;
    const value = clampSliderValue(next, state.min, state.max, state.step);
    if (value === state.value && !opts.force) return state.value;
    state.value = value;
    paint();
    if (!opts.silent) options.onChange?.(value);
    return value;
  };

  const onInput = event => {
    const value = clampSliderValue(Number(event.target.value), state.min, state.max, state.step);
    state.value = value;
    paint();
    options.onChange?.(value);
  };

  const startDrag = () => {
    dragging = true;
  };
  const endDrag = () => {
    dragging = false;
  };

  input?.addEventListener?.('input', onInput);
  input?.addEventListener?.('change', onInput);
  input?.addEventListener?.('pointerdown', startDrag);
  doc.addEventListener?.('pointerup', endDrag);
  doc.addEventListener?.('pointercancel', endDrag);

  ensureDots(track, state.dots, doc);
  el.classList.add('hub-slider');
  if (reduced) el.classList.add('is-reduced');
  paint();
  const frame = globalThis.requestAnimationFrame;
  if (typeof frame === 'function') frame(() => el.classList.add('is-ready'));
  else el.classList.add('is-ready');

  const api = {
    el,
    input,
    getValue: () => state.value,
    getStep: () => state.step,
    getRange: () => ({ min: state.min, max: state.max, step: state.step }),
    isDragging: () => dragging,
    setValue,
    setRange({ min = state.min, max = state.max, step = state.step } = {}) {
      state.min = readNumber(min, state.min);
      state.max = readNumber(max, state.max);
      state.step = readNumber(step, state.step);
      state.value = clampSliderValue(state.value, state.min, state.max, state.step);
      ensureDots(track, state.dots, doc);
      paint();
      return api.getRange();
    },
    destroy() {
      input?.removeEventListener?.('input', onInput);
      input?.removeEventListener?.('change', onInput);
      input?.removeEventListener?.('pointerdown', startDrag);
      doc.removeEventListener?.('pointerup', endDrag);
      doc.removeEventListener?.('pointercancel', endDrag);
      mounted.delete(el);
    }
  };

  mounted.set(el, api);
  return api;
}

/**
 * @param {{
 *   root?: ParentNode & { createElement: typeof document.createElement },
 *   el?: HTMLElement,
 *   label?: string,
 *   unit?: string,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   value?: number,
 *   defaultValue?: number,
 *   dots?: number,
 *   readonly?: boolean,
 *   className?: string,
 *   onChange?: (value: number) => void
 * }} [options]
 */
export function createAdaptiveSlider(options = {}) {
  const doc = ownerDoc(options.root);
  const label = options.label ?? 'Calories';
  const unit = options.unit ?? 'kcal';
  const parts = options.el
    ? enhanceExisting(options.el, { label, unit })
    : buildSlider(doc, { ...options, label, unit });
  return bindSlider(parts, { ...options, label, unit });
}

/**
 * @param {HTMLElement} el
 * @param {{ onChange?: (value: number) => void }} [options]
 */
export function mountAdaptiveSlider(el, options = {}) {
  if (!el) return null;
  const existing = mounted.get(el);
  if (existing) return existing;
  const label = el.getAttribute('data-slider-label')
    || el.querySelector?.('.hub-slider__label')?.textContent?.trim()
    || 'Calories';
  const unit = el.getAttribute('data-slider-unit')
    || el.querySelector?.('.hub-slider__unit')?.textContent?.trim()
    || 'kcal';
  return createAdaptiveSlider({
    el,
    label,
    unit,
    min: numAttr(el, 'data-slider-min', DEFAULT_MIN),
    max: numAttr(el, 'data-slider-max', DEFAULT_MAX),
    step: numAttr(el, 'data-slider-step', DEFAULT_STEP),
    value: numAttr(el, 'data-slider-value', DEFAULT_VALUE),
    dots: numAttr(el, 'data-slider-dots', DEFAULT_DOTS),
    readonly: el.hasAttribute('data-slider-readonly'),
    onChange: options.onChange
  });
}

/** @param {ParentNode} [scope] */
export function mountAdaptiveSliders(scope = globalThis.document) {
  if (!scope?.querySelectorAll) return [];
  return [...scope.querySelectorAll('[data-adaptive-slider], .hub-slider')].map(el => (
    mountAdaptiveSlider(el)
  )).filter(Boolean);
}

/** Test helper — nothing to reset beyond per-element WeakMap entries. */
export function resetAdaptiveSliderForTests() {
  // WeakMap entries drop when tests drop their nodes.
}
