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
      "/#central-node",
    );
  });

  it("parses Teaching lesson and Professional event/meeting/application refs", () => {
    expect(parseHubRef("teaching:lesson:lesson_1")).toEqual({
      hub: "teaching",
      kind: "lesson",
      id: "lesson_1",
    });
    expect(parseHubRef("tasks:program:program_1")).toEqual({
      hub: "tasks",
      kind: "program",
      id: "program_1",
    });
    expect(parseHubRef("professional:event:event_1")).toEqual({
      hub: "professional",
      kind: "event",
      id: "event_1",
    });
    expect(parseHubRef("professional:meeting:meeting_1")).toEqual({
      hub: "professional",
      kind: "meeting",
      id: "meeting_1",
    });
    expect(parseHubRef("professional:application:application_1")).toEqual({
      hub: "professional",
      kind: "application",
      id: "application_1",
    });
  });

  it("rejects unknown hubs and kinds", () => {
    expect(parseHubRef("life://diary/x")).toBeNull();
    expect(parseHubRef("professional:organisation:organisation_1")).toBeNull();
  });

  // The umbrella is one origin (life-hub.adam-russell.com) with each hub
  // mounted under its own path, never a separate subdomain — these hrefs
  // must stay relative to match entity-resolvers.mjs's own resolution.
  it("builds outbound Teaching, Tasks, and Professional hrefs as relative umbrella paths", () => {
    expect(hrefForHubRef({ hub: "teaching", kind: "unit", id: "unit_aotfw" })).toBe(
      "/teaching/units/unit_aotfw",
    );
    expect(hrefForHubRef({ hub: "teaching", kind: "lesson", id: "lesson_1" })).toBe(
      "/teaching/lessons/lesson_1",
    );
    expect(hrefForHubRef({ hub: "tasks", kind: "project", id: "proj_aotfw" })).toBe(
      "/tasks/#/project/proj_aotfw",
    );
    expect(hrefForHubRef({ hub: "tasks", kind: "program", id: "program_1" })).toBe(
      "/tasks/#/program/program_1",
    );
    expect(hrefForHubRef({ hub: "knowledge", kind: "page", id: "page_aotfw" })).toBe(
      "/knowledge/#page/page_aotfw",
    );
    expect(hrefForHubRef({ hub: "professional", kind: "event", id: "event_1" })).toBe(
      "/professional/#/event/event_1",
    );
    expect(hrefForHubRef({ hub: "professional", kind: "meeting", id: "meeting_1" })).toBe(
      "/professional/#/meeting/meeting_1",
    );
    expect(hrefForHubRef({ hub: "professional", kind: "application", id: "application_1" })).toBe(
      "/professional/#/application/application_1",
    );
  });
});
