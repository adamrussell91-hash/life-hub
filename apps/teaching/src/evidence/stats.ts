/** Plain descriptive statistics and classical item analysis. No quiz knowledge. */

export type Summary = { n: number; mean: number; median: number; sd: number; min: number; max: number; q1: number; q3: number };

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Sample variance (n − 1); 0 for fewer than two values. */
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Quantile of sorted values by linear interpolation (Excel QUARTILE.INC, R type 7). */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return (sorted[lo] as number) + (h - lo) * ((sorted[hi] as number) - (sorted[lo] as number));
}

export function summary(values: number[]): Summary | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: mean(values),
    median: quantile(sorted, 0.5),
    sd: Math.sqrt(variance(values)),
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75)
  };
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    const dx = x - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  });
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * Cronbach's alpha over marks (rows = students, columns = questions). Equals
 * KR-20 when every question is right or wrong. Null without two students,
 * two questions, or any spread in totals.
 */
export function cronbachAlpha(matrix: number[][]): number | null {
  const k = matrix[0]?.length ?? 0;
  if (matrix.length < 2 || k < 2) return null;
  const itemVar = Array.from({ length: k }, (_, j) => variance(matrix.map((row) => row[j] as number))).reduce((s, v) => s + v, 0);
  const totalVar = variance(matrix.map((row) => row.reduce((s, v) => s + v, 0)));
  if (totalVar <= 0) return null;
  return (k / (k - 1)) * (1 - itemVar / totalVar);
}

export type ItemStat = { facility: number; discrimination: number | null };

/** Facility (mean share of marks) and discrimination (each question against the total of the others). */
export function itemStats(matrix: number[][], maxes: number[]): ItemStat[] {
  return maxes.map((max, j) => {
    const item = matrix.map((row) => row[j] as number);
    const rest = matrix.map((row) => row.reduce((s, v, i) => (i === j ? s : s + v), 0));
    return { facility: max > 0 && item.length ? mean(item) / max : 0, discrimination: pearson(item, rest) };
  });
}
