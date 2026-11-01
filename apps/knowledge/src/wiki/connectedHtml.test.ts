import { describe, expect, it } from "vitest";
import { connectedLinksHtml } from "./connectedHtml";

describe("connectedLinksHtml", () => {
  it("returns nothing when there are no connected ids", () => {
    expect(connectedLinksHtml({ connected: [] }, [{ id: "a", title: "A" }])).toBe("");
    expect(connectedLinksHtml({}, [{ id: "a", title: "A" }])).toBe("");
  });

  it("lists titles from the archive manifest and falls back to the id", () => {
    const html = connectedLinksHtml({ connected: ["a", "missing"] }, [{ id: "a", title: "Duty" }]);
    expect(html).toContain("Connected");
    expect(html).toContain("data-open-page=\"a\"");
    expect(html).toContain("Duty");
    expect(html).toContain("missing");
  });

  it("renders Teaching units and Tasks projects as outbound hub links", () => {
    const html = connectedLinksHtml(
      { connected: ["page_lkeep", "teaching:unit:unit_lkeep", "tasks:project:proj_lkeep"] },
      [{ id: "page_lkeep", title: "The Lantern Keeper — sources" }],
    );
    expect(html).toContain("data-open-page=\"page_lkeep\"");
    expect(html).toContain("The Lantern Keeper — sources");
    // Umbrella-relative: every hub shares the life-hub.adam-russell.com origin.
    expect(html).toContain("href=\"/teaching/units/unit_lkeep\"");
    expect(html).toContain("Teaching unit unit_lkeep");
    expect(html).toContain("href=\"/tasks/#/project/proj_lkeep\"");
    expect(html).toContain("Tasks project proj_lkeep");
    expect(html).not.toContain("data-open-page=\"teaching:unit:unit_lkeep\"");
    expect(html).not.toContain("data-open-page=\"tasks:project:proj_lkeep\"");
  });

  it("renders Life decision refs as outbound Central Node links", () => {
    const html = connectedLinksHtml(
      { connected: ["life:decision:lkeep-sources"] },
      [],
    );
    expect(html).toContain("href=\"/#central-node\"");
    expect(html).toContain("Decision lkeep-sources");
    expect(html).not.toContain("data-open-page=\"life:decision:lkeep-sources\"");
  });

  it("shows an unavailable state when dual-read relationships failed", () => {
    const html = connectedLinksHtml(
      { connected: ["page_stale"] },
      [{ id: "page_stale", title: "Stale" }],
      { relationshipsStatus: "unavailable" },
    );
    expect(html).toContain("Related pages are unavailable.");
    expect(html).not.toContain("Stale");
  });

  it("prefers dual-read relationship rows over legacy connected", () => {
    const html = connectedLinksHtml(
      { connected: ["page_legacy"] },
      [
        { id: "page_legacy", title: "Legacy" },
        { id: "page_canonical", title: "Canonical" },
      ],
      {
        relationships: [{ legacy_hub_ref: "page_canonical", target_ref: "knowledge:page:page_canonical" }],
      },
    );
    expect(html).toContain("Canonical");
    expect(html).not.toContain("Legacy");
  });
});
