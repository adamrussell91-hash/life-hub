import { describe, expect, it } from "vitest";
import { KIND_COLOUR, KIND_ORDER, KIND_UNKNOWN, kindColour, kindLabel, kindTally } from "./kinds";
import { ShelfKindSchema } from "./schema";

describe("kinds", () => {
  it("covers every kind the schema allows, once", () => {
    expect([...KIND_ORDER].sort()).toEqual([...ShelfKindSchema.options].sort());
  });

  it("marks Claude's guesses and leaves unsorted notes blank", () => {
    expect(kindLabel({ kind: "bridge", kindGuessed: true })).toBe("bridge?");
    expect(kindLabel({ kind: "debate", kindGuessed: false })).toBe("debate");
    expect(kindLabel({})).toBe("");
  });

  it("colours unsorted notes with the fallback, not a kind", () => {
    expect(kindColour(undefined)).toBe(KIND_UNKNOWN);
    expect(kindColour("idea")).toBe(KIND_COLOUR.idea);
  });

  it("tallies in legend order and leaves out kinds with none", () => {
    expect(kindTally([{ kind: "debate" }, { kind: "idea" }, { kind: "idea" }, {}])).toEqual([
      { kind: "idea", count: 2 },
      { kind: "debate", count: 1 },
    ]);
  });
});
