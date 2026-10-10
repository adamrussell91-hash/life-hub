export function toHour(value: unknown): number;
export function isSchoolHoliday(date: string, terms?: unknown[]): boolean;
export function movedCaption(from: string, to: string): string;
export function buildTidelineModel(input: Record<string, unknown>): Record<string, unknown>;

export function chipFromEvent(event: { record?: Record<string, unknown>; path?: string }): Record<string, unknown> | null;
