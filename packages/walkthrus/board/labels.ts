// packages/walkthrus/board/labels.ts
// How much text the board shows at a zoom level: far out only the cluster labels, closer in the
// series tabs, closer still the bold titles. Hysteresis keeps a label from flickering on the edge.

export type LabelLevel = 'clusters' | 'tabs' | 'full';

const TABS_AT = 0.45;
const FULL_AT = 0.85;
const HYSTERESIS = 0.06;

export function labelLevel(scale: number, previous: LabelLevel | null = null): LabelLevel {
  const up = (edge: number, was: boolean): boolean => scale >= edge - (was ? HYSTERESIS : 0);
  const full = up(FULL_AT, previous === 'full');
  if (full) return 'full';
  return up(TABS_AT, previous === 'tabs' || previous === 'full') ? 'tabs' : 'clusters';
}
