/**
 * Turn phone notifications on or off for this device (Life Home Screen web app).
 * iPhone: works only when Life Hub is added to the Home Screen (iOS 16.4+), and the
 * permission prompt must come from a tap.
 */

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

/** 'on' | 'off' | 'denied' | 'unsupported' */
export async function pushState(win = globalThis) {
  const nav = win?.navigator;
  if (!nav?.serviceWorker || !('PushManager' in win) || !('Notification' in win)) return 'unsupported';
  if (win.Notification.permission === 'denied') return 'denied';
  try {
    const reg = await nav.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription?.();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush({ win = globalThis, apiFetch, label = '' } = {}) {
  const request = apiFetch ?? win.fetch.bind(win);
  const permission = await win.Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked in Settings.' : 'Not allowed this time.');
  const keyResponse = await request('/api/push');
  const keyPayload = await keyResponse.json().catch(() => null);
  const publicKey = keyPayload?.data?.publicKey;
  if (!keyResponse.ok || !publicKey) throw new Error('Could not reach Life Hub.');
  const reg = await win.navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const saved = await request('/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), label })
  });
  if (!saved.ok) throw new Error('Could not register this device.');
  return 'on';
}

export async function disablePush({ win = globalThis, apiFetch } = {}) {
  const request = apiFetch ?? win.fetch.bind(win);
  const reg = await win.navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription?.();
  if (!sub) return 'off';
  await request('/api/push', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint })
  }).catch(() => null);
  await sub.unsubscribe().catch(() => null);
  return 'off';
}
