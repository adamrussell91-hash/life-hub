import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_SESSION_KEY,
  readBandSession,
  writeBandSession
} from '../../apps/life/js/app/render-tideline.js';

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem: key => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; },
    snapshot: () => ({ ...data })
  };
}

test('tideline band session reads and writes life.calendar.band', () => {
  const previous = globalThis.sessionStorage;
  const store = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: store, configurable: true });
  try {
    assert.equal(readBandSession(), null);
    writeBandSession(1);
    assert.equal(store.getItem(BAND_SESSION_KEY), '1');
    assert.equal(readBandSession(), 1);
    writeBandSession(null);
    assert.equal(store.getItem(BAND_SESSION_KEY), null);
    assert.equal(readBandSession(), null);
    store.setItem(BAND_SESSION_KEY, 'none');
    assert.equal(readBandSession(), null);
    store.setItem(BAND_SESSION_KEY, '3');
    assert.equal(readBandSession(), 3);
  } finally {
    if (previous === undefined) delete globalThis.sessionStorage;
    else Object.defineProperty(globalThis, 'sessionStorage', { value: previous, configurable: true });
  }
});
