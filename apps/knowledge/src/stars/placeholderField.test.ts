import { describe, expect, it } from "vitest";
import {
  buildPlaceholderStars,
  PLACEHOLDER_STAR_MAX_COUNT,
  PLACEHOLDER_STAR_MIN_COUNT,
  PLACEHOLDER_STAR_MONTH_SPAN,
} from "./placeholderField";

describe("buildPlaceholderStars", () => {
  it("returns between 200 and 300 stars", () => {
    const stars = buildPlaceholderStars(300);
    expect(stars.length).toBeGreaterThanOrEqual(PLACEHOLDER_STAR_MIN_COUNT);
    expect(stars.length).toBeLessThanOrEqual(PLACEHOLDER_STAR_MAX_COUNT);
  });

  it("is deterministic for the same anchor month", () => {
    expect(buildPlaceholderStars(300)).toEqual(buildPlaceholderStars(300));
  });

  it("spreads stars across the trailing year ending at the anchor month", () => {
    const anchor = 300;
    const stars = buildPlaceholderStars(anchor);
    for (const star of stars) {
      expect(star.monthIndex).toBeGreaterThanOrEqual(anchor - PLACEHOLDER_STAR_MONTH_SPAN);
      expect(star.monthIndex).toBeLessThanOrEqual(anchor);
    }
  });

  it("keeps y positions within the visible band", () => {
    const stars = buildPlaceholderStars(300);
    for (const star of stars) {
      expect(star.yRatio).toBeGreaterThanOrEqual(0.1);
      expect(star.yRatio).toBeLessThanOrEqual(0.88);
    }
  });
});
