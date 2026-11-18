# Travel Postcards, Part 1: Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Travel API everything a check-in postcard needs: store and serve a voice clip, write out its words, save and remove a postcard on a check-in, return street-level address parts, and show postcards on the public link.

**Architecture:** A postcard is one optional field on an existing check-in in the trip document. Voice clips live in the Travel blob store beside check-in photos and are served to a live trip link with byte ranges. Three small functions are added (`travel-audio`, `travel-transcribe`, `travel-postcard`), two shared helpers are extracted (`byte-range`, `travel-share-token`), and `travel-places` and `travel-redact` each gain one pure function.

**Tech Stack:** Netlify Functions (ES modules, `.mjs`), Netlify Blobs, `node:test` with `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-travel-postcard-design.md`. This is part 1 of 3. Part 2 is the card and the public link; part 3 is the composer. Nothing in this part changes what anyone sees.

---

## Before you start

- Work from the repo root, on branch `claude/digital-postcard-feature-eqcrma`.
- Run one test file with: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`. A passing run ends with `# fail 0`.
- This repository is public. Tests and fixtures use invented people and places only. Never paste real trip content.
- Commit after every task. Commit messages start `Travel postcards: `. End every commit message with the attribution trailer lines your session gives you.
- Do not open a pull request in this part. The PR opens at the end of part 3.

## Files

| File | Change | Job |
|---|---|---|
| `netlify/functions/_shared/byte-range.mjs` | create | `parseByteRange`, moved out of the teaching media route |
| `netlify/functions/media-file.mjs` | modify | re-export `parseByteRange` from the shared file |
| `netlify/functions/_shared/travel-share-token.mjs` | create | `liveTripForShareToken`: a trip link's token to its live trip |
| `netlify/functions/travel-photo.mjs` | modify | use the shared token helper |
| `netlify/functions/travel-public.mjs` | modify | use the shared token helper |
| `netlify/functions/_shared/travel-blobs.mjs` | modify | clip ids and blob keys |
| `netlify/functions/travel-audio.mjs` | create | upload, serve and delete a voice clip |
| `netlify/functions/travel-transcribe.mjs` | create | write out a clip's words |
| `netlify.toml` | modify | 26 second limit for `travel-transcribe` |
| `netlify/functions/travel-places.mjs` | modify | `placeAddressFromReverse` and the `address` field |
| `netlify/functions/_shared/travel-postcard.mjs` | create | postcard limits and the "which check-in carries it" rules |
| `netlify/functions/travel-postcard.mjs` | create | save and remove a postcard |
| `netlify/functions/_shared/travel-redact.mjs` | modify | postcards on the public link; the last check-in stops naming a private stop |
| `tests/unit/byte-range.test.js`, `travel-share-token.test.js`, `travel-audio.test.js`, `travel-transcribe.test.js`, `travel-postcard-rules.test.js`, `travel-postcard.test.js` | create | tests |
| `tests/unit/travel-places-reverse.test.js`, `tests/unit/travel-redact.test.js` | modify | tests |

---

### Task 1: Shared byte-range helper

`parseByteRange` lives inside the teaching media route. The clip route needs it without pulling that route in.

**Files:**
- Create: `netlify/functions/_shared/byte-range.mjs`
- Modify: `netlify/functions/media-file.mjs` (the `parseByteRange` function near line 29)
- Test: `tests/unit/byte-range.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/byte-range.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from '../../netlify/functions/_shared/byte-range.mjs';
import { parseByteRange as viaMediaFile } from '../../netlify/functions/media-file.mjs';

test('byte ranges: start-end, open end and suffix', () => {
  assert.deepEqual(parseByteRange('bytes=0-1', 10), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=4-', 10), { start: 4, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=2-99', 10), { start: 2, end: 9 });
});

test('byte ranges: none, unsupported and past the end', () => {
  assert.equal(parseByteRange(null, 10), null);
  assert.equal(parseByteRange('bytes=0-1,4-5', 10), null);
  assert.equal(parseByteRange('bytes=10-', 10), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=-0', 10), 'unsatisfiable');
});

test('the teaching media route still exports the same helper', () => {
  assert.equal(viaMediaFile, parseByteRange);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/byte-range.test.js`
Expected: FAIL, `Cannot find module ... _shared/byte-range.mjs`.

- [ ] **Step 3: Create the shared helper**

Create `netlify/functions/_shared/byte-range.mjs`:

```js
/**
 * Parse a single `bytes=` range against a file of `size` bytes.
 * Returns null for no/unsupported range, 'unsatisfiable' when it misses the file.
 */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}
```

- [ ] **Step 4: Point the teaching media route at it**

In `netlify/functions/media-file.mjs`, delete this whole block (the doc comment and the function):

```js
/**
 * Parse a single `bytes=` range against a file of `size` bytes.
 * Returns null for no/unsupported range, 'unsatisfiable' when it misses the file.
 */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}
```

and put these two lines directly above `export const config = { path: '/api/media/:id/file' };`:

```js
import { parseByteRange } from './_shared/byte-range.mjs';

export { parseByteRange };
```

- [ ] **Step 5: Run the tests**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/byte-range.test.js tests/unit/teaching-student.test.js tests/unit/meeting-sheet.test.js`
Expected: `# fail 0`. The two teaching files import `media-file.mjs` and prove it still loads.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/byte-range.mjs netlify/functions/media-file.mjs tests/unit/byte-range.test.js
git commit -m "Travel postcards: byte-range parsing moves to a shared helper"
```

---

### Task 2: Shared share-token helper

The photo route and the public route each turn a link token into a live trip with the same ten lines. The clip route needs the same answer.

**Files:**
- Create: `netlify/functions/_shared/travel-share-token.mjs`
- Modify: `netlify/functions/travel-photo.mjs`, `netlify/functions/travel-public.mjs`
- Test: `tests/unit/travel-share-token.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/travel-share-token.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { liveTripForShareToken } from '../../netlify/functions/_shared/travel-share-token.mjs';

const hash = (token) => createHash('sha256').update(token).digest('hex');

function repo(map, trips) {
  return {
    async getShareTokens() {
      return { map, version: 'v' };
    },
    async getTrip(id) {
      if (trips[id]) return { trip: trips[id], version: 'v1' };
      throw Object.assign(new Error('Trip not found.'), { status: 404, code: 'not_found' });
    }
  };
}

const trips = {
  trp_live1: { id: 'trp_live1', title: 'Invented trip' },
  trp_gone1: { id: 'trp_gone1', title: 'Old trip', lifecycle: 'deleted' }
};

test('a trip link, typed or from before links had a kind, opens its live trip', async () => {
  const map = { [hash('old')]: { trip_id: 'trp_live1' }, [hash('typed')]: { trip_id: 'trp_live1', kind: 'trip' } };
  assert.deepEqual(await liveTripForShareToken(repo(map, trips), 'old'), { tripId: 'trp_live1', trip: trips.trp_live1 });
  assert.equal((await liveTripForShareToken(repo(map, trips), 'typed')).tripId, 'trp_live1');
});

test('a journal link, a deleted trip, a missing trip and an unknown token open nothing', async () => {
  const map = {
    [hash('journal')]: { trip_id: 'trp_live1', kind: 'journal' },
    [hash('deleted')]: { trip_id: 'trp_gone1' },
    [hash('dangling')]: { trip_id: 'trp_never1' }
  };
  const r = repo(map, trips);
  assert.equal(await liveTripForShareToken(r, 'journal'), null);
  assert.equal(await liveTripForShareToken(r, 'deleted'), null);
  assert.equal(await liveTripForShareToken(r, 'dangling'), null);
  assert.equal(await liveTripForShareToken(r, 'unknown'), null);
  assert.equal(await liveTripForShareToken(r, ''), null);
  assert.equal(await liveTripForShareToken(r, null), null);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-share-token.test.js`
Expected: FAIL, `Cannot find module ... travel-share-token.mjs`.

- [ ] **Step 3: Create the helper**

Create `netlify/functions/_shared/travel-share-token.mjs`:

```js
import { createHash } from 'node:crypto';
import { isDeletedRecord } from './record-liveness.mjs';

/**
 * The live trip a trip share link opens, or null.
 * Journal links have their own scoped routes and never open trip media.
 * Rows made before links had a `kind` are trip links.
 */
export async function liveTripForShareToken(repo, token) {
  if (typeof token !== 'string' || !token) return null;
  const { map } = await repo.getShareTokens();
  const row = map?.[createHash('sha256').update(token).digest('hex')];
  if (!row?.trip_id || (row.kind && row.kind !== 'trip')) return null;
  let trip = null;
  try {
    ({ trip } = await repo.getTrip(row.trip_id));
  } catch {
    trip = null;
  }
  if (!trip || isDeletedRecord(trip)) return null;
  return { tripId: row.trip_id, trip };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-share-token.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Use it in the photo route**

In `netlify/functions/travel-photo.mjs`:

Remove these two import lines:

```js
import { createHash } from 'node:crypto';
```

```js
import { isDeletedRecord } from './_shared/record-liveness.mjs';
```

Add this import after the `createTravelRepository` import:

```js
import { liveTripForShareToken } from './_shared/travel-share-token.mjs';
```

Replace the whole `if (token) { ... }` block inside `handleGet` with:

```js
    if (token) {
      // Only a trip link opens trip photos (journal links have their own scoped media
      // route), and only while the trip is live.
      const shared = await liveTripForShareToken(repo, token);
      if (!shared) {
        return httpError(404, 'not_found', 'This link has been turned off.', false, { 'cache-control': 'no-store' });
      }
      const response = await loadPhotoResponse(store, photoId, shared.tripId);
      return response || httpError(404, 'not_found', 'Photo not found.', false, { 'cache-control': 'no-store' });
    }
```

- [ ] **Step 6: Use it in the public route**

In `netlify/functions/travel-public.mjs`:

Remove these two import lines:

```js
import { createHash } from 'node:crypto';
```

```js
import { isDeletedRecord } from './_shared/record-liveness.mjs';
```

Add this import after the `redactTrip` import:

```js
import { liveTripForShareToken } from './_shared/travel-share-token.mjs';
```

Replace everything in `handle` from `const { map } = await repo.getShareTokens();` to the end of the `try { ... } catch { ... }` block with:

```js
    // Journal tokens open the journal page only; the whole trip needs a trip link.
    const shared = await liveTripForShareToken(repo, token);
    if (!shared) {
      return errorResponse(404, 'not_found', 'This link has been turned off.', false, NO_STORE);
    }
    try {
      return okResponse(200, { trip: redactTrip(shared.trip) }, NO_STORE);
    } catch {
      return errorResponse(404, 'not_found', 'This link has been turned off.', false, NO_STORE);
    }
```

- [ ] **Step 7: Run the routes' own tests**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-share-token.test.js tests/unit/travel-photo.test.js tests/unit/travel-public-token.test.js`
Expected: `# fail 0`.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/travel-share-token.mjs netlify/functions/travel-photo.mjs netlify/functions/travel-public.mjs tests/unit/travel-share-token.test.js
git commit -m "Travel postcards: one helper turns a trip link into its live trip"
```

---

### Task 3: Voice clip route

**Files:**
- Modify: `netlify/functions/_shared/travel-blobs.mjs`
- Create: `netlify/functions/travel-audio.mjs`
- Test: `tests/unit/travel-audio.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/travel-audio.test.js`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createTravelAudioHandler,
  MAX_AUDIO_BYTES,
  baseAudioMime
} from '../../netlify/functions/travel-audio.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const ORIGIN = 'https://life-hub.adam-russell.com';
const hash = (token) => createHash('sha256').update(token).digest('hex');

function blobStore(entries = {}) {
  const blobs = new Map(Object.entries(entries));
  return {
    blobs,
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async getWithMetadata(key) {
      return blobs.has(key) ? { data: blobs.get(key), metadata: {} } : null;
    },
    async set(key, value) {
      blobs.set(key, value);
    },
    async delete(key) {
      blobs.delete(key);
    }
  };
}

function seeded() {
  return blobStore({
    'audio/tau_a1.json': JSON.stringify({ id: 'tau_a1', trip_id: 'trp_live1', mime_type: 'audio/mp4' }),
    'audio/tau_a1.bin': new Uint8Array([1, 2, 3, 4]).buffer,
    'audio/tau_o1.json': JSON.stringify({ id: 'tau_o1', trip_id: 'trp_other1', mime_type: 'audio/mp4' }),
    'audio/tau_o1.bin': new Uint8Array([9]).buffer
  });
}

const LIVE_TRIPS = { trp_live1: { id: 'trp_live1', title: 'Invented trip', checkins: [] } };

function handler({ store = seeded(), shares = {}, sessionValid = true, trips = LIVE_TRIPS } = {}) {
  return createTravelAudioHandler({
    env,
    getTravelStore: async () => store,
    createTravelRepository: () => ({
      async getShareTokens() {
        return { map: shares, version: 'v' };
      },
      async getTrip(id) {
        if (trips[id]) return { trip: structuredClone(trips[id]), version: 'v1' };
        throw Object.assign(new Error('Trip not found.'), { status: 404, code: 'not_found' });
      }
    }),
    verifySessionToken: async () =>
      sessionValid ? { valid: true, payload: {} } : { valid: false, reason: 'malformed' }
  });
}

const get = (query, headers = {}) =>
  new Request(`https://api.example/api/travel-audio?${query}`, { headers: { origin: ORIGIN, ...headers } });

function upload(query, file) {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request(`https://api.example/api/travel-audio?${query}`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie: 'life_hub_session=x' },
    body: form
  });
}

const clip = (bytes, type, name = 'clip.m4a') => new File([new Uint8Array(bytes)], name, { type });

test('baseAudioMime drops the codec suffix', () => {
  assert.equal(baseAudioMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseAudioMime(' Audio/MP4 '), 'audio/mp4');
  assert.equal(baseAudioMime(undefined), '');
});

test('uploading a clip stores it against the trip and returns its id', async () => {
  const store = seeded();
  const response = await handler({ store })(
    upload('trip=trp_live1', clip([5, 6, 7], 'audio/webm;codecs=opus', 'clip.webm'))
  );
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.match(data.audio_id, /^tau_[a-z0-9]{12}$/);
  const meta = JSON.parse(store.blobs.get(`audio/${data.audio_id}.json`));
  assert.equal(meta.trip_id, 'trp_live1');
  assert.equal(meta.mime_type, 'audio/webm', 'the codec suffix is dropped');
  assert.equal(meta.size, 3);
  assert.equal(store.blobs.get(`audio/${data.audio_id}.bin`).byteLength, 3);
});

test('upload refuses a wrong type, an empty clip, an oversize clip, no file and no trip', async () => {
  const h = handler();
  assert.equal((await h(upload('trip=trp_live1', clip([1], 'video/mp4')))).status, 400);
  assert.equal((await h(upload('trip=trp_live1', clip([], 'audio/mp4')))).status, 400);
  const big = new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], 'big.m4a', { type: 'audio/mp4' });
  assert.equal((await h(upload('trip=trp_live1', big))).status, 400);
  assert.equal((await h(upload('trip=trp_live1'))).status, 400);
  assert.equal((await h(upload('', clip([1], 'audio/mp4')))).status, 400);
  assert.equal((await h(upload('trip=trp_missing1', clip([1], 'audio/mp4')))).status, 404);
});

test('only the signed-in owner uploads', async () => {
  const response = await handler({ sessionValid: false })(upload('trip=trp_live1', clip([1], 'audio/mp4')));
  assert.equal(response.status, 401);
});

test('a trip link plays that live trip\'s clips; a journal link, another trip\'s clip and an unknown token do not', async () => {
  const shares = {
    [hash('trip-token')]: { trip_id: 'trp_live1' },
    [hash('journal-token')]: { trip_id: 'trp_live1', kind: 'journal' }
  };
  const read = handler({ shares, sessionValid: false });
  const ok = await read(get('id=tau_a1&token=trip-token'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'audio/mp4');
  assert.equal(ok.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(ok.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [1, 2, 3, 4]);

  assert.equal((await read(get('id=tau_a1&token=journal-token'))).status, 404);
  assert.equal((await read(get('id=tau_o1&token=trip-token'))).status, 404);
  assert.equal((await read(get('id=tau_a1&token=unknown'))).status, 404);
  assert.equal((await read(get('id=not-an-id&token=trip-token'))).status, 404);
  assert.equal((await read(get('id=tau_a1'))).status, 401, 'no token and no session');
});

test('byte ranges are served so an iPhone can play the clip', async () => {
  const read = handler();
  const part = await read(get('id=tau_a1', { cookie: 'life_hub_session=x', range: 'bytes=0-1' }));
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 0-1/4');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [1, 2]);

  const tail = await read(get('id=tau_a1', { cookie: 'life_hub_session=x', range: 'bytes=2-' }));
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get('content-range'), 'bytes 2-3/4');

  const past = await read(get('id=tau_a1', { cookie: 'life_hub_session=x', range: 'bytes=9-' }));
  assert.equal(past.status, 416);
  assert.equal(past.headers.get('content-range'), 'bytes */4');
});

test('a clip must name its origin: a bare same-site media load is refused, a credentialed CORS load is served', async () => {
  const read = handler();
  const bare = await read(
    new Request('https://api.example/api/travel-audio?id=tau_a1', {
      headers: { cookie: 'life_hub_session=x', 'sec-fetch-site': 'same-site', 'sec-fetch-dest': 'audio' }
    })
  );
  assert.equal(bare.status, 403);

  const cors = await read(
    get('id=tau_a1', {
      cookie: 'life_hub_session=x',
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'audio'
    })
  );
  assert.equal(cors.status, 200);
  assert.equal(cors.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
});

test('the owner can delete a draft clip, but not one a postcard uses', async () => {
  const store = seeded();
  store.blobs.set('audio/tau_used1.json', JSON.stringify({ id: 'tau_used1', trip_id: 'trp_live1', mime_type: 'audio/mp4' }));
  store.blobs.set('audio/tau_used1.bin', new Uint8Array([1]).buffer);
  const trips = {
    trp_live1: {
      id: 'trp_live1',
      title: 'Invented trip',
      checkins: [
        {
          id: 'chk_1',
          at: '2027-03-04T10:00:00.000Z',
          city_id: 'lis',
          label: 'Safe',
          item_id: 'itm_1',
          postcard: { photo_id: 'tph_p1', audio_id: 'tau_used1' }
        }
      ]
    }
  };
  const h = handler({ store, trips });
  const del = (id) =>
    h(
      new Request(`https://api.example/api/travel-audio?id=${id}`, {
        method: 'DELETE',
        headers: { origin: ORIGIN, cookie: 'life_hub_session=x' }
      })
    );

  assert.equal((await del('tau_a1')).status, 200);
  assert.equal(store.blobs.has('audio/tau_a1.bin'), false);
  assert.equal(store.blobs.has('audio/tau_a1.json'), false);

  assert.equal((await del('tau_used1')).status, 409);
  assert.equal(store.blobs.has('audio/tau_used1.bin'), true);

  assert.equal((await del('tau_gone9')).status, 200, 'deleting twice is fine');
  assert.equal((await del('nope')).status, 404);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-audio.test.js`
Expected: FAIL, `Cannot find module ... travel-audio.mjs`.

- [ ] **Step 3: Add clip ids and keys to the blob helpers**

Replace the whole of `netlify/functions/_shared/travel-blobs.mjs` with:

```js
/** Netlify Blobs store for Travel check-in media: place photos and postcard voice clips. */

export const TRAVEL_CONTENT_STORE = 'life-hub-travel';
export const PHOTO_ID_RE = /^tph_[a-z0-9]+$/i;
export const AUDIO_ID_RE = /^tau_[a-z0-9]+$/i;

export function photoMetaKey(id) {
  return `photos/${id}.json`;
}

export function photoBytesKey(id) {
  return `photos/${id}.bin`;
}

export function isPhotoId(id) {
  return typeof id === 'string' && PHOTO_ID_RE.test(id);
}

export function audioMetaKey(id) {
  return `audio/${id}.json`;
}

export function audioBytesKey(id) {
  return `audio/${id}.bin`;
}

export function isAudioId(id) {
  return typeof id === 'string' && AUDIO_ID_RE.test(id);
}

export async function defaultGetTravelStore(env = process.env) {
  const { getStore } = await import('@netlify/blobs');
  void env;
  return getStore(TRAVEL_CONTENT_STORE);
}

function randomSuffix() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function newPhotoId() {
  return `tph_${randomSuffix()}`;
}

export function newAudioId() {
  return `tau_${randomSuffix()}`;
}
```

- [ ] **Step 4: Write the route**

Create `netlify/functions/travel-audio.mjs`:

```js
import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE,
  withPrivate
} from './_shared/travel-http.mjs';
import {
  audioBytesKey,
  audioMetaKey,
  defaultGetTravelStore,
  isAudioId,
  newAudioId
} from './_shared/travel-blobs.mjs';
import { createTravelRepository } from './_shared/travel-repository.mjs';
import { liveTripForShareToken } from './_shared/travel-share-token.mjs';
import { parseByteRange } from './_shared/byte-range.mjs';
import {
  guardRequestOrigin,
  isConfigured,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';

export const config = { path: '/api/travel-audio' };

/** A 30 second clip is a few hundred KB; 2 MB leaves room for any phone's encoder. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AUDIO_MIME = new Set(['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

const NO_STORE = { 'cache-control': 'no-store' };
// Per-viewer, like photos: the owner path is session-gated and the follower path
// depends on a share token that can be turned off, so no shared (CDN) caching.
const AUDIO_CACHE = 'private, max-age=86400';

/** "audio/webm;codecs=opus" is "audio/webm". */
export function baseAudioMime(type) {
  return String(type ?? '').split(';')[0].trim().toLowerCase();
}

async function readAudioMeta(store, audioId) {
  try {
    const raw = await store.get(audioMetaKey(audioId), { type: 'text' });
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadAudio(store, audioId, expectedTripId) {
  const meta = await readAudioMeta(store, audioId);
  if (!meta || (expectedTripId && meta.trip_id !== expectedTripId)) return null;
  const result = await store.getWithMetadata(audioBytesKey(audioId), { type: 'arrayBuffer' });
  if (!result?.data) return null;
  return { bytes: result.data, contentType: meta.mime_type || 'audio/mp4' };
}

/** The whole clip, or the part a Range header asks for. iOS will not play audio without ranges. */
export function audioResponse(bytes, contentType, rangeHeader) {
  const size = bytes.byteLength;
  const headers = {
    'content-type': contentType,
    'cache-control': AUDIO_CACHE,
    vary: 'cookie',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff'
  };
  const range = parseByteRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
  }
  if (range) {
    return new Response(bytes.slice(range.start, range.end + 1), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}` }
    });
  }
  return new Response(bytes, { status: 200, headers });
}

/** Owner only. POST multipart `file` + query `trip` returns `{ audio_id }`. DELETE `?id=` removes a clip no postcard uses. */
export function createTravelAudioWriteHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const bad = (message) => errorResponse(400, 'validation_error', message, false, PRIVATE_CACHE);

  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);

    if (request.method === 'DELETE') {
      const audioId = url.searchParams.get('id');
      if (!isAudioId(audioId)) {
        return errorResponse(404, 'not_found', 'Clip not found.', false, PRIVATE_CACHE);
      }
      const store = await getStore(ctx.env);
      const meta = await readAudioMeta(store, audioId);
      if (meta?.trip_id) {
        let trip = null;
        try {
          ({ trip } = await ctx.repo.getTrip(meta.trip_id));
        } catch {
          trip = null;
        }
        if ((trip?.checkins || []).some((c) => c?.postcard?.audio_id === audioId)) {
          return errorResponse(
            409,
            'in_use',
            'This clip is on a postcard. Remove the postcard instead.',
            false,
            PRIVATE_CACHE
          );
        }
      }
      await store.delete(audioBytesKey(audioId));
      await store.delete(audioMetaKey(audioId));
      return okResponse(200, { id: audioId, deleted: true }, PRIVATE_CACHE);
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST to upload.', false, PRIVATE_CACHE);
    }
    const tripId = url.searchParams.get('trip');
    if (!tripId) return bad('trip is required.');
    await ctx.repo.getTrip(tripId);

    let form;
    try {
      form = await request.formData();
    } catch {
      return bad('Request body must be multipart form data.');
    }
    const fileEntry = form.get('file');
    if (!(fileEntry instanceof File)) return bad('file is required.');
    const mime = baseAudioMime(fileEntry.type);
    if (!ALLOWED_AUDIO_MIME.has(mime)) return bad('That recording format is not supported.');
    if (fileEntry.size === 0) return bad('The recording is empty.');
    if (fileEntry.size > MAX_AUDIO_BYTES) {
      return bad(`Recording exceeds maximum size of ${MAX_AUDIO_BYTES} bytes.`);
    }

    const audioId = newAudioId();
    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    const store = await getStore(ctx.env);
    await store.set(audioBytesKey(audioId), bytes, { metadata: { contentType: mime } });
    await store.set(
      audioMetaKey(audioId),
      JSON.stringify({
        id: audioId,
        trip_id: tripId,
        mime_type: mime,
        size: bytes.byteLength,
        created_at: new Date(ctx.now()).toISOString()
      })
    );
    return okResponse(201, { audio_id: audioId }, PRIVATE_CACHE);
  }, deps);
}

/** GET ?id=…&token=… for followers on a live trip link, or GET ?id=… with a session for the owner. */
export function createTravelAudioGetHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const createRepo = deps.createTravelRepository ?? createTravelRepository;
  const verify = deps.verifySessionToken ?? verifySessionToken;
  const now = deps.now ?? Date.now;
  const clearCookie = deps.serializeExpiredSessionCookie ?? serializeExpiredSessionCookie;
  const notFound = (message) => errorResponse(404, 'not_found', message, false, NO_STORE);

  return async function travelAudioGetHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'GET') {
      return withCors(errorResponse(405, 'method_not_allowed', 'Use GET.', false), request, env);
    }
    return withCors(await handleGet(request), request, env);
  };

  async function handleGet(request) {
    const originError = guardRequestOrigin(request, env);
    if (originError) return originError;

    const url = new URL(request.url);
    const audioId = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    if (!isAudioId(audioId)) return notFound('Clip not found.');

    let repo;
    try {
      repo = createRepo({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
    } catch {
      return errorResponse(503, 'misconfigured', 'Travel storage is unavailable.', true, NO_STORE);
    }
    const store = await getStore(env);
    const range = request.headers.get('range');

    if (token) {
      const shared = await liveTripForShareToken(repo, token);
      if (!shared) return notFound('This link has been turned off.');
      const clip = await loadAudio(store, audioId, shared.tripId);
      return clip ? audioResponse(clip.bytes, clip.contentType, range) : notFound('Clip not found.');
    }

    if (!isConfigured(env)) return withPrivate(misconfiguredResponse());
    let session;
    try {
      session = await verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivate(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        'cache-control': 'no-store',
        'set-cookie': clearCookie()
      });
    }
    const clip = await loadAudio(store, audioId, null);
    return clip ? audioResponse(clip.bytes, clip.contentType, range) : notFound('Clip not found.');
  }
}

/** Combined handler: GET = follower or owner read; POST and DELETE = owner. */
export function createTravelAudioHandler(deps = {}) {
  const write = createTravelAudioWriteHandler(deps);
  const read = createTravelAudioGetHandler(deps);
  return async function travelAudioHandler(request, context) {
    if (request.method === 'GET' || request.method === 'OPTIONS') {
      return read(request, context);
    }
    return write(request, context);
  };
}

export default createTravelAudioHandler();
```

- [ ] **Step 5: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-audio.test.js tests/unit/travel-photo.test.js`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/travel-blobs.mjs netlify/functions/travel-audio.mjs tests/unit/travel-audio.test.js
git commit -m "Travel postcards: a route that stores a voice clip and plays it to a trip link"
```

---

### Task 4: Transcription route

**Files:**
- Create: `netlify/functions/travel-transcribe.mjs`
- Modify: `netlify.toml`
- Test: `tests/unit/travel-transcribe.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/travel-transcribe.test.js`:

```js
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  createTravelTranscribeHandler,
  tidyTranscript,
  TRANSCRIBE_PER_MINUTE
} from '../../netlify/functions/travel-transcribe.mjs';
import { resetRateLimits } from '../../netlify/functions/_shared/travel-rate-limit.mjs';

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: 's'.repeat(32),
  RESEARCH_KERNEL_SHARED_SECRET: 'kernel-secret'
};

beforeEach(() => resetRateLimits());

function store() {
  const blobs = new Map([
    ['audio/tau_a1.json', JSON.stringify({ id: 'tau_a1', trip_id: 'trp_live1', mime_type: 'audio/mp4' })],
    ['audio/tau_a1.bin', new Uint8Array([1, 2, 3, 4]).buffer],
    ['audio/tau_o1.json', JSON.stringify({ id: 'tau_o1', trip_id: 'trp_other1', mime_type: 'audio/mp4' })],
    ['audio/tau_o1.bin', new Uint8Array([9]).buffer]
  ]);
  return {
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async getWithMetadata(key) {
      return blobs.has(key) ? { data: blobs.get(key), metadata: {} } : null;
    }
  };
}

function handler({ fetchImpl, env: useEnv = env, timeoutMs } = {}) {
  return createTravelTranscribeHandler({
    env: useEnv,
    fetchImpl,
    timeoutMs,
    getTravelStore: async () => store(),
    createTravelRepository: () => ({
      async getTrip(id) {
        if (id === 'trp_live1') return { trip: { id, title: 'Invented trip' }, version: 'v1' };
        throw Object.assign(new Error('Trip not found.'), { status: 404, code: 'not_found' });
      }
    }),
    verifySessionToken: async () => ({ valid: true, payload: {} })
  });
}

const ask = (h, audioId, query = 'trip=trp_live1') =>
  h(
    new Request(`https://api.example/api/travel-transcribe?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'life_hub_session=x' },
      body: JSON.stringify({ audio_id: audioId })
    })
  );

const kernel = (payload, status = 200) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
};

test('tidyTranscript collapses whitespace and cuts to 600 characters', () => {
  assert.equal(tidyTranscript('  Made it \n to   the market. '), 'Made it to the market.');
  assert.equal(tidyTranscript(null), '');
  assert.equal(Array.from(tidyTranscript('é'.repeat(700))).length, 600);
});

test('the clip goes to the transcription service and its words come back tidy', async () => {
  const { calls, fetchImpl } = kernel({ text: '  Made it   to the market. ', segments: [] });
  const response = await ask(handler({ fetchImpl }), 'tau_a1');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { text: 'Made it to the market.' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/transcribe$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-research-kernel-secret'], 'kernel-secret');
  assert.equal(JSON.parse(calls[0].init.body).audio, Buffer.from([1, 2, 3, 4]).toString('base64'));
});

test('a service that never answers is a retryable 502, inside the time limit', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      // AbortSignal.timeout does not hold the event loop open; this timer does until it fires.
      const keepAlive = setTimeout(() => {}, 5_000);
      signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(signal.reason ?? new Error('aborted'));
      });
    });
  const response = await ask(handler({ fetchImpl, timeoutMs: 20 }), 'tau_a1');
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.code, 'transcription_failed');
  assert.equal(body.error.retryable, true);
});

test('a failing service is a 502; a service that is not connected is a 503', async () => {
  const { fetchImpl } = kernel({ error: 'boom' }, 500);
  assert.equal((await ask(handler({ fetchImpl }), 'tau_a1')).status, 502);

  const unbound = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const response = await ask(handler({ fetchImpl, env: unbound }), 'tau_a1');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'transcription_unavailable');
});

test('another trip\'s clip, a bad id, a missing trip and an unknown trip are refused', async () => {
  const { fetchImpl, calls } = kernel({ text: 'x' });
  const h = handler({ fetchImpl });
  assert.equal((await ask(h, 'tau_o1')).status, 404);
  assert.equal((await ask(h, 'nope')).status, 400);
  assert.equal((await ask(h, 'tau_a1', '')).status, 400);
  assert.equal((await ask(h, 'tau_a1', 'trip=trp_missing1')).status, 404);
  assert.equal(calls.length, 0, 'nothing was sent to the service');
});

test('transcription is limited to ten calls a minute', async () => {
  const { fetchImpl } = kernel({ text: 'x' });
  const h = handler({ fetchImpl });
  for (let i = 0; i < TRANSCRIBE_PER_MINUTE; i += 1) {
    assert.equal((await ask(h, 'tau_a1')).status, 200);
  }
  assert.equal((await ask(h, 'tau_a1')).status, 429);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-transcribe.test.js`
Expected: FAIL, `Cannot find module ... travel-transcribe.mjs`.

- [ ] **Step 3: Write the route**

Create `netlify/functions/travel-transcribe.mjs`:

```js
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { audioBytesKey, audioMetaKey, defaultGetTravelStore, isAudioId } from './_shared/travel-blobs.mjs';
import { knowledgeKernelFetch } from './_shared/knowledge-kernel.mjs';
import { checkRateLimit } from './_shared/travel-rate-limit.mjs';

export const config = { path: '/api/travel-transcribe' };

/** One call for a 30 second clip. The function itself is allowed 26 seconds (netlify.toml). */
export const TRANSCRIBE_TIMEOUT_MS = 20_000;
export const TRANSCRIBE_PER_MINUTE = 10;
export const MAX_TRANSCRIPT_CHARS = 600;

/** One paragraph of plain words, short enough for the back of a postcard. */
export function tidyTranscript(text) {
  const flat = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return Array.from(flat).slice(0, MAX_TRANSCRIPT_CHARS).join('');
}

/**
 * POST ?trip=… with { audio_id }: the words of a stored clip.
 * Owner only. The words are personal: they go back to the owner and are never logged.
 */
export function createTravelTranscribeHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const kernelFetch = deps.kernelFetch ?? knowledgeKernelFetch;
  const timeoutMs = deps.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS;
  const failed = () =>
    errorResponse(502, 'transcription_failed', "Couldn't write out the words. Try again.", true, PRIVATE_CACHE);

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST.', false, PRIVATE_CACHE);
    }
    const tripId = new URL(request.url).searchParams.get('trip');
    const body = await readJson(request);
    const audioId = body?.audio_id;
    if (!tripId || !isAudioId(audioId)) {
      return errorResponse(400, 'validation_error', 'trip and audio_id are required.', false, PRIVATE_CACHE);
    }
    await ctx.repo.getTrip(tripId);

    const store = await getStore(ctx.env);
    let meta = null;
    try {
      const raw = await store.get(audioMetaKey(audioId), { type: 'text' });
      meta = raw ? JSON.parse(raw) : null;
    } catch {
      meta = null;
    }
    const clip =
      meta?.trip_id === tripId
        ? await store.getWithMetadata(audioBytesKey(audioId), { type: 'arrayBuffer' })
        : null;
    if (!clip?.data) {
      return errorResponse(404, 'not_found', 'Clip not found.', false, PRIVATE_CACHE);
    }

    const sessionKey = ctx.session?.token || ctx.session?.id || 'anon';
    checkRateLimit(`transcribe:${sessionKey}`, { limit: TRANSCRIBE_PER_MINUTE, now: ctx.now() });

    let response;
    try {
      response = await kernelFetch('/transcribe', {
        env: ctx.env,
        fetchImpl: deps.fetchImpl ?? fetch,
        method: 'POST',
        body: { audio: Buffer.from(clip.data).toString('base64') },
        timeoutMs
      });
    } catch (error) {
      if (error?.code === 'knowledge_kernel_unbound') {
        return errorResponse(
          503,
          'transcription_unavailable',
          "Transcription isn't connected.",
          false,
          PRIVATE_CACHE
        );
      }
      return failed();
    }
    if (!response.ok) return failed();
    const payload = await response.json().catch(() => null);
    return okResponse(200, { text: tidyTranscript(payload?.text) }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelTranscribeHandler();
```

- [ ] **Step 4: Give the function time to finish**

In `netlify.toml`, directly after this block:

```toml
[functions.property]
  timeout = 26
```

add:

```toml

# Writing out a 30 second voice clip can pass the 10s default.
[functions.travel-transcribe]
  timeout = 26
```

- [ ] **Step 5: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-transcribe.test.js`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/travel-transcribe.mjs netlify.toml tests/unit/travel-transcribe.test.js
git commit -m "Travel postcards: a route that writes out a voice clip's words"
```

---

### Task 5: Address parts from a photo's location

**Files:**
- Modify: `netlify/functions/travel-places.mjs`
- Test: `tests/unit/travel-places-reverse.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/travel-places-reverse.test.js`, change the import line to:

```js
import { placeAddressFromReverse, placeNameFromReverse } from '../../netlify/functions/travel-places.mjs';
```

and add at the end of the file:

```js
test('address from coordinates: street, neighbourhood, postcode, town and country', () => {
  const address = placeAddressFromReverse([
    feature({
      name: 'Restaurante Inventado',
      osm_key: 'amenity',
      type: 'house',
      housenumber: '12',
      street: 'Rua do Exemplo',
      district: 'Alfama',
      postcode: '1100-000',
      city: 'Lisboa',
      country: 'Portugal'
    })
  ]);
  assert.deepEqual(address, {
    street: 'Rua do Exemplo',
    district: 'Alfama',
    postcode: '1100-000',
    city: 'Lisboa',
    country: 'Portugal'
  });
});

test('address from coordinates: never a house number, never a business name', () => {
  const address = placeAddressFromReverse([
    feature({ name: 'Baleal Surf Shop', osm_key: 'shop', type: 'house', housenumber: '7', city: 'Peniche', country: 'Portugal' })
  ]);
  assert.deepEqual(address, { city: 'Peniche', country: 'Portugal' });
  assert.equal(JSON.stringify(address).includes('7'), false);
  assert.equal(JSON.stringify(address).includes('Surf'), false);
});

test('address from coordinates: a street result uses its own name, and later results fill the gaps', () => {
  const address = placeAddressFromReverse([
    feature({ name: 'Travessa Inventada', osm_key: 'highway', type: 'street' }),
    feature({ name: 'Museu Inventado', osm_key: 'tourism', type: 'house', city: 'Porto', country: 'Portugal' })
  ]);
  assert.deepEqual(address, { street: 'Travessa Inventada', city: 'Porto', country: 'Portugal' });
});

test('address from coordinates: a neighbourhood named like its town is left out, and nothing gives null', () => {
  assert.deepEqual(placeAddressFromReverse([feature({ district: 'Porto', city: 'Porto', country: 'Portugal' })]), {
    city: 'Porto',
    country: 'Portugal'
  });
  assert.deepEqual(placeAddressFromReverse([feature({ name: 'Foz', type: 'district', city: 'Porto' })]), {
    district: 'Foz',
    city: 'Porto'
  });
  assert.equal(placeAddressFromReverse([]), null);
  assert.equal(placeAddressFromReverse(undefined), null);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-places-reverse.test.js`
Expected: FAIL, `placeAddressFromReverse is not a function` (or a missing export error).

- [ ] **Step 3: Add the function and return it**

In `netlify/functions/travel-places.mjs`, add this directly after the `placeNameFromReverse` function:

```js
/**
 * The parts of a postal address for where a photo was taken, from the same results.
 * Same care as the name: the street it stands on, never a house number and never the
 * nearest business. Each part comes from the first result that has it.
 */
export function placeAddressFromReverse(features) {
  const rows = (Array.isArray(features) ? features : []).map((f) => f?.properties || {});
  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  const first = (read) => {
    for (const p of rows) {
      const value = read(p);
      if (value) return value;
    }
    return '';
  };
  const street = first((p) => clean(p.street) || (p.type === 'street' || p.osm_key === 'highway' ? clean(p.name) : ''));
  const city = first((p) => clean(p.city) || (p.type === 'city' ? clean(p.name) : ''));
  const district = first(
    (p) => clean(p.district) || clean(p.locality) || (p.type === 'district' || p.type === 'locality' ? clean(p.name) : '')
  );
  const postcode = first((p) => clean(p.postcode));
  const country = first((p) => clean(p.country));
  const address = {
    ...(street ? { street } : {}),
    ...(district && district !== city ? { district } : {}),
    ...(postcode ? { postcode } : {}),
    ...(city ? { city } : {}),
    ...(country ? { country } : {})
  };
  return Object.keys(address).length ? address : null;
}
```

Then, in the reverse branch of the handler, replace:

```js
        return okResponse(200, { name: placeNameFromReverse(body.features) }, PRIVATE_CACHE);
```

with:

```js
        return okResponse(
          200,
          { name: placeNameFromReverse(body.features), address: placeAddressFromReverse(body.features) },
          PRIVATE_CACHE
        );
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-places-reverse.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/travel-places.mjs tests/unit/travel-places-reverse.test.js
git commit -m "Travel postcards: the place lookup also returns the parts of an address"
```

---

### Task 6: Postcard rules

One pure module holds the limits and the "which check-in carries the postcard" rules, so the route and the public link cannot disagree.

**Files:**
- Create: `netlify/functions/_shared/travel-postcard.mjs`
- Test: `tests/unit/travel-postcard-rules.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/travel-postcard-rules.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  carryingCheckin,
  cleanPostcardInput,
  latestCheckinForItem,
  postcardMediaOfItem,
  publicPostcard
} from '../../netlify/functions/_shared/travel-postcard.mjs';

const base = () => ({ photo_id: 'tph_p1', orientation: 'portrait', address: ['Rua do Exemplo', 'Lisboa', 'Portugal'] });
const refuses = (raw, path) =>
  assert.throws(
    () => cleanPostcardInput(raw),
    (error) => error.code === 'validation_error' && error.path === path
  );

test('a photo, an orientation and an address make a postcard', () => {
  assert.deepEqual(cleanPostcardInput(base()), base());
});

test('address lines are tidied, blank lines dropped, and one to four are kept', () => {
  const cleaned = cleanPostcardInput({ ...base(), address: ['  Rua   do Exemplo ', '', '   ', 'Lisboa'] });
  assert.deepEqual(cleaned.address, ['Rua do Exemplo', 'Lisboa']);
  refuses({ ...base(), address: [] }, 'postcard.address');
  refuses({ ...base(), address: ['', ' '] }, 'postcard.address');
  refuses({ ...base(), address: ['a', 'b', 'c', 'd', 'e'] }, 'postcard.address');
  refuses({ ...base(), address: ['x'.repeat(61)] }, 'postcard.address');
  refuses({ ...base(), address: 'Rua do Exemplo' }, 'postcard.address');
  assert.equal(cleanPostcardInput({ ...base(), address: ['é'.repeat(60)] }).address[0].length, 60);
});

test('words are one tidy paragraph of at most 600 characters, and empty words are left out', () => {
  assert.equal(cleanPostcardInput({ ...base(), text: '  Made it \n to the   market. ' }).text, 'Made it to the market.');
  assert.equal('text' in cleanPostcardInput({ ...base(), text: '   ' }), false);
  assert.equal(cleanPostcardInput({ ...base(), text: 'x'.repeat(600) }).text.length, 600);
  refuses({ ...base(), text: 'x'.repeat(601) }, 'postcard.text');
});

test('a clip needs a valid id and a length of 1 to 30 whole seconds', () => {
  const withClip = cleanPostcardInput({ ...base(), audio_id: 'tau_a1', audio_s: 28 });
  assert.equal(withClip.audio_id, 'tau_a1');
  assert.equal(withClip.audio_s, 28);
  refuses({ ...base(), audio_id: 'nope', audio_s: 28 }, 'postcard.audio_id');
  refuses({ ...base(), audio_id: 'tau_a1' }, 'postcard.audio_s');
  refuses({ ...base(), audio_id: 'tau_a1', audio_s: 0 }, 'postcard.audio_s');
  refuses({ ...base(), audio_id: 'tau_a1', audio_s: 31 }, 'postcard.audio_s');
  refuses({ ...base(), audio_id: 'tau_a1', audio_s: 12.5 }, 'postcard.audio_s');
  assert.equal('audio_s' in cleanPostcardInput({ ...base(), audio_s: 12 }), false, 'a length with no clip is dropped');
});

test('a missing photo, a bad orientation and unknown fields are handled', () => {
  refuses(null, 'postcard');
  refuses([], 'postcard');
  refuses({ ...base(), photo_id: 'nope' }, 'postcard.photo_id');
  refuses({ ...base(), orientation: 'square' }, 'postcard.orientation');
  const cleaned = cleanPostcardInput({ ...base(), coordinates: { lat: 1, lon: 2 }, posted_at: '1999-01-01T00:00:00.000Z' });
  assert.equal('coordinates' in cleaned, false);
  assert.equal('posted_at' in cleaned, false);
});

const checkins = [
  { id: 'chk_other', at: '2027-03-04T09:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_other' },
  { id: 'chk_a', at: '2027-03-04T10:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_1' },
  {
    id: 'chk_b',
    at: '2027-03-04T11:00:00.000Z',
    city_id: 'lis',
    label: 'Safe',
    item_id: 'itm_1',
    photo_id: 'tph_p1',
    postcard: {
      photo_id: 'tph_p1',
      orientation: 'landscape',
      address: ['Rua do Exemplo', 'Lisboa'],
      posted_at: '2027-03-04T11:30:00.000Z',
      audio_id: 'tau_a1',
      audio_s: 21,
      text: 'All good here.',
      coordinates: { lat: 38.7, lon: -9.1 }
    }
  },
  { id: 'chk_c', at: '2027-03-04T12:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_1' },
  { id: 'chk_city', at: '2027-03-04T13:00:00.000Z', city_id: 'lis', label: 'Safe check-in' }
];

test('the latest check-in on a stop, and the latest one that carries a postcard or photo', () => {
  assert.equal(latestCheckinForItem(checkins, 'itm_1').id, 'chk_c');
  assert.equal(carryingCheckin(checkins, 'itm_1').id, 'chk_b');
  assert.equal(carryingCheckin(checkins, 'itm_other'), null);
  assert.equal(latestCheckinForItem(checkins, 'itm_none'), null);
  assert.equal(latestCheckinForItem(undefined, 'itm_1'), null);
});

test('every file a stop\'s check-ins name, once each', () => {
  const older = [...checkins, { id: 'chk_old', at: '2027-03-04T08:00:00.000Z', city_id: 'lis', label: 'Photo', item_id: 'itm_1', photo_id: 'tph_old1' }];
  assert.deepEqual(postcardMediaOfItem(older, 'itm_1'), { photoIds: ['tph_p1', 'tph_old1'], audioIds: ['tau_a1'] });
  assert.deepEqual(postcardMediaOfItem(checkins, 'itm_other'), { photoIds: [], audioIds: [] });
});

test('what followers get: the postcard\'s own fields and nothing else', () => {
  assert.deepEqual(publicPostcard(checkins[2]), {
    id: 'chk_b',
    at: '2027-03-04T11:30:00.000Z',
    photo_id: 'tph_p1',
    orientation: 'landscape',
    address: ['Rua do Exemplo', 'Lisboa'],
    audio_id: 'tau_a1',
    audio_s: 21,
    text: 'All good here.'
  });
});

test('a photo from before postcards reads as a photo-only postcard at the check-in\'s time', () => {
  const old = { id: 'chk_old', at: '2027-03-04T08:00:00.000Z', city_id: 'lis', label: 'Photo', item_id: 'itm_1', photo_id: 'tph_old1' };
  assert.deepEqual(publicPostcard(old), { id: 'chk_old', at: '2027-03-04T08:00:00.000Z', photo_id: 'tph_old1' });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-postcard-rules.test.js`
Expected: FAIL, `Cannot find module ... _shared/travel-postcard.mjs`.

- [ ] **Step 3: Write the module**

Create `netlify/functions/_shared/travel-postcard.mjs`:

```js
/**
 * Postcards on check-ins: the limits, and which check-in carries a stop's postcard.
 * Pure, so the route that saves a postcard and the public link that shows it agree.
 */
import { isAudioId, isPhotoId } from './travel-blobs.mjs';

export const POSTCARD_MAX_LINES = 4;
export const POSTCARD_MAX_LINE_CHARS = 60;
export const POSTCARD_MAX_TEXT_CHARS = 600;
export const POSTCARD_MAX_AUDIO_S = 30;

function fail(path, message) {
  const err = new Error(message);
  err.code = 'validation_error';
  err.path = path;
  return err;
}

const chars = (value) => Array.from(value).length;
const tidy = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * The postcard a client may save: known fields only, tidied and inside the limits.
 * `posted_at` is the server's to set and is never taken from the client.
 */
export function cleanPostcardInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw fail('postcard', 'A postcard is needed.');
  }
  if (!isPhotoId(raw.photo_id)) throw fail('postcard.photo_id', 'A postcard needs a photo.');
  if (raw.orientation !== 'portrait' && raw.orientation !== 'landscape') {
    throw fail('postcard.orientation', 'orientation must be portrait or landscape.');
  }
  if (!Array.isArray(raw.address)) {
    throw fail('postcard.address', 'A postcard needs one to four address lines.');
  }
  const address = raw.address.map(tidy).filter(Boolean);
  if (address.length < 1 || address.length > POSTCARD_MAX_LINES) {
    throw fail('postcard.address', 'A postcard needs one to four address lines.');
  }
  if (address.some((line) => chars(line) > POSTCARD_MAX_LINE_CHARS)) {
    throw fail('postcard.address', `Each address line can be at most ${POSTCARD_MAX_LINE_CHARS} characters.`);
  }

  const out = { photo_id: raw.photo_id, orientation: raw.orientation, address };

  const text = tidy(raw.text);
  if (chars(text) > POSTCARD_MAX_TEXT_CHARS) {
    throw fail('postcard.text', `The words can be at most ${POSTCARD_MAX_TEXT_CHARS} characters.`);
  }
  if (text) out.text = text;

  if (raw.audio_id !== undefined && raw.audio_id !== null && raw.audio_id !== '') {
    if (!isAudioId(raw.audio_id)) throw fail('postcard.audio_id', 'audio_id is invalid.');
    const seconds = Number(raw.audio_s);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > POSTCARD_MAX_AUDIO_S) {
      throw fail('postcard.audio_s', `A clip is 1 to ${POSTCARD_MAX_AUDIO_S} whole seconds.`);
    }
    out.audio_id = raw.audio_id;
    out.audio_s = seconds;
  }
  return out;
}

const forItem = (checkins, itemId) =>
  (Array.isArray(checkins) ? checkins : []).filter((c) => c && c.item_id === itemId);

const latest = (rows) =>
  rows.reduce((best, c) => (!best || String(c.at) > String(best.at) ? c : best), null);

/** The stop's newest check-in: the one a new postcard is written onto. */
export function latestCheckinForItem(checkins, itemId) {
  return latest(forItem(checkins, itemId));
}

/** The check-in whose postcard a stop shows: the newest one with a postcard, or a photo from before postcards. */
export function carryingCheckin(checkins, itemId) {
  return latest(forItem(checkins, itemId).filter((c) => c.postcard || c.photo_id));
}

/** Every photo and clip a stop's check-ins name, once each. */
export function postcardMediaOfItem(checkins, itemId) {
  const photoIds = new Set();
  const audioIds = new Set();
  for (const c of forItem(checkins, itemId)) {
    if (isPhotoId(c.postcard?.photo_id)) photoIds.add(c.postcard.photo_id);
    if (isPhotoId(c.photo_id)) photoIds.add(c.photo_id);
    if (isAudioId(c.postcard?.audio_id)) audioIds.add(c.postcard.audio_id);
  }
  return { photoIds: [...photoIds], audioIds: [...audioIds] };
}

/** What followers on the public link get for a carrying check-in. Named fields only. */
export function publicPostcard(checkin) {
  const card = checkin.postcard;
  if (!card) return { id: checkin.id, at: checkin.at, photo_id: checkin.photo_id };
  return {
    id: checkin.id,
    at: card.posted_at || checkin.at,
    photo_id: card.photo_id,
    orientation: card.orientation,
    address: Array.isArray(card.address) ? card.address : [],
    ...(card.audio_id ? { audio_id: card.audio_id, audio_s: card.audio_s } : {}),
    ...(card.text ? { text: card.text } : {})
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-postcard-rules.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/travel-postcard.mjs tests/unit/travel-postcard-rules.test.js
git commit -m "Travel postcards: the limits and the rule for which check-in carries one"
```

---

### Task 7: Postcard route

**Files:**
- Create: `netlify/functions/travel-postcard.mjs`
- Test: `tests/unit/travel-postcard.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/travel-postcard.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createTravelPostcardHandler } from '../../netlify/functions/travel-postcard.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('../../apps/travel/fixtures/test-trip.json', import.meta.url), 'utf8')
);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const TRIP = fixture.id;
const ITEM = 'itm_testtodo01';
const NOW = Date.parse('2027-03-04T12:30:00.000Z');

const tick = (extra = {}) => ({
  id: 'chk_tick1',
  at: '2027-03-04T11:00:00.000Z',
  city_id: 'lis',
  label: 'Safe',
  item_id: ITEM,
  ...extra
});
const card = (extra = {}) => ({
  photo_id: 'tph_p1',
  orientation: 'portrait',
  address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
  ...extra
});

function fakeRepo(checkins) {
  const state = { trip: { ...structuredClone(fixture), checkins }, version: 'v1', saves: [] };
  return {
    state,
    async getTrip(id) {
      if (id !== state.trip.id) throw Object.assign(new Error('Trip not found.'), { code: 'not_found', status: 404 });
      return { trip: structuredClone(state.trip), version: state.version };
    },
    async saveTrip(next, version, message) {
      if (version !== state.version) {
        throw Object.assign(new Error('The trip changed. Reload and try again.'), { code: 'conflict', status: 409 });
      }
      state.trip = structuredClone(next);
      state.version = `v${state.saves.length + 2}`;
      state.saves.push(message);
      return { trip: structuredClone(next), version: state.version };
    }
  };
}

function blobStore({ failDelete = false } = {}) {
  const meta = (id, trip) => JSON.stringify({ id, trip_id: trip });
  const blobs = new Map([
    ['photos/tph_p1.json', meta('tph_p1', TRIP)],
    ['photos/tph_p1.bin', new Uint8Array([1]).buffer],
    ['photos/tph_old1.json', meta('tph_old1', TRIP)],
    ['photos/tph_old1.bin', new Uint8Array([2]).buffer],
    ['photos/tph_o1.json', meta('tph_o1', 'trp_other1')],
    ['audio/tau_a1.json', meta('tau_a1', TRIP)],
    ['audio/tau_a1.bin', new Uint8Array([3]).buffer],
    ['audio/tau_o1.json', meta('tau_o1', 'trp_other1')]
  ]);
  return {
    blobs,
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async delete(key) {
      if (failDelete) throw new Error('blob store down');
      blobs.delete(key);
    }
  };
}

function setup(checkins, storeOptions) {
  const repo = fakeRepo(checkins);
  const store = blobStore(storeOptions);
  const handler = createTravelPostcardHandler({
    env,
    now: () => NOW,
    getTravelStore: async () => store,
    createTravelRepository: () => repo,
    verifySessionToken: async () => ({ valid: true, payload: {} })
  });
  const call = (method, body, query = `trip=${TRIP}&item=${ITEM}`) =>
    handler(
      new Request(`https://api.example/api/travel-postcard?${query}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: 'life_hub_session=x' },
        body: JSON.stringify(body ?? {})
      })
    );
  return { repo, store, call };
}

test('a postcard is written onto the stop\'s latest check-in without moving its time', async () => {
  const earlier = tick({ id: 'chk_tick0', at: '2027-03-04T09:00:00.000Z' });
  const { repo, call } = setup([earlier, tick()]);
  const response = await call('PUT', {
    if_version: 'v1',
    postcard: card({ audio_id: 'tau_a1', audio_s: 21, text: ' All good   here. ', posted_at: '1999-01-01T00:00:00.000Z' })
  });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.version, 'v2');

  const [first, second] = repo.state.trip.checkins;
  assert.equal(first.postcard, undefined, 'the earlier tick is untouched');
  assert.equal(second.at, '2027-03-04T11:00:00.000Z', 'the safe time does not move');
  assert.equal(second.photo_id, 'tph_p1', 'an older client still finds the photo');
  assert.deepEqual(second.postcard, {
    photo_id: 'tph_p1',
    orientation: 'portrait',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    text: 'All good here.',
    audio_id: 'tau_a1',
    audio_s: 21,
    posted_at: '2027-03-04T12:30:00.000Z'
  });
  assert.deepEqual(repo.state.saves, [`travel: postcard from ${ITEM}`]);
});

test('a stop that is not ticked safe, an unknown stop and bad fields are refused', async () => {
  const { repo, call } = setup([]);
  const notTicked = await call('PUT', { postcard: card() });
  assert.equal(notTicked.status, 400);
  assert.equal((await notTicked.json()).error.message, 'Tick this stop safe first.');

  assert.equal((await call('PUT', { postcard: card() }, `trip=${TRIP}&item=itm_nope`)).status, 400);
  assert.equal((await call('PUT', { postcard: card() }, `trip=${TRIP}`)).status, 400);
  assert.equal((await call('PUT', { postcard: card() }, 'trip=trp_missing1&item=x')).status, 404);
  assert.equal((await call('PUT', { postcard: card({ address: [] }) })).status, 400);
  assert.equal((await call('PUT', {})).status, 400);
  assert.equal((await call('POST', { postcard: card() })).status, 405);
  assert.equal(repo.state.saves.length, 0);
});

test('a stop that already has a postcard, or a photo from before postcards, says to remove it first', async () => {
  const existing = setup([tick({ photo_id: 'tph_p1', postcard: { ...card(), posted_at: '2027-03-04T11:30:00.000Z' } })]);
  const again = await existing.call('PUT', { postcard: card() });
  assert.equal(again.status, 409);
  const body = await again.json();
  assert.equal(body.error.code, 'postcard_exists');
  assert.equal(body.error.message, 'This stop already has a postcard. Remove it first.');

  const older = setup([tick({ photo_id: 'tph_old1' })]);
  assert.equal((await older.call('PUT', { postcard: card() })).status, 409);
});

test('a photo or clip from another trip is refused', async () => {
  const { repo, call } = setup([tick()]);
  assert.equal((await call('PUT', { postcard: card({ photo_id: 'tph_o1' }) })).status, 400);
  assert.equal((await call('PUT', { postcard: card({ photo_id: 'tph_missing9' }) })).status, 400);
  assert.equal((await call('PUT', { postcard: card({ audio_id: 'tau_o1', audio_s: 5 }) })).status, 400);
  assert.equal(repo.state.saves.length, 0);
});

test('a stale version is a conflict the client can retry', async () => {
  const { call } = setup([tick()]);
  const response = await call('PUT', { if_version: 'v0', postcard: card() });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'conflict');
});

test('removing a postcard clears every check-in on the stop, keeps the safe tick and deletes the files', async () => {
  const { repo, store, call } = setup([
    tick({ id: 'chk_old', at: '2027-03-04T09:00:00.000Z', photo_id: 'tph_old1' }),
    tick({
      photo_id: 'tph_p1',
      postcard: { ...card({ audio_id: 'tau_a1', audio_s: 21 }), posted_at: '2027-03-04T11:30:00.000Z' }
    })
  ]);
  const response = await call('DELETE', { if_version: 'v1' });
  assert.equal(response.status, 200);

  assert.equal(repo.state.trip.checkins.length, 2, 'the ticks stay');
  for (const c of repo.state.trip.checkins) {
    assert.equal(c.postcard, undefined);
    assert.equal(c.photo_id, undefined);
  }
  assert.deepEqual(repo.state.saves, [`travel: postcard removed from ${ITEM}`]);
  for (const key of ['photos/tph_p1.bin', 'photos/tph_p1.json', 'photos/tph_old1.bin', 'photos/tph_old1.json', 'audio/tau_a1.bin', 'audio/tau_a1.json']) {
    assert.equal(store.blobs.has(key), false, key);
  }
  assert.equal(store.blobs.has('photos/tph_o1.json'), true, 'another trip\'s files are left alone');
});

test('removing with nothing to remove is a 404; a failed file delete does not fail the removal', async () => {
  assert.equal((await setup([tick()]).call('DELETE', {})).status, 404);

  const { repo, call } = setup([tick({ photo_id: 'tph_p1', postcard: { ...card(), posted_at: '2027-03-04T11:30:00.000Z' } })], {
    failDelete: true
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal((await call('DELETE', {})).status, 200);
  } finally {
    console.error = quiet;
  }
  assert.equal(repo.state.trip.checkins[0].postcard, undefined);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-postcard.test.js`
Expected: FAIL, `Cannot find module ... travel-postcard.mjs`.

- [ ] **Step 3: Write the route**

Create `netlify/functions/travel-postcard.mjs`:

```js
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import {
  audioBytesKey,
  audioMetaKey,
  defaultGetTravelStore,
  photoBytesKey,
  photoMetaKey
} from './_shared/travel-blobs.mjs';
import { validateTrip } from './_shared/travel-schema.mjs';
import {
  cleanPostcardInput,
  latestCheckinForItem,
  postcardMediaOfItem
} from './_shared/travel-postcard.mjs';

export const config = { path: '/api/travel-postcard' };

async function belongsToTrip(store, metaKey, tripId) {
  try {
    const raw = await store.get(metaKey, { type: 'text' });
    return Boolean(raw) && JSON.parse(raw).trip_id === tripId;
  } catch {
    return false;
  }
}

/**
 * Owner only.
 * PUT ?trip=…&item=… with { if_version, postcard }: write a postcard onto the stop's latest check-in.
 * DELETE ?trip=…&item=… with { if_version }: take the stop's postcard back and delete its files.
 */
export function createTravelPostcardHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const bad = (message) => errorResponse(400, 'validation_error', message, false, PRIVATE_CACHE);

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'PUT' && request.method !== 'DELETE') {
      return errorResponse(405, 'method_not_allowed', 'Use PUT or DELETE.', false, PRIVATE_CACHE);
    }
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    const itemId = url.searchParams.get('item');
    if (!tripId || !itemId) return bad('trip and item are required.');
    const body = (await readJson(request)) || {};

    const { trip, version } = await ctx.repo.getTrip(tripId);
    if (!(trip.items || []).some((i) => i.id === itemId)) {
      return bad('item does not match a stop on this trip.');
    }
    const ifVersion = typeof body.if_version === 'string' && body.if_version ? body.if_version : version;
    const store = await getStore(ctx.env);
    const media = postcardMediaOfItem(trip.checkins, itemId);
    const hasCard = media.photoIds.length > 0 || media.audioIds.length > 0;

    if (request.method === 'DELETE') {
      if (!hasCard) {
        return errorResponse(404, 'not_found', 'No postcard on this stop.', false, PRIVATE_CACHE);
      }
      for (const c of trip.checkins) {
        if (c?.item_id !== itemId) continue;
        delete c.postcard;
        delete c.photo_id;
      }
      trip.updated_at = new Date(ctx.now()).toISOString();
      validateTrip(trip);
      const saved = await ctx.repo.saveTrip(trip, ifVersion, `travel: postcard removed from ${itemId}`);
      // The trip no longer names these files. A failed delete only leaves an orphan behind.
      const keys = [
        ...media.photoIds.flatMap((id) => [photoBytesKey(id), photoMetaKey(id)]),
        ...media.audioIds.flatMap((id) => [audioBytesKey(id), audioMetaKey(id)])
      ];
      for (const key of keys) {
        try {
          await store.delete(key);
        } catch (error) {
          console.error('travel postcard: file delete failed', error?.message);
        }
      }
      return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
    }

    const postcard = cleanPostcardInput(body.postcard);
    if (hasCard) {
      return errorResponse(
        409,
        'postcard_exists',
        'This stop already has a postcard. Remove it first.',
        false,
        PRIVATE_CACHE
      );
    }
    const carrier = latestCheckinForItem(trip.checkins, itemId);
    if (!carrier) return bad('Tick this stop safe first.');
    if (!(await belongsToTrip(store, photoMetaKey(postcard.photo_id), tripId))) {
      return bad('That photo is not on this trip.');
    }
    if (postcard.audio_id && !(await belongsToTrip(store, audioMetaKey(postcard.audio_id), tripId))) {
      return bad('That recording is not on this trip.');
    }

    const postedAt = new Date(ctx.now()).toISOString();
    carrier.postcard = { ...postcard, posted_at: postedAt };
    // Browsers still running the old code read the photo from here.
    carrier.photo_id = postcard.photo_id;
    trip.updated_at = postedAt;
    validateTrip(trip);
    const saved = await ctx.repo.saveTrip(trip, ifVersion, `travel: postcard from ${itemId}`);
    return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelPostcardHandler();
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-postcard.test.js`
Expected: `# fail 0`.

If the first test fails on the key order of `second.postcard`, that is not a real failure: `assert.deepEqual` ignores key order. A real failure names a differing value.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/travel-postcard.mjs tests/unit/travel-postcard.test.js
git commit -m "Travel postcards: a route that saves a postcard on a check-in and takes it back"
```

---

### Task 8: Postcards on the public link

**Files:**
- Modify: `netlify/functions/_shared/travel-redact.mjs`
- Test: `tests/unit/travel-redact.test.js`

- [ ] **Step 1: Write the failing tests**

Add at the end of `tests/unit/travel-redact.test.js`:

```js
const postcardCheckin = (extra = {}) => ({
  id: 'chk_card1',
  at: '2027-03-04T11:00:00.000Z',
  city_id: 'lis',
  label: 'Safe',
  item_id: 'itm_testtodo01',
  photo_id: 'tph_p1',
  postcard: {
    photo_id: 'tph_p1',
    orientation: 'portrait',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    posted_at: '2027-03-04T11:30:00.000Z',
    audio_id: 'tau_a1',
    audio_s: 21,
    text: 'All good here.',
    coordinates: { lat: 12.345678, lon: 98.765432 }
  },
  ...extra
});

test('redactTrip gives followers a stop\'s postcard, and never where exactly it was taken', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    postcardCheckin(),
    { id: 'chk_later', at: '2027-03-04T13:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_testtodo01' }
  ];
  const publicTrip = redactTrip(trip);
  const stop = publicTrip.items.find((i) => i.id === 'itm_testtodo01');

  assert.equal(stop.safe_at, '2027-03-04T13:00:00.000Z', 'the safe time is still the latest tick');
  assert.deepEqual(stop.postcard, {
    id: 'chk_card1',
    at: '2027-03-04T11:30:00.000Z',
    photo_id: 'tph_p1',
    orientation: 'portrait',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    audio_id: 'tau_a1',
    audio_s: 21,
    text: 'All good here.'
  });
  const json = JSON.stringify(publicTrip);
  assert.equal(json.includes('12.345678'), false);
  assert.equal(json.includes('"coordinates"'), false);
  assert.equal(publicTrip.items.find((i) => i.id === 'itm_testfood01').postcard, undefined);
});

test('redactTrip reads a photo from before postcards as a photo-only postcard', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    { id: 'chk_old', at: '2027-03-04T10:00:00.000Z', city_id: 'lis', label: 'Photo', item_id: 'itm_testtodo01', photo_id: 'tph_old1' }
  ];
  const stop = redactTrip(trip).items.find((i) => i.id === 'itm_testtodo01');
  assert.deepEqual(stop.postcard, { id: 'chk_old', at: '2027-03-04T10:00:00.000Z', photo_id: 'tph_old1' });
  assert.equal(stop.safe_photo_id, 'tph_old1');
});

test('redactTrip drops a private stop with its postcard, and the last check-in does not name it', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    postcardCheckin({ item_id: 'itm_testmed01', city_id: 'opo', label: 'Safe · Private test medication stop' })
  ];
  const publicTrip = redactTrip(trip);
  const json = JSON.stringify(publicTrip);
  for (const secret of ['itm_testmed01', 'Private test medication stop', 'Rua do Exemplo', 'All good here.', 'tau_a1', 'tph_p1']) {
    assert.equal(json.includes(secret), false, `leaked: ${secret}`);
  }
  assert.deepEqual(publicTrip.last_checkin, { at: '2027-03-04T11:00:00.000Z', city_name: 'Porto', label: 'Safe' });
});

test('redactTrip still names a public stop in the last check-in', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [postcardCheckin({ label: 'Safe · Book Belém tram tickets' })];
  assert.deepEqual(redactTrip(trip).last_checkin, {
    at: '2027-03-04T11:00:00.000Z',
    city_name: 'Lisbon',
    label: 'Safe · Book Belém tram tickets',
    item_id: 'itm_testtodo01',
    photo_id: 'tph_p1'
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-redact.test.js`
Expected: FAIL in three of the four new tests. The first two fail because `stop.postcard` is `undefined`. The third fails with `leaked: itm_testmed01`: today the public trip's `last_checkin` copies the latest check-in's label, stop id and photo id even when that stop is private. Step 3 closes that as well. The fourth passes already and stays as a guard.

- [ ] **Step 3: Add the postcard to a redacted stop**

In `netlify/functions/_shared/travel-redact.mjs`, add this import as the first line of the file, above the doc comment:

```js
import { carryingCheckin, publicPostcard } from './travel-postcard.mjs';
```

Then, inside the `.map((item) => { ... })`, directly after this block:

```js
      const safe = safeByItem.get(item.id);
      if (safe) {
        base.safe_at = safe.at;
        if (safe.photo_id) base.safe_photo_id = safe.photo_id;
      }
```

add:

```js
      // The postcard may sit on an earlier check-in than the latest tick.
      const carrier = carryingCheckin(checkins, item.id);
      if (carrier) base.postcard = publicPostcard(carrier);
```

Last, replace this block near the end of `redactTrip`:

```js
  const latest = [...checkins].sort((a, b) => b.at.localeCompare(a.at))[0];
  const checkin = latest
    ? {
        at: latest.at,
        city_name: cityName[latest.city_id] || latest.city_id,
        label: latest.label,
        ...(latest.item_id ? { item_id: latest.item_id } : {}),
        ...(latest.photo_id ? { photo_id: latest.photo_id } : {})
      }
    : null;
```

with:

```js
  // A check-in on a stop followers cannot see still says "safe in <city>", and nothing about the stop.
  const shownItemIds = new Set(items.map((item) => item.id));
  const latest = [...checkins].sort((a, b) => b.at.localeCompare(a.at))[0];
  const latestShown = !latest?.item_id || shownItemIds.has(latest.item_id);
  const checkin = latest
    ? {
        at: latest.at,
        city_name: cityName[latest.city_id] || latest.city_id,
        label: latestShown ? latest.label : 'Safe',
        ...(latest.item_id && latestShown ? { item_id: latest.item_id } : {}),
        ...(latest.photo_id && latestShown ? { photo_id: latest.photo_id } : {})
      }
    : null;
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/travel-redact.test.js tests/unit/travel-public-token.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/travel-redact.mjs tests/unit/travel-redact.test.js
git commit -m "Travel postcards: the public link carries each stop's postcard"
```

---

### Task 9: Whole-suite check and push

- [ ] **Step 1: Run every root test**

Run: `npm test`
Expected: the run ends with `# fail 0`. This is the same suite the deploy runs.

- [ ] **Step 2: Run the privacy guard**

Run: `node scripts/privacy-guard.mjs`
Expected: `PASS  privacy guard`. A warning that no private denylist loaded is expected outside CI.

- [ ] **Step 3: Push**

```bash
git push -u origin claude/digital-postcard-feature-eqcrma
```

Expected: the branch updates. No pull request yet.

---

## Self-review against the spec's Server section

| Spec item | Task |
|---|---|
| `/api/travel-audio` POST, GET with token or session, byte ranges, DELETE, origin guard, private caching | 3 |
| `/api/travel-transcribe`, 20 second call, 600 characters, ten a minute, 26 second function, 503 and 502, never logged | 4 |
| `/api/travel-postcard` PUT and DELETE with both refusals, file deletes that cannot fail the request | 6, 7 |
| `/api/travel-places` returns `address` | 5 |
| `redactTrip` adds `postcard`, private stops dropped whole (including from `last_checkin`, which names a private stop today) | 8 |
| One shared share-token helper | 2 |
| Data: `posted_at` set by the server, `photo_id` mirrored, safe time unchanged, older photos read as postcards | 6, 7, 8 |
