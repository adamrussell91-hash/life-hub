import test from 'node:test';
import assert from 'node:assert/strict';
import { attachVisualViewportInset, detachVisualViewportInset } from '../../apps/life/js/app/visual-viewport.js';

test('attachVisualViewportInset writes CSS variables from visualViewport metrics', () => {
  const style = new Map();
  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (name, value) => style.set(name, value),
        removeProperty: name => style.delete(name)
      }
    },
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.innerHeight = 800;
  globalThis.visualViewport = {
    offsetTop: 12,
    height: 420,
    addEventListener() {},
    removeEventListener() {}
  };

  attachVisualViewportInset();
  assert.equal(style.get('--vv-offset-top'), '12px');
  assert.equal(style.get('--vv-height'), '420px');
  assert.equal(style.get('--vv-offset-bottom'), '368px');

  detachVisualViewportInset();
  assert.equal(style.has('--vv-offset-top'), false);
});
