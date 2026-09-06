import { describe, expect, it } from "vitest";
import notesPlace from "../origin/notesPlace.json";
import { notebookCards, notebookCatalog, notebookCoverSrc, notebookSlug, notesForNotebook } from "./catalog";

const cover = (file: string) => notebookCoverSrc(file);

describe("notebook catalog", () => {
  it("lists the recovered notebooks and only the covers we have", () => {
    const catalog = notebookCatalog();
    expect(catalog.map(item => item.label)).toEqual(Object.keys(notesPlace.notebook));
    expect(catalog).toHaveLength(12);
    expect(catalog.find(item => item.label === "Cognitive Psychology")?.image).toBe(cover("cognitive-psychology.jpg"));
    expect(catalog.find(item => item.label === "Philosophy")?.image).toBe(cover("philosophy.jpg"));
    expect(catalog.find(item => item.label === "Wellbeing")?.image).toBe(cover("wellbeing.jpg"));
    expect(catalog.find(item => item.label === "Social and Political Thought")?.image).toBe(
      cover("social-and-political-thought.jpg"),
    );
    expect(catalog.find(item => item.label === "Pedagogy and Planning")?.image).toBe(cover("pedagogy-and-planning.jpg"));
    expect(catalog.find(item => item.label === "Numeracy")?.image).toBe(cover("numeracy.jpg"));
    expect(catalog.find(item => item.label === "Mathematics")?.image).toBe(cover("mathematics.jpg"));
    expect(catalog.find(item => item.label === "Literacy")?.image).toBe(cover("literacy.jpg"));
    expect(catalog.find(item => item.label === "Leadership and Innovation")?.image).toBe(
      cover("leadership-and-innovation.jpg"),
    );
    expect(catalog.find(item => item.label === "Gifted Education")?.image).toBe(cover("gifted-education.jpg"));
    expect(catalog.find(item => item.label === "Boy's Education")?.image).toBe(cover("boys-education.jpg"));
    expect(catalog.filter(item => item.image)).toHaveLength(11);
    expect(catalog.find(item => item.label === "Educational Neuroscience")?.image).toBeUndefined();
  });

  it("roots covers at the Vite base so /knowledge without a slash still finds them", () => {
    const here = "https://life-hub.adam-russell.com/knowledge";
    expect(notebookCoverSrc("philosophy.jpg", "/knowledge/")).toBe("/knowledge/notebooks/philosophy.jpg");
    expect(new URL("./notebooks/philosophy.jpg", here).pathname).toBe("/notebooks/philosophy.jpg");
    expect(new URL(notebookCoverSrc("philosophy.jpg", "/knowledge/"), here).pathname).toBe(
      "/knowledge/notebooks/philosophy.jpg",
    );
    expect(notebookCatalog().find(item => item.image)?.image?.startsWith("./")).toBe(false);
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
