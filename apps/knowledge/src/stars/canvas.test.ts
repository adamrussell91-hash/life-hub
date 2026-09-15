import { describe, expect, it } from "vitest";
import { random, seedOf } from "./canvas";

describe("Stars canvas seeding", () => {
  it("produces an identical sequence for the same seed", () => {
    const genA = random(seedOf("stars_example"));
    const genB = random(seedOf("stars_example"));
    expect([genA(), genA(), genA()]).toEqual([genB(), genB(), genB()]);
  });

  it("produces a different first value for a different seed", () => {
    const genA = random(seedOf("stars_one"));
    const genB = random(seedOf("stars_two"));
    expect(genA()).not.toBeCloseTo(genB(), 6);
  });
});
