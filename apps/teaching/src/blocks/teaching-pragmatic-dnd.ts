/**
 * Shared Pragmatic DnD payload helpers for Teaching nested/column reorder.
 * App state stays in Block[] transforms — this module only names drag data.
 */
export const TEACHING_PRAGMATIC = 'teaching-hub-pragmatic' as const;

export type NestedBlockDrag =
  | {
      [TEACHING_PRAGMATIC]: true;
      kind: 'nested-block';
      fromCol: number;
      fromIndex: number;
    }
  | {
      [TEACHING_PRAGMATIC]: true;
      kind: 'nested-reorder';
      fromIndex: number;
    };

export type NestedDropLocation =
  | { kind: 'nested-slot'; index: number }
  | { kind: 'column-pane'; colIndex: number };

export function isNestedBlockDrag(data: Record<string | symbol, unknown>): data is NestedBlockDrag {
  return data[TEACHING_PRAGMATIC] === true && (data.kind === 'nested-block' || data.kind === 'nested-reorder');
}

export function nestedBlockDrag(fromCol: number, fromIndex: number): NestedBlockDrag {
  return { [TEACHING_PRAGMATIC]: true, kind: 'nested-block', fromCol, fromIndex };
}

export function nestedReorderDrag(fromIndex: number): NestedBlockDrag {
  return { [TEACHING_PRAGMATIC]: true, kind: 'nested-reorder', fromIndex };
}
