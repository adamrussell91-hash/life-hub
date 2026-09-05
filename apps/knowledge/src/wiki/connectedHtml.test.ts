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
      { connected: ["page_aotfw", "teaching:unit:unit_aotfw", "tasks:project:proj_aotfw"] },
      [{ id: "page_aotfw", title: "Artist of the Floating World — sources" }],
    );
    expect(html).toContain("data-open-page=\"page_aotfw\"");
    expect(html).toContain("Artist of the Floating World — sources");
    expect(html).toContain("href=\"https://teaching-hub.adam-russell.com/units/unit_aotfw\"");
    expect(html).toContain("Teaching unit unit_aotfw");
    expect(html).toContain("href=\"https://tasks-hub.adam-russell.com/#/project/proj_aotfw\"");
    expect(html).toContain("Tasks project proj_aotfw");
    expect(html).not.toContain("data-open-page=\"teaching:unit:unit_aotfw\"");
    expect(html).not.toContain("data-open-page=\"tasks:project:proj_aotfw\"");
  });
});
