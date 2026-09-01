import { buildRingTarget } from './chart-kit/ring.js';

export function buildCompletionRing({ complete, total }, options = {}) {
  return buildRingTarget({ value: complete, target: total }, options);
}
