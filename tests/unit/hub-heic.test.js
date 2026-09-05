import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureWebImage, isHeicLike } from '../../packages/design-kit/js/hub-heic.js';

test('isHeicLike detects type and extension', () => {
  assert.equal(isHeicLike(new File([], 'a.heic', { type: 'image/heic' })), true);
  assert.equal(isHeicLike(new File([], 'a.HEIF', { type: '' })), true);
  assert.equal(isHeicLike(new File([], 'a.jpg', { type: 'image/jpeg' })), false);
  assert.equal(isHeicLike(null), false);
});

test('ensureWebImage passes non-HEIC through', async () => {
  const file = new File(['x'], 'shot.png', { type: 'image/png' });
  const result = await ensureWebImage(file);
  assert.equal(result.converted, false);
  assert.equal(result.method, 'passthrough');
  assert.equal(result.file, file);
});

test('ensureWebImage uses native then LGPL injectables', async () => {
  const heic = new File(['heic'], 'phone.heic', { type: 'image/heic' });
  const jpeg = new File(['jpeg'], 'phone.jpg', { type: 'image/jpeg' });

  const native = await ensureWebImage(heic, {
    convertNatively: async () => jpeg,
    convertWithLgpl: async () => {
      throw new Error('should not run');
    }
  });
  assert.equal(native.method, 'native');
  assert.equal(native.file, jpeg);

  const lgpl = await ensureWebImage(heic, {
    convertNatively: async () => null,
    convertWithLgpl: async () => jpeg
  });
  assert.equal(lgpl.method, 'lgpl');
  assert.equal(lgpl.file, jpeg);
});

test('ensureWebImage can refuse LGPL fallback', async () => {
  const heic = new File(['heic'], 'phone.heic', { type: 'image/heic' });
  await assert.rejects(
    () =>
      ensureWebImage(heic, {
        enableLgplConverter: false,
        convertNatively: async () => null
      }),
    /HEIC|LGPL|heic-to/
  );
});
