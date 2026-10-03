import { describe, expect, it } from "vitest";
import { confidenceBand, parseRescanDecisions, rescanLinks } from "./bandResolve";

describe("confidence bands", () => {
  it("rejects 50–60% and below, rescans 60–70%, and approves 70–80%", () => {
    expect(confidenceBand(0.05)).toBe("reject");
    expect(confidenceBand(0.59)).toBe("reject");
    expect(confidenceBand(0.6)).toBe("rescan");
    expect(confidenceBand(0.69)).toBe("rescan");
    expect(confidenceBand(0.7)).toBe("approve");
    expect(confidenceBand(0.79)).toBe("approve");
    expect(confidenceBand(0.8)).toBe("written");
  });

  it("links a rescan only when the model commits at 70% or above", () => {
    expect(rescanLinks({ link: true, confidence: 0.7 })).toBe(true);
    expect(rescanLinks({ link: true, confidence: 0.69 })).toBe(false);
    expect(rescanLinks({ link: false, confidence: 0.95 })).toBe(false);
    expect(rescanLinks({ link: true })).toBe(false);
  });

  it("parses a fenced decision and keeps one row per pair", () => {
    const raw = "```json\n" + JSON.stringify({
      decisions: [
        { id: "a||b", link: false, confidence: 0.4, rationale: "topic only" },
        { id: "a||b", link: true, relation: "builds-on", confidence: 0.82, rationale: "same mechanism" },
        { id: "nope", link: true, confidence: 0.9 },
      ],
    }) + "\n```";
    expect(parseRescanDecisions(raw, new Set(["a||b"]))).toEqual([
      { id: "a||b", link: true, relation: "builds-on", rationale: "same mechanism", confidence: 0.82 },
    ]);
  });
});
