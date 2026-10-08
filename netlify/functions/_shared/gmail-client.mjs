/**
 * Read-only Gmail client for the Garage & Home Mailroom.
 *
 * Uses an OAuth refresh token (scope gmail.readonly) kept in Netlify env:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 * `scripts/gmail-refresh-token.mjs` mints the refresh token once, locally.
 *
 * Only metadata is fetched: From, Subject, Date and Gmail's own snippet.
 * Message bodies and attachments are never downloaded.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailNotConnectedError extends Error {
  constructor() {
    super('Gmail is not connected.');
    this.code = 'gmail_not_connected';
  }
}

export class GmailError extends Error {
  constructor(code, retryable = true) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

export function isGmailConfigured(env = process.env) {
  return Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

function header(headers, name) {
  const found = (headers ?? []).find(h => typeof h?.name === 'string' && h.name.toLowerCase() === name.toLowerCase());
  return typeof found?.value === 'string' ? found.value : '';
}

/** Gmail's snippet arrives HTML-escaped; turn it back into plain text. */
export function decodeSnippet(value) {
  return String(value ?? '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[͏​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sydneyDateKey(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(ms))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function createGmailClient({ env = process.env, fetchImpl = fetch } = {}) {
  if (!isGmailConfigured(env)) throw new GmailNotConnectedError();
  let accessToken = null;

  async function token() {
    if (accessToken) return accessToken;
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        refresh_token: env.GMAIL_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      }).toString()
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || typeof payload?.access_token !== 'string') {
      // invalid_grant means the refresh token was revoked or expired: reconnect, don't retry.
      throw new GmailError(payload?.error === 'invalid_grant' ? 'gmail_reconnect' : 'gmail_auth_failed', payload?.error !== 'invalid_grant');
    }
    accessToken = payload.access_token;
    return accessToken;
  }

  async function get(path) {
    const response = await fetchImpl(`${API}${path}`, { headers: { authorization: `Bearer ${await token()}` } });
    if (response.status === 401 || response.status === 403) throw new GmailError('gmail_reconnect', false);
    if (!response.ok) throw new GmailError('gmail_unavailable', true);
    return response.json();
  }

  return {
    /** Message ids matching a Gmail search, newest first. */
    async search(query, { max = 50 } = {}) {
      const params = new URLSearchParams({ q: query, maxResults: String(Math.min(100, Math.max(1, max))) });
      const payload = await get(`/messages?${params}`);
      return Array.isArray(payload?.messages) ? payload.messages.map(m => m.id).filter(id => typeof id === 'string') : [];
    },

    /** One message's metadata, shaped for classifyMessage(). */
    async message(id) {
      const params = new URLSearchParams({ format: 'metadata' });
      for (const name of ['From', 'Subject', 'Date']) params.append('metadataHeaders', name);
      const payload = await get(`/messages/${encodeURIComponent(id)}?${params}`);
      const internal = Number(payload?.internalDate);
      return {
        id: String(payload?.id ?? id),
        threadId: String(payload?.threadId ?? ''),
        from: header(payload?.payload?.headers, 'From'),
        subject: header(payload?.payload?.headers, 'Subject'),
        snippet: decodeSnippet(payload?.snippet),
        date: Number.isFinite(internal) ? sydneyDateKey(internal) : null
      };
    }
  };
}

/** Search, then fetch metadata for ids not already known. Bounded so a cron run stays short. */
export async function fetchNewMessages(client, query, { knownIds = new Set(), max = 40 } = {}) {
  const ids = (await client.search(query, { max })).filter(id => !knownIds.has(id));
  const messages = [];
  for (const id of ids) {
    const message = await client.message(id);
    if (message.date) messages.push(message);
  }
  return messages;
}
