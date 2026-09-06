import { describe, expect, it } from "vitest";
import { decisionTraceHtml } from "./decisionTraceHtml";

describe("decisionTraceHtml", () => {
  it("returns nothing without traces", () => {
    expect(decisionTraceHtml(undefined)).toBe("");
    expect(decisionTraceHtml([])).toBe("");
  });

  it("is fail-visible when the Life governance log cannot load", () => {
    const html = decisionTraceHtml([], "unavailable");
    expect(html).toContain("How this changed");
    expect(html).toContain("Decision history is unavailable.");
  });

  it("renders a same-decision timeline", () => {
    const html = decisionTraceHtml([
      {
        title: "AOTFW sources",
        decisionId: "aotfw-sources",
        steps: [
          { dateKey: "2026-08-01", chosen: "Start the unit" },
          { dateKey: "2026-09-06", chosen: "Keep the unit linked" },
        ],
      },
    ]);
    expect(html).toContain("How this changed");
    expect(html).toContain("AOTFW sources");
    expect(html).toContain("Start the unit");
    expect(html).toContain("Keep the unit linked");
  });
});
