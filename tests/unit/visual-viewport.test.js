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
  const docListeners = new Map();
  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (name, value) => style.set(name, value),
        removeProperty: name => style.delete(name)
      },
      classList
    },
    addEventListener(type, fn) {
      docListeners.set(type, fn);
    },
    removeEventListener(type) {
      docListeners.delete(type);
    }
  };
  return { style, classList, docListeners };
}

function mockVisualViewport({ offsetTop = 0, height, listeners }) {
  globalThis.visualViewport = {
    offsetTop,
    height,
    addEventListener(type, fn) {
      listeners?.set(type, fn);
    },
    removeEventListener(type) {
      listeners?.delete(type);
    }
  };
}

test('attachVisualViewportInset writes CSS variables from visualViewport metrics', () => {
  const { style, classList } = mockDocument();
  globalThis.innerHeight = 800;
  mockVisualViewport({ offsetTop: 12, height: 420 });

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
  mockVisualViewport({ height: 800 - (VV_KEYBOARD_OPEN_PX - 1) });

  attachVisualViewportInset();
  assert.equal(classList.contains('vv-keyboard-open'), false);
  detachVisualViewportInset();
});

test('vv-keyboard-open flips from closed baseline when iOS shrinks innerHeight with the keyboard', () => {
  const { classList } = mockDocument();
  const vvListeners = new Map();
  globalThis.innerHeight = 844;
  mockVisualViewport({ height: 844, listeners: vvListeners });

  attachVisualViewportInset();
  assert.equal(classList.contains('vv-keyboard-open'), false);

  // iOS: both innerHeight and vv.height collapse — classic inset≈0 trap.
  globalThis.innerHeight = 480;
  globalThis.visualViewport.height = 480;
  const onResize = vvListeners.get('resize');
  assert.equal(typeof onResize, 'function');
  onResize();

  assert.equal(
    classList.contains('vv-keyboard-open'),
    true,
    'must detect keyboard from baseline shrink when inset stays ~0'
  );
  detachVisualViewportInset();
});

test('composer focus forces vv-keyboard-open even when inset math is zero', () => {
  const { classList, docListeners } = mockDocument();
  globalThis.innerHeight = 480;
  mockVisualViewport({ height: 480 });

  attachVisualViewportInset();
  assert.equal(classList.contains('vv-keyboard-open'), false, 'geometry alone must not false-positive at rest');

  const focusin = docListeners.get('focusin');
  assert.equal(typeof focusin, 'function');
  focusin({
    target: {
      closest(selector) {
        return selector.includes('chat-form') ? {} : null;
      }
    }
  });
  assert.equal(
    classList.contains('vv-keyboard-open'),
    true,
    'focusing the composer must open keyboard mode even when inset≈0'
  );
  detachVisualViewportInset();
});
