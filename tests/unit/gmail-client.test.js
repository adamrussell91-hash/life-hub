import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GmailError,
  GmailNotConnectedError,
  createGmailClient,
  decodeSnippet,
  fetchNewMessages,
  isGmailConfigured
} from '../../netlify/functions/_shared/gmail-client.mjs';

const env = { GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_REFRESH_TOKEN: 'refresh' };

function gmailStub({ tokenStatus = 200, tokenBody = { access_token: 'tok' }, apiStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json(tokenBody, { status: tokenStatus });
    if (apiStatus !== 200) return Response.json({}, { status: apiStatus });
    if (url.includes('/messages?')) return Response.json({ messages: [{ id: 'm1' }, { id: 'm2' }] });
    if (url.includes('/messages/m1')) {
      return Response.json({
        id: 'm1',
        threadId: 't1',
        internalDate: String(Date.parse('2026-10-06T22:00:00Z')),
        snippet: 'Hi Adam, we&#39;ll visit on 20/10/2026 &amp; check',
        payload: { headers: [{ name: 'From', value: 'Agent <a@agent.example>' }, { name: 'Subject', value: 'Inspection' }] }
      });
    }
    return Response.json({ id: 'm2', threadId: 't2', internalDate: String(Date.parse('2026-10-01T00:00:00Z')), snippet: '', payload: { headers: [] } });
  };
  return { calls, fetchImpl };
}

test('configuration needs all three Gmail secrets', () => {
  assert.equal(isGmailConfigured(env), true);
  assert.equal(isGmailConfigured({ ...env, GMAIL_REFRESH_TOKEN: '' }), false);
  assert.throws(() => createGmailClient({ env: {} }), GmailNotConnectedError);
});

test('search and metadata reads use one refreshed token and never fetch bodies', async () => {
  const { calls, fetchImpl } = gmailStub();
  const client = createGmailClient({ env, fetchImpl });
  const messages = await fetchNewMessages(client, '"Wattle Rd"', { knownIds: new Set(['m2']) });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], { id: 'm1', threadId: 't1', from: 'Agent <a@agent.example>', subject: 'Inspection', snippet: "Hi Adam, we'll visit on 20/10/2026 & check", date: '2026-10-07' });
  assert.equal(calls.filter(c => c.url.startsWith('https://oauth2')).length, 1, 'one token refresh per client');
  const read = calls.find(c => c.url.includes('/messages/m1'));
  assert.match(read.url, /format=metadata/);
  assert.equal(read.options.headers.authorization, 'Bearer tok');
  assert.ok(!calls.some(c => c.url.includes('/messages/m2')), 'known ids are not re-read');
});

test('a revoked refresh token asks for reconnection instead of retrying', async () => {
  const { fetchImpl } = gmailStub({ tokenStatus: 400, tokenBody: { error: 'invalid_grant' } });
  const client = createGmailClient({ env, fetchImpl });
  await assert.rejects(client.search('x'), error => error instanceof GmailError && error.code === 'gmail_reconnect' && error.retryable === false);
  const forbidden = gmailStub({ apiStatus: 403 });
  await assert.rejects(createGmailClient({ env, fetchImpl: forbidden.fetchImpl }).search('x'), error => error.code === 'gmail_reconnect');
});

test('snippets are unescaped and stripped of invisible padding', () => {
  assert.equal(decodeSnippet('Receipt &quot;#18&quot; ͏ ͏ &lt;ok&gt;'), 'Receipt "#18" <ok>');
});
