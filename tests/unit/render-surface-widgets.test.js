import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSurfaceWidgets } from '../../js/app/render-surface-widgets.js';

class FakeEl {
  constructor() {
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.style = { setProperty: () => {} };
    this.attributes = {};
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector() { return null; }
}

function widgetRoot() {
  const nodes = new Map();
  const ensure = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new FakeEl());
    return nodes.get(selector);
  };
  return {
    nodes,
    createElement: () => new FakeEl(),
    querySelector(selector) { return ensure(selector); }
  };
}

test('renderSurfaceWidgets hides section when no widgets are ready', () => {
  const root = widgetRoot();
  renderSurfaceWidgets(root, { status: 'ready', widgets: [] });
  assert.equal(root.nodes.get('#fitness-surface-widgets').hidden, true);
});

test('renderSurfaceWidgets renders challenge-progress cards', () => {
  const root = widgetRoot();
  renderSurfaceWidgets(root, {
    status: 'ready',
    widgets: [{
      template_id: 'challenge-progress',
      title: 'No sugar',
      props: { title: 'No sugar week', progress_pct: 65, subtitle: 'Day 4' }
    }]
  });
  const rail = root.nodes.get('#fitness-surface-widgets-rail');
  assert.equal(rail.children.length, 1);
  assert.match(rail.children[0].className, /surface-widget-card--challenge/);
  assert.equal(root.nodes.get('#fitness-surface-widgets').hidden, false);
});
