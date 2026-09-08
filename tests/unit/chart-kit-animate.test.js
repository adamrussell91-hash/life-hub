import test from 'node:test';
import assert from 'node:assert/strict';
import { animateAreaReveal, animateRingFill, settleMetricRings } from '../../apps/life/js/app/chart-kit/animate.js';

test('animateAreaReveal clears stroke dash after animationend so the solid line stays visible', () => {
  const listeners = [];
  const line = {
    style: { strokeDasharray: '', strokeDashoffset: '' },
    getTotalLength: () => 100,
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const index = listeners.findIndex(entry => entry.type === type && entry.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    }
  };
  const svg = {
    classList: {
      items: new Set(),
      remove(...names) { for (const n of names) this.items.delete(n); },
      add(name) { this.items.add(name); },
      contains(name) { return this.items.has(name); }
    },
    getBoundingClientRect() { return {}; },
    querySelector(sel) { return sel.includes('line') ? line : null; }
  };
  animateAreaReveal(svg, { reducedMotion: false, settleMs: 0 });
  assert.equal(line.style.strokeDasharray, '100');
  assert.equal(line.style.strokeDashoffset, '100');
  const end = listeners.find(l => l.type === 'animationend');
  assert.ok(end);
  end.fn({ target: line, animationName: 'line-draw' });
  assert.equal(line.style.strokeDasharray, '');
  assert.equal(line.style.strokeDashoffset, '');
  assert.equal(svg.classList.items.has('chart-animating'), false);
  assert.equal(svg.classList.items.has('chart-static'), true);
});

test('animateAreaReveal settles to chart-static when animationend never fires', async () => {
  const line = {
    style: { strokeDasharray: '', strokeDashoffset: '' },
    getTotalLength: () => 64,
    addEventListener() {},
    removeEventListener() {}
  };
  const svg = {
    classList: {
      items: new Set(),
      remove(...names) { for (const n of names) this.items.delete(n); },
      add(name) { this.items.add(name); },
      contains(name) { return this.items.has(name); }
    },
    getBoundingClientRect() { return {}; },
    querySelector(sel) { return sel.includes('line') ? line : null; }
  };
  animateAreaReveal(svg, { reducedMotion: false, settleMs: 20 });
  assert.equal(svg.classList.items.has('chart-animating'), true);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(line.style.strokeDasharray, '');
  assert.equal(line.style.strokeDashoffset, '');
  assert.equal(svg.classList.items.has('chart-animating'), false);
  assert.equal(svg.classList.items.has('chart-static'), true);
});

test('animateAreaReveal skips the draw-in when quiet is set', () => {
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
  animateAreaReveal(svg, { quiet: true });
  assert.equal(line.style.strokeDasharray, '');
  assert.equal(line.style.strokeDashoffset, '');
  assert.equal(svg.classList.items.has('chart-static'), true);
  assert.equal(svg.classList.items.has('chart-animating'), false);
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

test('animateRingFill stamps data-ring-dashoffset and settleMetricRings restores a frozen empty ring', () => {
  const circle = {
    style: { transition: '' },
    dataset: {},
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; },
    getBoundingClientRect() { return {}; }
  };
  animateRingFill(circle, { circumference: 100, dashoffset: 40 }, { quiet: false, reducedMotion: false });
  assert.equal(circle.dataset.ringDashoffset, '40');
  // Mid-flight freeze: empty ring while the meal macros already show on Home.
  circle.setAttribute('stroke-dashoffset', '100');
  assert.equal(circle.getAttribute('stroke-dashoffset'), '100');

  settleMetricRings({ querySelectorAll() { return [circle]; } });
  assert.equal(circle.getAttribute('stroke-dashoffset'), '40');
  assert.equal(circle.style.transition, 'none');
});

test('settleMetricRings recovers when attribute already matches the stamp but the used value is frozen empty', () => {
  const reads = [];
  const circle = {
    style: { transition: '' },
    dataset: { ringDashoffset: '40' },
    attrs: { 'stroke-dasharray': '100', 'stroke-dashoffset': '40' },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; },
    getBoundingClientRect() {
      reads.push(this.attrs['stroke-dashoffset']);
      return {};
    }
  };
  // CSS transition was cancelled after JS had already written the target attribute.
  settleMetricRings({ querySelectorAll() { return [circle]; } });
  assert.deepEqual(reads, ['100']);
  assert.equal(circle.getAttribute('stroke-dashoffset'), '40');
  assert.equal(circle.style.transition, 'none');
});
