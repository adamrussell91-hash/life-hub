import { describe, expect, it } from "vitest";
import {
  MONTH_WIDTH_PX,
  clampMonthIndex,
  currentMonthIndex,
  dateFromMonthIndex,
  formatMonthIndex,
  monthIndexForRatio,
  monthIndexFromDate,
  monthIndexFromIso,
  monthDeltaForPixels,
  ratioForMonthIndex,
  screenXForMonth,
  stepInertia,
} from "./timeline";

describe("Stars timeline math", () => {
  it("converts dates to a continuous month index and back", () => {
    expect(monthIndexFromDate(new Date(Date.UTC(2000, 0, 15)))).toBe(0);
    expect(monthIndexFromDate(new Date(Date.UTC(2001, 0, 15)))).toBe(12);
    expect(monthIndexFromDate(new Date(Date.UTC(1999, 11, 15)))).toBe(-1);
    const roundTrip = dateFromMonthIndex(monthIndexFromDate(new Date(Date.UTC(2026, 8, 15))));
    expect(roundTrip.getUTCFullYear()).toBe(2026);
    expect(roundTrip.getUTCMonth()).toBe(8);
  });

  it("parses ISO strings and rejects missing/invalid ones", () => {
    expect(monthIndexFromIso("2026-09-15T00:00:00.000Z")).toBe(monthIndexFromDate(new Date("2026-09-15T00:00:00.000Z")));
    expect(monthIndexFromIso(undefined)).toBeNull();
    expect(monthIndexFromIso("")).toBeNull();
    expect(monthIndexFromIso("not-a-date")).toBeNull();
  });

  it("reports the current month index against a supplied clock", () => {
    expect(currentMonthIndex(new Date(Date.UTC(2026, 8, 1)))).toBe(monthIndexFromDate(new Date(Date.UTC(2026, 8, 1))));
  });

  it("formats a month index as a short human label", () => {
    expect(formatMonthIndex(monthIndexFromDate(new Date(Date.UTC(2026, 8, 1))))).toBe("Sep 2026");
  });

  it("clamps to a range, tolerating an inverted range", () => {
    expect(clampMonthIndex(50, 0, 10)).toBe(10);
    expect(clampMonthIndex(-5, 0, 10)).toBe(0);
    expect(clampMonthIndex(5, 0, 10)).toBe(5);
    expect(clampMonthIndex(5, 10, 0)).toBe(10);
  });

  it("maps month index to screen x centered on the camera", () => {
    expect(screenXForMonth(0, 0, 1000, MONTH_WIDTH_PX)).toBe(500);
    expect(screenXForMonth(1, 0, 1000, MONTH_WIDTH_PX)).toBe(500 + MONTH_WIDTH_PX);
    expect(screenXForMonth(-1, 0, 1000, MONTH_WIDTH_PX)).toBe(500 - MONTH_WIDTH_PX);
  });

  it("converts a pixel drag delta into a month delta", () => {
    expect(monthDeltaForPixels(MONTH_WIDTH_PX, MONTH_WIDTH_PX)).toBe(1);
    expect(monthDeltaForPixels(-MONTH_WIDTH_PX * 2, MONTH_WIDTH_PX)).toBe(-2);
  });

  it("decays inertia to exactly zero below the minimum velocity", () => {
    let velocity = 1;
    let steps = 0;
    while (velocity !== 0 && steps < 500) {
      velocity = stepInertia(velocity, 0.9, 0.01);
      steps += 1;
    }
    expect(velocity).toBe(0);
    expect(steps).toBeGreaterThan(1);
  });

  it("maps a month index to a slider ratio and back", () => {
    expect(ratioForMonthIndex(5, 0, 10)).toBeCloseTo(0.5, 5);
    expect(ratioForMonthIndex(-5, 0, 10)).toBe(0);
    expect(ratioForMonthIndex(15, 0, 10)).toBe(1);
    expect(monthIndexForRatio(0.5, 0, 10)).toBeCloseTo(5, 5);
  });
});
