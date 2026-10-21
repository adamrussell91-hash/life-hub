/**
 * Types for the block engine modules Professional imports through `@tasks/*`
 * and `@teaching/*`. Vite resolves these to apps/tasks/src and
 * apps/teaching/src (see vite.config.ts).
 * TypeScript reads this file instead, so Professional's typecheck never walks
 * those apps' own `@/` imports. Add an export here when Professional needs one.
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

export type Block = { id: string; block_type: string; content?: unknown; [key: string]: unknown };

export type BlockCanvasHandle = {
  update(blocks: Block[]): void;
  insertType(type: InsertMenuValue): void;
  dispose(): void;
};

export function mountBlockCanvas(
  host: HTMLElement,
  options: {
    blocks: Block[];
    onChange: (blocks: Block[]) => void;
    idFactory: () => string;
    editable?: boolean;
    editOnClick?: boolean;
  }
): BlockCanvasHandle;

export function nextBlockIdFactory(prefix: string, blocks: Block[]): () => string;

export function setClassroomExtras(on: boolean): void;
