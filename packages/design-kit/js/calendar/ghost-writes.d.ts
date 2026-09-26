export const GHOST_AGENTS: Readonly<Record<string, string>>;
export const GHOST_KINDS: readonly string[];
export function validateGhost(ghost: unknown): void;
export function acceptPlan(ghost: unknown): { steps: unknown[]; receipt: string };
export function dismissPlan(ghost: unknown): { steps: unknown[]; receipt: string };
