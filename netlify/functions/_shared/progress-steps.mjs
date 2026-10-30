/**
 * The two ladders a piece is placed on. Outcomes and concepts use steps that
 * describe how secure the learning is; skills use the HSC skills continuum's
 * rungs. Secure is the standard. Names are what students read.
 */
export const STEPS = ['starting', 'building', 'secure', 'extending'];
export const RUNGS = ['below', 'capable', 'skilled', 'accomplished', 'excellent'];

const NAMES = {
  starting: 'Starting', building: 'Building', secure: 'Secure', extending: 'Extending',
  below: 'On the way to Capable', capable: 'Capable', skilled: 'Skilled', accomplished: 'Accomplished', excellent: 'Excellent'
};
export const stepName = (id) => NAMES[id] ?? '';

/** Matches the evidence constants: weak below 0.5, secure from 0.8. */
export function stepForShare(share) {
  if (!Number.isFinite(share) || share < 0) return null;
  const s = share + 1e-9;
  if (s >= 0.9) return 'extending';
  if (s >= 0.8) return 'secure';
  if (s >= 0.5) return 'building';
  return 'starting';
}

/** Matches RUNG_THRESHOLDS in apps/teaching/src/skills/model.ts. */
export function rungForShare(share) {
  if (!Number.isFinite(share) || share < 0) return null;
  const s = share + 1e-9;
  if (s >= 0.95) return 'excellent';
  if (s >= 0.85) return 'accomplished';
  if (s >= 0.75) return 'skilled';
  if (s >= 0.65) return 'capable';
  return 'below';
}

export const ladderFor = (id) => (STEPS.includes(id) ? STEPS : RUNGS);
export const rankOf = (id) => ladderFor(id).indexOf(id);
export const lowerOf = (a, b) => (rankOf(a) <= rankOf(b) ? a : b);
export const isTop = (id) => id === 'extending' || id === 'excellent';
export const isStep = (id) => STEPS.includes(id);
export const isRung = (id) => RUNGS.includes(id);
