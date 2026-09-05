export const DEFAULT_SCROLL_HIDE_THRESHOLD: number;

export function prefersReducedMotion(root?: Document | ParentNode): boolean;

export function nextScrollHideState(input: {
  current: number;
  previous?: number;
  threshold?: number;
  hidden?: boolean;
}): boolean;

export function resolveScrollHideScroller(
  el: Element,
  root?: Document | ParentNode
): EventTarget;

export function applyHubScrollHide(
  el: Element,
  scroll?: { current: number; previous?: number; threshold?: number }
): boolean;

export function parseCountable(text: string | null | undefined): {
  value: number;
  format: (n: number) => string;
} | null;

export function startHubMotion(root?: Document | ParentNode): void;

export function isActiveHubPill(btn: Element | null | undefined): boolean;

export function hubPillsButtons(group: Element): Element[];

export function applyHubPillsThumb(
  group: Element,
  options?: { animate?: boolean; reduced?: boolean }
): { x: string; y: string; w: string; h: string } | null;

export function resetHubMotionForTests(): void;
