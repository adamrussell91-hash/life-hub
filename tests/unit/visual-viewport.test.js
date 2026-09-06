import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachVisualViewportInset,
  detachVisualViewportInset,
  VV_KEYBOARD_OPEN_PX
} from '../../apps/life/js/app/visual-viewport.js';

function mockDocument() {
  const style = new Map();
  const classList = {
    values: new Set(),
    toggle(name, force) {
      if (force) this.values.add(name);
      else this.values.delete(name);
    },
    remove(name) {
      this.values.delete(name);
    },
    contains(name) {
      return this.values.has(name);
    }
  };
  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (name, value) => style.set(name, value),
        removeProperty: name => style.delete(name)
      },
      classList
    },
    addEventListener() {},
    removeEventListener() {}
  };
  return { style, classList };
}

test('attachVisualViewportInset writes CSS variables from visualViewport metrics', () => {
  const { style, classList } = mockDocument();
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
  assert.equal(classList.contains('vv-keyboard-open'), true);

  detachVisualViewportInset();
  assert.equal(style.has('--vv-offset-top'), false);
  assert.equal(classList.contains('vv-keyboard-open'), false);
});

test('vv-keyboard-open stays off when the visual viewport barely shrinks', () => {
  const { classList } = mockDocument();
  globalThis.innerHeight = 800;
  globalThis.visualViewport = {
    offsetTop: 0,
    height: 800 - (VV_KEYBOARD_OPEN_PX - 1),
    addEventListener() {},
    removeEventListener() {}
  };

  attachVisualViewportInset();
  assert.equal(classList.contains('vv-keyboard-open'), false);
  detachVisualViewportInset();
});
