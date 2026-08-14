import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRingTarget } from '../../js/app/chart-kit/apply-ring.js';
import { buildRingTarget } from '../../js/app/chart-kit/ring.js';

function makeSvg() {
  const fillOffsets = [];
  const fill = {
    style: {},
    setAttribute(name, value) {
      if (name === 'stroke-dashoffset') fillOffsets.push(String(value));
    },
    getBoundingClientRect() { return {}; }
  };
  const track = { setAttribute() {} };
  return {
    fillOffsets,
    dataset: {},
    querySelector(selector) {
      if (selector.includes('fill')) return fill;
      if (selector.includes('track')) return track;
      return null;
    }
  };
}

test('applyRingTarget does not replay the empty-to-fill animation when value and target are unchanged', () => {
  const svg = makeSvg();
  const config = { value: 800, target: 1900 };
  const options = { size: 72, strokeWidth: 7, reducedMotion: false };
  const ring = buildRingTarget(config, options);

  applyRingTarget(svg, config, options);
  assert.deepEqual(svg.fillOffsets, [String(ring.circumference), String(ring.dashoffset)]);

  svg.fillOffsets.length = 0;
  applyRingTarget(svg, config, options);
  assert.deepEqual(svg.fillOffsets, [String(ring.dashoffset)]);
});

test('applyRingTarget replays the fill animation when the ring value changes', () => {
  const svg = makeSvg();
  const options = { size: 72, strokeWidth: 7, reducedMotion: false };

  applyRingTarget(svg, { value: 800, target: 1900 }, options);
  svg.fillOffsets.length = 0;

  const next = { value: 1200, target: 1900 };
  const ring = buildRingTarget(next, options);
  applyRingTarget(svg, next, options);
  assert.deepEqual(svg.fillOffsets, [String(ring.circumference), String(ring.dashoffset)]);
});
