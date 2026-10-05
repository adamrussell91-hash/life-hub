/**
 * Capacity forecast panel for the Day view: today's readiness as weather, the morning
 * bubbles, and the "What did we miss?" step.
 *
 * Model: readiness-model.js. Questions: morning-bubbles.js. Persistence:
 * /api/capacity-checkins (immutable snapshot → append-only observation → reason).
 *
 * The panel paints synchronously from a small per-day store and fetches once per day.
 * Bubble taps update the DOM in place (no repaint, focus stays put); saving repaints.
 */
import {
  CHECKIN_TYPE,
  dayState,
  explainReadiness,
  projectDay,
  readinessForDates,
  snapshotBody,
    READINESS,
  WEATHER_STATES
} from './readiness-model.js';
import { DISCREPANCY_PROMPT, REASON_OPTIONS, selectQuestions, answersFrom } from './morning-bubbles.js';
import { weatherIconSvg } from './weather-icons.js';
import { checkinState, loadCheckins, onCheckinsChange, recordObservation, recordSnapshot } from './readiness-checkins.js';

const API = '/api/capacity-checkins';
const INSIGHTS_API = '/api/readiness-insights';
/** Adam's off switch for agent insights: { status, enabled }. Loaded once per session. */
const insightSetting = { status: 'idle', enabled: true };
const NS = 'http://www.w3.org/2000/svg';

/** date → { status, payload, error, picks, notes, open, skipped, saving, reason, detail } */
const days = new Map();
let repaint = () => {};
let unsubPanel = null;

function slot(date) {
  if (!days.has(date)) {
    days.set(date, { picks: {}, other: {}, open: false, skipped: false, saving: false, reason: null, detail: null, snapshotPosted: false });
  }
  return days.get(date);
}

/** Test seam and unmount: forget everything. */
export function resetReadinessPanel() {
  days.clear();
  insightSetting.status = 'idle';
  insightSetting.enabled = true;
  repaint = () => {};
  unsubPanel?.();
  unsubPanel = null;
}

/** Notification tap (#/calendar/day?checkin=1): open the bubbles. */
export function openCheckin(date) {
  const s = slot(date);
  s.open = true;
  s.skipped = false;
}

/* ======================================================================== Today's numbers */

/**
 * Today's readiness from the same calculation every view uses (capacityForDates on the
 * calendar's events, check-ins included). `ctx.cap` is the calendar model's cap for
 * today when the view already has it; otherwise it is computed here the same way.
 */
function todayReadiness(ctx, events) {
  if (events === ctx.events && ctx.cap?.readiness) return ctx.cap;
  return readinessForDates(events, [ctx.date], { today: ctx.date }).get(ctx.date);
}

function present(r, ctx) {
  const projection = projectDay(r, { items: ctx.items ?? [], wake: ctx.wake ?? 6.5, lightsOut: ctx.lightsOut ?? 22.5, nowHour: ctx.nowHour });
  return { readiness: r, projection, state: dayState(r, projection), explanation: explainReadiness(r) };
}

/**
 * { view, pre, last, answered }: `view` is what every gauge shows for today; `pre` is
 * the same day without today's check-in — the forecast issued before the answer.
 */
export function todayForecast(ctx) {
  const events = ctx.events ?? [];
  const cap = todayReadiness(ctx, events);
  const view = present(cap.readiness, ctx);
  const today = checkinState().date === ctx.date ? checkinState().observations : [];
  const last = today.at(-1) ?? null;
  const withoutToday = events.filter(e => !(e?.record?.type === CHECKIN_TYPE && e.record.date === ctx.date));
  const pre = cap.checkedIn || withoutToday.length !== events.length
    ? present(readinessForDates(withoutToday, [ctx.date], { today: ctx.date }).get(ctx.date).readiness, ctx)
    : view;
  return { view, pre, last, answered: Boolean(cap.checkedIn), stateName: WEATHER_STATES[view.state]?.name ?? 'Forecast' };
}

/* ======================================================================== Server */

async function post(ctx, body) {
  const response = await ctx.apiFetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message ?? `Not saved (${response.status}).`);
  return payload?.data ?? payload;
}

/** Issue the pre-answer forecast once a day, before any answer exists. */
async function ensureSnapshot(ctx, date, pre) {
  const s = slot(date);
  const known = checkinState();
  if (s.snapshotPosted || known.date !== date || known.status !== 'ready' || known.snapshot || known.observations.length) return;
  s.snapshotPosted = true;
  try {
    const data = await post(ctx, { action: 'snapshot', date, snapshot: preSnapshot(pre, date) });
    recordSnapshot(data.snapshot);
  } catch {
    s.snapshotPosted = false; // retried with the observation if still missing
  }
}

function preSnapshot(pre, date) {
  const r = pre.readiness;
  return snapshotBody(r, {
    date,
    state: pre.state,
    explanation: pre.explanation,
    features: {
      sources: r.sources,
      missing: r.missing,
      prior_work: r.work,
      exercise: r.exercise
    }
  });
}

/* ======================================================================== DOM helpers */

/** Listeners are skipped on minimal DOMs (unit-test fakes); the paint still lands. */
function on(node, type, fn) {
  node?.addEventListener?.(type, fn);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function h(doc, tag, cls, html, parent, attrs = {}) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  parent?.append?.(node);
  return node;
}

const clock = hour => {
  const hh = Math.floor(hour) % 24;
  const mm = Math.round((hour - Math.floor(hour)) * 60);
  const suffix = hh >= 12 ? 'pm' : 'am';
  const h12 = hh % 12 || 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
};
const short = hour => {
  const hh = Math.round(hour) % 24;
  return `${hh % 12 || 12}${hh >= 12 ? 'p' : 'a'}`;
};

function iconHtml(state, size) {
  return weatherIconSvg(state).replace('width="256" height="256"', `width="${size}" height="${size}"`);
}

/* ======================================================================== Chart */

/** Hourly line + uncertainty band, coloured by the condition of each window. */
export function chartSvg(doc, projection, { nowHour = null, width = 320, height = 132 } = {}) {
  const pts = projection.points;
  const make = tag => (typeof doc.createElementNS === 'function' ? doc.createElementNS(NS, tag) : doc.createElement(tag));
  const svg = make('svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'rf-chart');
  svg.setAttribute('role', 'img');
  if (!pts.length) return svg;
  const x0 = 4;
  const x1 = width - 10;
  const y0 = 10;
  const y1 = height - 26;
  const hFrom = pts[0].h;
  const hTo = pts.at(-1).h;
  const X = hr => x0 + 22 + ((hr - hFrom) / Math.max(0.5, hTo - hFrom)) * (x1 - x0 - 22);
  const Y = v => y1 - (v / 100) * (y1 - y0);
  const add = (tag, attrs) => {
    const n = make(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    svg.append(n);
    return n;
  };
  for (const g of [25, 50, 75, 100]) {
    add('line', { x1: x0 + 16, x2: x1, y1: Y(g), y2: Y(g), class: 'rf-grid' });
    if (g % 50 === 0) add('text', { x: x0, y: Y(g) + 3, class: 'rf-axis', 'text-anchor': 'start' }).textContent = String(g);
  }
  const band = `${pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.h).toFixed(1)} ${Y(p.high).toFixed(1)}`).join(' ')} ${[...pts].reverse().map(p => `L${X(p.h).toFixed(1)} ${Y(p.low).toFixed(1)}`).join(' ')} Z`;
  add('path', { d: band, class: 'rf-band' });
  for (const seg of projection.segments) {
    const inside = pts.filter(p => p.h >= seg.from - 0.01 && p.h <= seg.to + 0.01);
    if (inside.length < 2) continue;
    const family = WEATHER_STATES[seg.state]?.family ?? 'cloud';
    add('path', { d: inside.map((p, i) => `${i ? 'L' : 'M'}${X(p.h).toFixed(1)} ${Y(p.score).toFixed(1)}`).join(' '), class: `rf-line rf-line--${family}` });
  }
  if (Number.isFinite(nowHour) && nowHour >= hFrom && nowHour <= hTo) {
    add('line', { x1: X(nowHour), x2: X(nowHour), y1: y0 - 4, y2: y1, class: 'rf-now' });
  }
  for (let hr = Math.ceil(hFrom / 3) * 3; hr <= hTo; hr += 3) {
    const t = add('text', { x: X(hr), y: height - 8, class: 'rf-axis', 'text-anchor': 'middle' });
    t.textContent = short(hr);
  }
  const lo = Math.min(...pts.map(p => p.score));
  const hi = Math.max(...pts.map(p => p.score));
  svg.setAttribute('aria-label', `Forecast from ${clock(hFrom)} to ${clock(hTo)}: between ${lo} and ${hi}. Shaded band shows uncertainty.`);
  return svg;
}

/* ======================================================================== Panel */

/**
 * Mount the panel into the Day view side column (today only).
 * ctx: { doc, side, date, nowHour, now, events, items, fallbackHistory, apiFetch, onRepaint, wake, lightsOut }
 */
export function mountReadinessPanel(ctx) {
  const { doc, side, date } = ctx;
  const s = slot(date);
  if (typeof ctx.onRepaint === 'function') repaint = ctx.onRepaint;
  if (!unsubPanel) unsubPanel = onCheckinsChange(() => repaint());
  loadCheckins(ctx.apiFetch, date);
  const { pre, view, last } = todayForecast(ctx);
  void ensureSnapshot(ctx, date, pre);

  const section = h(doc, 'section', 'rf', null, side, { 'data-part': 'forecast', 'aria-labelledby': `rf-h-${date}` });
  h(doc, 'h4', 'dd-h', 'Capacity forecast', section, { id: `rf-h-${date}` });

  const r = view.readiness;
  const meta = WEATHER_STATES[view.state];
  const head = h(doc, 'div', `rf-head rf-fam--${meta.family}`, null, section);
  h(doc, 'span', 'rf-icon', iconHtml(view.state, 56), head, { 'aria-hidden': 'true' });
  const words = h(doc, 'div', 'rf-words', null, head);
  h(doc, 'div', 'rf-score', `${r.score}<small>/100</small>`, words, { 'data-part': 'readiness-score' });
  h(doc, 'div', 'rf-state', `${esc(meta.name)} <span class="rf-range">likely ${r.low}–${r.high}</span>`, words, { 'data-part': 'readiness-state' });
  h(doc, 'p', 'rf-why', esc(view.explanation), section, { 'data-part': 'readiness-why' });

  const chartWrap = h(doc, 'div', 'rf-chart-wrap', null, section);
  chartWrap.append(chartSvg(doc, view.projection, { nowHour: ctx.nowHour }));
  mountWindows(doc, section, view, s);

  const why = h(doc, 'details', 'rf-details', null, section);
  h(doc, 'summary', '', 'What’s behind this', why);
  const list = h(doc, 'ul', 'rf-contrib', null, why);
  for (const c of r.contributors) {
    const sign = c.effect > 0 ? `+${c.effect}` : c.effect === 0 ? '0' : String(c.effect);
    h(doc, 'li', '', `<span>${esc(c.label)}</span><span class="rf-src">${esc(c.source)}</span><b>${sign}</b>`, list);
  }
  h(doc, 'p', 'rf-foot', `Provisional model (${esc(r.modelVersion)}). The shaded band is an honest guess at uncertainty, not a calibrated interval. 100 means full capacity.`, why);
  mountInsightSetting(ctx, why);

  mountCheckin(ctx, section, { s, last, pre, view });
  return section;
}

function mountWindows(doc, section, view, s) {
  const changes = view.projection.segments.filter(seg => seg.changed).slice(0, 4);
  if (!changes.length) return;
  const row = h(doc, 'div', 'rf-windows', null, section, { role: 'list' });
  for (const seg of changes) {
    const meta = WEATHER_STATES[seg.state];
    const key = `${seg.from}`;
    const btn = h(doc, 'button', `rf-window rf-fam--${meta.family}`, `${iconHtml(seg.state, 28)}<span><b>${esc(short(seg.from))}–${esc(short(Math.min(seg.to, 23)))}</b>${esc(meta.name)}</span>`, row, {
      type: 'button', role: 'listitem', 'aria-expanded': s.detail === key ? 'true' : 'false', 'data-rf-window': key
    });
    on(btn, 'click', () => {
      s.detail = s.detail === key ? null : key;
      for (const other of row.querySelectorAll('[data-rf-window]')) other.setAttribute('aria-expanded', other === btn && s.detail ? 'true' : 'false');
      paintDetail(doc, section, view, s);
    });
  }
  paintDetail(doc, section, view, s);
}

function paintDetail(doc, section, view, s) {
  section.querySelector('[data-part="rf-detail"]')?.remove();
  const seg = view.projection.segments.find(x => `${x.from}` === s.detail);
  if (!seg) return;
  const meta = WEATHER_STATES[seg.state];
  const pts = view.projection.points.filter(p => p.h >= seg.from && p.h < seg.to);
  const lo = Math.min(...pts.map(p => p.low));
  const hi = Math.max(...pts.map(p => p.high));
  const busy = pts.filter(p => p.busy).length / 2;
  const recovering = pts.some(p => p.recovering);
  const lines = [
    esc(meta.meaning),
    `Around ${seg.score}, likely ${lo}–${hi}.`,
    busy ? `About ${busy} h of commitments in this window.` : 'Nothing booked: room to recover, if you take it.',
    recovering ? 'Free time is a chance to recover, not a guarantee.' : null,
    pts.some(p => p.fog) ? 'Morning grogginess is expected to clear.' : null
  ].filter(Boolean);
  const box = h(doc, 'div', 'rf-detail', `<b>${esc(clock(seg.from))}–${esc(clock(Math.min(seg.to, 23)))} · ${esc(meta.name)}</b>${lines.map(l => `<span>${l}</span>`).join('')}`, null, { 'data-part': 'rf-detail', role: 'status' });
  section.querySelector('.rf-windows')?.after(box);
}

/* ======================================================================== Insight setting */

function mountInsightSetting(ctx, parent) {
  const { doc } = ctx;
  if (typeof ctx.apiFetch !== 'function') return;
  if (insightSetting.status === 'idle') {
    insightSetting.status = 'loading';
    void (async () => {
      try {
        const response = await ctx.apiFetch(INSIGHTS_API);
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.ok !== false) insightSetting.enabled = (payload?.data ?? payload)?.enabled !== false;
        insightSetting.status = 'ready';
      } catch {
        insightSetting.status = 'error';
      }
      repaint();
    })();
  }
  if (insightSetting.status !== 'ready') return;
  const row = h(doc, 'p', 'rf-foot rf-insight-setting', `Agents can offer insights from these patterns (you choose whether to hear them): <b>${insightSetting.enabled ? 'on' : 'off'}</b>. `, parent, { 'data-part': 'insight-setting' });
  const toggle = h(doc, 'button', 'dd-link', insightSetting.enabled ? 'Turn off' : 'Turn on', row, { type: 'button' });
  on(toggle, 'click', async () => {
    const next = !insightSetting.enabled;
    toggle.disabled = true;
    try {
      const response = await ctx.apiFetch(INSIGHTS_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'settings', enabled: next }) });
      if (response.ok) insightSetting.enabled = next;
    } catch {
      /* unchanged */
    }
    repaint();
  });
}

/* ======================================================================== Check-in */

function mountCheckin(ctx, section, { s, last, pre }) {
  const { doc, date, nowHour } = ctx;
  const known = checkinState();
  const status = known.date === date ? known.status : 'loading';
  if (s.reason) return mountReason(ctx, section, s);
  if (last && !s.open) {
    const done = h(doc, 'div', 'rf-done', null, section, { 'data-part': 'checkin-done' });
    const at = String(last.observed_local ?? '').slice(11, 16);
    h(doc, 'span', '', `Checked in${at ? ` at ${esc(clock(Number(at.slice(0, 2)) + Number(at.slice(3)) / 60))}` : ''}. Forecast updated.`, done);
    const change = h(doc, 'button', 'dd-link', 'Change answers', done, { type: 'button' });
    on(change, 'click', () => { s.open = true; s.picks = {}; s.other = {}; repaint(); });
    return null;
  }
  if (status === 'error') {
    h(doc, 'p', 'rf-note', `Check-ins unavailable: ${esc(known.error)} The forecast above uses your logs only.`, section, { 'data-part': 'checkin-error' });
    return null;
  }
  const window = READINESS.checkinWindow;
  const inWindow = nowHour >= window.from && nowHour < window.to;
  if (!s.open && (!inWindow || s.skipped)) {
    if (status === 'ready') {
      const later = h(doc, 'div', 'rf-done', null, section);
      h(doc, 'span', '', 'No check-in today.', later);
      const open = h(doc, 'button', 'dd-link', 'Check in now', later, { type: 'button', 'data-checkin-open': '' });
      on(open, 'click', () => { s.open = true; s.skipped = false; repaint(); });
    }
    return null;
  }
  if (status !== 'ready') {
    h(doc, 'p', 'rf-note', 'Loading your check-in…', section, { 'data-part': 'checkin-loading' });
    return null;
  }

  const { opening, questions } = selectQuestions({
    date,
    observations: known.recent,
    evidence: pre.readiness.evidence ?? {},
    priorWork: pre.readiness.work
  });
  const card = h(doc, 'form', 'rf-checkin', null, section, { 'data-part': 'checkin', 'aria-label': opening });
  h(doc, 'h5', 'rf-opening', esc(opening), card);
  for (const q of questions) {
    const set = h(doc, 'fieldset', 'rf-q', null, card, { 'data-q': q.id });
    h(doc, 'legend', '', esc(q.prompt), set);
    const row = h(doc, 'div', 'rf-bubbles', null, set);
    for (const o of q.options) {
      const b = h(doc, 'button', 'rf-bubble', esc(o.label), row, { type: 'button', 'aria-pressed': s.picks[q.id] === o.code ? 'true' : 'false', 'data-code': o.code });
      on(b, 'click', () => pick(card, s, q.id, o.code));
    }
    const other = h(doc, 'button', 'rf-bubble rf-bubble--other', 'Something else', row, { type: 'button', 'aria-pressed': s.picks[q.id] === 'premise_wrong' ? 'true' : 'false', 'data-code': 'premise_wrong' });
    on(other, 'click', () => pick(card, s, q.id, 'premise_wrong'));
    const note = h(doc, 'input', 'rf-other', null, set, { type: 'text', maxlength: 140, placeholder: 'What’s going on? (optional)', 'aria-label': `${q.prompt} — something else`, hidden: s.picks[q.id] !== 'premise_wrong' });
    note.value = s.other[q.id] ?? '';
    on(note, 'input', () => { s.other[q.id] = note.value; });
  }
  const actions = h(doc, 'div', 'rf-actions', null, card);
  const save = h(doc, 'button', 'btn btn--primary', s.saving ? 'Saving…' : 'Save', actions, { type: 'submit', disabled: s.saving || !Object.keys(s.picks).length, 'data-checkin-save': '' });
  const skip = h(doc, 'button', 'btn btn--ghost', 'Skip', actions, { type: 'button', 'data-checkin-skip': '' });
  h(doc, 'p', 'rf-status', '', card, { role: 'status', 'aria-live': 'polite' });
  on(skip, 'click', () => { s.open = false; s.skipped = true; s.picks = {}; repaint(); });
  on(card, 'submit', event => {
    event.preventDefault();
    void saveCheckin(ctx, s, questions, last, pre, card, save);
  });
  return card;
}

function pick(card, s, qid, code) {
  s.picks[qid] = s.picks[qid] === code ? undefined : code;
  if (!s.picks[qid]) delete s.picks[qid];
  const set = card.querySelector(`[data-q="${qid}"]`);
  for (const b of set.querySelectorAll('.rf-bubble')) b.setAttribute('aria-pressed', b.getAttribute('data-code') === s.picks[qid] ? 'true' : 'false');
  const other = set.querySelector('.rf-other');
  if (other) {
    if (s.picks[qid] === 'premise_wrong') { other.removeAttribute('hidden'); other.focus?.(); } else other.setAttribute('hidden', '');
  }
  const save = card.querySelector('[data-checkin-save]');
  if (save) save.disabled = !Object.keys(s.picks).length;
}

async function saveCheckin(ctx, s, questions, last, pre, card, save) {
  const answers = answersFrom(questions, s.picks);
  if (!Object.keys(answers).length) return;
  const notes = Object.entries(s.other).filter(([q, v]) => s.picks[q] === 'premise_wrong' && v?.trim()).map(([q, v]) => `${q}: ${v.trim()}`).join(' · ');
  s.saving = true;
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    const data = await post(ctx, {
      action: 'observe',
      date: ctx.date,
      answers,
      ...(notes ? { notes } : {}),
      ...(last ? { supersedes_observation_id: last.id } : {}),
      ...(checkinState().snapshot ? {} : { snapshot: preSnapshot(pre, ctx.date) })
    });
    const obs = data.observation;
    if (data.snapshot) recordSnapshot(data.snapshot);
    recordObservation(obs); // every view repaints with the same new number
    // Patterns for the agents to offer: recomputed in the background, never blocks the save.
    void ctx.apiFetch?.(INSIGHTS_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) })?.catch?.(() => {});
    s.open = false;
    s.picks = {};
    s.other = {};
    s.reason = data.askReason ? { observation: obs, picks: new Set(), note: '', saving: false } : null;
  } catch (error) {
    const status = card.querySelector('.rf-status');
    if (status) status.textContent = `Not saved. ${error?.message ?? ''}`.trim();
    save.disabled = false;
    save.textContent = 'Save';
    s.saving = false;
    return;
  }
  s.saving = false;
  repaint();
}

function mountReason(ctx, section, s) {
  const { doc, date } = ctx;
  const obs = s.reason.observation;
  const card = h(doc, 'form', 'rf-checkin rf-reason', null, section, { 'data-part': 'checkin-reason' });
  const dir = obs.residual < 0 ? 'lower' : 'higher';
  h(doc, 'h5', 'rf-opening', esc(DISCREPANCY_PROMPT), card);
  h(doc, 'p', 'rf-note', `You feel ${dir} than the ${obs.predicted_estimate} we forecast. Your answer is already saved; this just helps the forecast learn.`, card);
  const row = h(doc, 'div', 'rf-bubbles', null, card, { role: 'group', 'aria-label': 'Reasons' });
  const note = h(doc, 'input', 'rf-other', null, null, { type: 'text', maxlength: 200, placeholder: 'What was it? (optional)', 'aria-label': 'Something else — what was it?', hidden: !s.reason.picks.has('something_else') });
  note.value = s.reason.note;
  on(note, 'input', () => { s.reason.note = note.value; });
  const sync = () => {
    for (const b of row.querySelectorAll('.rf-bubble')) b.setAttribute('aria-pressed', s.reason.picks.has(b.getAttribute('data-code')) ? 'true' : 'false');
    if (s.reason.picks.has('something_else')) note.removeAttribute('hidden'); else note.setAttribute('hidden', '');
    const saveBtn = card.querySelector('[data-reason-save]');
    if (saveBtn) saveBtn.disabled = !s.reason.picks.size || s.reason.saving;
  };
  for (const o of REASON_OPTIONS) {
    const b = h(doc, 'button', 'rf-bubble', esc(o.label), row, { type: 'button', 'aria-pressed': 'false', 'data-code': o.code });
    on(b, 'click', () => {
      const picks = s.reason.picks;
      if (o.code === 'not_sure') { const had = picks.has('not_sure'); picks.clear(); if (!had) picks.add('not_sure'); }
      else {
        picks.delete('not_sure');
        if (picks.has(o.code)) picks.delete(o.code); else if (picks.size < 3) picks.add(o.code);
      }
      sync();
    });
  }
  card.append(note);
  const actions = h(doc, 'div', 'rf-actions', null, card);
  h(doc, 'button', 'btn btn--primary', 'Save reason', actions, { type: 'submit', 'data-reason-save': '', disabled: true });
  const later = h(doc, 'button', 'btn btn--ghost', 'Not now', actions, { type: 'button' });
  h(doc, 'p', 'rf-status', '', card, { role: 'status', 'aria-live': 'polite' });
  sync();
  on(later, 'click', () => { s.reason = null; repaint(); });
  on(card, 'submit', async event => {
    event.preventDefault();
    if (!s.reason.picks.size) return;
    s.reason.saving = true;
    sync();
    try {
      await post(ctx, { action: 'reason', date, observation_id: obs.id, reason_codes: [...s.reason.picks], ...(s.reason.note.trim() ? { note: s.reason.note.trim() } : {}) });
      s.reason = null;
      repaint();
    } catch (error) {
      s.reason.saving = false;
      sync();
      const status = card.querySelector('.rf-status');
      if (status) status.textContent = `Not saved. ${error?.message ?? ''}`.trim();
    }
  });
  return card;
}
