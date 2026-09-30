export const ZOOM_LABELS: readonly string[];
export function buildZoomPills(doc: Document, active: string): HTMLDivElement;
export function settleZoomPills(
  group: Element | null | undefined
): { x: string; y: string; w: string; h: string } | null;
export function resetZoomPillsForTests(): void;
