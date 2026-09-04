export function prefersReducedMotion(root?: Document | ParentNode): boolean;

export function parseCountable(text: string | null | undefined): {
  value: number;
  format: (n: number) => string;
} | null;

export function startHubMotion(root?: Document | ParentNode): void;

export function resetHubMotionForTests(): void;
