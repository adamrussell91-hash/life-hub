import { describe, expect, it } from "vitest";
import { bookFactsPrompt, parseBookFacts } from "./facts";

describe("parseBookFacts", () => {
  const good = '```json\n{"label":"The Enigma of Reason","author":"Hugo Mercier, Dan Sperber","pages":"396","chapters":[{"label":"","title":"Introduction","start":1},{"number":1,"title":"Reason on Trial","page":11}]}\n```';

  it("reads fenced JSON with loose key spellings", () => {
    const parsed = parseBookFacts(`Here you go:\n${good}`, "The Enigma of Reason");
    expect(parsed).toEqual({
      ok: true,
      facts: {
        author: "Hugo Mercier, Dan Sperber",
        pages: 396,
        chapters: [{ title: "Introduction", start: 1 }, { title: "Reason on Trial", start: 11, label: "1" }],
      },
    });
  });

  it("refuses facts for a different book", () => {
    expect(parseBookFacts('{"label":"Make It Stick","pages":300}', "The Knowledge Gene")).toEqual({ ok: false, error: "These facts are for “Make It Stick”, not “The Knowledge Gene”." });
  });

  it("explains bad chapters and bad JSON", () => {
    expect(parseBookFacts('{"pages":100,"chapters":[{"title":"Late","start":150}]}', "X")).toMatchObject({ ok: false, error: expect.stringContaining("after the last page") });
    expect(parseBookFacts('{"chapters":[{"title":"B","start":50},{"title":"A","start":10}]}', "X")).toMatchObject({ ok: false, error: expect.stringContaining("before the chapter above") });
    expect(parseBookFacts("{not json}", "X")).toMatchObject({ ok: false, error: expect.stringContaining("valid JSON") });
    expect(parseBookFacts("no object here", "X")).toMatchObject({ ok: false, error: expect.stringContaining("no JSON object") });
  });

  it("names the book in the prompt", () => {
    expect(bookFactsPrompt("The Knowledge Gene", "Lynne Kelly")).toContain('"The Knowledge Gene" by Lynne Kelly');
  });
});
