/**
 * Life Home: the morning check-in card (bubbles). Today's numbers come from the same
 * Tideline model and readiness calculation as the Day dial, so Home, the dial gauge
 * and the Day panel always show one forecast.
 */
import { buildTidelineModel } from './tideline-model.js';
import { getSydneyMinutesOfDay } from '../sydney-clock.js';
import { mountCheckinCard, openCheckin } from './readiness-panel.js';
import { onCheckinsChange, withCheckins } from './readiness-checkins.js';

const hhmm = value => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

let unsub = null;
let latest = null;

/**
 * input: { events, visual, today, now, dayProfile, terms, apiFetch, onRepaint }
 * Paints into `host` (replacing what was there). Returns the card, or null.
 */
export function renderHomeCheckin(doc, host, input) {
  if (!doc || !host || !input?.today) return null;
  latest = input;
  if (!unsub) unsub = onCheckinsChange(() => latest?.onRepaint?.());
  const now = input.now ?? new Date();
  const nowHour = Number.isFinite(input.nowHour) ? input.nowHour : getSydneyMinutesOfDay(now) / 60;
  const events = withCheckins(input.events ?? [], { apiFetch: input.apiFetch, today: input.today });
  const model = buildTidelineModel({
    events,
    visual: input.visual ?? null,
    ghosts: [],
    week: [input.today],
    today: input.today,
    nowHour,
    dayProfile: input.dayProfile ?? null,
    terms: input.terms ?? null
  });
  const today = model?.days?.find(day => day.date === input.today) ?? null;
  const sleepAt = hhmm(input.dayProfile?.sleep);
  host.replaceChildren?.();
  const card = mountCheckinCard({
    doc,
    date: input.today,
    nowHour,
    now,
    events,
    cap: today?.cap,
    items: (today?.chips ?? []).filter(chip => !chip.ambient && !chip.ghost).map(chip => ({ start: chip.start, end: chip.end, kind: chip.kind, isClass: chip.isClass, protected: chip.protected, title: chip.title })),
    apiFetch: input.apiFetch,
    wake: hhmm(input.dayProfile?.wake) ?? 6.5,
    lightsOut: sleepAt != null ? Math.min(23.5, Math.max(20, sleepAt + 0.5)) : 22.5,
    onRepaint: () => input.onRepaint?.()
  }, host);
  host.hidden = false;
  return card;
}

/** Notification tap (#/home?checkin=1, or the old #/calendar/day?checkin=1): open the bubbles. */
export function openHomeCheckin(date) {
  openCheckin(date);
}

/** Test seam. */
export function resetHomeCheckin() {
  unsub?.();
  unsub = null;
  latest = null;
}
