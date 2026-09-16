import { random, seedOf } from "./canvas";

// Real notes only populate the sky from SKY_NOTES_CUTOFF_ISO onward (see skyIndex.ts),
// so the timeline reads as near-empty until months of new notes accumulate. This
// scatters a fixed, deterministic field of non-interactive filler stars across the
// trailing year so the sky already looks populated while real notes slowly fill in.
export const PLACEHOLDER_STAR_SEED = seedOf("night-sky-placeholder-field");
export const PLACEHOLDER_STAR_MONTH_SPAN = 12;
export const PLACEHOLDER_STAR_MIN_COUNT = 200;
export const PLACEHOLDER_STAR_MAX_COUNT = 300;

export type PlaceholderStar = { monthIndex: number; yRatio: number };

export function buildPlaceholderStars(anchorMonthIndex: number): PlaceholderStar[] {
  const next = random(PLACEHOLDER_STAR_SEED);
  const countRange = PLACEHOLDER_STAR_MAX_COUNT - PLACEHOLDER_STAR_MIN_COUNT;
  const count = PLACEHOLDER_STAR_MIN_COUNT + Math.floor(next() * (countRange + 1));
  const minMonthIndex = anchorMonthIndex - PLACEHOLDER_STAR_MONTH_SPAN;
  const stars: PlaceholderStar[] = [];
  for (let index = 0; index < count; index += 1) {
    stars.push({
      monthIndex: minMonthIndex + next() * PLACEHOLDER_STAR_MONTH_SPAN,
      yRatio: 0.1 + next() * 0.78,
    });
  }
  return stars;
}
