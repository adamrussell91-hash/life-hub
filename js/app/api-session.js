export class SessionApiError extends Error {
  constructor(status, code) {
    super('Life Hub request failed');
    this.name = 'SessionApiError';
    this.status = status;
    this.code = code;
  }
}

export function createSessionApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    getSession: () => requestJson(fetchImpl, '/api/session'),
    signIn: passphrase => requestJson(fetchImpl, '/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase })
    }),
    signOut: () => requestJson(fetchImpl, '/api/logout', { method: 'POST', keepalive: true })
  };
}

async function requestJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok !== true) {
    throw new SessionApiError(response.status, payload?.error?.code ?? 'request_failed');
  }
  return payload.data;
}
