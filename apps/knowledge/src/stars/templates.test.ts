import { describe, expect, it } from "vitest";
import { chooseStarsTemplate } from "./chooseTemplate.mjs";
import { buildLocalStarsProposal } from "./localProposal";
import { buildStarsLayout, templateForQuery } from "./templates";

describe("Stars symbol templates", () => {
  it("keeps every supported note count inside normalized bounds", () => {
    for (const id of ["eye", "bridge", "cycle", "spiral", "tree", "compass"] as const) {
      for (let count = 5; count <= 10; count += 1) {
        const layout = buildStarsLayout(id, count);
        expect(layout.points).toHaveLength(count);
        expect(layout.segments.length).toBeGreaterThanOrEqual(count - 1);
        expect(layout.points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
        expect(layout.segments.every(segment => segment.source < count && segment.target < count)).toBe(true);
      }
    }
  });

  it("gives each template a different point pattern", () => {
    const signatures = ["eye", "bridge", "cycle", "spiral", "tree", "compass"].map(id =>
      JSON.stringify(buildStarsLayout(id, 6).points.map(point => [point.x.toFixed(2), point.y.toFixed(2)])),
    );
    expect(new Set(signatures).size).toBe(6);
  });

  it("chooses a shape from what the grouping is about, not a default spiral", () => {
    expect(templateForQuery("models of reading")).toBe("eye");
    expect(templateForQuery("leadership under uncertainty")).toBe("compass");
    expect(chooseStarsTemplate({ query: "curriculum differentiation for gifted students" })).toBe("tree");
    expect(chooseStarsTemplate({ query: "feedback loops in assessment" })).toBe("cycle");
    expect(chooseStarsTemplate({ query: "bridging inclusion and neurodiversity" })).toBe("bridge");
    expect(chooseStarsTemplate({ query: "research methods and iterative inquiry" })).toBe("spiral");
    expect(chooseStarsTemplate({ query: "what notes do I have?" })).not.toBe("spiral");
    expect(chooseStarsTemplate({
      query: "this topic",
      notes: [{ title: "Note", excerpt: "", tags: ["Educational Leadership and Change"] }],
    })).toBe("compass");
  });
});

describe("local Stars proposal shape", () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    id: `page_${index}`,
    title: `Curriculum differentiation note ${index}`,
    area: "notes" as const,
    tags: ["Curriculum Differentiation and Enrichment"],
    excerpt: "Branching pathways through the curriculum.",
  }));

  it("uses a tree when the selected notes are about differentiation", () => {
    const proposal = buildLocalStarsProposal("curriculum differentiation", entries);
    expect(proposal.symbol.templateId).toBe("tree");
    expect(proposal.symbol.label).toBe("Tree");
  });
});
