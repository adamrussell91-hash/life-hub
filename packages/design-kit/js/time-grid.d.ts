export const TIME_GRID_START_HOUR: number;
export const TIME_GRID_END_HOUR: number;
export const TIME_GRID_HOUR_PX: number;
export const TIME_GRID_SNAP_MINUTES: number;
export const TIME_GRID_DEFAULT_MINUTES: number;

export function parseTimeHours(time: string | null | undefined): number | null;
export function hoursToDueTime(hours: number): string;
export function snapHours(hours: number, minutes?: number): number;
export function hoursFromOffset(offsetY: number, hourHeight?: number, startHour?: number): number;
export function timeGridHours(): number[];
export function inTimeGridRange(hours: number): boolean;
export function hourCaption(hour: number): string;
export function clampSpan(start: number, minutes: number, minHours?: number): { start: number; end: number };
export function assignLanes<T extends { start: number; end: number }>(
  spans: T[]
): { items: Array<T & { lane: number }>; laneCount: number };
export function splitDayItems<T>(
  items: T[] | null | undefined,
  getTime?: (item: T) => string | null | undefined
): { timed: T[]; allDay: T[] };
export function layoutTimedBlocks<T>(
  items: T[] | null | undefined,
  getTime?: (item: T) => string | null | undefined,
  getDuration?: (item: T) => number | null | undefined
): Array<{ item: T; start: number; end: number; lane: number; lanes: number; timed: true }>;
export function blockStyle(
  block: { start: number; end: number; lane: number; lanes: number },
  hourHeight?: number,
  startHour?: number
): Record<string, string>;
export function formatBlockTime(block: { start: number; end: number }): string;
export function formatDialTime(hours: number): string;
export function nowLineOffset(
  now: Date | string | number,
  startHour?: number,
  endHour?: number,
  hourHeight?: number
): number | null;
export function parseGoToDate(raw: string, today?: Date): Date | null;
export function dateKeyFromDate(value: Date | string | number): string | null;
