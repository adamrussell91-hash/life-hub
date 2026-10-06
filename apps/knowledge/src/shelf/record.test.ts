import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  getShelf: vi.fn(),
  gradeKind: vi.fn(),
  savePlacements: vi.fn(),
}));
vi.mock("./client", () => client);

import { placementForBookNote, placementForComposedPage, recordBookNote, recordComposedPage } from "./record";

describe("placementForBookNote", () => {
  const body = "## In the book\nx\n\n## How this bears on the book\nThe web supports the claim.\n\n## Gaps\n- Replication?\n";
  it("keeps page and gaps from a From-a-book save", () => {
    expect(placementForBookNote({ id: "p1", body }, { label: "Make It Stick", locus: "p. 28" })).toEqual({
      pageId: "p1", page: 28, guessed: false, gaps: ["Replication?"],
    });
  });
  it("reads an explicit Kind line as clementine", () => {
    const withKind = "Kind: debate\n\n## How this bears on the book\nAdds a rival account.\n";
    expect(placementForBookNote({ id: "p1", body: withKind }, { label: "X", locus: "p. 1" })).toMatchObject({
      kind: "debate", kindBy: "clementine", kindGuessed: false,
    });
  });
  it("skips notes that are not from a book", () => {
    expect(placementForBookNote({ id: "p1", body }, undefined)).toBeNull();
  });
  it("leaves the page off when the locus names a chapter the shelf doesn't know", () => {
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "chapter 3" })).not.toHaveProperty("page");
  });
  it("puts a chapter-only locus at the chapter's first page, as a guess", () => {
    const chapters = [{ title: "One", start: 1 }, { title: "Two", start: 23 }, { label: "3", title: "Three", start: 46 }];
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "Ch. 2" }, chapters)).toMatchObject({ page: 23, guessed: true });
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "chapter 3: Mix it up" }, chapters)).toMatchObject({ page: 46, guessed: true });
  });
  it("ignores old Verdict lines: the stance is gone, kinds replace it", () => {
    const verdict = "## How this bears on the book\nVerdict: complicates\nIt mostly supports the claim, but...\n";
    expect(placementForBookNote({ id: "p1", body: verdict }, { label: "X" })).toBeNull();
  });
});

describe("placementForComposedPage", () => {
  it("places a written note at its typed page only when it has a book origin", () => {
    expect(placementForComposedPage("p1", [{ kind: "book" }], "42")).toEqual({ pageId: "p1", page: 42, guessed: false });
    expect(placementForComposedPage("p1", [{ kind: "notebook" }], "42")).toBeNull();
    expect(placementForComposedPage("p1", [{ kind: "book" }], "")).toBeNull();
    expect(placementForComposedPage("p1", [{ kind: "book" }], "-3")).toBeNull();
  });
});

describe("kind grading on save", () => {
  beforeEach(() => {
    client.getShelf.mockReset();
    client.savePlacements.mockReset().mockResolvedValue([]);
    client.gradeKind.mockReset();
  });

  it("does not hold up a From-a-book save while the kind is graded", async () => {
    let finishGrading: () => void = () => {};
    client.gradeKind.mockReturnValue(new Promise(resolve => { finishGrading = () => resolve({}); }));
    await recordBookNote({ id: "p1", body: "## In the book\nx\n" }, { label: "Make It Stick", locus: "p. 28" });
    expect(client.gradeKind).toHaveBeenCalledWith("p1");
    finishGrading();
  });

  it("skips grading when Clementine wrote a Kind line", async () => {
    await recordBookNote({ id: "p1", body: "Kind: case\n\n## In the book\nx\n" }, { label: "Make It Stick", locus: "p. 28" });
    expect(client.gradeKind).not.toHaveBeenCalled();
  });

  it("grades a write-it-yourself book note, with or without a typed page", async () => {
    client.gradeKind.mockResolvedValue({});
    await recordComposedPage("p2", [{ kind: "book" }], "");
    expect(client.savePlacements).not.toHaveBeenCalled();
    expect(client.gradeKind).toHaveBeenCalledWith("p2");

    await recordComposedPage("p3", [{ kind: "book" }], "42");
    expect(client.savePlacements).toHaveBeenCalledWith([{ pageId: "p3", page: 42, guessed: false }]);
    expect(client.gradeKind).toHaveBeenCalledWith("p3");
  });

  it("leaves notes without a book origin alone, and never throws when grading fails", async () => {
    await recordComposedPage("p4", [{ kind: "notebook" }], "42");
    expect(client.gradeKind).not.toHaveBeenCalled();

    client.gradeKind.mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordComposedPage("p5", [{ kind: "book" }], "")).resolves.toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
