#!/usr/bin/env node
/**
 * One-off: mint a read-only Gmail refresh token for the Garage & Home Mailroom.
 *
 *   GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/gmail-refresh-token.mjs
 *
 * Uses Google's loopback flow for a "Desktop app" OAuth client. Opens nothing
 * by itself: copy the printed link into a browser, approve, and the token is
 * printed here. Put it in Netlify as GMAIL_REFRESH_TOKEN. Never commit it.
 * See docs/garage-home.md.
 */
import { createServer } from 'node:http';
import { once } from 'node:events';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET first (Google Cloud → Credentials → OAuth client, type Desktop app).');
  process.exit(1);
}

const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const redirectUri = `http://127.0.0.1:${server.address().port}`;
const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consent.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent'
}).toString();

console.log('\nOpen this link, sign in to the Gmail account to read, and approve read-only access:\n');
console.log(consent.toString());
console.log('\nWaiting for Google to send you back here…');

server.on('request', async (request, response) => {
  const url = new URL(request.url, redirectUri);
  const code = url.searchParams.get('code');
  if (!code) {
    response.writeHead(400, { 'content-type': 'text/plain' }).end(url.searchParams.get('error') ?? 'No code in the redirect.');
    return;
  }
  try {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString()
    }).then(res => res.json());
    if (!token.refresh_token) throw new Error(token.error_description ?? token.error ?? 'Google returned no refresh token.');
    response.writeHead(200, { 'content-type': 'text/plain' }).end('Done. You can close this tab and go back to the terminal.');
    console.log('\nGMAIL_REFRESH_TOKEN (add it in Netlify → Site configuration → Environment variables):\n');
    console.log(token.refresh_token);
    console.log('');
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain' }).end('Token exchange failed. See the terminal.');
    console.error(`\nToken exchange failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
