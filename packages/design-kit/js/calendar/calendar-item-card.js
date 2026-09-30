/**
 * Expanded item card for every calendar view. Clicking a chip or a Due row shows
 * what the item is (type, hub, when, status, notes), edits the fields its record
 * owns, and opens the item in its hub in a new tab (↗, top right).
 *
 * The card only renders and collects input. The caller saves (so Tasks can keep
 * its plan-work rules) and repaints.
 */
import { formatDisplayDate } from '../format-display-date.js';
import {
  editableFields,
  itemRecord,
  itemType,
  itemTypeLabel,
  newTabHref,
  newTabLabel
} from './calendar-item-actions.js';
import { hubDomainForItem } from './open-in-hub.js';
import { AVAILABILITY, AVAILABILITY_NOTE } from './day-sense-plan.js';
import { hoursText } from './duration-model.js';

const NEW_TAB_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';

const HUB_NAME = { teaching: 'Teaching', professional: 'Professional', tasks: 'Tasks', knowledge: 'Knowledge', life: 'Life' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clock(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h >= 12 ? 'pm' : 'am'}`;
}

function hoursToHHMM(hour) {
  if (!Number.isFinite(hour)) return '';
  const total = Math.round(hour * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function weekday(date) {
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return '';
  }
}

/**
 * Current values the card shows and edits.
 * @param {Record<string, any>} item chip / due / river row (may carry `.record`)
 */
export function itemCardValues(item) {
  const record = itemRecord(item);
  const row = item && typeof item === 'object' ? item : {};
  const date = String(record.date || row.date || '');
  const start = typeof record.time === 'string' ? record.time : Number.isFinite(row.start) ? hoursToHHMM(row.start) : '';
  let duration = Number(record.duration_min);
  const spans = Number.isFinite(duration) && duration > 0;
  if (!spans) {
    duration = Number.isFinite(row.start) && Number.isFinite(row.end) ? Math.round((row.end - row.start) * 60) : 60;
  }
  // Logs (a meal at 12:30) and due times are moments, not spans: no invented end.
  const hasEnd = spans || (Number.isFinite(row.start) && Number.isFinite(row.end));
  const end = start && hasEnd ? hoursToHHMM(Number(start.slice(0, 2)) + Number(start.slice(3, 5)) / 60 + duration / 60) : '';
  return {
    title: String(record.title || row.title || ''),
    date,
    time: start,
    end,
    duration,
    notes: typeof record.description === 'string' ? record.description : typeof record.notes === 'string' ? record.notes : '',
    bookmark: record.bookmark?.note ?? row.bookmark?.note ?? '',
    resumability: record.resumability === 'quick' || record.resumability === 'runup' ? record.resumability : '',
    max_block: Number(record.max_block_minutes) > 0 ? String(record.max_block_minutes) : ''
  };
}

function whenLine(item, values) {
  const type = itemType(item);
  const row = item && typeof item === 'object' ? item : {};
  const from = row.from;
  const to = row.to;
  if (!values.date && from && to) return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
  if (!values.date) return '';
  const day = `${weekday(values.date)} ${formatDisplayDate(values.date)}`;
  if (type === 'task' || row.kind === 'promise') {
    return values.time ? `Due ${day} · ${clock(values.time)}` : `Due ${day}`;
  }
  if (!values.time) return day;
  const endText = values.end && values.end !== values.time ? ` – ${clock(values.end)}` : '';
  return `${day} · ${clock(values.time)}${endText}`;
}

function contextRows(item, values) {
  const record = itemRecord(item);
  const row = item && typeof item === 'object' ? item : {};
  const rows = [];
  const hub = hubDomainForItem(item) || hubDomainForItem({ source: itemType(item) });
  const type = itemTypeLabel(item) || (row.kind ? String(row.kind) : '');
  const what = [type, hub && !record.feed ? HUB_NAME[hub] : ''].filter(Boolean);
  if (what.length) rows.push(['What', what.join(' · ')]);
  const when = whenLine(item, values);
  if (when) rows.push(['When', when]);
  if (record.class_title) rows.push(['Class', record.class_title]);
  if (typeof record.location === 'string' && record.location) rows.push(['Where', record.location]);
  if (record.feed) rows.push(['From', 'iCloud · read-only here']);
  if (typeof record.status === 'string' && record.status) rows.push(['Status', record.status.replace(/_/g, ' ')]);
  const progress = record.progress ?? row.progress;
  if (progress?.total) rows.push(['Progress', `${progress.done} of ${progress.total} ${progress.unit}`]);
  const bookmark = record.bookmark?.note ?? row.bookmark?.note;
  if (bookmark && itemType(item) !== 'task') rows.push(['Way back in', bookmark]);
  if (typeof record.priority === 'string' && record.priority) rows.push(['Priority', record.priority]);
  if (typeof record.project_title === 'string' && record.project_title) rows.push(['Project', record.project_title]);
  if (typeof record.waiting_on === 'string' && record.waiting_on) rows.push(['Waiting on', record.waiting_on]);
  // Step 10: how long the rest really takes, whether it still fits, and what waits on what.
  const range = row.range;
  if (range) {
    const lost = [range.blocked ? `${hoursText(range.blocked)} blocked` : '', range.interrupted ? `${hoursText(range.interrupted)} interrupted` : ''].filter(Boolean);
    rows.push(['Left', `${range.text}${lost.length ? ` · ${lost.join(', ')}, not counted as pace` : ''}`]);
  }
  if (row.fragility && row.fragility.status !== 'fits') rows.push([row.fragility.status === 'short' ? 'Won’t fit' : 'Fragile', row.fragility.text]);
  if (Array.isArray(record.blocked_by) && record.blocked_by.length) rows.push(['After', record.blocked_by.map((b) => b.title).join(', ')]);
  if (record.unlocks) rows.push(['Unlocks', `${record.unlocks} task${record.unlocks === 1 ? '' : 's'} waiting on this`]);
  if (row.texture && AVAILABILITY[row.texture] && row.texture !== 'fixed' && row.texture !== 'focus') {
    rows.push(['Time', `${AVAILABILITY[row.texture]}. ${AVAILABILITY_NOTE[row.texture]}`]);
  }
  if (row.regained) {
    const why = row.regained.reason ? ` (${row.regained.reason})` : '';
    const term = row.regained.termHours != null
      ? ` Every week to the end of term, that is about ${row.regained.termHours} h of it back in use.`
      : '';
    rows.push(['Freed time', `In the slot you freed from ${row.regained.title}${why}.${term}`]);
  }
  if (typeof record.channel === 'string' && record.channel) rows.push(['Channel', record.channel]);
  if (row.provider) rows.push(['With', row.provider]);
  if (row.mergedRecords) rows.push(['Records', `${row.mergedRecords} merged`]);
  if (row.meta && !record.feed && !rows.some(([, text]) => text === row.meta) && !when.includes(String(row.meta))) {
    rows.push(['Detail', row.meta]);
  }
  return rows;
}

function fieldHtml(field, values) {
  if (field === 'title') {
    return `<label class="cal-card__field cal-card__field--wide"><span>Title</span><input type="text" name="title" value="${escapeHtml(values.title)}" required></label>`;
  }
  if (field === 'date') {
    return `<label class="cal-card__field"><span>Date</span><input type="date" name="date" value="${escapeHtml(values.date)}" required></label>`;
  }
  if (field === 'time') {
    return `<label class="cal-card__field"><span>Start</span><input type="time" name="time" step="300" value="${escapeHtml(values.time)}"></label>`;
  }
  if (field === 'duration') {
    return `<label class="cal-card__field"><span>End</span><input type="time" name="end" step="300" value="${escapeHtml(values.end)}"></label>`;
  }
  if (field === 'bookmark') {
    return `<label class="cal-card__field cal-card__field--wide"><span>Way back in</span><input type="text" name="bookmark" maxlength="280" value="${escapeHtml(values.bookmark)}" placeholder="Where you left it, e.g. stopped at Q4 feedback"></label>`;
  }
  if (field === 'resumability') {
    const option = (value, label) => `<option value="${value}"${values.resumability === value ? ' selected' : ''}>${label}</option>`;
    return `<label class="cal-card__field"><span>Picking it back up</span><select name="resumability">${option('', 'Not sure')}${option('quick', 'Quick to restart')}${option('runup', 'Needs a run-up')}</select></label>`;
  }
  if (field === 'max_block') {
    return `<label class="cal-card__field"><span>Longest stretch (min)</span><input type="number" name="max_block" inputmode="numeric" min="15" max="240" step="15" value="${escapeHtml(values.max_block)}" placeholder="90"></label>`;
  }
  if (field === 'notes') {
    return `<label class="cal-card__field cal-card__field--wide"><span>Notes</span><textarea name="notes" rows="3" placeholder="Add a note">${escapeHtml(values.notes)}</textarea></label>`;
  }
  return '';
}

/**
 * @param {Record<string, any>} item
 * @param {{ kind?: string, routeFor?: (item: unknown) => string | null | undefined, location?: { href: string } | null, readOnlyNote?: string }} [opts]
 */
export function itemCardHtml(item, opts = {}) {
  const values = itemCardValues(item);
  const kind = opts.kind || item?.kind || 'task';
  const href = newTabHref(item, { routeFor: opts.routeFor, location: opts.location });
  const label = newTabLabel(item);
  const open = href
    ? `<a class="cal-card__icon" data-part="open-in-hub" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${escapeHtml(label)} (new tab)">${NEW_TAB_ICON}<span class="cal-sr">${escapeHtml(label)}</span></a>`
    : '';
  const head =
    `<div class="cal-card__head"><i class="cal-pop__dot k-${escapeHtml(kind)}"></i><b data-part="card-title">${escapeHtml(values.title || 'Untitled')}</b>` +
    `<span class="cal-card__tools">${open}<button type="button" class="cal-card__icon" data-card-close aria-label="Close">${CLOSE_ICON}</button></span></div>`;
  const rows = contextRows(item, values);
  const context = rows.length
    ? `<dl class="cal-card__context" data-part="card-context">${rows.map(([term, text]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(text)}</dd></div>`).join('')}</dl>`
    : '';
  const record = itemRecord(item);
  const inferred = record.inferred_after?.id
    ? `<div class="cal-card__ask" data-part="card-infer"><span>Probably after “${escapeHtml(record.inferred_after.title)}”?</span>`
      + `<button type="button" class="btn btn--secondary" data-infer="yes" data-after="${escapeHtml(record.inferred_after.id)}">Yes, after it</button>`
      + `<button type="button" class="btn btn--ghost" data-infer="no" data-after="${escapeHtml(record.inferred_after.id)}">No</button></div>`
    : '';
  const drop = typeof record.series === 'string' && record.series && record.time && record.end_time
    ? `<form class="cal-card__drop" data-part="card-drop" novalidate><label class="cal-card__field cal-card__field--wide"><span>Stopped going to this?</span>`
      + `<input type="text" name="drop_reason" maxlength="160" placeholder="Why, so the time remembers (optional)"></label>`
      + `<button type="submit" class="btn btn--secondary">I’ve dropped this</button><p class="cal-card__hint">Frees this weekly slot from ${escapeHtml(formatDisplayDate(record.date))}. Nothing changes in iCloud.</p></form>`
    : '';
  const fields = editableFields(item);
  if (!fields.length) {
    const notes = values.notes ? `<p class="cal-card__notes">${escapeHtml(values.notes)}</p>` : '';
    const note = opts.readOnlyNote ? `<p class="cal-card__hint">${escapeHtml(opts.readOnlyNote)}</p>` : '';
    return `${head}${context}${notes}${drop}${note}`;
  }
  const form =
    `<form class="cal-card__form" data-part="card-form" novalidate>${fields.map((field) => fieldHtml(field, values)).join('')}` +
    `<p class="cal-card__error" data-part="card-error" role="alert" hidden></p>` +
    `<div class="cal-pop__acts"><button type="submit" class="btn btn--primary" data-part="card-save">Save</button></div></form>`;
  return `${head}${context}${inferred}${form}`;
}

function toMinutes(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * The normalised patch for what changed in the form (empty object = nothing changed).
 * @param {Record<string, any>} item
 * @param {Record<string, string>} form
 */
export function itemCardPatch(item, form) {
  const before = itemCardValues(item);
  const fields = editableFields(item);
  const patch = {};
  if (fields.includes('title') && typeof form.title === 'string' && form.title.trim() && form.title.trim() !== before.title) {
    patch.title = form.title.trim();
  }
  if (fields.includes('date') && form.date && form.date !== before.date) patch.date = form.date;
  if (fields.includes('time') && typeof form.time === 'string' && form.time !== before.time) {
    patch.start_time = form.time ? form.time : itemType(item) === 'task' ? null : undefined;
    if (patch.start_time === undefined) delete patch.start_time;
  }
  if (fields.includes('duration') && typeof form.end === 'string') {
    const start = toMinutes(form.time || before.time);
    const end = toMinutes(form.end);
    if (start != null && end != null && end > start) {
      const minutes = end - start;
      if (minutes !== before.duration) patch.duration_min = minutes;
    }
  }
  if (fields.includes('notes') && typeof form.notes === 'string' && form.notes !== before.notes) patch.notes = form.notes;
  if (fields.includes('bookmark') && typeof form.bookmark === 'string' && form.bookmark.trim() !== before.bookmark) patch.bookmark = form.bookmark.trim();
  if (fields.includes('resumability') && typeof form.resumability === 'string' && form.resumability !== before.resumability) {
    patch.resumability = form.resumability || null;
  }
  if (fields.includes('max_block') && typeof form.max_block === 'string' && form.max_block.trim() !== before.max_block) {
    patch.max_block_minutes = form.max_block.trim() ? Number(form.max_block) : null;
  }
  if (patch.date === undefined && Object.keys(patch).length && fields.includes('date')) patch.date = before.date;
  return patch;
}

/**
 * True when the page runs as an installed Home Screen app (no browser tabs).
 * @param {{ navigator?: { standalone?: boolean }, matchMedia?: (query: string) => { matches: boolean } } | null | undefined} view
 */
export function isStandaloneApp(view) {
  if (!view) return false;
  if (view.navigator?.standalone === true) return true;
  return view.matchMedia?.('(display-mode: standalone)')?.matches === true;
}

/**
 * Wire a rendered card. `onSave(patch)` persists; resolve to close, throw to show the error.
 * @param {HTMLElement} node container holding itemCardHtml output
 * @param {Record<string, any>} item
 * @param {{ onSave?: (patch: Record<string, unknown>) => Promise<unknown> | unknown, onClose?: () => void }} handlers
 */
export function bindItemCard(node, item, handlers = {}) {
  node.querySelector?.('[data-card-close]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onClose?.();
  });
  const openLink = node.querySelector?.('[data-part="open-in-hub"]');
  openLink?.addEventListener('click', (event) => {
    // Full navigation in a new tab. Never let a hub SPA router catch the click.
    event.stopPropagation();
    // A Home Screen app has no tabs: iOS sends target=_blank out to Safari, which has
    // none of the app's cookies, so the hub asks for the passphrase. Stay in the app.
    const view = openLink.ownerDocument?.defaultView;
    if (!isStandaloneApp(view) || !openLink.href) return;
    event.preventDefault();
    view.location.assign(openLink.href);
  });
  // One-tap answers ride the same save path as the form (confirm-first: nothing until tapped).
  const record = itemRecord(item);
  const once = async (button, patch) => {
    button.disabled = true;
    try {
      await handlers.onSave?.(patch);
      handlers.onClose?.();
    } catch (cause) {
      button.disabled = false;
      const error = node.querySelector?.('[data-part="card-error"]');
      if (error) {
        error.textContent = cause?.message || 'Could not save.';
        error.hidden = false;
      } else {
        button.textContent = cause?.message || 'Could not save.';
      }
    }
  };
  for (const button of node.querySelectorAll?.('[data-infer]') ?? []) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const after = button.getAttribute('data-after');
      const list = (key) => (Array.isArray(record[key]) ? record[key] : []);
      void once(button, button.getAttribute('data-infer') === 'yes'
        ? { depends_on: [...list('depends_on'), after] }
        : { dismissed_inferred: [...list('dismissed_inferred'), after] });
    });
  }
  const drop = node.querySelector?.('[data-part="card-drop"]');
  drop?.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = drop.querySelector('button[type="submit"]');
    void once(button, { freed: { reason: drop.querySelector('input[name="drop_reason"]')?.value ?? '' } });
  });
  const form = node.querySelector?.('[data-part="card-form"]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const data = {};
    for (const input of form.querySelectorAll('input[name],textarea[name],select[name]')) data[input.name] = input.value;
    const error = form.querySelector('[data-part="card-error"]');
    const save = form.querySelector('[data-part="card-save"]');
    if (fieldsInvalid(item, data)) {
      if (error) {
        error.textContent = fieldsInvalid(item, data);
        error.hidden = false;
      }
      return;
    }
    const patch = itemCardPatch(item, data);
    if (!Object.keys(patch).length) {
      handlers.onClose?.();
      return;
    }
    if (save) {
      save.disabled = true;
      save.textContent = 'Saving…';
    }
    if (error) error.hidden = true;
    try {
      await handlers.onSave?.(patch);
      handlers.onClose?.();
    } catch (cause) {
      if (save) {
        save.disabled = false;
        save.textContent = 'Save';
      }
      if (error) {
        error.textContent = cause?.message || 'Could not save.';
        error.hidden = false;
      }
    }
  });
}

function fieldsInvalid(item, data) {
  const fields = editableFields(item);
  if (fields.includes('title') && !String(data.title ?? '').trim()) return 'Title is required.';
  if (fields.includes('date') && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date ?? ''))) return 'Pick a date.';
  if (fields.includes('duration')) {
    const start = toMinutes(data.time);
    const end = toMinutes(data.end);
    if (start != null && end != null && end <= start) return 'End must be after start.';
  }
  return '';
}
