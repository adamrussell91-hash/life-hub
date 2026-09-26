export const FILTER_CHIPS: readonly Readonly<{ id: string; label: string; group: string }>[];
export function defaultFilterForHub(hub?: string): Record<string, boolean>;
export function writeFilterState(hub: string, state: Record<string, boolean>): void;
export function readFilterState(hub: string): Record<string, boolean>;
export function filterKeyForItem(item: unknown): string | null;
export function isItemVisible(item: unknown, state: Record<string, boolean>): boolean;
export function countHidden(items: Iterable<unknown>, state: Record<string, boolean>): number;
export function countByFilterKey(items: Iterable<unknown>): Record<string, number>;
export function paintSourceFilter(
  doc: Document,
  host: HTMLElement,
  opts: {
    hub?: string;
    state: Record<string, boolean>;
    counts: Record<string, number>;
    hidden: number;
    ambient?: string;
    onChange: (next: Record<string, boolean>) => void;
  }
): void;
export function applyItemVisibility(
  nodes: Map<string, HTMLElement>,
  entries: Iterable<{ id: string; item: unknown }>,
  state: Record<string, boolean>,
  motion?: { reducedMotion?: boolean; engine?: { to?: Function } }
): void;
