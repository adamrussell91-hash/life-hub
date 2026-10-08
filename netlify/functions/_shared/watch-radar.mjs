/**
 * Watch price radar: one weekly pass over every wishlist watch that has a product page.
 *
 * Blob keys (tasks store):
 *   meta/watch_radar          { readings: { [watchId]: Reading }, lastRun, notified: { [modelKey]: aud } }
 *   meta/watch_radar_targets  { [modelKey]: aud }   Adam's buy prices, set from the Watches page
 *
 * Reading: { amount, currency, aud, rate_date, host, url, via, checkedAt, error?, history: [{ at, aud }] }
 * A failed check keeps the last good price and records the error, so one blocked
 * page never wipes a watch off the radar.
 */
import { WATCHES, defaultTarget, groupByModel, isTrackable, isWanted } from '../../../apps/life/js/app/aesthetics/watch-model.js';
import { getJSON, setJSON } from './tasks-blobs.mjs';
import { readShopPrice } from './watch-price.mjs';
import { PUSH_DAILY_CAP, readPushLog, readSubscriptions, sendToAll, writePushLog } from './push.mjs';
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';

export const RADAR_KEY = 'meta/watch_radar';
export const TARGETS_KEY = 'meta/watch_radar_targets';
const HISTORY_WEEKS = 26;

/** The wanted watches, by model, that the radar can actually check. */
export function radarWatchList(watches = WATCHES) {
  return groupByModel(watches.filter(isWanted)).flatMap(g =>
    g.items.filter(w => isTrackable(w.url)).map(w => ({ id: w.id, url: w.url, key: g.key, name: g.name, price: w.price })));
}
export function radarModelKeys(watches = WATCHES) {
  return new Set(groupByModel(watches.filter(isWanted)).map(g => g.key));
}

export async function readRadar(store) {
  const saved = await getJSON(store, RADAR_KEY).catch(() => null);
  return { readings: saved?.readings ?? {}, lastRun: saved?.lastRun ?? null, notified: saved?.notified ?? {} };
}
export async function readTargets(store) {
  const saved = await getJSON(store, TARGETS_KEY).catch(() => null);
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

/** Validates and stores one buy price. `null` clears it back to the default. */
export async function saveTarget(store, key, target, { keys = radarModelKeys() } = {}) {
  if (typeof key !== 'string' || !keys.has(key)) throw Object.assign(new Error('Unknown watch'), { code: 'unknown_watch' });
  if (target !== null && !(typeof target === 'number' && Number.isFinite(target) && target > 0 && target <= 100000)) {
    throw Object.assign(new Error('Target must be a price in dollars'), { code: 'validation_error' });
  }
  const targets = await readTargets(store);
  if (target === null) delete targets[key];
  else targets[key] = Math.round(target);
  await setJSON(store, TARGETS_KEY, targets);
  return targets;
}

export async function runWatchRadar({
  store,
  watches = radarWatchList(),
  fetchImpl = fetch,
  rates,
  now = () => new Date(),
  send = sendToAll,
  env = process.env
}) {
  const at = now().toISOString();
  const radar = await readRadar(store);
  const targets = await readTargets(store);

  const results = await Promise.allSettled(watches.map(async w => {
    const price = await readShopPrice(w.url, { fetchImpl });
    const fx = await rates.getRate(price.currency);
    return { w, price, fx };
  }));

  let checked = 0, failed = 0;
  results.forEach((r, i) => {
    const w = watches[i];
    const prev = radar.readings[w.id] ?? { history: [] };
    const host = (() => { try { return new URL(w.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    if (r.status === 'fulfilled') {
      checked += 1;
      const { price, fx } = r.value;
      const aud = Math.round(price.amount * fx.rate);
      const history = [...(prev.history ?? []), { at, aud }].slice(-HISTORY_WEEKS);
      radar.readings[w.id] = { amount: price.amount, currency: price.currency, aud, rate_date: fx.date, via: price.via, host, url: w.url, checkedAt: at, history };
    } else {
      failed += 1;
      const code = r.reason?.code ?? 'fetch_failed';
      radar.readings[w.id] = { ...prev, host, url: w.url, checkedAt: prev.checkedAt ?? null, error: { code, at } };
    }
  });

  // Cheapest live price per model against Adam's buy price (or the default 15% under Notion).
  const byModel = new Map();
  for (const w of watches) {
    const reading = radar.readings[w.id];
    if (!reading?.aud || reading.error?.at === at) continue;
    const best = byModel.get(w.key);
    if (!best || reading.aud < best.aud) byModel.set(w.key, { ...w, aud: reading.aud, host: reading.host });
  }
  const hits = [];
  for (const [key, best] of byModel) {
    const notionPrice = watches.find(w => w.key === key && w.price)?.price ?? null;
    const target = targets[key] ?? defaultTarget(notionPrice ?? best.aud);
    if (target && best.aud <= target) {
      if (!(radar.notified[key] <= best.aud)) hits.push({ ...best, target });
    } else {
      delete radar.notified[key];
    }
  }

  let delivered = 0;
  if (hits.length && (await readSubscriptions(store)).length) {
    const date = getSydneyDateKey(now());
    const log = await readPushLog(store, date);
    if (Object.keys(log.sent).length < PUSH_DAILY_CAP) {
      const [first] = hits.sort((a, b) => a.aud / a.target - b.aud / b.target);
      const message = hits.length === 1
        ? { title: 'A watch hit your price', body: `${first.name} is A$${first.aud} at ${first.host}. You said you'd buy at A$${first.target}.` }
        : { title: `${hits.length} watches hit your price`, body: hits.map(h => `${h.name} A$${h.aud}`).join(', ') };
      const result = await send(store, { ...message, url: '/#skincare', tag: 'watch-radar' }, { env });
      delivered = result?.delivered ?? 0;
      if (delivered > 0) {
        for (const h of hits) radar.notified[h.key] = h.aud;
        log.sent['watch-radar'] = at;
        await writePushLog(store, log);
      }
    }
  }

  radar.lastRun = at;
  await setJSON(store, RADAR_KEY, radar);
  return { checked, failed, hits: hits.map(h => ({ key: h.key, aud: h.aud, target: h.target })), delivered };
}
