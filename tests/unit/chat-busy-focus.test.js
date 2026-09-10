import test from 'node:test';
import assert from 'node:assert/strict';
import { setChatBusy } from '../../apps/life/js/app/render-chat.js';

// Disabling the focused Send/Stop button used to hand focus to a readOnly
// composer. iOS keeps that focus (and shows AutoFill) without opening the
// keyboard; tapping an already-focused field never reopens it. Busy chrome is
// held by .chat-view.is-busy → visual-viewport chatViewBusy(), so blur is safe.

class FakeButton {
  constructor() {
    this.disabled = false;
    this.hidden = false;
    this.blurred = false;
  }

  blur() {
    this.blurred = true;
    if (globalThis.document?.activeElement === this) {
      globalThis.document.activeElement = { tagName: 'BODY' };
    }
  }
}

class FakeInput {
  constructor() {
    this.readOnly = false;
    this.disabled = false;
    this.focused = false;
    this.blurred = false;
  }

  focus() {
    this.focused = true;
    globalThis.document.activeElement = this;
  }

  blur() {
    this.blurred = true;
    this.focused = false;
    if (globalThis.document?.activeElement === this) {
      globalThis.document.activeElement = { tagName: 'BODY' };
    }
  }
}

function makeRoot({ input, button, stop, view }) {
  return {
    querySelector(selector) {
      if (selector === '#chat-input') return input;
      if (selector === '#chat-send') return button;
      if (selector === '#chat-stop') return stop;
      if (selector === '#chat-view') return view;
      return null;
    }
  };
}

test('setChatBusy blurs Send instead of trapping focus on a readOnly composer', () => {
  const input = new FakeInput();
  const button = new FakeButton();
  const stop = new FakeButton();
  const view = { classList: { add() {}, remove() {}, contains: () => false } };
  const root = makeRoot({ input, button, stop, view });

  globalThis.document = { activeElement: button };
  setChatBusy(root, true);

  assert.equal(button.blurred, true, 'Send must blur before it is disabled');
  assert.equal(input.focused, false, 'must not focus a readOnly composer');
  assert.equal(input.readOnly, true);
  assert.equal(button.disabled, true);
});

test('setChatBusy blurs the composer when it already holds focus at send time', () => {
  const input = new FakeInput();
  const button = new FakeButton();
  const stop = new FakeButton();
  const view = { classList: { add() {}, remove() {}, contains: () => false } };
  const root = makeRoot({ input, button, stop, view });

  globalThis.document = { activeElement: input };
  setChatBusy(root, true);

  assert.equal(input.blurred, true, 'Enter-to-send must release focus so the next tap can open the keyboard');
  assert.equal(input.readOnly, true);
});

test('setChatBusy clears readOnly when the turn ends', () => {
  const input = new FakeInput();
  const button = new FakeButton();
  const stop = new FakeButton();
  const view = { classList: { add() {}, remove() {}, contains: () => false } };
  const root = makeRoot({ input, button, stop, view });

  globalThis.document = { activeElement: stop };
  setChatBusy(root, false);

  assert.equal(stop.blurred, true);
  assert.equal(input.readOnly, false);
  assert.equal(stop.disabled, true);
});
