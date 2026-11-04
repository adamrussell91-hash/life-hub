import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  STALE_ENTRY_GUARD,
  injectStaleEntryGuard,
  staleEntryGuardHash
} from '../../scripts/lib/stale-entry-guard.mjs';

const ORIGIN = 'https://hub.example';

function runGuard({ readyState = 'interactive', stored = null, storageThrows = false } = {}) {
  const calls = { reloads: 0, fetches: [], delays: [], appended: [] };
  const store = new Map(stored ? [['life-hub:stale-entry-reload', stored]] : []);
  let onError;
  const makeEl = () => ({
    style: {},
    setAttribute() {},
    appendChild() {},
    addEventListener() {}
  });
  const context = {
    window: { addEventListener: (_type, fn) => { onError = fn; } },
    document: {
      readyState,
      body: { appendChild: el => calls.appended.push(el) },
      createElement: makeEl,
      addEventListener() {}
    },
    location: { origin: ORIGIN, href: `${ORIGIN}/teaching/`, reload: () => { calls.reloads += 1; } },
    sessionStorage: {
      getItem(key) {
        if (storageThrows) throw new Error('blocked');
        return store.get(key) ?? null;
      },
      setItem(key, value) { store.set(key, value); },
      removeItem(key) { store.delete(key); }
    },
    fetch(url, options) {
      calls.fetches.push({ url, options });
      return { then: (ok) => ok() };
    },
    setTimeout(fn, ms) {
      calls.delays.push(ms);
      fn();
    },
    Date,
    JSON
  };
  vm.runInNewContext(STALE_ENTRY_GUARD, context);
  return { calls, store, fail: (target) => onError({ target }) };
}

const bundle = { tagName: 'SCRIPT', src: `${ORIGIN}/teaching/assets/index-OLD.js` };

test('a missing main bundle refetches the page past the cache, then reloads', () => {
  const { calls, fail } = runGuard();
  fail(bundle);
  assert.equal(calls.fetches.length, 1);
  assert.equal(calls.fetches[0].url, `${ORIGIN}/teaching/`);
  assert.equal(calls.fetches[0].options.cache, 'reload');
  assert.equal(calls.reloads, 1);
});

test('a missing stylesheet recovers the same way', () => {
  const { calls, fail } = runGuard();
  fail({ tagName: 'LINK', href: `${ORIGIN}/teaching/assets/index-OLD.css` });
  assert.equal(calls.reloads, 1);
});

test('two failures on one page reload once', () => {
  const { calls, fail } = runGuard();
  fail(bundle);
  fail({ tagName: 'LINK', href: `${ORIGIN}/teaching/assets/index-OLD.css` });
  assert.equal(calls.reloads, 1);
});

test('it ignores failures that cannot blank the page', () => {
  const { calls, fail } = runGuard();
  fail({ tagName: 'IMG', src: `${ORIGIN}/assets/agents/clare.png` });
  fail({ tagName: 'LINK', href: `${ORIGIN}/assets/icon.png` });
  fail({ tagName: 'SCRIPT', src: 'https://elsewhere.example/assets/index.js' });
  fail({ tagName: 'SCRIPT', src: `${ORIGIN}/packages/design-kit/js/thing.js` });
  assert.equal(calls.reloads, 0);
});

test('after the page has loaded it leaves failed chunks to stale-chunk-reload', () => {
  const { calls, fail } = runGuard({ readyState: 'complete' });
  fail(bundle);
  assert.equal(calls.reloads, 0);
});

test('a retry during a rollout waits longer each time', () => {
  const stored = JSON.stringify({ at: Date.now(), tries: 2 });
  const { calls, fail } = runGuard({ stored });
  fail(bundle);
  assert.deepEqual(calls.delays, [6000]);
  assert.equal(calls.reloads, 1);
});

test('after three tries it shows a message and stops reloading', () => {
  const stored = JSON.stringify({ at: Date.now(), tries: 3 });
  const { calls, fail } = runGuard({ stored });
  fail(bundle);
  assert.equal(calls.reloads, 0);
  assert.equal(calls.appended.length, 1);
});

test('old tries expire, so the next deploy recovers on its own', () => {
  const stored = JSON.stringify({ at: Date.now() - 600000, tries: 3 });
  const { calls, fail } = runGuard({ stored });
  fail(bundle);
  assert.equal(calls.reloads, 1);
  assert.deepEqual(calls.delays, [0]);
});

test('without sessionStorage it never reload-loops', () => {
  const { calls, fail } = runGuard({ storageThrows: true });
  fail(bundle);
  assert.equal(calls.reloads, 0);
  assert.equal(calls.appended.length, 1);
});

const page = (scriptSrc) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src ${scriptSrc}; object-src 'none'" />
    <script type="module" crossorigin src="/teaching/assets/index-NEW.js"></script>
  </head>
  <body></body>
</html>`;

test('the guard runs before the bundle tag', () => {
  const html = injectStaleEntryGuard(page("'self' 'unsafe-inline' https:"));
  assert.ok(html.indexOf(STALE_ENTRY_GUARD) < html.indexOf('index-NEW.js'));
});

test('a hash-based CSP gains the guard hash and keeps its own', () => {
  const html = injectStaleEntryGuard(page("'self' 'sha256-existing=' 'wasm-unsafe-eval'"));
  assert.ok(html.includes(
    `script-src 'self' 'sha256-existing=' 'wasm-unsafe-eval' ${staleEntryGuardHash()};`
  ));
});

test("an 'unsafe-inline' CSP gains no hash, which would switch it off", () => {
  const html = injectStaleEntryGuard(page("'self' 'unsafe-inline' https:"));
  assert.ok(!html.includes(staleEntryGuardHash()));
  assert.ok(html.includes("script-src 'self' 'unsafe-inline' https:;"));
});

test('injecting twice changes nothing', () => {
  const once = injectStaleEntryGuard(page("'self' 'sha256-existing='"));
  assert.equal(injectStaleEntryGuard(once), once);
});

test('built HTML without a head fails the build', () => {
  assert.throws(() => injectStaleEntryGuard('<html></html>'), /no <head>/);
});
