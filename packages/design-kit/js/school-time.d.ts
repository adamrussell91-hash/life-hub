export type SchoolTerm = { term: 1 | 2 | 3 | 4; starts_on: string; ends_on: string };

export function toMs(key: string): number;
export function toKey(ms: number): string;
export function addDaysKey(key: string, days: number): string;
export function mondayOf(key: string): string;
export function termAt(key: string, terms: SchoolTerm[]): SchoolTerm | null;
export function isHoliday(key: string, terms: SchoolTerm[]): boolean;
export function weekLabel(key: string, terms: SchoolTerm[]): string | null;
export function termWeek(key: string, terms: SchoolTerm[]): number | null;

export type ScaleDay = { key: string; x: number; w: number; holiday: boolean };

export type TimeScale = {
  start: string;
  end: string;
  width: number;
  days: ScaleDay[];
  x: (keyOrMs: string | number) => number;
  dateAt: (x: number) => string;
};

export type ScaleOptions = {
  start: string;
  end: string;
  terms: SchoolTerm[];
  dayWidth: number;
  holidayFactor?: number;
};

export function buildTimeScale(options: ScaleOptions): TimeScale;
export function holidayRuns(scale: TimeScale): Array<{ start: string; end: string; x: number; w: number }>;
