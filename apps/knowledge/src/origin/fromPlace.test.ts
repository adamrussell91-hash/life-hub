import { describe, expect, it } from "vitest";
import {
  inferOriginFromLabel,
  notionIdFromSource,
  notionPropertyLabels,
  notionRelationIds,
  originsFromBody,
  originsFromNotionProperties,
  originsFromUnitTags,
  stampPageOrigins,
  unitCodeFromLabel,
} from "./fromPlace";
import { applyUnitDegreeMap, installUnitDegreeMap } from "./unitDegrees";
import { TEST_UNIT_DEGREES } from "./unitDegrees.fixture";
import { installNotesPlace } from "./notesPlace";
import { TEST_NOTES_PLACE } from "./notesPlace.fixture";

installNotesPlace(TEST_NOTES_PLACE);

installUnitDegreeMap(TEST_UNIT_DEGREES);

describe("origins from existing place data", () => {
  it("lifts unit codes already sitting in tags", () => {
    expect(originsFromUnitTags(["Note", "SMPL5805", "Philosophy Knowledge and Society"])).toEqual([
      { kind: "unit", label: "SMPL5805" },
    ]);
  });

  it("reads Notion-style property lines from the body", () => {
    expect(
      originsFromBody(`# Lecture

Degree: MEd
Unit: SMPL5805, SMPL909
Notebook: Brown 2022
Book: Make It Stick
PD: HALT workshop 2024

The lecture itself.`),
    ).toEqual([
      { kind: "book", label: "Make It Stick" },
      { kind: "degree", label: "MEd" },
      { kind: "notebook", label: "Brown 2022" },
      { kind: "pd", label: "HALT workshop 2024" },
      { kind: "unit", label: "SMPL5805" },
      { kind: "unit", label: "SMPL909" },
    ]);
  });

  it("maps the live Notes and University property names", () => {
    expect(
      originsFromNotionProperties({
        Notebooks: { type: "select", select: { name: "Cognitive Psychology" } },
        "Unit Number": { type: "select", select: { name: "SMPL5805: Sample Curriculum Design" } },
        "Book/Journal": { type: "relation", relation: [{ id: "15df794f-8476-80f7-ae79-f77b0001c400" }] },
        Tags: { type: "multi_select", multi_select: [{ name: "Note" }] },
      }),
    ).toEqual([
      { kind: "notebook", label: "Cognitive Psychology" },
      { kind: "unit", label: "SMPL5805" },
    ]);
  });

  it("maps Notion property objects and infers Type values", () => {
    expect(
      originsFromNotionProperties({
        Degree: { type: "select", select: { name: "MEd" } },
        Unit: { type: "multi_select", multi_select: [{ name: "SMPL5805" }] },
        Type: { type: "select", select: { name: "Notebook — Blue 2019" } },
        Tags: { type: "multi_select", multi_select: [{ name: "Note" }] },
      }),
    ).toEqual([
      { kind: "degree", label: "MEd" },
      { kind: "notebook", label: "Notebook — Blue 2019" },
      { kind: "unit", label: "SMPL5805" },
    ]);
  });

  it("reads Notion rich-text and select names", () => {
    expect(notionPropertyLabels({ type: "rich_text", rich_text: [{ plain_text: "Make It Stick" }] })).toEqual([
      "Make It Stick",
    ]);
    expect(inferOriginFromLabel("PhD")).toEqual({ kind: "degree", label: "PhD" });
  });

  it("dashes a stored Notion id for the API", () => {
    expect(notionIdFromSource("d0000000000000000000000000000004")).toBe("d0000000-0000-0000-0000-000000000004");
    expect(notionIdFromSource("page_notion_d0000000000000000000000000000004")).toBe(
      "d0000000-0000-0000-0000-000000000004",
    );
    expect(notionIdFromSource("not-an-id")).toBeNull();
  });

  it("keeps the unit code from a Unit Number select", () => {
    expect(unitCodeFromLabel("SMPL5805: Sample Curriculum Design")).toBe("SMPL5805");
    expect(notionRelationIds({ type: "relation", relation: [{ id: "15df794f-8476-80f7-ae79-f77b0001c400" }] })).toEqual([
      "15df794f-8476-80f7-ae79-f77b0001c400",
    ]);
  });

  it("fills notebook, book, and PD from the installed Notion place map", () => {
    expect(
      stampPageOrigins({
        tags: ["Note"],
        body: "Lecture notes.",
        source_notion_id: "b0000000000000000000000000000002",
      }),
    ).toEqual([
      { kind: "book", label: "Example Book" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
    expect(
      stampPageOrigins({
        id: "page_notion_b0000000000000000000000000000002",
        tags: ["Note"],
        body: "Lecture notes.",
      }),
    ).toEqual([
      { kind: "book", label: "Example Book" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
  });

  it("keeps pills already on the page and adds recovered ones", () => {
    expect(
      stampPageOrigins({
        tags: ["Note", "HIST2001"],
        body: "Degree: MEd\n\nBody.",
        origins: [{ kind: "book", label: "Make It Stick" }],
      }),
    ).toEqual([
      { kind: "book", label: "Make It Stick" },
      { kind: "degree", label: "MEd" },
      { kind: "unit", label: "HIST2001" },
    ]);
  });

  it("fills the degree from the unit’s Notion parent", () => {
    expect(stampPageOrigins({ tags: ["SMPL5805"], body: "Lecture notes." })).toEqual([
      { kind: "degree", label: "Master of Sample Studies" },
      { kind: "unit", label: "SMPL5805" },
    ]);
    expect(
      applyUnitDegreeMap(
        [
          { kind: "unit", label: "EXMP6014" },
          { kind: "notebook", label: "Wellbeing" },
        ],
      ),
    ).toEqual([
      { kind: "degree", label: "Graduate Certificate in Example Wellbeing" },
      { kind: "notebook", label: "Wellbeing" },
      { kind: "unit", label: "EXMP6014" },
    ]);
    expect(applyUnitDegreeMap([{ kind: "unit", label: "SMPL6119" }])).toEqual([
      { kind: "degree", label: "Graduate Certificate in Sample Leadership" },
      { kind: "unit", label: "SMPL6119" },
    ]);
    expect(applyUnitDegreeMap([{ kind: "unit", label: "EXMP9733" }])).toEqual([
      { kind: "degree", label: "Master of Example Psychology" },
      { kind: "unit", label: "EXMP9733" },
    ]);
  });
});
