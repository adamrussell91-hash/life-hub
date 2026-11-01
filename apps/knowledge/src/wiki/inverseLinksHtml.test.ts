import { describe, expect, it } from "vitest";
import { inverseLinksHtml } from "./inverseLinksHtml";

describe("inverseLinksHtml", () => {
  it("returns nothing when nobody points here", () => {
    expect(inverseLinksHtml([], "ready")).toBe("");
    expect(inverseLinksHtml(undefined, "ready")).toBe("");
  });

  it("lists inbound Knowledge pages", () => {
    const html = inverseLinksHtml(
      [{ id: "page_lkeep_notes", title: "LKEEP teaching notes" }],
      "ready",
    );
    expect(html).toContain("What points here");
    expect(html).toContain('data-open-page="page_lkeep_notes"');
    expect(html).toContain("LKEEP teaching notes");
  });

  it("is fail-visible when the inbound scan cannot run", () => {
    const html = inverseLinksHtml([], "unavailable");
    expect(html).toContain("Inbound links are unavailable.");
    expect(html).not.toContain("<ul>");
  });
});
