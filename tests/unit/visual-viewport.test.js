import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachVisualViewportInset,
  detachVisualViewportInset,
  notifyChatViewport,
  VV_HEIGHT_STICK_PX,
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
  const busyView = { classList: { contains: () => false } };
  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (name, value) => style.set(name, value),
        getPropertyValue: name => style.get(name) ?? '',
        removeProperty: name => style.delete(name)
      },
      classList
    },
    activeElement: { closest: () => null },
    querySelector(selector) {
      if (selector === '.chat-view.is-busy') return busyView.classList.contains() ? busyView : null;
      return null;
    },
    addEventListener(type, fn) {
      docListeners.set(type, fn);
    },
    removeEventListener(type) {
      docListeners.delete(type);
    }
  };
  return { style, classList, docListeners, busyView };
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

test('visualViewport jitter smaller than the stick threshold does not rewrite --vv-height', () => {
  const { style } = mockDocument();
  const vvListeners = new Map();
  globalThis.innerHeight = 844;
  mockVisualViewport({ height: 844, listeners: vvListeners });

  attachVisualViewportInset();
  assert.equal(style.get('--vv-height'), '844px');

  globalThis.visualViewport.height = 844 - (VV_HEIGHT_STICK_PX - 4);
  vvListeners.get('resize')();
  assert.equal(style.get('--vv-height'), '844px', '12px iOS jitter must not resize the Chat canvas');

  globalThis.visualViewport.height = 480;
  vvListeners.get('resize')();
  assert.equal(style.get('--vv-height'), '480px', 'a real keyboard shrink must still land');
  detachVisualViewportInset();
});

test('an in-flight Chat turn keeps keyboard mode after the composer blurs', async () => {
  const { classList, docListeners, busyView } = mockDocument();
  globalThis.innerHeight = 844;
  mockVisualViewport({ height: 844 });

  attachVisualViewportInset();
  docListeners.get('focusin')({
    target: { closest: selector => (selector.includes('chat-form') ? {} : null) }
  });
  assert.equal(classList.contains('vv-keyboard-open'), true);

  busyView.classList.contains = () => true;
  globalThis.document.activeElement = { closest: () => null };
  docListeners.get('focusout')({
    target: { closest: selector => (selector.includes('chat-form') ? {} : null) }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  notifyChatViewport();
  assert.equal(
    classList.contains('vv-keyboard-open'),
    true,
    'busy Chat must keep reading-room chrome while the reply streams'
  );

  busyView.classList.contains = () => false;
  notifyChatViewport();
  assert.equal(
    classList.contains('vv-keyboard-open'),
    false,
    'keyboard mode clears once the turn ends and focus is outside the form'
  );
  detachVisualViewportInset();
});
