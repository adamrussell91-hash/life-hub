# Authenticated GitHub Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure single-user authentication and incremental, read-only synchronization from the private Life Hub GitHub repository to the existing Home PWA.

**Architecture:** Small Fetch-style Netlify Functions delegate to ordinary JavaScript modules for password verification, signed sessions, GitHub reads, path policy, and health mapping. The browser authenticates before rendering, diffs server-issued manifests against a private Cache Storage adapter, downloads only changed blobs, and continues deriving Home through the existing parser and aggregation modules.

**Tech Stack:** Node.js 22 ESM, built-in `node:crypto`, vanilla browser modules, Netlify Functions Fetch API, GitHub REST API `2026-03-10`, Cache Storage, `node:test`, and Playwright 1.61.1.

## Global Constraints

- The app is single-user and read-only in this phase.
- No production token, passphrase, private content, provider error, or session secret may enter browser assets, responses, fixtures, repository files, or logs.
- The raw passphrase exists only for the duration of `POST /api/auth`; store only a versioned salted scrypt verifier.
- Session lifetime is eight hours; cookie name is `life_hub_session` with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`.
- Authentication accepts JSON only, rejects cross-origin requests, limits request size, and declares a five-attempt-per-sixty-second Netlify limit aggregated by IP and domain.
- GitHub credentials are server-only and require read-only Contents access to `adamrussell91-hash/life-hub`.
- Repository reads are restricted to canonical Markdown event paths plus `config/targets.yml` and `config/agents.yml`.
- Manifest ranges use `Australia/Sydney`, accept at most 366 days, initially load thirty prior days, and extend a boundary-reaching workout streak backwards in ninety-day blocks.
- Every manifest has a range-specific `manifestId`; conditional requests never use the branch commit SHA alone.
- The file endpoint accepts at most fifty files and 1 MiB total declared and actual UTF-8 content per batch.
- Automatic refresh runs every two minutes only while the page is visible; duplicate refreshes collapse to one request.
- Only a tab with a prior online session marker may render cached data offline, and never beyond the known eight-hour session expiry.
- Production secrets remain disconnected throughout implementation and review.

---

### Task 1: Password and signed-session primitives

**Files:**
- Create: `netlify/functions/_shared/auth-security.mjs`
- Create: `scripts/generate-auth-secrets.mjs`
- Create: `tests/unit/auth-security.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `createPassphraseHash(passphrase, options?) -> Promise<string>`.
- Produces: `verifyPassphrase(passphrase, encoded) -> Promise<boolean>`.
- Produces: `createSessionToken({ now, randomBytes }, secret) -> { token, expiresAt }`.
- Produces: `verifySessionToken(token, secret, now) -> { valid, payload?, reason? }`.
- Produces: `serializeSessionCookie(token)` and `serializeExpiredSessionCookie()`.

- [ ] **Step 1: Write failing password and session tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPassphraseHash,
  createSessionToken,
  serializeSessionCookie,
  verifyPassphrase,
  verifySessionToken
} from '../../netlify/functions/_shared/auth-security.mjs';

test('scrypt verifier accepts only the original passphrase', async () => {
  const encoded = await createPassphraseHash('correct horse', {
    salt: Buffer.alloc(16, 7)
  });
  assert.equal(await verifyPassphrase('correct horse', encoded), true);
  assert.equal(await verifyPassphrase('wrong horse', encoded), false);
});

test('signed session expires after eight hours and rejects tampering', () => {
  const secret = 's'.repeat(32);
  const issued = createSessionToken({
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 3)
  }, secret);
  assert.equal(verifySessionToken(issued.token, secret, Date.parse('2026-08-01T07:59:59Z')).valid, true);
  assert.equal(verifySessionToken(`${issued.token}x`, secret, Date.parse('2026-08-01T01:00:00Z')).valid, false);
  assert.equal(verifySessionToken(issued.token, secret, Date.parse('2026-08-01T08:00:01Z')).reason, 'expired');
});

test('session cookie uses every required browser security attribute', () => {
  const cookie = serializeSessionCookie('abc');
  for (const value of ['life_hub_session=abc', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
    assert.match(cookie, new RegExp(value.replace('/', '\\/')));
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `node --test tests/unit/auth-security.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `auth-security.mjs`.

- [ ] **Step 3: Implement the cryptographic boundary**

Use `scrypt` via `promisify`, `timingSafeEqual`, `createHmac`, and `randomBytes` from `node:crypto`. Encode password verifiers exactly as `scrypt$v1$16384$8$1$<salt-base64url>$<hash-base64url>`, derive 32 bytes with `maxmem: 64 * 1024 * 1024`, reject malformed encodings without throwing, require a session secret of at least 32 UTF-8 bytes, and encode the session payload `{ v: 1, iat, exp, jti }` as base64url JSON followed by a base64url HMAC.

```js
const SESSION_MS = 8 * 60 * 60 * 1000;

export function createSessionToken({ now = Date.now(), randomBytes: bytes = randomBytes } = {}, secret) {
  assertSessionSecret(secret);
  const payload = { v: 1, iat: now, exp: now + SESSION_MS, jti: bytes(16).toString('base64url') };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { token: `${encoded}.${signature}`, expiresAt: new Date(payload.exp).toISOString() };
}

export function serializeSessionCookie(token) {
  return `life_hub_session=${token}; Max-Age=28800; Path=/; Secure; HttpOnly; SameSite=Strict`;
}
```

The generator reads the passphrase twice from a TTY without echo, refuses non-interactive input, prints only `LIFE_HUB_PASSPHRASE_HASH=...` and `SESSION_SECRET=...`, and zeroes temporary passphrase buffers after derivation. Add `.auth-secrets` to `.gitignore` as an additional defense.

- [ ] **Step 4: Run focused tests and the generator smoke test**

Run: `node --test tests/unit/auth-security.test.js`
Expected: all auth-security tests PASS.

Run: `node scripts/generate-auth-secrets.mjs </dev/null`
Expected: non-zero exit with `Run this command in an interactive terminal.` and no secret output.

- [ ] **Step 5: Commit the security primitives**

```bash
git add .gitignore netlify/functions/_shared/auth-security.mjs scripts/generate-auth-secrets.mjs tests/unit/auth-security.test.js
git commit -m "feat: add secure Life Hub sessions"
```

### Task 2: Authentication function contract

**Files:**
- Create: `netlify/functions/_shared/http.mjs`
- Create: `netlify/functions/auth.mjs`
- Create: `netlify/functions/session.mjs`
- Create: `netlify/functions/logout.mjs`
- Create: `tests/integration/auth-functions.test.js`

**Interfaces:**
- Consumes: Task 1 password, session, and cookie functions.
- Produces: `createAuthHandler(dependencies?)`, `createSessionHandler(dependencies?)`, and `createLogoutHandler(dependencies?)`.
- Produces: stable JSON responses shaped as `{ ok: boolean, data?: object, error?: { code, message, retryable } }`.

- [ ] **Step 1: Write failing handler tests**

```js
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'injected-verifier',
  SESSION_SECRET: 's'.repeat(32)
};
const authRequest = passphrase => new Request('https://life.example/api/auth', {
  method: 'POST',
  headers: { origin: 'https://life.example', 'content-type': 'application/json' },
  body: JSON.stringify({ passphrase })
});
const requestWithCookie = cookie => new Request('https://life.example/api/session', {
  headers: { cookie: cookie.split(';', 1)[0] }
});

test('auth rejects wrong-origin and invalid credentials without detail', async () => {
  const handler = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async value => value === 'accepted',
    now: () => 1_754_009_600_000,
    randomBytes: () => Buffer.alloc(16, 1)
  });
  const crossOrigin = await handler(new Request('https://life.example/api/auth', {
    method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'accepted' })
  }));
  assert.equal(crossOrigin.status, 403);

  const rejected = await handler(authRequest('wrong'));
  assert.equal(rejected.status, 401);
  assert.deepEqual((await rejected.json()).error, {
    code: 'invalid_credentials', message: 'That passphrase was not accepted.', retryable: true
  });
});

test('auth issues a protected cookie and session validates it', async () => {
  const auth = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async value => value === 'accepted',
    now: () => 1_754_009_600_000,
    randomBytes: () => Buffer.alloc(16, 1)
  });
  const sessionHandler = createSessionHandler({ env: validEnv, now: () => 1_754_009_600_001 });
  const response = await auth(authRequest('accepted'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  const session = await sessionHandler(requestWithCookie(response.headers.get('set-cookie')));
  assert.deepEqual((await session.json()).data.authenticated, true);
});
```

Also cover wrong methods (`405` plus `Allow`), missing JSON content type (`415`), malformed or over-1-KiB bodies (`400`/`413`), missing environment (`503 misconfigured`), invalid and expired cookies (`401` plus clearing cookie), and logout (`204` plus clearing cookie).

- [ ] **Step 2: Run the integration test and confirm missing handlers**

Run: `node --test tests/integration/auth-functions.test.js`
Expected: FAIL with missing function modules.

- [ ] **Step 3: Implement response helpers and injectable handlers**

```js
export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  return origin === null || origin === new URL(request.url).origin;
}
```

Each function exports a default production handler and a named factory for tests. Parse cookies without decoding arbitrary keys. Never interpolate caught error messages into responses.

```js
export const config = {
  path: '/api/auth',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 5, windowSize: 60 }
};
```

Session and logout export `config.path` values `/api/session` and `/api/logout`. Logout requires POST and same-origin validation.

- [ ] **Step 4: Run authentication integration and regression tests**

Run: `node --test tests/unit/auth-security.test.js tests/integration/auth-functions.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit the authenticated API boundary**

```bash
git add netlify/functions/_shared/http.mjs netlify/functions/auth.mjs netlify/functions/session.mjs netlify/functions/logout.mjs tests/integration/auth-functions.test.js
git commit -m "feat: add single-user authentication API"
```

### Task 3: GitHub repository policy and manifest discovery

**Files:**
- Create: `netlify/functions/_shared/repo-policy.mjs`
- Create: `netlify/functions/_shared/github-client.mjs`
- Create: `netlify/functions/repo-manifest.mjs`
- Create: `tests/unit/repo-policy.test.js`
- Create: `tests/integration/repo-manifest-function.test.js`

**Interfaces:**
- Consumes: Task 2 JSON response and session validation helpers.
- Produces: `parseDateRange(url, { maxDays: 366 }) -> { from, to }`.
- Produces: `selectManifestEntries(tree, range) -> Array<{ path, sha, size }>`.
- Produces: `createGitHubClient({ env, fetchImpl })` with `resolveTree()` and `readBlob(sha)`.
- Produces: authenticated `GET /api/repo/manifest` response `{ commitSha, treeSha, manifestId, from, to, files }`.

- [ ] **Step 1: Write failing repository-policy tests**

```js
test('manifest policy returns sorted config and in-range canonical events', () => {
  const blob = (path, sha, size) => ({ path, sha, size, type: 'blob' });
  const [MEAL, OLD, TARGETS, SECRET] = ['a', 'b', 'c', 'd'].map(value => value.repeat(40));
  const tree = [
    blob('data/nutrition/2026/08/2026-08-01-breakfast.md', MEAL, 120),
    blob('data/nutrition/2026/07/2026-07-01-old.md', OLD, 100),
    blob('config/targets.yml', TARGETS, 90),
    blob('private/secret.md', SECRET, 20)
  ];
  assert.deepEqual(selectManifestEntries(tree, { from: '2026-07-02', to: '2026-08-01' }), [
    { path: 'config/targets.yml', sha: TARGETS, size: 90 },
    { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: MEAL, size: 120 }
  ]);
});

test('policy rejects traversal, URLs, backslashes, bad dates, and ranges over 366 days', () => {
  for (const path of ['../data/x.md', 'https://evil/x.md', 'data\\nutrition\\x.md', 'data/nutrition/2026/02/2026-02-30-x.md']) {
    assert.equal(isAllowedRepositoryPath(path), false);
  }
  assert.throws(() => parseDateRange(new URL('https://life.test/api/repo/manifest?from=2025-01-01&to=2026-08-01')));
});
```

- [ ] **Step 2: Run policy tests and confirm missing-module failure**

Run: `node --test tests/unit/repo-policy.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement strict allowlisting and the GitHub adapter**

Use the existing date validation in `js/core/time.js`. Match event paths with named captures for domain, year, month, and filename date; require every captured date component to agree. Allow only the five approved domains, `.md` events, the two exact `.yml` config paths, `type === 'blob'`, forty-character lowercase hexadecimal SHAs, non-negative integer sizes, and a maximum individual size of 256 KiB.

```js
const API_VERSION = '2026-03-10';

async function github(path) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${config.token}`,
      'user-agent': 'life-hub',
      'x-github-api-version': API_VERSION
    }
  });
  if (!response.ok) throw mapGitHubFailure(response.status);
  return response.json();
}
```

Resolve `/repos/{owner}/{repo}/commits/{encodedBranch}`, take `sha` and `commit.tree.sha`, then request `/git/trees/{treeSha}?recursive=1`. Reject `truncated: true` with stable code `repository_tree_incomplete`. Never include the token or upstream body in thrown errors.

- [ ] **Step 4: Write failing manifest handler tests with mocked GitHub**

Cover missing session (`401` with zero GitHub calls), invalid range (`400`), happy path with sorted files and a quoted range-specific ETag, `If-None-Match` on an unchanged manifest (`304` with no body), the same commit with a wider range returning `200`, truncated tree (`503`), and upstream `401`, `403`, `404`, `429`, and `500` mapped to sanitized stable codes.

- [ ] **Step 5: Implement and verify the manifest handler**

The handler accepts GET only, validates the session before parsing any provider configuration, sets `Cache-Control: private, no-store`, returns no GitHub URLs, and calculates `manifestId` as a SHA-256 digest of `commitSha`, `from`, and `to` separated by NUL bytes. Quote `manifestId`, not `commitSha`, as the ETag. Run:

`node --test tests/unit/repo-policy.test.js tests/integration/repo-manifest-function.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit the repository manifest boundary**

```bash
git add netlify/functions/_shared/repo-policy.mjs netlify/functions/_shared/github-client.mjs netlify/functions/repo-manifest.mjs tests/unit/repo-policy.test.js tests/integration/repo-manifest-function.test.js
git commit -m "feat: expose allowlisted repository manifests"
```

### Task 4: Bounded file reads and provider health

**Files:**
- Create: `netlify/functions/repo-files.mjs`
- Create: `netlify/functions/_shared/provider-health.mjs`
- Create: `netlify/functions/health.mjs`
- Create: `tests/integration/repo-files-function.test.js`
- Create: `tests/unit/provider-health.test.js`
- Create: `tests/integration/health-function.test.js`

**Interfaces:**
- Consumes: Task 3 `createGitHubClient()` and manifest selection.
- Produces: authenticated `POST /api/repo/files` response `{ commitSha, files: [{ path, sha, content }] }`.
- Produces: `tokenExpiryState(expiry, today) -> healthy | expiring | expired | unknown`.
- Produces: authenticated `GET /api/health` sanitized provider state.

- [ ] **Step 1: Write failing file-endpoint tests**

```js
const TARGET_SHA = 'a'.repeat(40);
const WRONG_SHA = 'b'.repeat(40);

test('files endpoint returns only exact current manifest pairs', async () => {
  const request = jsonRequest('/api/repo/files', {
    from: '2026-07-02', to: '2026-08-01',
    files: [{ path: 'config/targets.yml', sha: TARGET_SHA }]
  }, validCookie);
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.files, [{
    path: 'config/targets.yml', sha: TARGET_SHA, content: 'target_sets: []\n'
  }]);
});

test('files endpoint rejects stale, excessive, and oversized requests before blob reads', async () => {
  const requestFor = files => jsonRequest('/api/repo/files', {
    from: '2026-07-02', to: '2026-08-01', files
  }, validCookie);
  const validPair = { path: 'config/targets.yml', sha: TARGET_SHA };
  assert.equal((await handler(requestFor([{ ...validPair, sha: WRONG_SHA }]))).status, 409);
  assert.equal((await handler(requestFor(Array.from({ length: 51 }, () => validPair)))).status, 413);
  assert.equal(blobReads, 0);
});
```

Also test duplicate pairs, malformed SHA, unknown path, base64 decoding, non-base64 encoding, invalid UTF-8, declared and actual aggregate size over 1 MiB, and provider failures with no leaked upstream body.

- [ ] **Step 2: Run the focused test and confirm the missing-handler failure**

Run: `node --test tests/integration/repo-files-function.test.js`
Expected: FAIL with missing `repo-files.mjs`.

- [ ] **Step 3: Implement current-tree validation and bounded blob reads**

Parse at most a 16-KiB JSON request body. Resolve the current tree once, rebuild its allowlisted map for the requested range supplied alongside the file list, and require exact path/SHA matches. Sum declared sizes before network reads. Decode GitHub blobs with `Buffer.from(content.replace(/\n/g, ''), 'base64')`, require `encoding === 'base64'`, decode with a fatal `TextDecoder`, and enforce both individual and aggregate byte limits before returning UTF-8 strings.

- [ ] **Step 4: Write and implement health-state tests**

```js
test('token state becomes expiring fourteen Sydney dates before expiry', () => {
  assert.equal(tokenExpiryState('2026-08-15', '2026-08-01'), 'expiring');
  assert.equal(tokenExpiryState('2026-08-16', '2026-08-01'), 'healthy');
  assert.equal(tokenExpiryState('2026-07-31', '2026-08-01'), 'expired');
  assert.equal(tokenExpiryState('', '2026-08-01'), 'unknown');
});
```

The health handler validates the session, resolves the branch, and returns only `{ github, token, expiresOn, code, retryable }`. Map missing environment to `misconfigured`, provider failure to `unavailable`, and never echo an exception message. Cache only successful provider checks for at most sixty seconds inside the warm function instance.

- [ ] **Step 5: Run repository and health tests**

Run: `node --test tests/integration/repo-files-function.test.js tests/unit/provider-health.test.js tests/integration/health-function.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit bounded reads and health reporting**

```bash
git add netlify/functions/repo-files.mjs netlify/functions/_shared/provider-health.mjs netlify/functions/health.mjs tests/integration/repo-files-function.test.js tests/unit/provider-health.test.js tests/integration/health-function.test.js
git commit -m "feat: add bounded GitHub reads and health"
```

### Task 5: Incremental browser repository sync

**Files:**
- Create: `js/app/repository-cache.js`
- Create: `js/app/sync-repository.js`
- Create: `js/app/load-live-events.js`
- Create: `tests/unit/repository-cache.test.js`
- Create: `tests/unit/sync-repository.test.js`
- Create: `tests/unit/load-live-events.test.js`

**Interfaces:**
- Produces: `createRepositoryCache(cacheStorage) -> { read, write, clear }`.
- Produces: `diffManifest(previous, next) -> { changed, removed, unchanged }`.
- Produces: `syncRepository({ fetchImpl, cache, from, to, signal, validateFile }) -> { files, warnings, commitSha, manifestId, changed }`.
- Produces: `loadLiveEvents({ sync, loadYaml, date }) -> { events, targetsConfig, warnings, commitSha }`.

- [ ] **Step 1: Write failing cache and manifest-diff tests**

```js
test('manifest diff downloads only new or changed blobs and drops removed paths', () => {
  const file = (path, sha) => ({ path, sha, size: 10 });
  const manifest = (manifestId, files) => ({ manifestId, commitSha: 'c'.repeat(40), files });
  const [A, B, GONE] = ['a'.repeat(40), 'b'.repeat(40), 'd'.repeat(40)];
  const previous = manifest('old', [file('a.md', A), file('gone.md', GONE)]);
  const next = manifest('new', [file('a.md', A), file('b.md', B)]);
  assert.deepEqual(diffManifest(previous, next), {
    changed: [file('b.md', B)], removed: ['gone.md'], unchanged: [file('a.md', A)]
  });
});

test('private cache never stores cookies or request headers', async () => {
  await cache.write({ manifest: manifest('sha', []), files: [] });
  assert.equal(JSON.stringify(await cache.read()).includes('life_hub_session'), false);
});
```

Cache one JSON response under `/__life-hub-private-cache__/repository` in a cache named `life-hub-private-v1`. The record contains the last remote manifest and raw valid file records only. `clear()` deletes that named cache.

- [ ] **Step 2: Run cache tests and confirm missing-module failures**

Run: `node --test tests/unit/repository-cache.test.js tests/unit/sync-repository.test.js`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement atomic incremental sync**

```js
export async function syncRepository({ fetchImpl, cache, from, to, signal, validateFile }) {
  const previous = await cache.read();
  const manifestResponse = await fetchImpl(`/api/repo/manifest?from=${from}&to=${to}`, {
    headers: previous?.manifest?.manifestId ? { 'if-none-match': `"${previous.manifest.manifestId}"` } : {},
    signal
  });
  if (manifestResponse.status === 304 && previous) return { ...previous, changed: false, warnings: [] };
  if (manifestResponse.status === 401) throw new SyncError('session_expired');
  if (!manifestResponse.ok) return staleOrThrow(previous, 'github_unavailable');
  const manifest = (await manifestResponse.json()).data;
  const diff = diffManifest(previous?.manifest, manifest);
  // Fetch diff.changed in <=50-file, <=1-MiB batches, validate every response pair
  // and validateFile result, merge with unchanged or prior-valid cached records,
  // remove diff.removed, then write one replacement cache record.
}
```

Use one in-flight promise per date range so refresh callers share work. Abort superseded ranges. `validateFile({ path, sha, content })` returns `{ valid: true }` or `{ valid: false, code }`. Treat an invalid changed document as a warning and retain the prior valid path content with the new remote SHA marker so the same bad SHA is not repeatedly downloaded.

- [ ] **Step 4: Implement live event loading through existing parsers**

`loadLiveEvents` requests the current Sydney date plus thirty prior days, finds `config/targets.yml`, parses all Markdown records with `parseEventDocument`, and returns warnings rather than raw errors. If completed workouts fill the oldest loaded date without a gap, extend the range backwards by ninety days and sync again until a gap or no older event is returned. Cap extension at the repository's oldest discovered event and reject more than 366 days per individual request.

- [ ] **Step 5: Run sync, parser, and existing Home tests**

Run: `node --test tests/unit/repository-cache.test.js tests/unit/sync-repository.test.js tests/unit/load-live-events.test.js tests/unit/home-model.test.js tests/unit/load-events.test.js`
Expected: all tests PASS, including unchanged manifest with zero file calls, one changed file with one requested pair, stale fallback, invalid changed-file fallback, and exact Home values.

- [ ] **Step 6: Commit incremental browser sync**

```bash
git add js/app/repository-cache.js js/app/sync-repository.js js/app/load-live-events.js tests/unit/repository-cache.test.js tests/unit/sync-repository.test.js tests/unit/load-live-events.test.js
git commit -m "feat: sync changed Life Hub records"
```

### Task 6: Authenticated Clinical Glass application states

**Files:**
- Create: `js/app/api-session.js`
- Create: `js/app/app-controller.js`
- Modify: `index.html`
- Modify: `css/app.css`
- Modify: `js/app/main.js`
- Modify: `js/app/render-home.js`
- Test: `tests/unit/web-assets.test.js`
- Create: `tests/unit/app-controller.test.js`

**Interfaces:**
- Consumes: Task 5 `loadLiveEvents`, repository cache, and existing `buildHomeModel`/renderers.
- Produces: `createSessionApi(fetchImpl)` with `getSession`, `signIn`, and `signOut`.
- Produces: `createAppController(dependencies)` with `start`, `refresh`, `signIn`, `signOut`, and `destroy`.

- [ ] **Step 1: Write failing controller state tests**

```js
test('signed-out startup reveals only the sign-in view', async () => {
  const controller = createAppController(harness({ session: { authenticated: false } }));
  await controller.start();
  assert.equal(root.querySelector('#sign-in-view').hidden, false);
  assert.equal(root.querySelector('#app-shell').hidden, true);
});

test('successful sign-in loads live Home and never persists passphrase', async () => {
  const controller = createAppController(harness({ acceptedPassphrase: 'secret' }));
  await controller.signIn('secret');
  assert.equal(root.querySelector('#app-shell').hidden, false);
  assert.equal(localStorage.getItem('passphrase'), null);
  assert.match(sessionStorage.getItem('life-hub:session-expiry'), /^2026-/);
});

test('refreshes collapse and stop when the document is hidden', async () => {
  const controller = createAppController(harness());
  const first = controller.refresh();
  const second = controller.refresh();
  assert.equal(first, second);
  await first;
  visibility.set('hidden');
  clock.tick(120_000);
  assert.equal(syncCalls, 1);
});
```

Also cover invalid credentials and focus, expired-session transition, stale GitHub warning with cached Home retained, health expiry notice, manual refresh status, explicit logout clearing private cache, and `destroy()` clearing timers/listeners.

- [ ] **Step 2: Run controller tests and confirm missing-module failure**

Run: `node --test tests/unit/app-controller.test.js tests/unit/web-assets.test.js`
Expected: FAIL for missing controller and sign-in landmarks.

- [ ] **Step 3: Add semantic sign-in and authenticated controls**

Add `#sign-in-view` with heading, explanatory copy, labelled password input, submit button, and `role="alert"` error region. Wrap the existing UI in hidden `#app-shell`. Add `#refresh-button`, `#last-synced`, `#provider-status`, and `#sign-out-button`. Preserve all existing Home region IDs and semantic `[hidden]` behavior.

Extend Clinical Glass CSS with centered sign-in layout, visible focus, disabled/loading controls, status severity variants, minimum 44-pixel targets, and the existing 390-pixel no-overflow contract.

- [ ] **Step 4: Implement session API and controller**

```js
export function createSessionApi(fetchImpl = fetch) {
  return {
    getSession: () => requestJson(fetchImpl, '/api/session'),
    signIn: passphrase => requestJson(fetchImpl, '/api/auth', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase })
    }),
    signOut: () => requestJson(fetchImpl, '/api/logout', { method: 'POST' })
  };
}
```

`main.js` becomes composition only: create session API, cache, live loader, and controller; bind once; start once; register the service worker. The controller derives today's Sydney key with existing time helpers, renders Home, checks health, records last success, schedules a two-minute visible-page refresh, and uses generic user-facing failures. After online session validation it stores only the returned expiry in `sessionStorage` under `life-hub:session-expiry`. If session validation fails solely because the browser is offline, the controller may render the private cache read-only only in that same tab and before the stored expiry. Explicit logout clears both the private cache and marker; a new tab has no marker and remains at sign-in.

- [ ] **Step 5: Run controller and static UI tests**

Run: `node --test tests/unit/app-controller.test.js tests/unit/web-assets.test.js tests/unit/home-model.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit authenticated UI states**

```bash
git add index.html css/app.css js/app/api-session.js js/app/app-controller.js js/app/main.js js/app/render-home.js tests/unit/app-controller.test.js tests/unit/web-assets.test.js
git commit -m "feat: gate Life Hub behind sign-in"
```

### Task 7: Local mock API and private offline behavior

**Files:**
- Create: `scripts/mock-api.mjs`
- Modify: `scripts/serve.mjs`
- Modify: `service-worker.js`
- Modify: `tests/integration/static-server.test.js`
- Modify: `tests/browser/home.spec.mjs`

**Interfaces:**
- Consumes: production `/api/*` response shapes from Tasks 2–4.
- Produces: fixture-backed local endpoints with passphrase `life-hub-local` and an HttpOnly mock session cookie.

- [ ] **Step 1: Write failing local API integration tests**

```js
test('local server requires a mock session before repository reads', async () => {
  const response = await fetch(`${baseUrl}/api/repo/manifest?from=2026-07-01&to=2026-08-01`);
  assert.equal(response.status, 401);
});

test('local sign-in exposes the fixture repository contract', async () => {
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
  const manifest = await fetch(`${baseUrl}/api/repo/manifest?from=2026-07-01&to=2026-08-01`, { headers: { cookie } });
  assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).data.files.length, 6);
});
```

- [ ] **Step 2: Run the integration test and confirm unauthenticated behavior is missing**

Run: `node --test tests/integration/static-server.test.js`
Expected: FAIL because the current server serves no `/api/*` contract.

- [ ] **Step 3: Implement fixture-backed API routing**

Keep mock routing isolated in `scripts/mock-api.mjs`. Accept only localhost traffic, use `life_hub_mock=1; HttpOnly; SameSite=Strict; Path=/`, return the same JSON shapes as production, derive deterministic fixture SHAs with SHA-256, and never inspect production environment variables. Production source files must not import the mock adapter.

- [ ] **Step 4: Keep private API responses out of service-worker caches**

Change the service worker fetch handler so every pathname beginning `/api/` uses `fetch(event.request)` with no `cache.put`, auth/session/logout are never served offline, and only shell assets use the public shell cache. The application's named private repository cache remains inaccessible until session validation succeeds; explicit logout clears it.

- [ ] **Step 5: Update browser acceptance around sign-in and refresh**

Add a helper that signs in with `life-hub-local`. Preserve desktop, mobile, and offline Home assertions, and add rejected passphrase, successful sign-in, manual unchanged refresh, sign-out, and session-expiry coverage. Offline reload succeeds only in the already-authenticated tab before expiry; a fresh offline tab remains at sign-in. Assert the password input is empty after submission and no API response body contains `life-hub-local`.

- [ ] **Step 6: Run integration and browser tests**

Run: `node --test tests/integration/static-server.test.js`
Expected: all server tests PASS.

Run: `node --test tests/browser/home.spec.mjs`
Expected: all desktop, 390-pixel, auth, refresh, logout, expiry, and offline tests PASS.

- [ ] **Step 7: Commit the local authenticated runtime**

```bash
git add scripts/mock-api.mjs scripts/serve.mjs service-worker.js tests/integration/static-server.test.js tests/browser/home.spec.mjs
git commit -m "test: exercise authenticated Life Hub runtime"
```

### Task 8: Environment documentation and complete Phase 3 gate

**Files:**
- Create: `.env.example`
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `tests/unit/dependency-security.test.js`
- Modify: `tests/unit/web-assets.test.js`

**Interfaces:**
- Consumes: all Phase 3 production and local interfaces.
- Produces: documented symbolic deployment contract and final verified status.

- [ ] **Step 1: Add failing environment and secret-safety tests**

```js
test('environment example contains names but no usable credentials', async () => {
  const example = await readFile('.env.example', 'utf8');
  for (const name of ['LIFE_HUB_PASSPHRASE_HASH', 'SESSION_SECRET', 'GITHUB_REPOSITORY', 'GITHUB_BRANCH', 'GITHUB_TOKEN', 'GITHUB_TOKEN_EXPIRES']) {
    assert.match(example, new RegExp(`^${name}=`, 'm'));
  }
  assert.doesNotMatch(example, /github_pat_|ghp_|gho_|Bearer\s+[A-Za-z0-9]/);
});

test('browser assets contain no server environment names that reveal values', async () => {
  const assets = await browserAssetText();
  assert.doesNotMatch(assets, /github_pat_|ghp_|gho_|LIFE_HUB_PASSPHRASE_HASH=.*[^=\n]/);
});
```

- [ ] **Step 2: Run security tests and confirm the missing environment example**

Run: `node --test tests/unit/dependency-security.test.js tests/unit/web-assets.test.js`
Expected: FAIL because `.env.example` does not exist.

- [ ] **Step 3: Document safe local and Netlify setup**

Use placeholders such as `replace-in-netlify` and `YYYY-MM-DD`; never include a working token or secret. README sections explain `npm run generate:auth`, local passphrase `life-hub-local`, the fine-grained read-only GitHub token requirement, Netlify environment names, deploy-log verification of the auth rate limit, and the deliberate absence of production credentials from the PR.

Update `package.json` with `"generate:auth": "node scripts/generate-auth-secrets.mjs"`. Update `docs/IMPLEMENTATION_STATUS.md` with Phase 3 results and next phase `Agent chat and write loop` only after the exact final counts are known.

- [ ] **Step 4: Run the complete verification matrix**

Run in this order:

```bash
npm ci --ignore-scripts
npm test
npm run test:browser
npm run validate:fixtures
npm audit --audit-level=high
git diff --check origin/main...HEAD
git status --short
```

Expected: clean install; all unit/integration/browser tests pass; four fixture files valid and zero invalid; zero high-or-critical vulnerabilities; no whitespace errors; only intended tracked changes.

Search tracked source, generated web assets, test output, and git history diff for `github_pat_`, `ghp_`, `gho_`, raw `Authorization: Bearer` values, non-placeholder secrets, and the local test passphrase outside the isolated mock server/tests/docs. Expected: no production secret material.

- [ ] **Step 5: Perform desktop and 390-pixel visual acceptance**

Start the local server, sign in, and inspect Home at 1440×1000 and 390×844. Confirm no horizontal overflow, sign-in focus and errors are visible, Home values remain correct, refresh and sign-out controls are reachable, provider warnings do not obscure content, an authenticated tab can reload cached data offline before expiry, and a fresh offline tab never bypasses sign-in.

- [ ] **Step 6: Record exact results and commit Phase 3**

```bash
git add .env.example README.md package.json docs/IMPLEMENTATION_STATUS.md tests/unit/dependency-security.test.js tests/unit/web-assets.test.js
git commit -m "docs: complete authenticated GitHub sync phase"
```

- [ ] **Step 7: Publish for review**

Push `agent/authenticated-github-sync` and open a draft pull request against `main` titled `feat: add authenticated GitHub sync`. The description lists the single-user security boundary, incremental manifest/blob behavior, mocked-provider guarantee, exact verification counts, secret audit, and the next phase. Keep production credentials disconnected and preserve the branch for review feedback.
