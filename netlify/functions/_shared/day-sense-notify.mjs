/**
 * Scarce, deterministic phone notifications (Day Sense brief §3.2 / notification policy).
 * No AI. Runs every 10 minutes; most runs end after one Blob read (no devices, or
 * nothing due).
 *
 *   dexy   — a usual dose (learned from Adam's logs) is 30–60 min overdue with no log
 *   review — the train-home pass: school day, around leave time, review not done
 *
 * Cap: 4 a day. Each key once a day. An ignored notification changes nothing.
 */
import { load as loadYaml } from 'js-yaml';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { medicationDay, usualDoseTimes, clock } from '../../../packages/design-kit/js/calendar/medication-model.js';
import { getJSON } from './tasks-blobs.mjs';
import { PUSH_DAILY_CAP, readPushLog, readSubscriptions, sendToAll, writePushLog } from './push.mjs';

export const DAY_REVIEW_PREFIX = 'meta/day_review/';
const DEX_PATH = /^data\/body\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-dex-[a-z0-9-]+\.md$/;
const LEAVE_BEFORE_HOME_H = 0.75;
const REVIEW_WINDOW_H = 1;

const hourOf = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

export function sydneyNowHour(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
}

/** Leave time: explicit profile.leave_school, else 45 min before "home". */
export function leaveHour(profile) {
  const explicit = hourOf(profile?.day_profile?.leave_school ?? profile?.leave_school);
  if (explicit != null) return explicit;
  const home = hourOf(profile?.day_profile?.home ?? profile?.home) ?? 17.5;
  return home - LEAVE_BEFORE_HOME_H;
}

export function isSchoolDay(date, terms) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (!terms?.length) return true;
  return terms.some((term) => date >= term.starts_on && date <= term.ends_on);
}

/**
 * Pure: which notifications are due now.
 * @returns {Array<{ key: string, title: string, body: string, url: string }>}
 */
export function decideNotifications({ today, nowHour, med, schoolDay, leave, reviewDone, log }) {
  const out = [];
  const sentCount = Object.keys(log?.sent ?? {}).length;
  const unsent = (key) => !log?.sent?.[key];
  if (med?.prompt && nowHour < med.prompt.usual + 1) {
    const key = `dex-${med.prompt.slot}`;
    if (unsent(key)) {
      out.push({
        key,
        title: 'Dexy',
        body: `No ${med.prompt.slot === 'am' ? 'morning' : 'afternoon'} dose logged yet. You usually take it around ${clock(med.prompt.usual)}.`,
        url: '/#/calendar/day?sheet=dexy'
      });
    }
  }
  if (schoolDay && !reviewDone && nowHour >= leave && nowHour < leave + REVIEW_WINDOW_H && unsent('review')) {
    out.push({
      key: 'review',
      title: 'Today, in 60 seconds',
      body: 'On the train? A quick look at how today went, and tomorrow’s first thing.',
      url: '/#/calendar/day?review=1'
    });
  }
  return out.slice(0, Math.max(0, PUSH_DAILY_CAP - sentCount));
}

/** Dose logs from the data repo: all dex files in the last four weeks (small). */
async function loadDoseLogs(client, decodeBlob, today) {
  const tree = await client.resolveTree();
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10);
  const files = (tree.tree ?? []).filter((entry) => {
    const m = entry?.type === 'blob' ? DEX_PATH.exec(entry.path) : null;
    return m && m[1] >= since && m[1] <= today;
  });
  const logs = [];
  for (const file of files) {
    try {
      const text = decodeBlob(await client.readBlob(file.sha));
      const event = parseEventDocument(text, file.path, loadYaml);
      if (event?.record?.type === 'medication') logs.push(event.record);
    } catch {
      /* one bad file never blocks the rest */
    }
  }
  return logs;
}

/**
 * The scheduled run. `deps` make it testable without Netlify or GitHub.
 * @returns {Promise<{ sent: string[], skipped?: string }>}
 */
export async function runDaySenseNotify({ store, now = new Date(), loadProfile, loadTerms, openRepo, send = sendToAll, env = process.env }) {
  const subs = await readSubscriptions(store);
  if (!subs.length) return { sent: [], skipped: 'no_devices' };
  const today = getSydneyDateKey(now);
  const nowHour = sydneyNowHour(now);
  const log = await readPushLog(store, today);
  if (Object.keys(log.sent).length >= PUSH_DAILY_CAP) return { sent: [], skipped: 'cap' };

  // Usual dose times: computed once a day (reads the dex files), then reused.
  let med = null;
  if (!log.usual) {
    try {
      const repo = await openRepo();
      const logs = await loadDoseLogs(repo.client, repo.decodeBlob, today);
      log.usual = usualDoseTimes(logs, today);
      log.todayLogs = logs.filter((row) => row.date === today);
    } catch {
      log.usual = {};
    }
  }
  const slots = Object.values(log.usual ?? {});
  const inDoseWindow = slots.some((usual) => nowHour >= usual + 0.5 && nowHour < usual + 1);
  if (inDoseWindow) {
    // Only now is today's own log worth re-reading.
    try {
      const repo = await openRepo();
      const logs = await loadDoseLogs(repo.client, repo.decodeBlob, today);
      log.todayLogs = logs.filter((row) => row.date === today);
    } catch {
      /* keep what we had */
    }
    med = medicationDay({ date: today, today, nowHour, logs: log.todayLogs ?? [], usual: log.usual });
  }

  const profile = await loadProfile().catch(() => null);
  const terms = await loadTerms().catch(() => []);
  const review = await getJSON(store, `${DAY_REVIEW_PREFIX}${today}`).catch(() => null);
  const due = decideNotifications({
    today,
    nowHour,
    med,
    schoolDay: isSchoolDay(today, terms),
    leave: leaveHour(profile),
    reviewDone: Boolean(review),
    log
  });
  const sent = [];
  for (const message of due) {
    const result = await send(store, message, { env });
    if (result.delivered > 0) {
      log.sent[message.key] = now.toISOString();
      sent.push(message.key);
    }
  }
  await writePushLog(store, log);
  return { sent };
}
