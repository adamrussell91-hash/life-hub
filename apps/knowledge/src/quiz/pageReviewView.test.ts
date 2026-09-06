import { describe, expect, it } from "vitest";
import { seedPageReview } from "./pageReview";
import { duePagesHtml, pageReviewActionsHtml } from "./pageReviewView";

describe("duePagesHtml", () => {
  it("returns nothing when nothing is due", () => {
    expect(duePagesHtml([])).toBe("");
  });

  it("lists due notes as open buttons without a Run-style write", () => {
    const review = seedPageReview({
      id: "page_1",
      title: "Working memory",
      updated_at: "2026-08-01T00:00:00.000Z",
    });
    const html = duePagesHtml([review]);
    expect(html).toContain("Due to revisit");
    expect(html).toContain("Working memory");
    expect(html).toContain('data-open-page="page_1"');
    expect(html).not.toContain("section-kicker");
  });
});

describe("pageReviewActionsHtml", () => {
  it("reuses the quiz Again/Hard/Good/Easy ratings", () => {
    const html = pageReviewActionsHtml();
    expect(html).toContain("data-page-rate=\"1\"");
    expect(html).toContain("Again");
    expect(html).toContain("Hard");
    expect(html).toContain("Good");
    expect(html).toContain("Easy");
  });
});
