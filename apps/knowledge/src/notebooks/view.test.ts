import { describe, expect, it } from "vitest";
import { notebookCardHtml, notebookOpenHtml, notebooksGridHtml } from "./view";

const covered = {
  label: "Cognitive Psychology",
  slug: "cognitive-psychology",
  image: "./notebooks/cognitive-psychology.jpg",
  count: 12,
};

const bare = { label: "Literacy", slug: "literacy", count: 0 };

describe("notebooks view html", () => {
  it("renders equal cards with a shared morph image and title", () => {
    const html = notebooksGridHtml([covered, bare]);
    expect(html).toContain('data-notebook="Cognitive Psychology"');
    expect(html).toContain('src="./notebooks/cognitive-psychology.jpg"');
    expect(html).toContain('data-hub-morph="image"');
    expect(html).toContain('data-hub-morph="title"');
    expect(html).toContain("nb-card__image--empty");
    expect(html).toContain("Literacy");
    expect(notebookCardHtml(covered)).not.toContain("nb-card__image--empty");
  });

  it("turns the cover into a header and lists notes underneath", () => {
    const html = notebookOpenHtml(covered, [
      { id: "n1", title: "Working memory", excerpt: "Hold a few items." },
      { id: "n2", title: "Working memory", excerpt: "Working memory" },
    ]);
    expect(html).toContain("nb-open__hero");
    expect(html).toContain('src="./notebooks/cognitive-psychology.jpg"');
    expect(html).toContain("12 notes");
    expect(html).toContain('data-open-page="n1"');
    expect(html).toContain("Hold a few items.");
    expect(html.split('data-open-page="n2"')[1]).not.toContain("nb-note__excerpt");
    expect(notebookOpenHtml(bare, [])).toContain("No notes in this notebook yet.");
    expect(notebookOpenHtml({ ...covered, count: 1 }, [])).toContain("1 note");
  });
});
