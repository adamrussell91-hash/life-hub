/**
 * Pure key resolution for annotation interactive view (slice 3b).
 * Arrow keys step a focused thread. Layer visibility is the tick chips.
 */

export type AnnotationKeyAction =
  | { type: 'close_panel' }
  | { type: 'exit_focus' }
  | { type: 'step_thread'; delta: -1 | 1 };

export type AnnotationKeyInput = {
  key: string;
  /** Thread focus active. */
  focusThreadId: string | null;
  panelOpen: boolean;
  isTextControl: boolean;
};

/** Resolve a keydown into at most one action. Returns null when ignored. */
export function resolveAnnotationKey(input: AnnotationKeyInput): AnnotationKeyAction | null {
  if (input.isTextControl) return null;

  if (input.key === 'Escape') {
    if (input.panelOpen) return { type: 'close_panel' };
    if (input.focusThreadId) return { type: 'exit_focus' };
    return null;
  }

  if (!input.focusThreadId) return null;

  switch (input.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return { type: 'step_thread', delta: -1 };
    case 'ArrowRight':
    case 'ArrowUp':
      return { type: 'step_thread', delta: 1 };
    default:
      return null;
  }
}

export function clampStepIndex(index: number, stopCount: number): number {
  if (stopCount <= 0) return 0;
  return Math.max(0, Math.min(index, stopCount - 1));
}

/** Advance step-through index; starts at 0 when stepping begins. */
export function stepThreadIndex(
  stepIndex: number | null,
  stopCount: number,
  delta: -1 | 1
): number {
  if (stopCount <= 0) return 0;
  if (stepIndex == null) return delta > 0 ? 0 : stopCount - 1;
  return clampStepIndex(stepIndex + delta, stopCount);
}
