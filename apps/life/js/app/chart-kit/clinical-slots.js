/**
 * Closed Clinical Glass series colours for multi-theme charts.
 * Source: docs/superpowers/specs/2026-07-31-life-hub-design.md (Charts)
 * and docs/superpowers/specs/2026-08-16-mind-visual-restyle-design.md.
 *
 * Stroke tokens from the chart spec, plus --pastel-*-ink so washed fills
 * (--pastel-sage, --shore) stay readable as 10px arcs. Do not use
 * --high-sea here — that token is rail / decisive only; charts use
 * --high-sea-ink.
 */
export const CLINICAL_CHART_SLOTS = [
  'var(--wave)',
  'var(--marine)',
  'var(--success)',
  'var(--danger)',
  'var(--high-sea-ink)',
  'var(--pastel-sage-ink)',
  'var(--pastel-peach-ink)',
  'var(--muted)'
];
