/**
 * Web Push for Life Hub (Home Screen web app on iPhone, Safari/Chrome elsewhere).
 *
 * - VAPID keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY from the environment when set;
 *   otherwise generated once and kept in the private tasks Blob store. The private
 *   key never reaches a client, the repo or a log line.
 * - Subscriptions: `meta/push_subscriptions` (a short list; one per device).
 * - Send log: `meta/push_log` per Sydney date, for cooldowns and the daily cap.
 */
import webpush from 'web-push';
import { getJSON, setJSON } from './tasks-blobs.mjs';

export const PUSH_SUBSCRIPTIONS_KEY = 'meta/push_subscriptions';
export const PUSH_VAPID_KEY = 'meta/push_vapid';
export const PUSH_LOG_KEY = 'meta/push_log';
export const PUSH_DAILY_CAP = 4;
const SUBJECT = 'https://life-hub.adam-russell.com';

export async function vapidKeys(store, env = process.env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  }
  const saved = await getJSON(store, PUSH_VAPID_KEY).catch(() => null);
  if (saved?.publicKey && saved?.privateKey) return saved;
  const keys = webpush.generateVAPIDKeys();
  await setJSON(store, PUSH_VAPID_KEY, { ...keys, created_at: new Date().toISOString() });
  return keys;
}

/** Keep only the fields a push service needs. */
export function cleanSubscription(raw) {
  const endpoint = typeof raw?.endpoint === 'string' ? raw.endpoint : '';
  const p256dh = typeof raw?.keys?.p256dh === 'string' ? raw.keys.p256dh : '';
  const auth = typeof raw?.keys?.auth === 'string' ? raw.keys.auth : '';
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !p256dh || !auth || endpoint.length > 1000) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export async function readSubscriptions(store) {
  const list = await getJSON(store, PUSH_SUBSCRIPTIONS_KEY).catch(() => null);
  return Array.isArray(list) ? list.filter((row) => cleanSubscription(row)) : [];
}

export async function saveSubscription(store, raw, { label = '' } = {}) {
  const sub = cleanSubscription(raw);
  if (!sub) throw new TypeError('invalid subscription');
  const list = (await readSubscriptions(store)).filter((row) => row.endpoint !== sub.endpoint);
  list.push({ ...sub, label: String(label).slice(0, 60), created_at: new Date().toISOString() });
  await setJSON(store, PUSH_SUBSCRIPTIONS_KEY, list.slice(-6));
  return sub;
}

export async function removeSubscription(store, endpoint) {
  const list = (await readSubscriptions(store)).filter((row) => row.endpoint !== endpoint);
  await setJSON(store, PUSH_SUBSCRIPTIONS_KEY, list);
}

/** Today's send log: { date, sent: { key: iso } }. */
export async function readPushLog(store, date) {
  const log = await getJSON(store, PUSH_LOG_KEY).catch(() => null);
  return log?.date === date ? log : { date, sent: {} };
}

export async function writePushLog(store, log) {
  await setJSON(store, PUSH_LOG_KEY, log);
}

/**
 * Send one notification to every device. Gone subscriptions (404/410) are pruned.
 * @param {{ title: string, body: string, url: string, tag?: string }} message
 */
export async function sendToAll(store, message, { env = process.env, send = webpush.sendNotification } = {}) {
  const keys = await vapidKeys(store, env);
  const subs = await readSubscriptions(store);
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag ?? message.url
  });
  const gone = [];
  let delivered = 0;
  for (const sub of subs) {
    try {
      await send(sub, payload, { vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 1800, urgency: 'normal' });
      delivered += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) gone.push(sub.endpoint);
      else console.warn(`push: send failed (${error?.statusCode ?? 'error'})`);
    }
  }
  if (gone.length) {
    const kept = subs.filter((sub) => !gone.includes(sub.endpoint));
    await setJSON(store, PUSH_SUBSCRIPTIONS_KEY, kept);
  }
  return { delivered, pruned: gone.length };
}
