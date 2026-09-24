/**
 * Re-export of the shared hub motion engine.
 * Implementation: packages/design-kit/js/hub-motion-engine.js
 */
export {
  MOTION,
  cubicBezier,
  EASE,
  OVERSHOOT,
  LINEAR,
  createMotion,
  reconcile
} from '../../../../packages/design-kit/js/hub-motion-engine.js';

export type {
  Props,
  Easing,
  Clock,
  TweenOptions,
  MotionStats,
  MotionEngine,
  MotionOptions
} from '../../../../packages/design-kit/js/hub-motion-engine.js';
