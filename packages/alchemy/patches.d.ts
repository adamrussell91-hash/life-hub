export type AlchemyPatch = { blockId: string; path: string; oldStr: string; newStr: string };
export class PatchError extends Error {}
export function editableFields(block: { content: unknown }): Array<[string, string]>;
export function childBlocks<T extends { block_type: string; content?: unknown }>(block: T): T[];
export function patchBlock<T extends { id: string; block_type: string; content: unknown }>(blocks: T[], patch: AlchemyPatch, validateBlock: (block: unknown) => T | null): T;
export function applyPatchToEntity<E extends { blocks?: Array<{ id: string; block_type: string; content: unknown }> }>(entity: E, patch: AlchemyPatch, validateBlock: (block: unknown) => { id: string; block_type: string; content: unknown } | null): E;
export function normaliseForQuote(text: string): string;
export function quoteAppears(noteText: string, quote: string): boolean;
