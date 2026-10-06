import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { PLANET_LOOKS, planetIconBox, planetLook, planetName, spriteBucket } from "./universePlanets";

describe("the twenty planets", () => {
  it("gives every topic in the vocabulary exactly one named look", () => {
    expect(PLANET_LOOKS).toHaveLength(TOPIC_VOCABULARY.length);
    for (const topic of TOPIC_VOCABULARY) expect(planetLook(topic)?.topic).toBe(topic);
  });

  it("uses each god's name once", () => {
    const names = PLANET_LOOKS.map(look => look.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the agreed names for the planets Adam picked by hand", () => {
    expect(planetName("Technology AI and Digital Learning")).toBe("Hephaestus");
    expect(planetName("Teacher Practice and Professional Learning")).toBe("Chiron");
    expect(planetName("Literacy Language and Communication")).toBe("Thoth");
  });

  it("mixes pantheons: mostly Greek and Roman, two Egyptian, two Celtic, three Asian", () => {
    const count = (match: (p: string) => boolean) => PLANET_LOOKS.filter(look => match(look.pantheon)).length;
    expect(count(p => p === "Greek" || p === "Roman")).toBe(13);
    expect(count(p => p === "Egyptian")).toBe(2);
    expect(count(p => p === "Celtic")).toBe(2);
    expect(count(p => p === "Japanese" || p === "Chinese")).toBe(3);
  });

  it("matches topics regardless of case and falls back to the topic itself", () => {
    expect(planetName("  literacy language and communication ")).toBe("Thoth");
    expect(planetName("Some Unknown Topic")).toBe("Some Unknown Topic");
    expect(planetLook("Some Unknown Topic")).toBeNull();
  });

  it("paints every recipe with real colours derived from the base", () => {
    for (const look of PLANET_LOOKS) {
      const layers = look.surface("#5b8ec8");
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) {
        const colors = "colors" in layer ? layer.colors : "color" in layer ? [layer.color] : [];
        for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("reuses a handful of sprite sizes instead of one per frame size", () => {
    expect(spriteBucket(3)).toBe(6);
    expect(spriteBucket(6)).toBe(6);
    expect(spriteBucket(6.1)).toBe(12);
    expect(spriteBucket(70)).toBe(96);
    expect(spriteBucket(5000)).toBe(384);
  });

  it("leaves room for a ring around ringed drawer icons", () => {
    expect(planetIconBox(10, false)).toBe(24);
    expect(planetIconBox(10, true)).toBe(48);
  });
});
