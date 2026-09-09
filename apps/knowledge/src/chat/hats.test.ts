import { describe, expect, it } from "vitest";
import { CHAT_HATS, DEFAULT_CHAT_HAT, hatById, hatForArchiveMessage, resolveChatPlan } from "./hats";
import { isArchiveLookupQuery } from "../research/topicQuery";

describe("chat hats", () => {
  it("ships nine hats including Ask Clementine and From a book and no Consolidation", () => {
    expect(CHAT_HATS.map(hat => hat.id)).toEqual([
      "makeNote",
      "fromBook",
      "scoping",
      "synthesis",
      "evidence",
      "contested",
      "internalExternal",
      "methods",
      "writing",
    ]);
    expect(DEFAULT_CHAT_HAT).toBe("scoping");
    expect(CHAT_HATS.some(hat => /consolidat/i.test(hat.label))).toBe(false);
    for (const hat of CHAT_HATS) {
      expect(hat.explain).toMatch(/^[A-Z][^.?!]*[.?!]$/);
    }
  });

  it("forces Scope the archive for existence checks even under synthesis", () => {
    expect(
      hatForArchiveMessage("synthesis", "Do I already have a note on coincidence reasoning?", isArchiveLookupQuery),
    ).toEqual({ hat: "scoping", depth: "single", scope: "wide" });
    expect(hatForArchiveMessage("makeNote", "Do I already have a note on X?", isArchiveLookupQuery)).toEqual({
      hat: "makeNote",
    });
    expect(resolveChatPlan("scoping")).toMatchObject({ kernel: "quick", maxRounds: 1 });
  });

  it("uses cheap defaults and lets discrete dials override them", () => {
    expect(resolveChatPlan("scoping")).toMatchObject({
      hat: hatById("scoping"),
      scope: "wide",
      depth: "single",
      kernel: "quick",
      k: 32,
      maxRounds: 1,
      negation: false,
    });
    expect(resolveChatPlan("evidence")).toMatchObject({
      scope: "narrow",
      depth: "verified",
      kernel: "deep",
      k: 8,
      maxRounds: 2,
      negation: true,
    });
    expect(resolveChatPlan("synthesis")).toMatchObject({
      scope: "standard",
      depth: "iterative",
      kernel: "deep",
      maxRounds: 5,
    });
    expect(resolveChatPlan("methods")).toMatchObject({
      tags: ["Research Methods and Evidence Literacy"],
      kernel: "quick",
    });
    expect(resolveChatPlan("writing", { scope: "wide", depth: "exhaustive" })).toMatchObject({
      scope: "wide",
      depth: "exhaustive",
      kernel: "deep",
      k: 48,
      maxRounds: 5,
    });
    expect(hatById("writing").plan).toMatch(/answer it from the archive/i);
    expect(hatById("writing").plan).not.toMatch(/University writing-coach/i);
    expect(hatById("synthesis").plan).toMatch(/\[Title\]\(pageId\)/);
    expect(hatById("synthesis").plan).toMatch(/central claim/i);
    expect(hatById("synthesis").plan).toMatch(/explanatory levels/i);
    expect(hatById("synthesis").plan).not.toMatch(/archive page id/i);
    expect(hatById("synthesis").explain).toMatch(/audit trail/);
    expect(resolveChatPlan("fromBook")).toMatchObject({
      scope: "standard",
      depth: "single",
      kernel: "quick",
      k: 16,
      maxRounds: 1,
    });
    expect(hatById("fromBook").plan).toMatch(/bears on the book/i);
    expect(hatById("fromBook").plan).toMatch(/open web/i);
    expect(hatById("fromBook").plan).toMatch(/not the archive/i);
    expect(resolveChatPlan("makeNote")).toMatchObject({
      scope: "standard",
      depth: "single",
      kernel: "quick",
      k: 16,
      maxRounds: 1,
    });
    expect(hatById("makeNote").plan).toMatch(/open web/i);
    expect(hatById("makeNote").plan).toMatch(/not the archive/i);
    expect(hatById("makeNote").plan).toMatch(/no notebook|Do not stamp/i);
    expect(hatById("makeNote").explain).toMatch(/no notebook/i);
  });
});
