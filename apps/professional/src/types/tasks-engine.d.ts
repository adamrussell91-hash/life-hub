/**
 * Types for the Tasks block engine modules Professional imports through
 * `@tasks/*`. Vite resolves these to apps/tasks/src (see vite.config.ts).
 * TypeScript reads this file instead, so Professional's typecheck never walks
 * Tasks' own `@/` imports. Add an export here when Professional needs one.
 */
export type InsertMenuValue = string;

export type BlockInsertHandle = {
  open(): void;
  close(): void;
  dispose(): void;
};

export function mountBlockInsert(
  host: HTMLElement,
  options: { onInsert: (type: InsertMenuValue) => void }
): BlockInsertHandle;
