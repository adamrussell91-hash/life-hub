import test from 'node:test';
import assert from 'node:assert/strict';
import { animateAreaReveal } from '../../js/app/chart-kit/animate.js';

test('animateAreaReveal clears stroke dash after animationend so the solid line stays visible', () => {
  const listeners = [];
  const line = {
    style: { strokeDasharray: '', strokeDashoffset: '' },
    getTotalLength: () => 100,
    addEventListener(type, fn) { listeners.push({ type, fn }); }
  };
  const svg = {
    classList: {
      items: new Set(),
      remove(...names) { for (const n of names) this.items.delete(n); },
      add(name) { this.items.add(name); }
    },
    getBoundingClientRect() { return {}; },
    querySelector(sel) { return sel.includes('line') ? line : null; }
  };
  animateAreaReveal(svg, { reducedMotion: false });
  assert.equal(line.style.strokeDasharray, '100');
  assert.equal(line.style.strokeDashoffset, '100');
  const end = listeners.find(l => l.type === 'animationend');
  assert.ok(end);
  end.fn({ target: line, animationName: 'line-draw' });
  assert.equal(line.style.strokeDasharray, '');
  assert.equal(line.style.strokeDashoffset, '');
});

test('animateAreaReveal jumps to the final line when reduced motion is set', () => {
  const line = {
    style: { strokeDasharray: '', strokeDashoffset: '' },
    getTotalLength: () => 80,
    addEventListener() {}
  };
  const svg = {
    classList: {
      items: new Set(),
      remove(...names) { for (const n of names) this.items.delete(n); },
      add(name) { this.items.add(name); }
    },
    getBoundingClientRect() { return {}; },
    querySelector(sel) { return sel.includes('line') ? line : null; }
  };
  animateAreaReveal(svg, { reducedMotion: true });
  assert.equal(line.style.strokeDasharray, '');
  assert.equal(line.style.strokeDashoffset, '');
  assert.equal(svg.classList.items.has('chart-static'), true);
});
