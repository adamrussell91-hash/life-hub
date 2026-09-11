import { describe, expect, it } from "vitest";
import { parseStarsProposal, StarsProposalSchema } from "./schema";
import { groundStarsProposal } from "./client";

function proposal() {
  const notes = Array.from({ length: 5 }, (_, index) => ({
    pageId: `page_${index}`,
    title: `Note ${index}`,
    excerpt: `Evidence ${index}`,
    role: `Role ${index}`,
  }));
  return {
    version: 1 as const,
    query: "models of reading",
    title: "Models of Reading",
    symbol: { templateId: "eye" as const, label: "Eye", meaning: "Several ways of seeing reading." },
    notes,
    relations: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [2, 4]].map(([source, target]) => ({
      sourceId: notes[source]!.pageId,
      targetId: notes[target]!.pageId,
      type: "extends" as const,
      explanation: "A grounded connection.",
    })),
    synthesis: {
      summary: "A connected account.",
      claims: [{ text: "A grounded claim.", sourceIds: [notes[0]!.pageId] }],
      tensions: [],
      gaps: [],
    },
  };
}

describe("Stars proposal schema", () => {
  it("accepts a grounded five note constellation from fenced JSON", () => {
    const parsed = parseStarsProposal(`\`\`\`json\n${JSON.stringify(proposal())}\n\`\`\``);
    expect(parsed.symbol.templateId).toBe("eye");
    expect(parsed.notes).toHaveLength(5);
  });

  it("rejects relationships to notes outside the constellation", () => {
    const value = proposal();
    value.relations[0]!.targetId = "page_missing";
    expect(StarsProposalSchema.safeParse(value).success).toBe(false);
  });

  it("rejects a decorative symbol line with no grounded relationship", () => {
    const value = proposal();
    value.relations.pop();
    expect(StarsProposalSchema.safeParse(value).success).toBe(false);
  });

  it("rejects unsupported symbol templates", () => {
    const value = proposal() as Record<string, any>;
    value.symbol.templateId = "planet";
    expect(StarsProposalSchema.safeParse(value).success).toBe(false);
  });

  it("rejects note ids outside the current archive and restores canonical titles", () => {
    const parsed = StarsProposalSchema.parse(proposal());
    const entries = parsed.notes.map(note => ({ id: note.pageId, title: `Archive ${note.title}`, area: "notes" as const, tags: [], excerpt: "" }));
    expect(groundStarsProposal(parsed, entries).notes[0]!.title).toBe("Archive Note 0");
    expect(() => groundStarsProposal(parsed, entries.slice(1))).toThrow(/outside the current archive/);
  });
});
