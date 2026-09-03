export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 15
} as const;

export function printableHeightMm(): number {
  return A4.heightMm - A4.marginMm * 2;
}

/** At least 1 page; uses content height in the same mm units as A4. */
export function estimatePageCount(contentHeightMm: number): number {
  const page = printableHeightMm();
  if (contentHeightMm <= 0) return 1;
  return Math.max(1, Math.ceil(contentHeightMm / page));
}
