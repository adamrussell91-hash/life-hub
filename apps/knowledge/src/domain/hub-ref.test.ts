import { describe, expect, it } from "vitest";
import { hrefForHubRef, parseHubRef } from "./hub-ref";

describe("parseHubRef", () => {
  it("keeps a bare Knowledge page id", () => {
    expect(parseHubRef("page_aotfw")).toEqual({ hub: "knowledge", kind: "page", id: "page_aotfw" });
  });

  it("parses Teaching unit and Tasks project refs", () => {
    expect(parseHubRef("teaching:unit:unit_aotfw")).toEqual({
      hub: "teaching",
      kind: "unit",
      id: "unit_aotfw",
    });
    expect(parseHubRef("tasks:project:proj_aotfw")).toEqual({
      hub: "tasks",
      kind: "project",
      id: "proj_aotfw",
    });
  });

  it("parses Life decision refs", () => {
    expect(parseHubRef("life:decision:aotfw-sources")).toEqual({
      hub: "life",
      kind: "decision",
      id: "aotfw-sources",
    });
    expect(hrefForHubRef({ hub: "life", kind: "decision", id: "aotfw-sources" })).toBe(
      "https://life-hub.adam-russell.com/#central-node",
    );
  });

  it("rejects unknown hubs and kinds", () => {
    expect(parseHubRef("life://diary/x")).toBeNull();
    expect(parseHubRef("teaching:lesson:lesson_1")).toBeNull();
  });

  it("builds outbound Teaching and Tasks hrefs", () => {
    expect(hrefForHubRef({ hub: "teaching", kind: "unit", id: "unit_aotfw" })).toBe(
      "https://teaching-hub.adam-russell.com/units/unit_aotfw",
    );
    expect(hrefForHubRef({ hub: "tasks", kind: "project", id: "proj_aotfw" })).toBe(
      "https://tasks-hub.adam-russell.com/#/project/proj_aotfw",
    );
  });
});
