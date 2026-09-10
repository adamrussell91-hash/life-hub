import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDocumentFromImage } from '../../packages/design-kit/js/hub-doc-scan.js';

test('scanDocumentFromImage returns original when jscanify is unavailable', async () => {
  const input = new File([Uint8Array.of(1, 2, 3)], 'doc.png', { type: 'image/png' });
  const result = await scanDocumentFromImage(input, {
    loadOpenCv: async () => ({ Mat: class {} }),
    loadJscanify: async () => ({})
  });
  assert.equal(result.scanned, false);
  assert.equal(result.reason, 'jscanify-unavailable');
  assert.equal(result.blob, input);
});

test('scanDocumentFromImage warps when extractPaper returns a canvas', async () => {
  const input = new File([Uint8Array.of(9)], 'paper.jpg', { type: 'image/jpeg' });
  const fakeCanvas = {
    width: 40,
    height: 60,
    toBlob(cb, type, quality) {
      assert.equal(type, 'image/jpeg');
      assert.ok(quality > 0);
      cb(new Blob(['scanned'], { type: 'image/jpeg' }));
    }
  };

  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext() {
          return { drawImage() {} };
        },
        toBlob(cb) {
          cb(new Blob(['fallback'], { type: 'image/jpeg' }));
        }
      };
    }
  };
  globalThis.createImageBitmap = async () => ({
    width: 100,
    height: 120,
    close() {}
  });

  try {
    const result = await scanDocumentFromImage(input, {
      loadOpenCv: async () => ({ Mat: class {} }),
      loadJscanify: async () =>
        function Scanner() {
          this.extractPaper = () => fakeCanvas;
        }
    });
    assert.equal(result.scanned, true);
    assert.equal(result.width, 40);
    assert.equal(result.height, 60);
    assert.equal(result.blob.type, 'image/jpeg');
  } finally {
    delete globalThis.document;
    delete globalThis.createImageBitmap;
  }
});
