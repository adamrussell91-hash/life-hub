/** Life Hub `js/app/chart-kit/mood-mix.js` — donut geometry for mix panels. */

const DEFAULT_SIZE = 218;
const DEFAULT_RADIUS = 90;
const DEFAULT_GAP = 7;

export type MoodMixItem = {
  key: string;
  label?: string;
  value?: number;
  colour?: string;
};

export type MoodMixSegment = MoodMixItem & {
  label: string;
  value: number;
  pct: number;
  visible: number;
  dasharray: string;
  dashoffset: number;
};

export type MoodMixDonut = {
  empty: boolean;
  total: number;
  size: number;
  center: number;
  radius: number;
  gap: number;
  circumference: number;
  dominant: MoodMixSegment | null;
  segments: MoodMixSegment[];
};

function largestRemainderPercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return values.map(() => 0);
  const rows = values.map((value, index) => {
    const exact = (value / total) * 100;
    const pct = Math.floor(exact);
    return { index, pct, rem: exact - pct };
  });
  let used = rows.reduce((sum, row) => sum + row.pct, 0);
  const leftover = 100 - used;
  rows.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < leftover; i += 1) rows[i]!.pct += 1;
  const byIndex = new Array<number>(values.length);
  for (const row of rows) byIndex[row.index] = row.pct;
  return byIndex;
}

/**
 * Donut geometry for mix panels: stroke-dasharray arcs clockwise from 12 o’clock,
 * integer percents that sum to 100, one segment per item (including zeros).
 */
export function buildMoodMixDonut(
  items: MoodMixItem[] | null | undefined,
  { size = DEFAULT_SIZE, radius = DEFAULT_RADIUS, gap = DEFAULT_GAP }: { size?: number; radius?: number; gap?: number } = {}
): MoodMixDonut {
  const segmentsIn = (items ?? []).map((item) => ({
    ...item,
    key: item.key,
    label: item.label ?? item.key,
    value: Number(item.value) || 0,
    colour: item.colour
  }));
  const total = segmentsIn.reduce((sum, item) => sum + item.value, 0);
  const circumference = 2 * Math.PI * radius;
  if (!(total > 0)) {
    return {
      empty: true,
      total: 0,
      size,
      center: size / 2,
      radius,
      gap,
      circumference,
      dominant: null,
      segments: []
    };
  }

  const percents = largestRemainderPercents(segmentsIn.map((item) => item.value));
  let offset = 0;
  const segments: MoodMixSegment[] = segmentsIn.map((item, index) => {
    const pct = percents[index] ?? 0;
    const full = (pct / 100) * circumference;
    const visible =
      full <= 0 ? 0 : Math.max(full - gap, full > 2 ? full - gap : full * 0.6);
    const dashoffset = 0 - offset;
    offset += full;
    return {
      ...item,
      pct,
      visible,
      dasharray: `${visible} ${circumference - visible}`,
      dashoffset
    };
  });

  const dominant = segments.reduce<MoodMixSegment | null>(
    (best, segment) => (segment.value > (best?.value ?? -1) ? segment : best),
    null
  );

  return {
    empty: false,
    total,
    size,
    center: size / 2,
    radius,
    gap,
    circumference,
    dominant,
    segments
  };
}
