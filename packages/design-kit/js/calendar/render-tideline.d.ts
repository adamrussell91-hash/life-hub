export const BAND_SESSION_KEY: string;
export function readBandSession(): number | null;
export function writeBandSession(next: number | null): void;
export function ghostDecisionBody(id: string, decision: 'accept' | 'dismiss'): { id: string; decision: string };
export function renderTideline(
  doc: Document,
  host: HTMLElement,
  input?: Record<string, unknown>
): void;
export function layout(heights: number[]): Map<string, Record<string, unknown>>;
