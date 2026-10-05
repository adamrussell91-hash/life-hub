/**
 * Morning check-ins, loaded once per day and shared by every calendar view.
 *
 * Views add `checkinCalendarEvents()` to the events they hand to the calendar, so
 * capacityForDates sees the same answers in Day, Week, Term, Year and every hub.
 * The Day panel writes through `recordObservation` and everyone repaints.
 */
import { checkinEvents } from './readiness-model.js';

const API = '/api/capacity-checkins';
const state = { date: null, status: 'idle', payload: null, error: null };
const listeners = new Set();

function notify() {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* one bad listener never blocks the rest */
    }
  }
}

/** Fetch today's check-ins (and the last three weeks) once. Safe to call on every paint. */
export function loadCheckins(apiFetch, date) {
  if (typeof apiFetch !== 'function' || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return;
  if (state.date === date && state.status !== 'idle') return;
  Object.assign(state, { date, status: 'loading', payload: null, error: null });
  void (async () => {
    try {
      const response = await apiFetch(`${API}?date=${date}&days=21`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message ?? `Check-ins unavailable (${response.status}).`);
      if (state.date !== date) return;
      state.payload = payload?.data ?? payload;
      state.status = 'ready';
    } catch (error) {
      if (state.date !== date) return;
      state.status = 'error';
      state.error = error?.message ?? 'Could not reach the server.';
    }
    notify();
  })();
}

export function checkinState() {
  return {
    date: state.date,
    status: state.status,
    error: state.error,
    snapshot: state.payload?.snapshot ?? null,
    observations: state.payload?.observations ?? [],
    recent: state.payload?.recent ?? []
  };
}

/** Check-ins as calendar events for capacityForDates (empty until loaded). */
export function checkinCalendarEvents() {
  if (state.status !== 'ready') return [];
  return checkinEvents([...(state.payload.recent ?? []), ...(state.payload.observations ?? [])]);
}

/** A saved observation: corrections replace what they supersede. */
export function recordObservation(obs) {
  if (!obs || !state.payload) return;
  state.payload.observations = [...(state.payload.observations ?? []).filter(o => o.id !== obs.supersedes_observation_id && o.id !== obs.id), obs];
  notify();
}

export function recordSnapshot(snapshot) {
  if (snapshot && state.payload && !state.payload.snapshot) state.payload.snapshot = snapshot;
}

export function onCheckinsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tests and sign-out. */
export function resetCheckins() {
  Object.assign(state, { date: null, status: 'idle', payload: null, error: null });
  listeners.clear();
}

/**
 * The calendar's events plus today's check-ins (deduplicated by path), starting the
 * fetch when the view can. Every capacity-showing view calls this before building its
 * model, so no hub can show a number that ignores the morning answers.
 */
export function withCheckins(events, { apiFetch = null, today = null } = {}) {
  if (apiFetch && today) loadCheckins(apiFetch, today);
  const extra = checkinCalendarEvents();
  if (!extra.length) return events ?? [];
  const have = new Set((events ?? []).map(e => e?.path).filter(Boolean));
  return [...(events ?? []), ...extra.filter(e => !have.has(e.path))];
}
