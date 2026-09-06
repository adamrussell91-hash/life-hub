import { describe, expect, it } from "vitest";
import { inverseLinksHtml } from "./inverseLinksHtml";

describe("inverseLinksHtml", () => {
  it("returns nothing when nobody points here", () => {
    expect(inverseLinksHtml([], "ready")).toBe("");
    expect(inverseLinksHtml(undefined, "ready")).toBe("");
  });

  it("lists inbound Knowledge pages", () => {
    const html = inverseLinksHtml(
      [{ id: "page_aotfw_notes", title: "AOTFW teaching notes" }],
      "ready",
    );
    expect(html).toContain("What points here");
    expect(html).toContain('data-open-page="page_aotfw_notes"');
    expect(html).toContain("AOTFW teaching notes");
  });

  it("is fail-visible when the inbound scan cannot run", () => {
    const html = inverseLinksHtml([], "unavailable");
    expect(html).toContain("Inbound links are unavailable.");
    expect(html).not.toContain("<ul>");
  });
});
