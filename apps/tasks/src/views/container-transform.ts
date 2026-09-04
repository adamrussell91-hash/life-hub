import { runMorphTransform } from '../../design-kit/js/morphing-dialog.js';

/** Spring FLIP wrapper — same MorphingDialog motion as every other hub. */
export function runContainerTransform(
  update: () => void,
  guard?: { current: boolean },
  from?: Element | null,
  to?: () => Element | null
): void {
  runMorphTransform({ from: from ?? null, update, to, guard });
}

export function cardTransitionName(id: string): string {
  return `hub-card-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
