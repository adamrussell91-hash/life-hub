import { describe, expect, it } from "vitest";
import { isArchiveLookupQuery, topicQuery } from "./topicQuery";

describe("topicQuery", () => {
  it("keeps the topic from a scoping question", () => {
    expect(topicQuery("what do I have on attribution theory")).toBe("attribution theory");
    expect(topicQuery("What do I have on Gagne?")).toBe("Gagne");
    expect(topicQuery("Do I already have a note on coincidence reasoning?")).toBe("coincidence reasoning");
  });

  it("leaves a plain topic alone", () => {
    expect(topicQuery("Synthesise Gagne")).toBe("Synthesise Gagne");
  });
});

describe("isArchiveLookupQuery", () => {
  it("recognises existence and coverage checks", () => {
    expect(isArchiveLookupQuery("Do I already have a note on coincidence reasoning?")).toBe(true);
    expect(isArchiveLookupQuery("what do I have on attribution theory")).toBe(true);
    expect(isArchiveLookupQuery("is there a note about Gagne")).toBe(true);
    expect(isArchiveLookupQuery("any notes on spaced practice")).toBe(true);
  });

  it("leaves synthesis and web-note prompts alone", () => {
    expect(isArchiveLookupQuery("Synthesise Gagne")).toBe(false);
    expect(isArchiveLookupQuery("desirable difficulties")).toBe(false);
    expect(isArchiveLookupQuery("How does coincidence reasoning work in practice?")).toBe(false);
  });
});
