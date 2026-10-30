import { describe, expect, it } from "vitest";
import { extractNotionHex, installNotesPlace, originsFromNotesPlace, resolvedOrigins } from "./notesPlace";
import { TEST_NOTES_PLACE } from "./notesPlace.fixture";

installNotesPlace(TEST_NOTES_PLACE);

describe("origins from the installed Notion place map", () => {
  it("returns notebook, book, and PD pills for known notes", () => {
    expect(originsFromNotesPlace("a0000000000000000000000000000001")).toEqual([
      { kind: "notebook", label: "Boy's Education" },
    ]);
    expect(originsFromNotesPlace("b0000000-0000-0000-0000-000000000002")).toEqual([
      { kind: "book", label: "Example Book" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
    expect(originsFromNotesPlace("c0000000000000000000000000000003")).toEqual([
      { kind: "notebook", label: "Literacy" },
      { kind: "pd", label: "Sample Conference 2025" },
    ]);
  });

  it("extracts a Notion hex from page ids and URLs", () => {
    expect(extractNotionHex("page_notion_a0000000000000000000000000000001")).toBe(
      "a0000000000000000000000000000001",
    );
    expect(extractNotionHex("https://www.notion.so/Habits-b0000000000000000000000000000002")).toBe(
      "b0000000000000000000000000000002",
    );
    expect(extractNotionHex("a0000000-0000-0000-0000-000000000001")).toBe("a0000000000000000000000000000001");
  });

  it("fills recovered pills from a page_notion id when the row has none stored", () => {
    expect(resolvedOrigins({ id: "page_notion_a0000000000000000000000000000001" })).toEqual([
      { kind: "notebook", label: "Boy's Education" },
    ]);
    expect(
      originsFromNotesPlace("page_notion_b0000000000000000000000000000002"),
    ).toEqual([
      { kind: "book", label: "Example Book" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
  });

  it("ignores unknown or empty Notion ids", () => {
    expect(originsFromNotesPlace()).toEqual([]);
    expect(originsFromNotesPlace("not-an-id")).toEqual([]);
    expect(originsFromNotesPlace("ffffffffffffffffffffffffffffffff")).toEqual([]);
  });
});
