/** Shared MorphingDialog — spring FLIP from a micro card to a larger view. */

export function prefersReducedMotion(root?: Document | ParentNode): boolean;

export function tagTriggerMorph(trigger: Element | null | undefined): void;

export type MorphSpring = {
  stiffness?: number;
  damping?: number;
  mass?: number;
};

export type MorphingDialogHandle = {
  close: () => void;
  backdrop: HTMLElement | null;
  frame: HTMLElement;
};

export function openMorphingDialog(options: {
  trigger?: Element | null;
  frame: HTMLElement;
  backdropClass?: string;
  closeButton?: boolean;
  labelledBy?: string;
  label?: string;
  onRequestClose?: () => void;
  onClose?: () => void;
  spring?: MorphSpring;
}): MorphingDialogHandle;

export function runMorphTransform(options: {
  from?: Element | null;
  update: () => void;
  to?: () => Element | null;
  guard?: { current: boolean };
  spring?: MorphSpring;
}): void;

export function morphFromRect(
  first: { left: number; top: number; width: number; height: number; radius?: number } | null,
  target: HTMLElement | null
): void;

export function closeActiveMorphingDialog(): void;

export function resetMorphingDialogForTests(): void;

export function morphingDialogIsOpen(): boolean;
