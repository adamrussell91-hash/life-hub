import { describe, expect, it } from "vitest";
import notesPlace from "../origin/notesPlace.json";
import { notebookCards, notebookCatalog, notebookSlug, notesForNotebook } from "./catalog";

describe("notebook catalog", () => {
  it("lists the recovered notebooks and only the covers we have", () => {
    const catalog = notebookCatalog();
    expect(catalog.map(item => item.label)).toEqual(Object.keys(notesPlace.notebook));
    expect(catalog).toHaveLength(12);
    expect(catalog.find(item => item.label === "Cognitive Psychology")?.image).toBe(
      "./notebooks/cognitive-psychology.jpg",
    );
    expect(catalog.find(item => item.label === "Philosophy")?.image).toBe("./notebooks/philosophy.jpg");
    expect(catalog.filter(item => item.image)).toHaveLength(2);
  });

  it("slugs apostrophes out of Boy's Education", () => {
    expect(notebookSlug("Boy's Education")).toBe("boys-education");
  });

  it("counts notes and keeps unknown notebook labels", () => {
    const cards = notebookCards([
      { id: "a", origins: [{ kind: "notebook", label: "Philosophy" }] },
      { id: "b", origins: [{ kind: "notebook", label: "Philosophy" }] },
      { id: "c", origins: [{ kind: "notebook", label: "Brown 2022" }] },
      { id: "d", origins: [{ kind: "unit", label: "EDST5805" }] },
    ]);
    expect(cards.find(item => item.label === "Philosophy")?.count).toBe(2);
    expect(cards.find(item => item.label === "Literacy")?.count).toBe(0);
    expect(cards.find(item => item.label === "Brown 2022")).toEqual({
      label: "Brown 2022",
      slug: "brown-2022",
      count: 1,
    });
  });

  it("filters notes to one notebook", () => {
    const pages = [
      { id: "p1", title: "One", excerpt: "a", origins: [{ kind: "notebook" as const, label: "Literacy" }] },
      { id: "p2", title: "Two", excerpt: "b", origins: [{ kind: "notebook" as const, label: "Philosophy" }] },
    ];
    expect(notesForNotebook(pages, "Philosophy").map(item => item.id)).toEqual(["p2"]);
  });
});
