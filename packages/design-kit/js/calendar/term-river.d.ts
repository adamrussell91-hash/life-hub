export const LANES: readonly Readonly<{ id: string; label: string; sub: string }>[];
export function deriveRiverZooms(
  terms: unknown[],
  today: string
): { term: { from: string; to: string }; year: { from: string; to: string } };
export function laneFor(item: unknown): string;
export function byLane(items: unknown[]): Map<string, unknown[]>;
export function weeksBetween(from: string, to: string): string[];
export function weeklyLoad(items: unknown[], weeks: string[], capacityFor?: (date: string) => number | null): unknown[];
export function riverWeekLabel(monday: string, terms?: unknown[]): string;
