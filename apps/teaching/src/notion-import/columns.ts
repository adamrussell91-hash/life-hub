const PRESETS: Record<string, '50-50' | '33-67' | '67-33' | '33-33-33'> = {
  '6,6': '50-50',
  '4,8': '33-67',
  '8,4': '67-33',
  '4,4,4': '33-33-33'
};

/** Notion width ratios → whole twelfths, each ≥ 1, summing to 12. Needs 1–12 columns. */
export function columnWidths(ratios: Array<number | undefined>): number[] {
  const n = ratios.length;
  const raw = ratios.map((r) => (typeof r === 'number' && r > 0 ? r : 1 / n));
  const total = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((r) => (r / total) * 12);
  const widths = scaled.map((s) => Math.max(1, Math.floor(s)));
  let diff = 12 - widths.reduce((a, b) => a + b, 0);
  const byFraction = scaled
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; diff > 0; k += 1, diff -= 1) widths[byFraction[k % n].i] += 1;
  while (diff < 0) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] -= 1;
    diff += 1;
  }
  return widths;
}

export function columnPreset(widths: number[]): '50-50' | '33-67' | '67-33' | '33-33-33' | 'custom' {
  return PRESETS[widths.join(',')] ?? 'custom';
}
