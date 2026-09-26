export const CAPACITY: Readonly<{ budgetHours: number; softCap: number; hardCap: number }>;
export function symptomsIn(logs: unknown[], date: string): string[];
export function dayCapacity(logs: unknown[], date: string): number;
export function noteFor(pct: number, symptoms?: string[]): string;
export function forecastCapacity(date: string, logs?: unknown[]): number;
export function capacityForDates(dates: string[], logs?: unknown[]): number[];
export function dayLoadHours(events: unknown[], date: string): number;
export function isOverCapacity(events: unknown[], date: string, logs?: unknown[]): boolean;
export function forecastSeries(
  from: string,
  to: string,
  logs?: unknown[]
): Array<{ date: string; pct: number; forecast: boolean }>;
