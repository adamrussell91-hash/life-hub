import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  UMBRELLA_PASSPHRASE_HASH_ENV,
  UMBRELLA_SESSION_COOKIE,
  UMBRELLA_SESSION_SECRET_ENV
} from '../../netlify/functions/_shared/umbrella-auth.mjs';

async function functionSources() {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) await walk(url);
      else if (entry.name.endsWith('.mjs')) files.push(url);
    }
  }
  await walk(new URL('../../netlify/functions/', import.meta.url));
  return Promise.all(files.map(async url => ({ url, source: await readFile(url, 'utf8') })));
}

test('umbrella auth retains Life Hub env names and cookie', () => {
  assert.equal(UMBRELLA_PASSPHRASE_HASH_ENV, 'LIFE_HUB_PASSPHRASE_HASH');
  assert.equal(UMBRELLA_SESSION_SECRET_ENV, 'SESSION_SECRET');
  assert.equal(UMBRELLA_SESSION_COOKIE, 'life_hub_session');
});

test('Netlify functions do not introduce a second passphrase or Teaching auth env', async () => {
  const files = await functionSources();
  assert.ok(files.length > 0);
  for (const { url, source } of files) {
    assert.doesNotMatch(source, /TEACHING_HUB_PASSPHRASE_HASH/);
    assert.doesNotMatch(source, /process\.env\.UMBRELLA_PASSPHRASE/);
    assert.doesNotMatch(source, /teaching_hub_session/);
  }
});

test('configured-auth check and login read the retained Life env keys', async () => {
  const http = await readFile(new URL('../../netlify/functions/_shared/http.mjs', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../../netlify/functions/auth.mjs', import.meta.url), 'utf8');
  assert.match(http, /UMBRELLA_PASSPHRASE_HASH_ENV/);
  assert.match(http, /UMBRELLA_SESSION_SECRET_ENV/);
  assert.match(auth, /UMBRELLA_PASSPHRASE_HASH_ENV/);
  assert.match(auth, /UMBRELLA_SESSION_SECRET_ENV/);
});

test('session cookie and secret literals live only in umbrella-auth.mjs', async () => {
  const files = await functionSources();
  for (const { url, source } of files) {
    const name = url.pathname.split('/').pop();
    if (name === 'umbrella-auth.mjs') continue;
    assert.doesNotMatch(source, /['"]life_hub_session['"]/, name);
    assert.doesNotMatch(source, /env\.SESSION_SECRET/, name);
  }
});

test('functions verify sessions through umbrella helpers', async () => {
  const http = await readFile(new URL('../../netlify/functions/_shared/http.mjs', import.meta.url), 'utf8');
  assert.match(http, /export function readUmbrellaSessionCookie/);
  assert.match(http, /export function umbrellaSessionSecret/);

  const security = await readFile(new URL('../../netlify/functions/_shared/auth-security.mjs', import.meta.url), 'utf8');
  assert.match(security, /UMBRELLA_SESSION_COOKIE/);
});
