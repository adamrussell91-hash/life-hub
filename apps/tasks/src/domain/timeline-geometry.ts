/**
 * Timeline geometry. Ported exactly from docs/proposals/timeline-reference/src/timeline-ref.ts.
 * Views read sizes from here. No magic numbers in the view.
 */

export const TL = {
  labelW: 208,
  axis: { h: 64, termY: 8, termH: 20, weekY: 42, dateY: 56 },
  row: { dream: 36, goal: 36, project: 44, projectOpen: 34, task: 36, step: 30, milestone: 36, marking: 48, group: 36, ribbon: 24 },
  groupGap: 12,
  bar: { h: 24, rx: 6, stripeW: 3, stripeInset: 6, minW: 28, textPad: 16, outsideGap: 8 },
  project: { h: 28, rx: 8, bracketH: 6, bracketRx: 3 },
  band: { h: 24, rx: 12 },
  diamond: 14,
  undated: { h: 22, rx: 11, padX: 10 },
  shadow: { h: 32, rx: 8 },
  ribbon: { h: 16, gap: 3, rx: 4 },
  load: { h: 104, top: 30, colGap: 8, rx: 4 },
  today: { pillH: 20, pillW: 52 },
  ghost: { dash: '4 3' },
  mobileBreak: 720,
  zooms: [
    { id: 'year', label: 'Year', dayWidth: 1.6 },
    { id: 'term', label: 'Term', dayWidth: 4.4 },
    { id: 'month', label: 'Month', dayWidth: 10 },
    { id: 'week', label: 'Week', dayWidth: 34 },
    { id: 'day', label: 'Day', dayWidth: 96 }
  ]
} as const;

/** Surface literals with no kit token. Derived from tokens; keep the derivation comment. */
export const SURF = {
  goalBand: 'color-mix(in srgb, var(--navy) 5%, transparent)',
  holiday: 'color-mix(in srgb, var(--navy) 3.5%, transparent)',
  selectedHalo: 'color-mix(in srgb, var(--wave) 16%, transparent)',
  ghostFill: 'color-mix(in srgb, var(--wave) 6%, transparent)',
  shadowFill: 'color-mix(in srgb, var(--navy) 7%, transparent)'
};

export function tint(hex: string, pct: number): string {
  return `color-mix(in srgb, ${hex} ${pct}%, #fff)`;
}

export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Second project in the same domain is shaded 30% toward depth, as Lines does. */
export function domainColour(base: string, shade: boolean): string {
  return shade ? mixHex(base, '#0a1536', 0.3) : base;
}

/** 09:00 is 0.375 of a day. Callers pass the fraction for the frozen clock. */
export const TODAY_FRAC_NINE_AM = 0.375;

export function formatKey(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(2, 4)}`;
}
