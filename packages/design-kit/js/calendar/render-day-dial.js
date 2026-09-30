/**
 * Day Dial: the Day zoom stop. Today as one 24-hour circle, noon at the top.
 *
 * Structure follows docs/proposals/calendar-reference/day-dial/src/dial-ref.ts:
 * mount builds the DOM once, the `__sweep` entity's apply redraws every arc through
 * visibleSpan, and apply(id, props) is the only function that writes geometry.
 *
 * Sections: 1 Constants · 2 Model · 3 Mount · 4 Render · 5 Interaction.
 */
import { createMotion, EASE, MOTION, OVERSHOOT } from '../hub-motion-engine.js';
import { arcPath, calloutRoom, layoutCallouts, point, ringRadii, visibleSpan } from '../dial-geometry.js';
import { DD } from '../day-dial-geometry.js';
import { bandsFromProfile } from '../calendar-bands.js';
import { formatDisplayDate } from '../format-display-date.js';
import { applyHubPillsThumb } from '../hub-motion.js';
import { buildZoomPills, settleZoomPills } from './zoom-pills.js';
import { clock12, holidayRun, lightsOutFor, tomorrow as tomorrowBrief, tonight as tonightBrief } from './day-brief.js';
import { acceptPlan, GHOST_AGENTS } from './ghost-writes.js';
import { buildTidelineModel, isSchoolHoliday, toHour } from './tideline-model.js';
import { getSydneyMinutesOfDay } from '../sydney-clock.js';
import {
  countByFilterKey,
  countHidden,
  isItemVisible,
  paintSourceFilter,
  readFilterState
} from './calendar-filter.js';
import { bindItemCard, itemCardHtml } from './calendar-item-card.js';
import { saveCalendarItem } from './calendar-item-actions.js';
import { presetBand } from './render-tideline.js';
import { clock as medClock, doseCandidate, MEDICATION, toHHMM } from './medication-model.js';
import { bookmarkMoment, tonightFit, trackedHours } from './day-sense.js';
import { leaveByCandidate, legsLine, minutesLate, TRANSPORT, transportPath, wedgeFor, wedgeWidth } from './transport-model.js';
import { opportunities } from './mio-model.js';
import { openRescueSheet } from './rescue-sheet.js';
import { morphPairs, playArcs } from './rescue-morph.js';
import { openDayReview } from './day-review-sheet.js';
import { disablePush, enablePush, pushState } from '../push-client.js';

/* ======================================================================== 1. Constants */

const NS = 'http://www.w3.org/2000/svg';
const AGENT_INITIAL = { sara: 'S', hammond: 'H', clare: 'C', chadwick: 'Ch' };
const NOTE_FONT = '400 12px Inter, ui-sans-serif, sans-serif';
const ICON = {
  prev: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>'
};
/** The entrance owns the dial for this long: data and resize re-layouts wait for it. */
const ENTRANCE_GUARD_MS = Math.max(DD.sweepMs, DD.handDelay + DD.handMs, DD.gaugeMs, 6 * DD.weekStagger + MOTION.enter) + 120;
const WEEK_LABEL = /^(?:T\d+ W\d+|Hol W\d+)$/;

/** Text is measured once through a cache, never in the frame loop. */
let measureCtx;
const measured = new Map();
function textW(text, font) {
  const key = `${font}|${text}`;
  let width = measured.get(key);
  if (width == null) {
    if (measureCtx === undefined) measureCtx = doc?.createElement?.('canvas')?.getContext?.('2d') ?? null;
    if (!measureCtx) return text.length * 6.2; // no canvas (tests): a rough width keeps layout sane
    measureCtx.font = font;
    width = measureCtx.measureText(text).width;
    measured.set(key, width);
  }
  return width;
}
/** Longest prefix that fits `max` px, ending in "…". The full text stays in the popover and aria-label. */
function fitText(text, max, font) {
  const value = String(text ?? '');
  if (!value || textW(value, font) <= max) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textW(value.slice(0, mid).trimEnd() + '…', font) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? value.slice(0, lo).trimEnd() + '…' : '';
}

/* ======================================================================== 2. Model */

const state = { day: '', accepted: new Set(), dismissed: new Set(), phone: false, layout: 'dial', toast: null };
/** Ghosts decided in this session, kept so an accepted one stays real once the queue drops it. */
const decided = new Map();
const busy = new Set();
const nodes = new Map();

let doc = null;
let host = null;
let input = null;
let model = null;
let engine = null;
let root = null;
let svg = null;
let rings = null;
let arcs = [];
let nowHour = 12;
let profileSleep = 22;
/** Train-home pass: date → reviewed (server GET once per day), and push state for this device. */
const reviewed = new Map();
let pushNow = null;
let deepLinkHandled = '';

/** Leave time for the pass: 45 min before "home" (start of Yours) unless the profile says. */
function leaveHourFor() {
  const explicit = input?.dayProfile?.leave_school;
  const m = /^(\d{2}):(\d{2})$/.exec(String(explicit ?? ''));
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const home = (model?.bands ?? []).find(band => band.id === 'yours')?.from ?? 17.5;
  return home - 0.75;
}

function openReview() {
  openDayReview({
    doc,
    model,
    today: input.today,
    nowHour,
    apiFetch: input?.apiFetch,
    onSaved: () => {
      reviewed.set(input.today, true);
      void input?.onSourcesChanged?.();
    }
  });
}

async function checkReviewed(date) {
  if (reviewed.has(date) || typeof input?.apiFetch !== 'function') return;
  reviewed.set(date, false);
  try {
    const response = await input.apiFetch(`/api/day-review?date=${date}`);
    const payload = await response.json().catch(() => null);
    if (payload?.data?.done) {
      reviewed.set(date, true);
      doc?.querySelector?.('[data-part="review-entry"]')?.remove();
    }
  } catch {
    /* unknown: keep the entry */
  }
}

/*
 * Leave-by (step 9). One trip per commitment, fetched once per paint cycle and cached:
 * key → { status: 'loading'|'ok'|'error', plan?, code?, message? }.
 * `transportExtra` holds "Need 10 minutes" per commitment (minutes added before leaving).
 */
const transportCache = new Map();
const transportExtra = new Map();
let transportPlaces = null;

function transportKey(candidate, extra) {
  return `${candidate.id}|${candidate.date}|${candidate.origin}|${extra}`;
}

function transportFor(candidate) {
  if (!candidate) return null;
  const extra = transportExtra.get(candidate.id) ?? 0;
  const key = transportKey(candidate, extra);
  const hit = transportCache.get(key);
  // Live times move: a plan is good for 5 minutes, an error for 1 (then ask again).
  const fresh = hit && (hit.status === 'loading' || Date.now() - hit.at < (hit.status === 'ok' ? 5 : 1) * 60_000);
  if (fresh) return { extra, ...hit };
  if (typeof input?.apiFetch !== 'function') return null;
  // "Need 10 minutes" re-plans from the original leave time plus the extra.
  let leaveAt = null;
  if (extra) {
    const base = transportCache.get(transportKey(candidate, 0));
    const leave = base?.plan ? Number(base.plan.leave.slice(0, 2)) + Number(base.plan.leave.slice(3, 5)) / 60 : null;
    if (leave == null) return null;
    leaveAt = leave + extra / 60;
  }
  transportCache.set(key, { status: 'loading' });
  void (async () => {
    try {
      const response = await input.apiFetch(transportPath(candidate, { leaveAt }));
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        transportCache.set(key, { status: 'error', at: Date.now(), code: payload?.error?.code ?? 'transport_failed', message: payload?.error?.message ?? `Transport times unavailable (${response.status}).` });
      } else {
        const plan = payload?.data?.plan ?? payload?.plan;
        transportCache.set(key, plan?.leave && plan?.arrive
          ? { status: 'ok', at: Date.now(), plan }
          : { status: 'error', at: Date.now(), code: 'transport_failed', message: 'Transport for NSW sent no trip.' });
      }
    } catch {
      transportCache.set(key, { status: 'error', at: Date.now(), code: 'transport_failed', message: 'Could not reach the server.' });
    }
    repaintAfter(0);
  })();
  return { extra, status: 'loading' };
}

function transportCandidate(date) {
  // Today and tomorrow only: live times further out are not worth the calls.
  const tomorrowKey = model.week[model.week.indexOf(input.today) + 1];
  if (date !== input.today && date !== tomorrowKey) return null;
  return leaveByCandidate(dayAt(date), { today: input.today, nowHour });
}

function mountTransport(side, date) {
  const candidate = transportCandidate(date);
  if (!candidate) return;
  const trip = transportFor(candidate);
  if (!trip) return;
  const section = el('section', 'dd-go', undefined, side, { 'data-part': 'getting-there', 'data-id': candidate.id });
  el('h4', 'dd-h', 'Getting there', section);
  const what = `${escapeHtml(candidate.title)} at ${clock12(candidate.start)} · from ${candidate.origin}`;
  if (trip.status === 'loading') {
    el('p', 'dd-go__sub', `${what}. Checking Transport for NSW…`, section);
    return;
  }
  if (trip.status === 'error') {
    if (trip.code === 'transport_place_missing') {
      el('p', 'dd-go__sub', `${what}. Add where you leave from, once, and the dial shows when to go.`, section);
      const form = el('form', 'dd-go__places', undefined, section, { 'data-part': 'transport-places', novalidate: '' });
      el('label', 'dd-go__field', `<span>Home</span><input type="text" name="home" maxlength="160" placeholder="Street address or nearest station" value="${escapeHtml(transportPlaces?.home ?? '')}">`, form);
      el('label', 'dd-go__field', `<span>School</span><input type="text" name="school" maxlength="160" placeholder="School address or stop" value="${escapeHtml(transportPlaces?.school ?? '')}">`, form);
      el('div', 'dd-acts', '<button type="submit" class="btn btn--primary">Save places</button>', form);
      return;
    }
    el('p', 'dd-go__sub', `${what}.`, section);
    el('p', 'dd-go__err', escapeHtml(trip.message), section, { role: 'status' });
    return;
  }
  const plan = trip.plan;
  const late = minutesLate(plan, candidate.start);
  const timing = late == null ? '' : late > 0 ? `${late} min late` : late === 0 ? 'right on time' : `${-late} min to spare`;
  el('div', 'dd-big', `Leave ${clock12(Number(plan.leave.slice(0, 2)) + Number(plan.leave.slice(3, 5)) / 60)}<small>${what}</small>`, section, { 'data-part': 'leave-by' });
  el('p', 'dd-go__legs', escapeHtml(legsLine(plan)), section);
  el('p', `dd-go__sub${late > 0 ? ' is-late' : ''}`, [
    plan.status === 'realtime' ? 'Live times' : 'Timetable estimate (no live data for this trip)',
    timing,
    trip.extra ? `with ${trip.extra} more minutes` : ''
  ].filter(Boolean).join(' · '), section, { 'data-part': 'leave-status' });
  el('div', 'dd-acts', `<button type="button" class="btn btn--secondary" data-transport="more">Need ${TRANSPORT.needMore} minutes</button>`
    + (trip.extra ? '<button type="button" class="btn btn--ghost" data-transport="reset">Back to the plan</button>' : ''), section);
}

async function saveTransportPlaces(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  const places = { home: form.querySelector('[name="home"]')?.value ?? '', school: form.querySelector('[name="school"]')?.value ?? '' };
  try {
    const response = await input.apiFetch('/api/transport', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ places })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `Not saved (${response.status}).`);
    transportPlaces = payload?.data?.places ?? places;
    transportCache.clear();
    repaintAfter(0);
  } catch (error) {
    if (button) button.disabled = false;
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
  }
}

function drawLeaveWedge(date) {
  const candidate = transportCandidate(date);
  const trip = candidate ? transportFor(candidate) : null;
  if (trip?.status !== 'ok') return;
  const wedge = wedgeFor(trip.plan);
  if (!wedge) return;
  const { cx, cy } = rings;
  const e2 = rings.event[1];
  const width = date === input.today ? wedgeWidth(nowHour, wedge.leave) : TRANSPORT.wedgeMax;
  const r1 = e2 + 9;
  const group = s('g', {
    'data-part': 'leave-wedge',
    role: 'button',
    tabindex: 0,
    'aria-label': `Leave by ${clock12(wedge.leave)} for ${candidate.title}. Get ready from ${clock12(wedge.ready)}. ${trip.plan.board ? `First service ${clock12(wedge.board)}.` : ''} Open getting there.`
  }, svg);
  s('path', { class: 'dd-leave is-ready', d: arcPath(cx, cy, r1, r1 + width * 0.6, wedge.ready, wedge.leave) }, group);
  s('path', { class: 'dd-leave is-go', d: arcPath(cx, cy, r1, r1 + width, wedge.leave, Math.max(wedge.board, wedge.leave + 1 / 60)) }, group);
  s('path', { class: 'dd-leave is-ride', d: arcPath(cx, cy, r1, r1 + width * 0.45, Math.max(wedge.board, wedge.leave), wedge.arrive) }, group);
  s('title', {}, group, `Get ready ${clock12(wedge.ready)} · leave ${clock12(wedge.leave)}${trip.plan.board ? ` · board ${clock12(wedge.board)}` : ''} · arrive ${clock12(wedge.arrive)}`);
}

/*
 * Mio opportunities (step 11): the synced candidates, read once per 30 minutes.
 * Offers are computed per paint from the model; "Not this time" is remembered server-side.
 */
let mioDoc = null; // { at, places, declined: Set } | { at, error }
let mioLoading = false;

function mioPlaces() {
  if (typeof input?.apiFetch !== 'function') return null;
  if (mioDoc && Date.now() - mioDoc.at < 30 * 60_000) return mioDoc;
  if (!mioLoading) {
    mioLoading = true;
    void (async () => {
      try {
        const response = await input.apiFetch('/api/mio');
        const payload = await response.json().catch(() => null);
        mioDoc = response.ok && payload?.ok !== false
          ? { at: Date.now(), places: payload?.data?.places ?? [], declined: new Set(payload?.data?.declined ?? []), synced: payload?.data?.synced_at ?? null }
          : { at: Date.now(), places: [], declined: new Set(), error: true };
      } catch {
        mioDoc = { at: Date.now(), places: [], declined: new Set(), error: true };
      }
      mioLoading = false;
      repaintAfter(0);
    })();
  }
  return mioDoc;
}

function mioOffersFor(date) {
  const doc = mioPlaces();
  if (!doc?.places?.length || date < input.today) return [];
  return opportunities(dayAt(date), doc.places, { today: input.today, nowHour, declined: doc.declined });
}

function drawMioGaps(date) {
  const { cx, cy } = rings;
  const [e1, e2] = rings.event;
  for (const offer of mioOffersFor(date)) {
    const path = s('path', { class: 'dd-mio', 'data-part': 'mio-gap', d: arcPath(cx, cy, e1 + 6, e2 - 6, offer.visit.start, offer.visit.end) }, svg);
    s('title', {}, path, `Free near ${offer.commitment.title}: ${offer.place.name} (from your Mio saves)`);
  }
}

function mountMio(side, date) {
  const offers = mioOffersFor(date);
  if (!offers.length) return;
  const section = el('section', 'dd-mio-panel', undefined, side, { 'data-part': 'mio' });
  el('h4', 'dd-h', 'On the way', section);
  for (const offer of offers) {
    const { place, commitment, visit } = offer;
    const where = commitment.area.replace(/\b\w/g, (c) => c.toUpperCase());
    const gapText = `${offer.when === 'after' ? 'After' : 'Before'} ${escapeHtml(commitment.title)} · ${clock12(offer.gap.start)} – ${clock12(offer.gap.end)} free in ${escapeHtml(where)}`;
    const hours = offer.hours === 'open'
      ? (offer.closes != null ? `open till ${clock12(offer.closes % 24)}` : 'open then')
      : 'hours not checked yet';
    const meta = [place.category, place.rating ? `★ ${place.rating}` : '', hours, place.creator ? `saved from ${escapeHtml(place.creator)}` : ''].filter(Boolean).join(' · ');
    const card = el('div', 'dd-mio-offer', `<p class="dd-go__sub">${gapText}</p><b>${escapeHtml(place.name)}</b><p class="dd-go__sub">${meta}</p>${place.why ? `<p class="dd-mio-offer__why">${escapeHtml(place.why)}</p>` : ''}`, section, {
      'data-save': place.id
    });
    const attrs = `data-save="${escapeHtml(place.id)}" data-date="${date}" data-start="${toHHMM(visit.start)}" data-end="${toHHMM(visit.end)}" data-after="${escapeHtml(commitment.title)}"`;
    el('div', 'dd-acts', `<button type="button" class="btn btn--secondary" data-mio="plan" ${attrs}>Plan it ${clock12(visit.start)}</button>`
      + `<button type="button" class="btn btn--ghost" data-mio="skip" ${attrs}>Not this time</button>`, card);
  }
}

async function answerMio(button) {
  const act = button.getAttribute('data-mio');
  const saveId = button.getAttribute('data-save');
  const date = button.getAttribute('data-date');
  const card = button.closest('.dd-mio-offer');
  card?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const post = async (path, body) => {
    const response = await input.apiFetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `Not saved (${response.status}).`);
    return payload;
  };
  try {
    if (act === 'skip') {
      await post('/api/mio', { decline: { save_id: saveId, date } });
      mioDoc?.declined?.add(`${saveId}|${date}`);
      card?.remove();
      return;
    }
    // Plan it: Hammond queues an outing, then the tap accepts it through the usual path.
    const queued = await post('/api/mio', { plan: { save_id: saveId, date, start: button.getAttribute('data-start'), end: button.getAttribute('data-end'), after: button.getAttribute('data-after') } });
    const ghostId = queued?.data?.ghost?.id;
    const accepted = await post('/api/calendar-ghosts', { id: ghostId, decision: 'accept' });
    mioDoc?.declined?.add(`${saveId}|${date}`);
    card?.remove();
    showToast(`<b>Planned.</b> ${escapeHtml(accepted?.receipt || 'Added as a tentative plan.')}`);
    void input?.onSourcesChanged?.();
  } catch (error) {
    card?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
  }
}

/** Tonight's overflow this paint (tonightFit), or null. */
let overflowNow = null;

function formatHours(value) {
  const minutes = Math.round(value * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} m` : ''}` : `${m} m`;
}
let lightsOut = 22;
let mountedFor = null;
let observer = null;
let playedEntrance = false;
let entranceGuardUntil = 0;
let skipResize = false;
let lastHostW = 0;
let lastSelectedDate = null;
let toastTimer = 0;
let repaintTimer = 0;
let popFor = null;
/** True while telling the app about a day we have already painted, so it cannot re-enter. */
let switching = false;

const dayLabel = date => new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const capColour = pct => (pct >= 60 ? 'var(--pastel-sage-ink)' : pct >= 40 ? 'var(--pastel-gold-ink)' : 'var(--high-sea)');
const agentName = agent => GHOST_AGENTS[agent] ?? agent ?? '';
const dayAt = date => model?.days?.find(day => day.date === date) ?? null;
const perfNow = () => doc?.defaultView?.performance?.now?.() ?? Date.now();
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay() % 6 !== 0;
const isHoliday = date => isSchoolHoliday(date, model?.terms ?? []);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The only body that leaves the browser. The server loads the ghost and builds the writes. */
export function ghostDecisionBody(id, decision, reason) {
  const body = { id, decision };
  if (typeof reason === 'string' && reason) body.reason = reason;
  return body;
}

/** Server fields the write planner never sees. */
function ghostInput(ghost) {
  const { label, meta, chip, overItem, status, settled, created_at, tasks_pending, ...rest } = ghost;
  return rest;
}

function baseGhosts() {
  if (Array.isArray(input?.ghosts)) return input.ghosts;
  return input?.visual?.GHOSTS ?? [];
}

/** The queue with this session's decisions folded in. Accepted ghosts survive leaving the queue. */
function ghostsNow() {
  const seen = new Set();
  const out = [];
  for (const ghost of baseGhosts()) {
    if (!ghost?.id) continue;
    seen.add(ghost.id);
    const status = state.accepted.has(ghost.id) || ghost.settled === 'accepted'
      ? 'accepted'
      : state.dismissed.has(ghost.id) ? 'dismissed' : 'pending';
    out.push({ ...ghost, status });
  }
  for (const ghost of decided.values()) {
    if (seen.has(ghost.id) || !state.accepted.has(ghost.id)) continue;
    out.push({ ...ghost, status: 'accepted' });
  }
  return out;
}

/** Commitments only: ghost chips are drawn as ghost arcs, not as commitments. */
function chipsFor(date) {
  const day = dayAt(date);
  if (!day) return [];
  const ghosts = ghostsNow();
  const bed = ghosts.find(ghost => ghost.kind === 'bedtime' && ghost.date === date && ghost.status !== 'dismissed' && ghost.chip);
  const bedStart = bed ? toHour(bed.chip.start) : null;
  const bedEnd = bed ? toHour(bed.chip.end) : null;
  return day.chips.filter(chip => {
    if (chip.ghost) return false;
    // An accepted bedtime still arrives as a Life calendar_block; the ghost arc
    // already paints it. Keep one, not two.
    if (bed && chip.source === 'calendar_block'
      && Math.abs(chip.start - bedStart) < 0.02 && Math.abs(chip.end - bedEnd) < 0.02) {
      return false;
    }
    return true;
  }).map(chip => ({
    ...chip,
    skipped: Boolean(chip.skipped) || ghosts.some(ghost => ghost.overItem === chip.id && ghost.status === 'accepted')
  }));
}

const logsFor = date => (input?.events ?? []).filter(event => event?.record?.date === date).map(event => ({ ...event.record }));

/** The day's shape from the planning profile. School merges into Day on weekends and holidays. */
const bandsFor = date => bandsFromProfile(
  input.dayProfile ?? input.visual?.day_profile ?? {},
  { school: !isHoliday(date) && weekday(date) }
);

const BAND_NAMES = { morning: 'Morning', school: 'School', after: 'After bell', yours: 'Yours', day: 'Day', sleep: 'Sleep wall' };
const bandName = id => BAND_NAMES[id] ?? id;
/** Log dots on the dial this paint, by dot id (for the item card). */
const logItems = new Map();

/** Tap a band on the ring: Linear day with that band expanded (same as the week's Focus pills). */
function zoomToBand(id) {
  const target = id === 'day' ? 'school' : id;
  const index = (model?.bands ?? []).findIndex(band => band.id === target);
  if (index < 0 || typeof input?.onLinear !== 'function') return;
  closePop();
  presetBand(index);
  input.onLinear();
}

/** The hours the bands leave over. The reference hardcoded 22 → 6.25; the profile owns both ends here. */
const sleepWall = bands => ({ id: 'sleep', h1: bands[bands.length - 1].to, h2: bands[0].from });

function buildModel() {
  nowHour = Number.isFinite(input.nowHour) ? input.nowHour : getSydneyMinutesOfDay(input.now ?? new Date()) / 60;
  model = buildTidelineModel({
    events: input.events ?? [],
    visual: input.visual ?? null,
    ghosts: ghostsNow().filter(ghost => ghost.status !== 'dismissed'),
    week: input.week,
    today: input.today,
    nowHour,
    dayProfile: input.dayProfile ?? null,
    terms: input.terms ?? null
  });
}

/** "Thursday 24/09/26 · T3 W10" and, for today, "6:05 pm · second-last school day of term". */
function periodCopy() {
  const date = state.day;
  const label = String(model.period?.title ?? '').split(' · ')[0];
  const title = `${dayLabel(date)} ${formatDisplayDate(date)}${WEEK_LABEL.test(label) ? ` · ${label}` : ''}`;
  const tag = dayAt(date)?.tag?.text ?? '';
  if (date !== input.today) return { title, note: tag };
  const next = model.week[model.week.indexOf(date) + 1];
  const nextTag = next ? dayAt(next)?.tag?.text ?? '' : '';
  const note = /^Last day T/.test(nextTag) ? 'second-last school day of term' : tag;
  return { title, note: note ? `${clock12(nowHour)} · ${note}` : clock12(nowHour) };
}

/* ======================================================================== 3. Mount */

function attach(parent, node) {
  if (!parent || !node) return node;
  (parent.appendChild ?? parent.append).call(parent, node);
  return node;
}

function el(tag, cls, html, parent, attrs = {}) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return attach(parent, node);
}

function s(tag, attrs, parent, text) {
  const node = typeof doc.createElementNS === 'function'
    ? doc.createElementNS(NS, tag)
    : doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return attach(parent, node);
}

/** Views may run without requestAnimationFrame (unit tests): then motion lands at once. */
function clockFor(view) {
  if (typeof view?.requestAnimationFrame === 'function') return undefined;
  return { now: () => 0, request: () => 1, cancel: () => {} };
}

/** The sleep hatch. The Life shell may already carry it; never define it twice. */
function ensureHatch(target) {
  if (doc.getElementById?.('dd-hatch')) return;
  const defs = s('defs', {}, target);
  const pattern = s('pattern', { id: 'dd-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  s('rect', { width: 6, height: 6, fill: 'color-mix(in srgb, var(--navy) 5%, transparent)' }, pattern);
  s('rect', { width: 2, height: 6, fill: 'color-mix(in srgb, var(--navy) 16%, transparent)' }, pattern);
  // Interruptible time: speckled, same as the Week.
  const speckle = s('pattern', { id: 'dd-speckle', width: 7, height: 7, patternUnits: 'userSpaceOnUse' }, defs);
  s('circle', { cx: 3.5, cy: 3.5, r: 1, fill: 'color-mix(in srgb, var(--navy) 28%, transparent)' }, speckle);
}

function mount({ entrance = false } = {}) {
  const view = doc.defaultView;
  // Focus lives on the chosen day across a re-layout; read it before the DOM goes.
  const keepFocus = Boolean(root && doc.activeElement && root.contains?.(doc.activeElement) && doc.activeElement.closest?.('[data-day]'));
  engine?.dispose();
  engine = null;
  clearTimeout(toastTimer);
  toastTimer = 0;
  popFor = null;
  nodes.clear();
  arcs = [];
  skipResize = true;
  state.phone = view?.matchMedia?.('(max-width: 719px)')?.matches === true;
  buildModel();
  profileSleep = model.bands[model.bands.length - 1]?.to ?? 22;
  lightsOut = lightsOutFor(state.day, ghostsNow(), profileSleep);

  host.replaceChildren();
  root = el('section', 'dd', undefined, host, { 'data-part': 'day-dial', 'aria-label': 'Day' });

  const period = periodCopy();
  const nav = el('header', 'dd__nav', undefined, root, { 'data-part': 'nav' });
  el('button', 'dd__round', ICON.prev, nav, { type: 'button', 'aria-label': 'Previous day', 'data-step': '-1' });
  el('div', 'dd__period', `<b>${escapeHtml(period.title)}</b><span>${escapeHtml(period.note)}</span>`, nav, { 'data-part': 'period' });
  el('button', 'dd__round', ICON.next, nav, { type: 'button', 'aria-label': 'Next day', 'data-step': '1' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button', 'data-today': '' });
  if (state.day === input.today) el('button', 'btn btn--secondary dd__rescue', 'Day changed', nav, { type: 'button', 'data-rescue-open': '', 'aria-haspopup': 'dialog' });
  const zoom = buildZoomPills(doc, 'day');
  nav.append(zoom);
  el('div', 'dd__spacer', undefined, nav);
  const viewPills = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'View', 'data-part': 'view-pills' });
  el('button', 'hub-pills__btn is-active', 'Dial', viewPills, { type: 'button', 'aria-pressed': 'true' });
  el('button', 'hub-pills__btn', 'Linear', viewPills, { type: 'button', 'aria-pressed': 'false', title: 'The Tideline one-day view', 'data-linear': '' });

  const filterState = readFilterState(input?.hub || 'life');
  const dayChips = (model.days.find((day) => day.date === state.day)?.chips ?? []).concat(
    model.days.find((day) => day.date === state.day)?.due?.map((due) => (due.kind === 'allday' ? due : { ...due, kind: 'task', filterKey: 'tasks' })) ?? []
  );
  const sources = el('div', 'cal__sources', undefined, root, { 'data-part': 'sources' });
  paintSourceFilter(doc, sources, {
    hub: input?.hub || 'life',
    state: filterState,
    counts: countByFilterKey(dayChips),
    hidden: countHidden(dayChips, filterState),
    ambient: model.ambient,
    feedNote: input?.icalFeedNote ?? null,
    onChange: () => mount({ entrance: false })
  });

  const card = el('div', 'dd__card', undefined, root, { 'data-part': 'card' });
  const body = el('div', 'dd__body', undefined, card);
  const cell = el('div', 'dd__dialcell', undefined, body, { 'data-part': 'dial-cell' });
  const side = el('div', 'dd__side', undefined, body, { 'data-part': 'side' });
  mountWeek(card);

  // The dial is laid out at its cell's real width (1 unit = 1px). Never scaled.
  const cellWidth = Math.floor(cell.clientWidth || host.clientWidth || 0);
  const size = Math.min(DD.maxSize, cellWidth > 0 ? cellWidth : DD.maxSize);
  rings = ringRadii(size);
  svg = typeof doc.createElementNS === 'function'
    ? doc.createElementNS(NS, 'svg')
    : doc.createElement('svg');
  svg.setAttribute('class', 'dd-dial');
  svg.setAttribute('viewBox', `0 0 ${size} ${rings.height}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(rings.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('data-part', 'dial');
  svg.setAttribute('aria-label', `${dayLabel(state.day)}: a 24-hour dial with noon at the top`);
  attach(cell, svg);
  ensureHatch(svg);
  mountDial(size);
  mountSide(side);
  mountPushControl(side);
  handleDeepLink(view, side);
  for (const chip of dayChips) {
    if (isItemVisible(chip, filterState)) continue;
    const arc = nodes.get(`arc:${chip.id}`);
    if (arc) {
      arc.setAttribute('visibility', 'hidden');
      arc.classList?.add?.('is-filter-hidden');
    }
  }

  nodes.set('__toast', el('div', 'dd-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'dd-pop', '', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'dd-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: clockFor(view) });
  engine.place('__toast', { opacity: 0, y: DD.toastRise });
  engine.place('__pop', { opacity: 0, y: DD.popRise });
  for (const arc of arcs) {
    if (nodes.get(`arc:${arc.id}`)?.classList?.contains('is-ghost')) engine.place(`arc:${arc.id}`, { solid: 0 });
  }
  const pct = dayAt(state.day)?.cap?.pct ?? 0;
  const handTo = 12 + ((((nowHour - 12) % 24) + 24) % 24);
  if (entrance) {
    engine.place('__sweep', { h: 0 });
    engine.to('__sweep', { h: 24 }, { duration: DD.sweepMs, easing: EASE });
    engine.place('__hand', { h: 12, o: 0 });
    engine.to('__hand', { h: handTo, o: 1 }, { duration: DD.handMs, delay: DD.handDelay, easing: OVERSHOOT });
    engine.place('__gauge', { v: 0 });
    engine.to('__gauge', { v: pct }, { duration: DD.gaugeMs, easing: EASE });
    model.week.forEach((date, index) => engine.enter(`wd:${date}`, { opacity: 1, y: 0 }, {
      from: { opacity: 0, y: 6 },
      delay: index * DD.weekStagger,
      duration: MOTION.enter
    }));
    entranceGuardUntil = perfNow() + ENTRANCE_GUARD_MS;
  } else {
    engine.place('__sweep', { h: 24 });
    engine.place('__hand', { h: handTo, o: 1 });
    engine.place('__gauge', { v: pct });
  }

  lastHostW = Math.round(host.getBoundingClientRect?.().width || cellWidth || 0);
  const settle = () => {
    skipResize = false;
    lastHostW = Math.round(host.getBoundingClientRect?.().width || lastHostW);
    settleZoomPills(zoom);
    applyHubPillsThumb(viewPills);
  };
  if (typeof view?.requestAnimationFrame === 'function') view.requestAnimationFrame(settle);
  else settle();
  if (keepFocus) nodes.get(`wd:${state.day}`)?.focus?.({ preventScroll: true });
  wire(root);
  publish(view);
  if (state.toast && Date.now() < state.toast.until) showToast(state.toast.html, { resume: true });
}

function mountDial(size) {
  const { cx, cy, R } = rings;
  const date = state.day;
  const isToday = date === input.today;
  const day = dayAt(date);
  const cap = day?.cap ?? { pct: 0, note: '', factors: [], forecast: true };
  s('circle', { class: 'dd-disc', cx, cy, r: R + 8 }, svg);

  // Context ring: the day's bands, plus the sleep wall.
  const bands = bandsFor(date);
  const ctx = s('g', { 'data-part': 'context-ring' }, svg);
  const [c1, c2] = rings.context;
  const segs = [sleepWall(bands), ...bands.map(band => ({ id: band.id, h1: band.from, h2: band.to }))];
  for (const seg of segs) {
    const zoomable = seg.id !== 'sleep';
    const path = s('path', {
      class: `dd-ctx dd-ctx--${seg.id}${zoomable ? ' is-zoomable' : ''}`,
      'data-h1': seg.h1,
      'data-h2': seg.h2,
      'data-band-id': seg.id,
      ...(zoomable ? { role: 'button', tabindex: 0, 'aria-label': `${bandName(seg.id)}, ${clock12(seg.h1)} to ${clock12(seg.h2)}. Open in Linear, zoomed to this band.` } : {})
    }, ctx);
    s('title', {}, path, zoomable
      ? `${bandName(seg.id)} · ${clock12(seg.h1)} – ${clock12(seg.h2)} · click to zoom in`
      : `Sleep wall · ${clock12(seg.h1)} – ${clock12(seg.h2)}`);
    nodes.set(`ctx:${seg.id}`, path);
  }
  // Ring labels, only when there's room.
  if (!rings.compact) {
    const label = (hour, text, cls) => {
      const p = point(cx, cy, (c1 + c2) / 2, hour);
      s('text', { class: `dd-t-ring ${cls}`, x: p.x.toFixed(1), y: (p.y + 4).toFixed(1) }, ctx, text);
    };
    label(3, 'sleep wall', 'is-sleep');
    if (bands.some(band => band.id === 'school')) label(11.7, 'school', 'is-school');
    label(19.75, 'yours', 'is-yours');
  }

  // Medication band: a thin ring between the day's bands and the events.
  // Drawn only from a logged dose ("about 4 h"); a skipped or unlogged usual dose is a gap marker.
  const med = day?.med ?? null;
  if (med?.doses?.length) {
    const r1 = R * 0.664;
    const r2 = R * 0.696;
    const medRing = s('g', { 'data-part': 'med-ring' }, svg);
    for (const dose of med.doses) {
      if (dose.status === 'taken') {
        const band = s('path', { class: `dd-med${dose.late ? ' is-late' : ''}`, d: arcPath(cx, cy, r1, r2, dose.window[0], Math.min(24, dose.window[1])) }, medRing);
        s('title', {}, band, `${MEDICATION.short} ${dose.slot === 'am' ? 'morning' : 'afternoon'} dose at ${medClock(dose.time)}${dose.late ? ' (later than usual)' : ''} · drawn as about ${MEDICATION.effectHours} h`);
        const tick = point(cx, cy, (r1 + r2) / 2, dose.time);
        s('circle', { class: 'dd-med-dot', cx: tick.x.toFixed(1), cy: tick.y.toFixed(1), r: 3.2 }, medRing);
      } else if ((dose.status === 'skipped' || dose.status === 'unknown') && dose.usual != null) {
        const gap = s('path', { class: `dd-med is-gap${dose.status === 'skipped' ? ' is-skipped' : ''}`, d: arcPath(cx, cy, r1, r2, dose.usual, dose.usual + 0.75) }, medRing);
        s('title', {}, gap, dose.status === 'skipped'
          ? `${MEDICATION.short} ${dose.slot === 'am' ? 'morning' : 'afternoon'} dose skipped today`
          : `No ${dose.slot === 'am' ? 'morning' : 'afternoon'} dose logged (usually ${medClock(dose.usual)})`);
      }
    }
  }

  // Event ring
  const [e1, e2] = rings.event;
  s('circle', { class: 'dd-track', cx, cy, r: (e1 + e2) / 2, 'stroke-width': e2 - e1 }, svg);
  // What kind of time it is, under the events: interruptible school gaps, freed slots.
  const tex = s('g', { 'data-part': 'texture-ring', 'aria-hidden': 'true' }, svg);
  for (const span of day?.textures ?? []) {
    const path = s('path', { class: `dd-tex tx-${span.kind}`, d: arcPath(cx, cy, e1, e2, span.start, span.end) }, tex);
    s('title', {}, path, `Interruptible: school time between classes, ${clock12(span.start)} – ${clock12(span.end)}`);
  }
  for (const span of day?.freed ?? []) {
    const path = s('path', { class: 'dd-tex tx-regained', d: arcPath(cx, cy, e1 - 3, e2 + 3, span.start, span.end) }, tex);
    s('title', {}, path, `Freed: ${span.title}${span.reason ? ` (${span.reason})` : ''}`);
  }
  const ev = s('g', { 'data-part': 'event-ring' }, svg);
  const ghosts = ghostsNow();
  const chips = chipsFor(date);
  for (const chip of chips) {
    const proposal = ghosts.find(ghost => ghost.overItem === chip.id && ghost.status === 'pending');
    const inset = chip.isClass ? 4 : 2;
    const texture = chip.texture && !['fixed', 'focus', 'protected'].includes(chip.texture) ? `tx-${chip.texture}` : '';
    const cls = ['dd-arc', `k-${chip.kind}`, chip.isClass ? 'is-class' : '', proposal ? 'is-proposal' : '', chip.skipped ? 'is-skipped' : '', texture, chip.regained ? 'is-regained' : ''].filter(Boolean).join(' ');
    nodes.set(`arc:${chip.id}`, s('path', {
      class: cls,
      tabindex: 0,
      role: 'button',
      'data-part': chip.isClass ? 'class-arc' : 'arc',
      'data-id': chip.id,
      'aria-label': `${chip.title}. ${chip.meta ?? ''}`.trim()
    }, ev));
    arcs.push({ id: chip.id, h1: chip.start, h2: chip.end, r1: e1 + inset, r2: e2 - inset });
  }
  for (const ghost of ghosts) {
    if (!ghost.chip || ghost.chip.date !== date || ghost.overItem || ghost.status === 'dismissed') continue;
    const pending = ghost.status === 'pending';
    nodes.set(`arc:${ghost.id}`, s('path', {
      class: `dd-arc k-${ghost.chip.kind}${pending ? ' is-ghost' : ''}`,
      tabindex: 0,
      role: 'button',
      'data-part': pending ? 'ghost-arc' : 'arc',
      'data-id': ghost.id,
      'aria-label': pending ? `${ghost.label}. Proposal from ${agentName(ghost.agent)}.` : ghost.label
    }, ev));
    arcs.push({ id: ghost.id, h1: toHour(ghost.chip.start), h2: toHour(ghost.chip.end), r1: e1 + 4, r2: e2 - 4 });
  }
  // What actually happened: a thin track just outside the events (tracked work, finished workouts).
  const actual = date <= input.today ? (day?.actual ?? []) : [];
  if (actual.length) {
    const a1 = e2 + 3;
    const a2 = e2 + 8;
    const track = s('g', { 'data-part': 'actual-track' }, svg);
    for (const span of actual) {
      const end = span.open && date === input.today ? Math.max(span.start + 0.05, nowHour) : span.end;
      const piece = s('path', { class: `dd-actual is-${span.kind}${span.open ? ' is-open' : ''}`, d: arcPath(cx, cy, a1, a2, span.start, end) }, track);
      const result = span.result && span.result !== 'open' ? ` (${span.result})` : span.open ? ' (running)' : '';
      s('title', {}, piece, `${span.kind === 'workout' ? 'Workout' : 'Worked on'} ${span.title} · ${medClock(span.start)} – ${medClock(end)}${result}`);
    }
  }

  // Tonight's overflow: due work that no longer fits before lights-out spills past it.
  const fit = date === input.today ? tonightFit({ day, nowHour, lightsOut: lightsOutFor(date, ghosts, profileSleep), events: input.events }) : null;
  overflowNow = fit && fit.over >= 0.25 ? fit : null;
  if (overflowNow) {
    const lights = lightsOutFor(date, ghosts, profileSleep);
    const spill = s('path', {
      class: 'dd-overflow',
      'data-part': 'overflow',
      d: arcPath(cx, cy, e1 + 3, e2 - 3, lights, lights + Math.min(6, overflowNow.over))
    }, svg);
    s('title', {}, spill, `Doesn't fit before lights-out: ${overflowNow.spill.map(row => row.title).join(', ')} (${formatHours(overflowNow.over)} over)`);
  }

  drawLeaveWedge(date);
  drawMioGaps(date);

  // Time left tonight: a lip outside the event ring.
  if (isToday) nodes.set('left', s('path', { class: 'dd-left', 'data-part': 'time-left' }, svg));

  // Log ring
  const logs = logsFor(date);
  s('circle', { class: 'dd-logring', cx, cy, r: rings.log }, svg);
  const logRing = s('g', { 'data-part': 'log-ring' }, svg);
  const logDots = [];
  for (const log of logs) {
    if (!log.time) continue;
    if (log.type === 'meal') logDots.push({ id: `log-${log.meal}`, h: toHour(log.time), cls: 'is-meal', label: log.meal });
    if (log.type === 'diary') {
      logDots.push({
        id: 'log-symptom',
        h: toHour(log.time),
        cls: 'is-symptom',
        label: cap.factors?.find(factor => factor.id === 'symptoms')?.symptoms?.[0] ?? 'diary'
      });
    }
  }
  const meals = logs.filter(log => log.type === 'meal' && log.time).map(log => toHour(log.time));
  if ((!isToday || nowHour > 15) && logs.length && !meals.some(hour => hour >= 11 && hour < 15)) {
    logDots.push({ id: 'log-nolunch', h: 12.75, cls: 'is-missing', label: 'no lunch' });
  }
  for (const row of day?.med?.evening?.rows ?? []) {
    const planned = row.at === MEDICATION.dinnerAt ? 'dinner' : 'snack';
    if (logs.some(log => log.type === 'meal' && log.time && Math.abs(toHour(log.time) - row.at) < 1.25)) continue;
    logDots.push({ id: `plan-${planned}`, h: row.at, cls: 'is-planned', label: `${planned}, planned` });
  }
  logItems.clear();
  for (const dot of logDots) {
    const p = point(cx, cy, rings.log, dot.h);
    const record = logs.find(log => log.time && Math.abs(toHour(log.time) - dot.h) < 1e-6 && (log.type === 'meal' ? `log-${log.meal}` === dot.id : dot.id === 'log-symptom')) ?? null;
    const title = dot.id === 'log-nolunch' ? 'No lunch logged' : `${String(dot.label).charAt(0).toUpperCase()}${String(dot.label).slice(1)}`;
    const plannedWhy = day?.med?.evening?.reason === 'skipped'
      ? 'afternoon dexy skipped today'
      : day?.med?.evening?.reason === 'late' ? 'afternoon dexy later than usual' : 'no afternoon dexy logged';
    logItems.set(dot.id, {
      id: dot.id,
      kind: 'health',
      date,
      title,
      meta: dot.id === 'log-nolunch'
        ? 'Nothing logged between 11 am and 3 pm'
        : dot.cls === 'is-planned' ? `Planned for ${clock12(dot.h)} · ${plannedWhy}` : `Logged ${clock12(dot.h)}`,
      source: record?.type ?? 'meal',
      ...(record ? { record } : {})
    });
    const circle = s('circle', {
      class: `dd-log ${dot.cls}`, cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5,
      'data-part': 'log-dot', 'data-id': dot.id, role: 'button', tabindex: 0, 'aria-label': `${title}. Open for details.`
    }, logRing);
    s('title', {}, circle, `${title} · ${clock12(dot.h)}`);
  }

  // Hour ticks and labels
  for (let hour = 0; hour < 24; hour++) {
    const a = point(cx, cy, R - 2, hour);
    const b = point(cx, cy, R + (hour % 6 === 0 ? 6 : 3), hour);
    s('line', {
      class: `dd-tick${hour % 6 === 0 ? ' is-major' : ''}`,
      x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1)
    }, svg);
  }
  const hourLabel = (hour, text) => {
    const p = point(cx, cy, R + 18, hour);
    s('text', { class: 'dd-t-hour', x: p.x.toFixed(1), y: (p.y + 4).toFixed(1) }, svg, text);
  };
  hourLabel(12, 'noon');
  hourLabel(18, '6 pm');
  hourLabel(0, 'midnight');
  hourLabel(6, '6 am');

  // Callouts (not on a compact dial: the side list carries them)
  if (!rings.compact) {
    const calls = [];
    for (const chip of chips) {
      if (chip.isClass) continue;
      const proposal = ghosts.find(ghost => ghost.overItem === chip.id && ghost.status === 'pending');
      calls.push({
        id: chip.id,
        hour: (chip.start + chip.end) / 2,
        height: 28,
        text: chip.kind === 'corey' ? 'Corey' : String(chip.title ?? '').replace(/ · Dr .*$/, ''),
        sub: proposal
          ? `${agentName(proposal.agent)}: ${String(proposal.label ?? '').toLowerCase()}`
          : chip.bookmark?.note
            ? `↳ ${chip.bookmark.note}`
          : chip.kind === 'corey'
            ? String(chip.title ?? '').replace(/ with Corey$/, '')
            : String(chip.meta ?? '').split(' · ')[0],
        cls: chip.kind === 'corey' ? 'is-corey' : ''
      });
    }
    for (const dot of logDots) calls.push({ id: dot.id, hour: dot.h, height: 14, text: dot.label, cls: dot.cls === 'is-symptom' ? 'is-symptom' : 'is-meal' });
    if (overflowNow) {
      const lights = lightsOutFor(date, ghosts, profileSleep);
      calls.push({
        id: 'overflow',
        hour: lights + Math.min(6, overflowNow.over) / 2,
        height: 28,
        text: `${formatHours(overflowNow.over)} doesn't fit`,
        sub: overflowNow.spill.map(row => row.title).join(', '),
        cls: 'is-overflow'
      });
    }
    const room = calloutRoom(size);
    const positions = layoutCallouts(calls.map(call => ({ id: call.id, hour: call.hour, height: call.height })), {
      cx, cy, r: room.r, gap: DD.calloutGap, top: 8, bottom: rings.height - 8, reach: room.reach
    });
    const group = s('g', { 'data-part': 'callouts' }, svg);
    for (const call of calls) {
      const p = positions.get(call.id);
      if (!p) continue;
      const anchor = point(cx, cy, call.height === 14 ? rings.log + 7 : rings.event[1] + 2, call.hour);
      s('path', { class: 'dd-lead', d: `M${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} L${p.lead.x2.toFixed(1)} ${p.lead.y2.toFixed(1)}` }, group);
      s('text', {
        class: `dd-t-call ${call.cls}`,
        x: p.x.toFixed(1),
        y: (p.y + 11).toFixed(1),
        'text-anchor': p.anchor,
        'data-part': 'callout',
        'data-id': call.id
      }, group, fitText(call.text, room.width, DD.callFont));
      if (call.sub) {
        s('text', { class: 'dd-t-sub', x: p.x.toFixed(1), y: (p.y + 25).toFixed(1), 'text-anchor': p.anchor }, group, fitText(call.sub, room.width, DD.subFont));
      }
    }
  }

  // Centre: capacity gauge
  const gauge = s('g', { 'data-part': 'gauge', 'data-pct': cap.pct }, svg);
  s('circle', { class: 'dd-gauge-track', cx, cy, r: rings.gauge, 'stroke-width': rings.gaugeWidth }, gauge);
  nodes.set('gauge', s('circle', {
    class: 'dd-gauge',
    cx, cy,
    r: rings.gauge,
    'stroke-width': rings.gaugeWidth,
    stroke: capColour(cap.pct),
    transform: `rotate(-90 ${cx} ${cy})`
  }, gauge));
  const big = Math.max(28, Math.min(48, rings.gauge * 0.42));
  // Text boxes (what a reader's eye and the spec measure) reach 1em above the baseline and ~0.25em below.
  // So the caps line's baseline sits big + 6px above the % baseline: the two boxes never touch.
  s('text', { class: 'dd-t-caps', x: cx, y: (cy + big * 0.35 - big - 6).toFixed(1) }, gauge, cap.forecast ? 'FORECAST' : 'CAPACITY');
  nodes.set('pct', s('text', { class: 'dd-t-pct', x: cx, y: (cy + big * 0.35).toFixed(1), 'font-size': big, fill: capColour(cap.pct) }, gauge, `${cap.pct}%`));
  const noteRoom = rings.gauge * 1.6; // inside the gauge ring, with air
  s('text', { class: 'dd-t-note', x: cx, y: cy + big * 0.38 + 22 }, gauge, fitText(cap.note, noteRoom, NOTE_FONT));
  const streak = cap.factors?.find(factor => factor.id === 'streak');
  if (streak && !rings.compact) {
    s('text', { class: 'dd-t-note', x: cx, y: cy + big * 0.38 + 38 }, gauge, fitText(streak.label, noteRoom, NOTE_FONT));
  }

  // Now hand (today only)
  if (isToday) {
    nodes.set('hand', s('line', { class: 'dd-hand', 'data-part': 'now-hand' }, svg));
    nodes.set('hand-dot', s('circle', { class: 'dd-hand-dot', r: 5 }, svg));
    // On a compact dial the time is in the Tonight heading; no label outside the ring.
    if (!rings.compact) nodes.set('hand-label', s('text', { class: 'dd-t-now' }, svg, `now ${clock12(nowHour).replace(' pm', '').replace(' am', '')}`));
  }
}

/** Which dose "Taken now" means: morning until well before the usual afternoon dose. */
function slotForNow(med, usual) {
  const am = med?.doses?.find(dose => dose.slot === 'am');
  if (am && (am.status === 'taken' || am.status === 'skipped')) return 'pm';
  const pmAt = usual?.pm ?? 14;
  return nowHour < pmAt - 1.5 ? 'am' : 'pm';
}

function mountMedication(side, date) {
  const day = dayAt(date);
  const med = day?.med;
  if (!med || date !== input.today) {
    if (med?.summary) {
      const past = el('section', 'dd-med-panel', undefined, side, { 'data-part': 'medication' });
      el('h4', 'dd-h', MEDICATION.short, past);
      el('p', 'dd-med-panel__line', escapeHtml(med.summary), past);
    }
    return;
  }
  const section = el('section', `dd-med-panel${med.prompt ? ' is-prompt' : ''}`, undefined, side, { 'data-part': 'medication' });
  el('h4', 'dd-h', MEDICATION.short, section);
  const usual = Object.fromEntries(med.doses.filter(dose => dose.usual != null).map(dose => [dose.slot, dose.usual]));
  const slot = med.prompt?.slot ?? slotForNow(med, usual);
  const slotName = slot === 'am' ? 'morning' : 'afternoon';
  if (med.prompt) {
    el('p', 'dd-med-panel__ask', `No ${slotName} dose logged yet. You usually take it around ${medClock(med.prompt.usual)}.`, section);
  } else if (med.summary) {
    el('p', 'dd-med-panel__line', escapeHtml(med.summary), section);
  } else {
    el('p', 'dd-med-panel__line', 'Nothing logged today. Log a dose and the dial shows its window.', section);
  }
  const done = med.doses.find(dose => dose.slot === slot && (dose.status === 'taken' || dose.status === 'skipped'));
  if (!done) {
    el('div', 'dd-acts dd-med-panel__acts',
      `<button type="button" class="btn btn--primary" data-med-act="taken" data-med-slot="${slot}">Taken now</button>`
      + `<button type="button" class="btn btn--secondary" data-med-act="earlier" data-med-slot="${slot}">Earlier…</button>`
      + `<button type="button" class="btn btn--ghost" data-med-act="skipped" data-med-slot="${slot}">Skipping today</button>`,
      section);
    el('div', 'dd-med-panel__earlier', `<label><span>Taken at</span><input type="time" name="med-time" step="300" value="${toHHMM(Math.max(0, nowHour - 0.5))}"></label><button type="button" class="btn btn--secondary" data-med-act="taken-at" data-med-slot="${slot}">Save</button>`, section, { hidden: '' });
  }
  if (med.evening) {
    const why = med.prompt ? 'Tonight is planned early just in case' : med.evening.reason === 'skipped' ? 'Afternoon dose skipped, so tonight is planned' : med.evening.reason === 'late' ? 'Afternoon dose was late, so tonight is planned' : 'No afternoon dose logged, so tonight is planned';
    el('p', 'dd-med-panel__plan', `${why}: ${med.evening.rows.map(row => `${row.title.split(',')[0].toLowerCase()} at ${medClock(row.at)}`).join(', ')}.`, section, { 'data-part': 'evening-plan' });
  }
}

async function saveDose(button) {
  const act = button.getAttribute('data-med-act');
  const slot = button.getAttribute('data-med-slot') === 'pm' ? 'pm' : 'am';
  const panel = button.closest('[data-part="medication"]');
  if (act === 'earlier') {
    const earlier = panel?.querySelector('.dd-med-panel__earlier');
    if (earlier) {
      earlier.hidden = false;
      earlier.removeAttribute('hidden');
      earlier.querySelector('input')?.focus();
    }
    return;
  }
  const time = act === 'taken' ? toHHMM(nowHour) : act === 'taken-at' ? panel?.querySelector('input[name="med-time"]')?.value : null;
  if (act !== 'skipped' && !/^\d{2}:\d{2}$/.test(String(time ?? ''))) return;
  const status = act === 'skipped' ? 'skipped' : 'taken';
  const buttons = [...(panel?.querySelectorAll('button') ?? [])];
  buttons.forEach(btn => { btn.disabled = true; });
  const request = input?.apiFetch ?? globalThis.fetch;
  try {
    const response = await request('/api/chat/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidate: doseCandidate({ date: input.today, status, time, slot }), slug: 'sara', overwrite: true })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || 'Could not save that.');
    showToast(status === 'skipped'
      ? `<b>Noted: ${slot === 'am' ? 'morning' : 'afternoon'} dose skipped.</b> Tonight's meals are planned early.`
      : `<b>Logged ${MEDICATION.short} at ${medClock(Number(time.slice(0, 2)) + Number(time.slice(3)) / 60)}.</b> The dial shows its window.`);
    void input?.onSourcesChanged?.();
  } catch (error) {
    buttons.forEach(btn => { btn.disabled = false; });
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
  }
}

/** Blocks whose bookmark prompt was answered this session (never ask twice). */
const bookmarkDismissed = new Set();

/** A notification tapped after the block ended: ask about that task's latest block today anyway. */
function askedMoment(day, taskId) {
  const chip = (day?.chips ?? [])
    .filter((row) => row.source === 'work_block' && !row.ghost && row.record?.task_id === taskId && row.start <= nowHour)
    .sort((a, b) => b.start - a.start)[0];
  if (!chip || bookmarkDismissed.has(chip.id)) return null;
  return { blockId: chip.id, taskId, title: chip.title, previous: chip.bookmark?.note ?? '', reason: 'ending', at: chip.end };
}

/** The task a tapped notification asked about: kept across repaints until answered. */
let askedBookmark = null;

function mountBookmarkPrompt(side, date, askedTask = askedBookmark) {
  if (date !== input.today || !side) return null;
  if (side.querySelector?.('[data-part="bookmark-prompt"]')) return null;
  const moment = askedTask ? askedMoment(dayAt(date), askedTask) : bookmarkMoment(dayAt(date), nowHour, { dismissed: bookmarkDismissed });
  if (!moment) return null;
  const lead = moment.reason === 'interrupted'
    ? `${moment.next} starts at ${clock12(moment.at)} and cuts into ${moment.title}.`
    : `${moment.title} ${moment.at > nowHour ? 'ends' : 'ended'} at ${clock12(moment.at)}.`;
  const section = el('section', 'dd-bookmark', undefined, side, { 'data-part': 'bookmark-prompt', 'data-block': moment.blockId, 'data-task': moment.taskId });
  el('p', 'dd-bookmark__lead', `${escapeHtml(lead)} Leave yourself a way back in?`, section);
  el('label', 'dd-bookmark__field', `<span class="dd-sr">Where you're up to</span><input type="text" name="bookmark" maxlength="280" placeholder="${escapeHtml(moment.previous ? `Last time: ${moment.previous}` : 'e.g. stopped at Q4 feedback')}">`, section);
  el('div', 'dd-acts', '<button type="button" class="btn btn--primary" data-bookmark-act="save">Save</button>'
    + '<button type="button" class="btn btn--secondary" data-bookmark-act="none">Nothing to add</button>'
    + '<button type="button" class="btn btn--ghost" data-bookmark-act="finished">Finished for now</button>', section);
  // Sit at the top of the panel: this is the one thing worth doing right now.
  if (side.firstChild && side.firstChild !== section) side.insertBefore?.(section, side.firstChild);
  return section;
}

async function answerBookmark(button) {
  const section = button.closest('[data-part="bookmark-prompt"]');
  if (!section) return;
  const act = button.getAttribute('data-bookmark-act');
  const blockId = section.getAttribute('data-block');
  const taskId = section.getAttribute('data-task');
  if (act !== 'save') {
    // Nothing to add / finished for now: never ask again for this block; nothing is written.
    bookmarkDismissed.add(blockId);
    askedBookmark = null;
    section.remove();
    return;
  }
  const note = section.querySelector('input')?.value?.trim() ?? '';
  if (!note) {
    section.querySelector('input')?.focus();
    return;
  }
  button.disabled = true;
  try {
    await saveCalendarItem(input?.apiFetch, { record: { type: 'task', id: taskId } }, { bookmark: note });
    bookmarkDismissed.add(blockId);
    askedBookmark = null;
    section.remove();
    showToast('<b>Kept.</b> It will be waiting on the task next time.');
    void input?.onSourcesChanged?.();
  } catch (error) {
    button.disabled = false;
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
  }
}

function mountReviewEntry(side, date) {
  if (date !== input.today || nowHour < leaveHourFor() || reviewed.get(date) === true) return;
  const entry = el('section', 'dd-review-entry', undefined, side, { 'data-part': 'review-entry' });
  el('button', 'btn btn--primary', 'Today, in 60 seconds', entry, { type: 'button', 'data-review-open': '' });
  el('span', 'dd-review-entry__sub', 'How it went, a way back in, tomorrow’s first thing.', entry);
  void checkReviewed(date);
}

/** Notification taps land on #/calendar/day?review=1 or ?sheet=dexy. Handle once, then tidy the URL. */
function handleDeepLink(view, side) {
  const hash = String(view?.location?.hash ?? '');
  const query = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1)) : null;
  if (!query || deepLinkHandled === hash) return;
  deepLinkHandled = hash;
  if (state.day !== input.today) return;
  const clean = () => {
    try {
      view.history?.replaceState?.(null, '', hash.slice(0, hash.indexOf('?')) || '#/calendar/day');
    } catch {
      /* not fatal */
    }
  };
  if (query.get('review') === '1') {
    clean();
    queueMicrotask(() => openReview());
  } else if (query.get('bookmark')) {
    clean();
    askedBookmark = query.get('bookmark');
    const prompt = doc.querySelector?.('[data-part="bookmark-prompt"]') ?? mountBookmarkPrompt(side, state.day, askedBookmark);
    prompt?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    prompt?.querySelector?.('input')?.focus?.({ preventScroll: true });
  } else if (query.get('sheet') === 'dexy') {
    clean();
    const panel = doc.querySelector?.('[data-part="medication"]');
    panel?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    panel?.querySelector?.('button')?.focus?.({ preventScroll: true });
  }
}

function mountPushControl(side) {
  if ((input?.hub || 'life') !== 'life') return;
  const row = el('div', 'dd-push', undefined, side, { 'data-part': 'push' });
  const paint = (status) => {
    pushNow = status;
    const text = status === 'on' ? 'Phone notifications on' : status === 'denied' ? 'Notifications blocked in Settings' : status === 'unsupported' ? '' : 'Get the dexy nudge and the train-home pass on your phone';
    const action = status === 'on' ? 'Turn off' : status === 'off' ? 'Turn on' : '';
    row.innerHTML = text ? `<span>${escapeHtml(text)}</span>${action ? `<button type="button" class="dd-link" data-push="${status === 'on' ? 'off' : 'on'}">${action}</button>` : ''}` : '';
  };
  if (pushNow) paint(pushNow);
  void pushState(doc?.defaultView).then(paint);
}

async function togglePush(button) {
  const want = button.getAttribute('data-push');
  button.disabled = true;
  try {
    const status = want === 'on'
      ? await enablePush({ win: doc.defaultView, apiFetch: input?.apiFetch, label: doc.defaultView?.navigator?.platform ?? '' })
      : await disablePush({ win: doc.defaultView, apiFetch: input?.apiFetch });
    pushNow = status;
    showToast(status === 'on' ? '<b>Notifications on.</b> At most four a day, only when they matter.' : '<b>Notifications off</b> on this device.');
    mount({ entrance: false });
  } catch (error) {
    button.disabled = false;
    showToast(`<b>Not turned on.</b> ${escapeHtml(error?.message || 'Try again from the Home Screen app.')}`);
  }
}

function mountSide(side) {
  const date = state.day;
  const ghosts = ghostsNow();
  mountBookmarkPrompt(side, date);
  mountTransport(side, date);
  mountMio(side, date);
  mountReviewEntry(side, date);
  mountMedication(side, date);
  if (date === input.today) {
    const plannedDinnerAt = dayAt(date)?.med?.evening?.rows?.find(row => row.at === MEDICATION.dinnerAt)?.at ?? null;
    const brief = tonightBrief({ date, now: nowHour, chips: chipsFor(date), ghosts, logs: logsFor(date), profileSleep, plannedDinnerAt });
    const section = el('section', '', undefined, side, { 'data-part': 'tonight' });
    el('h4', 'dd-h', 'Tonight', section);
    const by = brief.timeLeft.by ? ` (${escapeHtml(brief.timeLeft.by)})` : '';
    el('div', 'dd-big', `${escapeHtml(brief.timeLeft.label)}<small>Now ${clock12(nowHour)} · lights out ${escapeHtml(brief.timeLeft.until)}${by}</small>`, section, { 'data-part': 'time-left-label' });
    const tracked = trackedHours(dayAt(date)?.actual ?? []);
    if (tracked >= 0.1) el('p', 'dd-tracked', `Tracked today: ${formatHours(tracked)}`, section, { 'data-part': 'tracked' });
    if (overflowNow) {
      const first = overflowNow.spill[0];
      el('div', 'dd-overflow-note',
        `<b>Doesn't fit tonight:</b> ${escapeHtml(overflowNow.spill.map(row => row.title).join(', '))} · ${formatHours(overflowNow.over)} over.`
        + (first ? ` <button type="button" class="dd-link" data-row-item="${escapeHtml(first.id)}">Move ${escapeHtml(first.title)}…</button>` : ''),
        section, { 'data-part': 'overflow-note' });
    }
    renderRows(el('div', 'dd-rows', undefined, section), brief.rows, ghosts);
  }
  const next = model.week[model.week.indexOf(date) + 1];
  if (!next) return;
  const nextDay = dayAt(next);
  const after = model.week[model.week.indexOf(next) + 1] ?? next;
  const brief = tomorrowBrief({
    date: next,
    chips: chipsFor(next),
    due: (nextDay?.due ?? []).filter(item => item.kind !== 'allday').map(item => ({ id: item.id, title: item.title })),
    ghosts,
    capacity: nextDay?.cap,
    tag: nextDay?.tag ?? null,
    holidayDaysAfter: holidayRun(after, model.terms ?? [])
  });
  const section = el('section', '', undefined, side, { 'data-part': 'tomorrow' });
  el('h4', 'dd-h', `Tomorrow · ${dayLabel(next).slice(0, 3)} ${next.slice(8)}`, section);
  const tag = brief.tag ? `<span class="dd-tag">${escapeHtml(brief.tag)}</span>` : '';
  el('div', 'dd-big', `${escapeHtml(brief.headline)}${tag}<small>${escapeHtml(brief.note)}</small>`, section, { 'data-part': 'tomorrow-headline' });
  renderRows(el('div', 'dd-rows', undefined, section), brief.rows, ghosts);
}

function renderRows(wrap, rows, ghosts) {
  for (const row of rows) {
    const node = el('div', `dd-row k-${row.kind}${row.struck ? ' is-struck' : ''}${row.itemId ? ' is-live' : ''}`, undefined, wrap, {
      'data-part': 'row',
      'data-title': row.title,
      ...(row.itemId ? { 'data-row-item': row.itemId, role: 'button', tabindex: '0', title: `${row.title} · click for details` } : {})
    });
    el('div', 'dd-row__t', row.time, node);
    const mark = row.kind === 'corey' ? '<span class="dd-mark"></span>' : '';
    const words = el('div', 'dd-row__w', `<b>${mark}${escapeHtml(row.title)}</b><span>${escapeHtml(row.note)}</span>`, node);
    if (!row.ghostId) continue;
    const ghost = ghosts.find(item => item.id === row.ghostId);
    if (!ghost) continue;
    if (row.suggestion) {
      el('div', 'dd-suggest', `<span class="dd-av ${ghost.agent === 'sara' ? 'dd-av--sara' : ''}">${AGENT_INITIAL[ghost.agent] ?? ''}</span><span>${escapeHtml(row.suggestion)}</span>`, words);
    }
    const accept = ghost.kind === 'skip_workout' ? 'Skip' : ghost.kind === 'move_task' ? 'Move' : 'Accept';
    const dismiss = ghost.kind === 'bedtime'
      ? ''
      : `<button type="button" class="btn btn--ghost" data-dismiss="${escapeHtml(ghost.id)}">${ghost.kind === 'skip_workout' ? 'Keep' : 'Dismiss'}</button>`;
    el('div', 'dd-acts', `<button type="button" class="btn btn--primary" data-accept="${escapeHtml(ghost.id)}" data-label="${accept}">${accept}</button>${dismiss}`, words);
  }
}

function mountWeek(card) {
  const week = el('div', 'dd-week', undefined, card, { 'data-part': 'week', role: 'group', 'aria-label': 'Week' });
  for (const date of model.week) {
    const cap = dayAt(date)?.cap ?? { pct: 0, note: '', forecast: true };
    const button = el('button', 'dd-wd', undefined, week, {
      type: 'button',
      'data-day': date,
      'aria-pressed': String(date === state.day),
      'aria-label': `${dayLabel(date)} ${date.slice(8)}, ${cap.pct}%`
    });
    const m = 34;
    const r1 = 18;
    const r2 = 26;
    const circ = 2 * Math.PI * 13;
    const bands = bandsFor(date);
    const wall = sleepWall(bands);
    let mini = `<svg width="${DD.miniSize}" height="${DD.miniSize}" viewBox="0 0 68 68" aria-hidden="true">`;
    mini += `<path class="dd-ctx dd-ctx--sleep" d="${arcPath(m, m, r1, r2, wall.h1, wall.h2)}"/>`;
    // Only the two bands that carry colour; the quiet ones would be invisible at 68px.
    for (const band of bands) {
      if (band.id !== 'school' && band.id !== 'yours') continue;
      mini += `<path class="dd-ctx dd-ctx--${band.id}" d="${arcPath(m, m, r1, r2, band.from, band.to)}"/>`;
    }
    for (const chip of chipsFor(date)) {
      if (chip.isClass) continue;
      mini += `<path class="dd-arc k-${chip.kind}" d="${arcPath(m, m, r2 - 2, r2 + 4, chip.start, chip.end)}"/>`;
    }
    mini += `<circle cx="34" cy="34" r="13" fill="none" stroke="var(--dd-track)" stroke-width="4"/>`;
    mini += `<circle cx="34" cy="34" r="13" fill="none" stroke="${capColour(cap.pct)}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(circ * cap.pct / 100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 34 34)"${cap.forecast ? ' opacity=".55"' : ''}/>`;
    mini += `<text x="34" y="38" font-size="10" font-weight="600" fill="var(--ink)" text-anchor="middle">${cap.pct}</text></svg>`;
    const caption = date === input.today ? 'today' : cap.forecast ? 'forecast' : cap.note;
    button.innerHTML = `${mini}<b>${dayLabel(date).slice(0, 3)} ${Number(date.slice(8))}</b><span>${escapeHtml(caption)}</span>`;
    nodes.set(`wd:${date}`, button);
  }
}

/* ======================================================================== 4. Render */

/** The only function that writes geometry or motion values. */
function apply(id, props) {
  if (id === '__sweep') return renderSweep(props.h);
  if (id === '__gauge') {
    const circ = 2 * Math.PI * rings.gauge;
    nodes.get('gauge')?.setAttribute('stroke-dasharray', `${((circ * props.v) / 100).toFixed(1)} ${circ.toFixed(1)}`);
    return;
  }
  if (id === '__hand') {
    const hand = nodes.get('hand');
    if (!hand) return;
    const { cx, cy } = rings;
    const a = point(cx, cy, rings.gauge + 12, props.h);
    const b = point(cx, cy, rings.event[1] + 10, props.h);
    hand.setAttribute('x1', a.x.toFixed(1));
    hand.setAttribute('y1', a.y.toFixed(1));
    hand.setAttribute('x2', b.x.toFixed(1));
    hand.setAttribute('y2', b.y.toFixed(1));
    hand.style.opacity = String(props.o);
    const dot = nodes.get('hand-dot');
    if (dot) {
      dot.setAttribute('cx', b.x.toFixed(1));
      dot.setAttribute('cy', b.y.toFixed(1));
      dot.style.opacity = String(props.o);
    }
    const label = nodes.get('hand-label');
    if (label) {
      const l = point(cx, cy, rings.event[1] + 14, props.h);
      label.setAttribute('x', (l.x + 8).toFixed(1));
      label.setAttribute('y', (l.y + 22).toFixed(1));
      label.style.opacity = String(props.o);
    }
    return;
  }
  if (id === '__toast' || id === '__pop') {
    const node = nodes.get(id);
    if (!node) return;
    node.style.opacity = String(props.opacity);
    node.style.transform = `translateY(${props.y}px)`;
    return;
  }
  if (id.startsWith('wd:')) {
    const node = nodes.get(id);
    if (!node) return;
    node.style.opacity = String(props.opacity);
    node.style.transform = props.y ? `translateY(${props.y}px)` : '';
    return;
  }
  if (id.startsWith('arc:')) {
    const node = nodes.get(id);
    if (node && props.solid != null) {
      node.style.strokeDasharray = props.solid >= 1 ? 'none' : '';
      node.style.fillOpacity = String(0.4 + 0.6 * props.solid);
    }
  }
}

/** Draw every arc clipped to the revealed part of the day. */
function renderSweep(sweep) {
  const { cx, cy } = rings;
  const [c1, c2] = rings.context;
  for (const [id, node] of nodes) {
    if (!id.startsWith('ctx:')) continue;
    const h1 = Number(node.getAttribute('data-h1'));
    const h2 = Number(node.getAttribute('data-h2'));
    const span = visibleSpan(h1, h2, sweep);
    node.setAttribute('d', span ? arcPath(cx, cy, c1, c2, span[0], span[1]) : '');
  }
  for (const arc of arcs) {
    const span = visibleSpan(arc.h1, arc.h2, sweep);
    nodes.get(`arc:${arc.id}`)?.setAttribute('d', span ? arcPath(cx, cy, arc.r1, arc.r2, span[0], span[1]) : '');
  }
  const left = nodes.get('left');
  if (!left) return;
  const span = visibleSpan(nowHour, lightsOut, sweep);
  left.setAttribute('d', span ? arcPath(cx, cy, rings.event[1] + 3, rings.event[1] + 7, span[0], span[1]) : '');
}

/* ======================================================================== 5. Interaction */

function showToast(html, { resume = false } = {}) {
  const toast = nodes.get('__toast');
  if (!toast) return;
  toast.innerHTML = html;
  if (!resume) state.toast = { html, until: Date.now() + DD.toastHoldMs };
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: DD.toastInMs });
  clearTimeout(toastTimer);
  const remaining = state.toast ? Math.max(0, state.toast.until - Date.now()) : DD.toastHoldMs;
  toastTimer = setTimeout(() => {
    state.toast = null;
    engine?.to('__toast', { opacity: 0, y: DD.toastRise }, { duration: DD.toastInMs });
  }, remaining);
}

function announce(text) {
  const live = nodes.get('__live');
  if (live) live.textContent = text;
}

/** Display only: the receipt the server will write if this is accepted. */
function writePreview(ghost) {
  try {
    return acceptPlan(ghostInput(ghost), { today: input.today }).receipt;
  } catch {
    return null;
  }
}

/** A chip or Due row on any day of the week, or a log dot on the dial. */
function findDialItem(id) {
  for (const day of model?.days ?? []) {
    const chip = day.chips.find(entry => entry.id === id);
    if (chip) return chip;
    const due = day.due.find(entry => entry.id === id);
    if (due) return { ...due, kind: due.kind === 'promise' ? 'promise' : due.kind === 'allday' ? (due.filterKey === 'events' ? 'event' : due.filterKey) : 'task' };
  }
  return logItems.get(id) ?? null;
}

function openPop(arcId, anchor = null) {
  const pop = nodes.get('__pop');
  const arc = anchor ?? nodes.get(`arc:${arcId}`) ?? svg?.querySelector?.(`[data-id="${arcId}"]`);
  if (!pop || !arc) return;
  const item = chipsFor(state.day).find(chip => chip.id === arcId) ?? findDialItem(arcId);
  const ghost = ghostsNow().find(item2 => (item2.id === arcId || item2.overItem === arcId) && item2.status === 'pending');
  let html = `<b>${escapeHtml(item?.title ?? ghost?.label ?? '')}</b><p class="dd-pop__meta">${escapeHtml(item?.meta ?? ghost?.meta ?? '')}</p>`;
  if (ghost) {
    if (ghost.overItem) {
      html += `<p class="dd-pop__label">${escapeHtml(agentName(ghost.agent))} suggests</p><p class="dd-pop__meta">${escapeHtml(ghost.label)} · ${escapeHtml(ghost.meta)}</p>`;
    }
    const receipt = writePreview(ghost);
    if (receipt) html += `<p class="dd-pop__label">Accept writes</p><p class="dd-pop__writes" data-part="write-preview">${escapeHtml(receipt)}</p>`;
    const dismiss = ghost.kind === 'bedtime' ? '' : `<button type="button" class="btn btn--ghost" data-dismiss="${escapeHtml(ghost.id)}">Dismiss</button>`;
    html += `<div class="dd-pop__acts"><button type="button" class="btn btn--primary" data-accept="${escapeHtml(ghost.id)}" data-label="Accept">Accept</button>${dismiss}</div>`;
  } else if (item) {
    html = itemCardHtml(item, { kind: item.kind, routeFor: input?.routeFor, location: doc?.defaultView?.location ?? null });
  }
  pop.innerHTML = html;
  pop.classList.toggle('cal-pop--card', Boolean(item && !ghost));
  if (item && !ghost) {
    bindItemCard(pop, item, {
      onSave: async (patch) => {
        const moveOnly = Object.keys(patch).every((key) => key === 'date' || key === 'start_time' || key === 'duration_min');
        if (moveOnly && typeof input?.onReschedule === 'function') await input.onReschedule(item, patch);
        else await saveCalendarItem(input?.apiFetch, item, patch);
        void input?.onSourcesChanged?.();
      },
      onClose: () => closePop()
    });
  }
  pop.hidden = false;
  pop.removeAttribute('hidden');
  const bounds = root.getBoundingClientRect();
  const box = arc.getBoundingClientRect();
  const room = bounds.right - box.right;
  pop.style.left = `${Math.max(0, room > DD.popWidth + DD.popGap ? box.right - bounds.left + DD.popGap : box.left - bounds.left - DD.popWidth - DD.popGap)}px`;
  pop.style.top = `${box.top - bounds.top}px`;
  popFor = arcId;
  engine.place('__pop', { opacity: 0, y: DD.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: DD.popMs });
}

function closePop() {
  if (!popFor) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: DD.popRise }, { duration: DD.popMs });
  setTimeout(() => {
    if (popFor) return;
    const pop = nodes.get('__pop');
    if (!pop) return;
    pop.hidden = true;
    pop.setAttribute('hidden', '');
  }, DD.popMs);
}

function decisionButtons(ghostId) {
  return [...(root?.querySelectorAll?.(`[data-accept="${ghostId}"],[data-dismiss="${ghostId}"]`) ?? [])];
}

function armButtons(ghostId, disabled, { saving = false } = {}) {
  for (const button of decisionButtons(ghostId)) {
    button.disabled = disabled;
    if (!button.hasAttribute('data-accept')) continue;
    button.textContent = saving ? 'Saving…' : button.getAttribute('data-label') ?? 'Accept';
  }
}

function markRetry(ghostId) {
  for (const button of decisionButtons(ghostId)) {
    button.disabled = false;
    if (!button.hasAttribute('data-accept')) continue;
    button.setAttribute('data-label', 'Retry');
    button.textContent = 'Retry';
  }
}

async function postDecision(id, decision, reason) {
  const request = input?.apiFetch ?? doc.defaultView?.fetch ?? globalThis.fetch;
  const response = await request('/api/calendar-ghosts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ghostDecisionBody(id, decision, reason))
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

/** Never optimistic: the server writes first, then the dial re-lays out from its answer. */
async function decide(ghostId, decision, reason) {
  const ghost = ghostsNow().find(item => item.id === ghostId);
  if (!ghost || ghost.status !== 'pending' || busy.has(ghostId)) return;
  closePop();
  busy.add(ghostId);
  armButtons(ghostId, true, { saving: decision === 'accept' });
  let result;
  try {
    result = await postDecision(ghostId, decision, reason);
  } catch (error) {
    busy.delete(ghostId);
    armButtons(ghostId, false);
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
    return;
  }
  busy.delete(ghostId);
  const receipt = typeof result.payload?.receipt === 'string' ? result.payload.receipt : '';
  if (decision === 'accept' && (result.status === 207 || result.payload?.writes === 'partial' || result.payload?.retry === 'tasks')) {
    markRetry(ghostId);
    showToast(`<b>Tasks will retry.</b> ${escapeHtml(receipt)}`);
    return;
  }
  if (result.status !== 200 || result.payload?.ok === false) {
    armButtons(ghostId, false);
    const message = result.payload?.error?.message;
    showToast(`<b>Not saved.</b> ${escapeHtml(typeof message === 'string' && message ? message : 'Could not save that change.')}`);
    return;
  }
  decided.set(ghostId, ghost);
  (decision === 'accept' ? state.accepted : state.dismissed).add(ghostId);
  // Re-lay out from the (new) data without replaying the entrance, then show the receipt.
  mount({ entrance: false });
  const text = receipt || (decision === 'accept' ? 'Written.' : 'Dismissed. Nothing written.');
  showToast(decision === 'accept' ? `<b>Written.</b> ${escapeHtml(text)}` : `<b>${escapeHtml(text)}</b>`);
  announce(text);
  void input?.onSourcesChanged?.();
}

function setDay(date) {
  if (!date || !model.week.includes(date) || date === state.day) return;
  state.day = date;
  lastSelectedDate = date;
  mount({ entrance: false });
  const pct = dayAt(date)?.cap?.pct ?? 0;
  engine.place('__sweep', { h: 0 });
  engine.to('__sweep', { h: 24 }, { duration: DD.daySwitchMs, easing: EASE });
  engine.place('__gauge', { v: 0 });
  engine.to('__gauge', { v: pct }, { duration: DD.daySwitchMs, easing: EASE });
  announce(`${dayLabel(date)}, capacity ${pct}%`);
  // The re-layout replaced the DOM: put focus back on the chosen day so arrow keys keep working.
  nodes.get(`wd:${date}`)?.focus?.({ preventScroll: true });
  switching = true;
  try {
    input?.onSelectDate?.(date);
  } finally {
    switching = false;
  }
}

function step(delta) {
  setDay(model.week[model.week.indexOf(state.day) + delta]);
}

function wire(section) {
  section.addEventListener('click', event => {
    const target = event.target;
    const medButton = target.closest?.('[data-med-act]');
    if (medButton) return void saveDose(medButton);
    const accept = target.closest?.('[data-accept]');
    if (accept) return void decide(accept.getAttribute('data-accept'), 'accept');
    const dismiss = target.closest?.('[data-dismiss]');
    if (dismiss) return void decide(dismiss.getAttribute('data-dismiss'), 'dismiss');
    const day = target.closest?.('[data-day]');
    if (day) return setDay(day.getAttribute('data-day'));
    const stepper = target.closest?.('[data-step]');
    if (stepper) return step(Number(stepper.getAttribute('data-step')));
    if (target.closest?.('[data-review-open]')) return openReview();
    const bookmarkButton = target.closest?.('[data-bookmark-act]');
    if (bookmarkButton) return void answerBookmark(bookmarkButton);
    const mioButton = target.closest?.('[data-mio]');
    if (mioButton) return void answerMio(mioButton);
    const transportButton = target.closest?.('[data-transport]');
    if (transportButton) {
      const id = transportButton.closest('[data-part="getting-there"]')?.getAttribute('data-id');
      const now = transportExtra.get(id) ?? 0;
      transportExtra.set(id, transportButton.getAttribute('data-transport') === 'more' ? now + TRANSPORT.needMore : 0);
      return void mount({ entrance: false });
    }
    if (target.closest?.('[data-part="leave-wedge"]')) {
      const panel = doc.querySelector?.('[data-part="getting-there"]');
      panel?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return void panel?.querySelector?.('button')?.focus?.({ preventScroll: true });
    }
    const pushButton = target.closest?.('[data-push]');
    if (pushButton) return void togglePush(pushButton);
    if (target.closest?.('[data-rescue-open]')) {
      return openRescueSheet({
        doc,
        model,
        today: input.today,
        nowHour,
        lightsOut: lightsOutFor(input.today, ghostsNow(), profileSleep),
        apiFetch: input?.apiFetch,
        onQueued: (queued) => {
          const pairs = morphPairs(queued);
          const before = new Map(chipsFor(state.day).map((chip) => [chip.id, chip.start]));
          input.ghosts = [...(input.ghosts ?? []), ...queued];
          mount({ entrance: false });
          // Rescue morph on the dial: each arc turns from its old time to the proposed one.
          playArcs(svg, pairs, {
            cx: rings.cx,
            cy: rings.cy,
            hourOf: (id) => {
              if (before.has(id)) return before.get(id);
              const ghost = queued.find((row) => row.id === id);
              return ghost && ghost.date === state.day ? toHour(ghost.start) : null;
            },
            view: doc.defaultView
          });
        },
        onDone: () => { void input?.onSourcesChanged?.(); }
      });
    }
    if (target.closest?.('[data-today]')) return setDay(input.today);
    if (target.closest?.('[data-linear]')) return void input?.onLinear?.();
    const zoom = target.closest?.('[data-zoom]');
    if (zoom) {
      const name = zoom.getAttribute('data-zoom');
      if (name === 'week' || name === 'term' || name === 'year' || name === 'almanac') {
        input?.onSwitchView?.(name);
      }
      return;
    }
    const arc = target.closest?.('.dd-arc[data-id]');
    if (arc) {
      const id = arc.getAttribute('data-id');
      // Every arc opens the item card (context, edit, ↗ new tab) — never a silent jump.
      return id === popFor ? closePop() : openPop(id);
    }
    const dot = target.closest?.('[data-part="log-dot"],[data-part="callout"]');
    if (dot) {
      const id = dot.getAttribute('data-id');
      return id === popFor ? closePop() : openPop(id, nodes.get(`arc:${id}`) ?? dot);
    }
    const row = target.closest?.('[data-row-item]');
    if (row && (!target.closest?.('button') || target.closest('button').hasAttribute('data-row-item'))) {
      const id = row.getAttribute('data-row-item');
      return id === popFor ? closePop() : openPop(id, row);
    }
    const band = target.closest?.('.dd-ctx.is-zoomable');
    if (band) return zoomToBand(band.getAttribute('data-band-id'));
    if (!target.closest?.('[data-part="popover"]')) closePop();
  });
  section.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-part="transport-places"]');
    if (!form) return;
    event.preventDefault();
    void saveTransportPlaces(form);
  });
  section.addEventListener('keydown', event => {
    const target = event.target;
    if (event.key === 'Escape') closePop();
    if ((event.key === 'Enter' || event.key === ' ') && target?.classList?.contains?.('is-zoomable')) {
      zoomToBand(target.getAttribute('data-band-id'));
      event.preventDefault();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && (target?.getAttribute?.('data-row-item') || target?.classList?.contains?.('dd-log'))) {
      const id = target.getAttribute('data-row-item') || target.getAttribute('data-id');
      openPop(id, target);
      event.preventDefault();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && target?.classList?.contains?.('dd-arc')) {
      openPop(target.getAttribute('data-id'));
      event.preventDefault();
    }
    if ((event.key === 'Enter' || event.key === ' ') && target?.getAttribute?.('data-part') === 'leave-wedge') {
      const panel = doc.querySelector?.('[data-part="getting-there"]');
      panel?.querySelector?.('button')?.focus?.({ preventScroll: true });
      event.preventDefault();
      return;
    }
    if (target?.closest?.('input, textarea')) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
}

function publish(view) {
  const hostname = view?.location?.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  view.__dayDial = {
    state,
    DD,
    capacity: Object.fromEntries(model.days.map(day => [day.date, day.cap?.pct])),
    rings: () => rings,
    setDay,
    decide,
    openPop,
    closePop,
    finish: () => engine?.finish(),
    stats: () => engine?.stats()
  };
}

/** Late data waits for the entrance rather than cutting it short. */
function repaintAfter(ms) {
  if (repaintTimer) return;
  repaintTimer = setTimeout(() => {
    repaintTimer = 0;
    if (mountedFor === host) mount({ entrance: false });
  }, ms);
}

function observe() {
  const view = doc.defaultView;
  if (typeof view?.ResizeObserver !== 'function') return;
  observer = new view.ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    // Never tear down mid-entrance (paint noise, or a real resize during the reveal).
    if (skipResize || perfNow() < entranceGuardUntil || engine?.busy()) {
      lastHostW = width;
      return;
    }
    if (lastHostW && Math.abs(width - lastHostW) > 2) {
      lastHostW = width;
      // Re-layout settled — never replay the entrance.
      view.requestAnimationFrame(() => {
        if (mountedFor === host) mount({ entrance: false });
      });
      return;
    }
    lastHostW = width;
  });
  observer.observe(host);
}

export function isDayDialMounted() {
  return mountedFor != null;
}

export function renderDayDial(nextDoc, dialHost, nextInput) {
  doc = nextDoc;
  input = nextInput;
  const fresh = mountedFor !== dialHost;
  host = dialHost;
  const week = input.week ?? [];
  if (fresh || input.selectedDate !== lastSelectedDate || !week.includes(state.day)) {
    state.day = week.includes(input.selectedDate)
      ? input.selectedDate
      : week.includes(input.today) ? input.today : week[0];
  }
  lastSelectedDate = input.selectedDate;
  // The app is echoing the day we just painted: the sweep already running owns the dial.
  if (switching && !fresh) return;
  if (fresh) {
    observer?.disconnect();
    observer = null;
    mountedFor = dialHost;
    observe();
  }
  const entrance = !playedEntrance;
  if (!entrance && perfNow() < entranceGuardUntil) {
    // The entrance owns the dial: paint this data once it has finished.
    repaintAfter(entranceGuardUntil - perfNow() + 16);
    return;
  }
  playedEntrance = true;
  mount({ entrance });
}

export function unmountDayDial() {
  clearTimeout(toastTimer);
  clearTimeout(repaintTimer);
  toastTimer = 0;
  repaintTimer = 0;
  observer?.disconnect();
  observer = null;
  engine?.dispose();
  engine = null;
  nodes.clear();
  arcs = [];
  decided.clear();
  busy.clear();
  transportCache.clear();
  transportExtra.clear();
  mioDoc = null;
  mioLoading = false;
  askedBookmark = null;
  state.accepted.clear();
  state.dismissed.clear();
  state.toast = null;
  state.day = '';
  mountedFor = null;
  playedEntrance = false;
  entranceGuardUntil = 0;
  lastHostW = 0;
  lastSelectedDate = null;
  popFor = null;
  root = null;
  svg = null;
  model = null;
  input = null;
  host = null;
}
