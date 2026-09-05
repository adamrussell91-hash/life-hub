/** Hub compose — dump / schedule composer.
 * Calendar expands a date + time row. Dump stays immediate.
 * Schedule appends `due dd/mm/yy` (optional `at HH:MM`) for Clare to parse.
 * No “will be posted” footer. Tokens only. Respects prefers-reduced-motion.
 *
 * Markup: snippets/hub-compose.html
 * startHubMotion() mounts `.hub-compose` / `[data-hub-compose]`.
 */

import { formatDisplayDate } from './format-display-date.js';

const SYDNEY_TZ = 'Australia/Sydney';
const TIME_KEY = /^(\d{1,2}):(\d{2})/;
const mounted = new WeakMap();

function pad2(value) {
  return String(value).padStart(2, '0');
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sydneyParts(instant = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SYDNEY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

/**
 * 24-hour `HH:MM` for the UI. Accepts `HH:MM` or a Date (Sydney clock).
 * @param {string | Date | null | undefined} value
 * @returns {string}
 */
export function formatDisplayTime(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const parts = sydneyParts(value);
    return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }
  const match = TIME_KEY.exec(String(value).trim());
  if (!match) return '';
  return `${pad2(match[1])}:${match[2]}`;
}

/**
 * Today + next whole hour on the Sydney clock.
 * At an exact hour, keeps that hour (`12:00` → `12:00`).
 * @param {Date} [now]
 * @returns {{ dateKey: string, time: string }}
 */
export function defaultScheduleValues(now = new Date()) {
  const parts = sydneyParts(now);
  const hour = Number(parts.minute) === 0 ? Number(parts.hour) : (Number(parts.hour) + 1) % 24;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${pad2(hour)}:00`
  };
}

/**
 * Clare-parseable due phrase. Date is always `dd/mm/yy`.
 * @param {string | Date | null | undefined} dateKey
 * @param {string | Date | null | undefined} [timeValue]
 * @returns {string}
 */
export function composeDueLine(dateKey, timeValue) {
  const date = formatDisplayDate(dateKey);
  if (!date) return '';
  const time = formatDisplayTime(timeValue);
  return time ? `due ${date} at ${time}` : `due ${date}`;
}

/**
 * Plain dump text, or the same text with a due phrase appended.
 * @param {string | null | undefined} text
 * @param {{ scheduled?: boolean, dateKey?: string | Date | null, timeValue?: string | Date | null }} [options]
 * @returns {string}
 */
export function composeDumpText(text, options = {}) {
  const body = String(text ?? '').trim();
  if (!options.scheduled) return body;
  const due = composeDueLine(options.dateKey, options.timeValue);
  if (!due) return body;
  const date = formatDisplayDate(options.dateKey);
  if (date && new RegExp(`\\bdue\\s+${escapeRe(date)}\\b`, 'i').test(body)) return body;
  return body ? `${body} ${due}` : due;
}

function $(el, selector) {
  return el?.querySelector?.(selector) ?? null;
}

function isCompose(el) {
  return Boolean(el?.matches?.('[data-hub-compose], .hub-compose'));
}

/**
 * Read the current compose state. Safe before or after mount.
 * @param {Element | null | undefined} el
 * @returns {{
 *   text: string,
 *   scheduled: boolean,
 *   dateKey: string,
 *   timeValue: string,
 *   composed: string
 * } | null}
 */
export function readHubCompose(el) {
  if (!isCompose(el)) return null;
  const textarea = $(el, '[data-hub-compose-text], .hub-compose__text, textarea');
  const dateInput = $(el, '[data-hub-compose-date]');
  const timeInput = $(el, '[data-hub-compose-time]');
  const scheduled = el.classList.contains('is-scheduling');
  const text = textarea?.value ?? '';
  const dateKey = dateInput?.value ?? '';
  const timeValue = timeInput?.value ?? '';
  return {
    text,
    scheduled,
    dateKey,
    timeValue,
    composed: composeDumpText(text, { scheduled, dateKey, timeValue })
  };
}

function syncLabels(el) {
  const dateInput = $(el, '[data-hub-compose-date]');
  const timeInput = $(el, '[data-hub-compose-time]');
  const dateLabel = $(el, '[data-hub-compose-date-label]');
  const timeLabel = $(el, '[data-hub-compose-time-label]');
  if (dateLabel && dateInput?.value) dateLabel.textContent = formatDisplayDate(dateInput.value);
  if (timeLabel && timeInput?.value) timeLabel.textContent = formatDisplayTime(timeInput.value);
}

function ensureDefaults(el, now) {
  const dateInput = $(el, '[data-hub-compose-date]');
  const timeInput = $(el, '[data-hub-compose-time]');
  const defaults = defaultScheduleValues(now);
  if (dateInput && !dateInput.value) dateInput.value = defaults.dateKey;
  if (timeInput && !timeInput.value) timeInput.value = defaults.time;
  syncLabels(el);
}

function setScheduling(el, open, now) {
  el.classList.toggle('is-scheduling', open);
  const when = $(el, '[data-hub-compose-when], .hub-compose__when');
  const cal = $(el, '[data-hub-compose-cal], .hub-compose__cal');
  const schedule = $(el, '[data-hub-compose-schedule], .hub-compose__schedule');
  if (when) when.setAttribute('aria-hidden', open ? 'false' : 'true');
  cal?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    ensureDefaults(el, now);
    schedule?.removeAttribute('tabindex');
  } else {
    schedule?.setAttribute('tabindex', '-1');
  }
}

function emit(el, type, detail) {
  el.dispatchEvent?.(new CustomEvent(type, { bubbles: true, detail }));
}

/**
 * @param {Element} el
 * @param {{ now?: Date }} [options]
 */
export function mountHubCompose(el, options = {}) {
  if (!isCompose(el) || mounted.has(el)) return mounted.get(el) ?? null;

  const cal = $(el, '[data-hub-compose-cal], .hub-compose__cal');
  const close = $(el, '[data-hub-compose-close], .hub-compose__close');
  const schedule = $(el, '[data-hub-compose-schedule], .hub-compose__schedule');
  const dateInput = $(el, '[data-hub-compose-date]');
  const timeInput = $(el, '[data-hub-compose-time]');
  const textarea = $(el, '[data-hub-compose-text], .hub-compose__text, textarea');

  const now = () => options.now ?? new Date();

  const onCal = (event) => {
    event.preventDefault?.();
    setScheduling(el, true, now());
  };
  const onClose = (event) => {
    event.preventDefault?.();
    setScheduling(el, false);
  };
  const onSchedule = (event) => {
    event.preventDefault?.();
    setScheduling(el, true, now());
    const state = readHubCompose(el);
    emit(el, 'hub-compose:schedule', state);
    const form = el.matches?.('form') ? el : el.closest?.('form');
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    else form?.dispatchEvent?.(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const onChange = () => syncLabels(el);
  const onKey = (event) => {
    if (event.key === 'Escape' && el.classList.contains('is-scheduling')) {
      event.stopPropagation?.();
      setScheduling(el, false);
      cal?.focus?.();
    }
  };

  cal?.addEventListener('click', onCal);
  close?.addEventListener('click', onClose);
  schedule?.addEventListener('click', onSchedule);
  dateInput?.addEventListener('change', onChange);
  dateInput?.addEventListener('input', onChange);
  timeInput?.addEventListener('change', onChange);
  timeInput?.addEventListener('input', onChange);
  el.addEventListener('keydown', onKey);

  setScheduling(el, el.classList.contains('is-scheduling'), now());
  if (dateInput?.value || timeInput?.value) syncLabels(el);

  const api = {
    el,
    textarea,
    open() {
      setScheduling(el, true, now());
    },
    close() {
      setScheduling(el, false);
    },
    isScheduling() {
      return el.classList.contains('is-scheduling');
    },
    read() {
      return readHubCompose(el);
    },
    destroy() {
      cal?.removeEventListener('click', onCal);
      close?.removeEventListener('click', onClose);
      schedule?.removeEventListener('click', onSchedule);
      dateInput?.removeEventListener('change', onChange);
      dateInput?.removeEventListener('input', onChange);
      timeInput?.removeEventListener('change', onChange);
      timeInput?.removeEventListener('input', onChange);
      el.removeEventListener('keydown', onKey);
      mounted.delete(el);
    }
  };

  mounted.set(el, api);
  return api;
}

/**
 * Mount every compose control under a document or subtree.
 * @param {ParentNode} [scope]
 */
export function mountHubComposes(scope = globalThis.document) {
  const nodes = [];
  if (scope.matches?.('[data-hub-compose], .hub-compose')) nodes.push(scope);
  for (const node of scope.querySelectorAll?.('[data-hub-compose], .hub-compose') ?? []) {
    nodes.push(node);
  }
  const apis = [];
  for (const node of nodes) {
    const api = mountHubCompose(node);
    if (api) apis.push(api);
  }
  return apis;
}

/** Test helper — drop the mount cache. */
export function resetHubComposeForTests() {
  // WeakMap cannot be cleared; new elements are always mountable.
}
