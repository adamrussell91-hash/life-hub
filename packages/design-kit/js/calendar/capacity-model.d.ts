export const CAPACITY: Readonly<{
  baseline: number; floor: number; ceiling: number; belowParPct: number; softenPct: number;
  budgetHours: number; recovery: number; holidayLift: number;
}>;
export function symptomsIn(record: unknown, body?: string): string[];
export function forecastCapacity(lastPct: number, daysAhead: number, opts?: { holiday?: boolean }): { pct: number; note: string; factors: unknown[]; soften: boolean; forecast: boolean };
export function capacityForDates(
  events: unknown[],
  dateKeys: string[],
  opts?: { isHoliday?: (date: string) => boolean; today?: string | null }
): Map<string, { pct: number; low?: number; high?: number; note: string; factors: unknown[]; soften: boolean; forecast: boolean; checkedIn: boolean; readiness: unknown }>;
export function dayLoadHours(items: unknown[]): number;
export function isOverCapacity(pct: number, loadHours: number): boolean;
export function forecastSeries(
  dateKeys: string[],
  opts: { lastPct: number; lastDate: string; isHoliday?: (date: string) => boolean; pattern?: (date: string) => number }
): Array<{ date: string; pct: number; low: number; high: number }>;
