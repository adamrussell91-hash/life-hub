export function prefersReducedMotion(root?: Document | ParentNode): boolean;

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
