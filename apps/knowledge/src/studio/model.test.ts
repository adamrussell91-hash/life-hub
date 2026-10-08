import { describe, expect, it } from "vitest";
import {
  alreadyWritten,
  assembleDraft,
  chapterCount,
  cornerstones,
  draftMarkdown,
  flatChapters,
  formatWords,
  insights,
  nextMove,
  sharedNotes,
  singleSourceRisk,
  suggestNotes,
} from "./model";
import { parseStudioData, type StudioBook, type StudioData } from "./schema";

const book = (over: Partial<StudioBook> & Pick<StudioBook, "id">): StudioBook => ({
  title: over.id,
  short: over.id,
  subtitle: "",
  area: "gifted",
  added: "2025-10-20",
  kind: "chapters",
  stage: "Just an Idea",
  blurb: "",
  notes: [],
  ...over,
});

const ch = (title: string, notes: string[] = []) => ({ title, notes });

function fixture(): StudioData {
  return parseStudioData({
    schema_version: 1,
    notes: {
      a: { title: "Revisiting Gifted Education", words: 500, in_knowledge: true },
      b: { title: "Equity in Gifted Education", words: 1000, in_knowledge: true },
      c: { title: "Six Profiles", words: 300, in_knowledge: true },
      gone: { title: "Lost note", words: 0, in_knowledge: false },
    },
    books: [
      book({
        id: "missed",
        short: "Brilliance Missed",
        series: "The Brilliance Series",
        area: "series",
        notes: ["a", "b", "c", "gone"],
        parts: [
          { name: "The Problem", chapters: [ch("Invisible"), ch("Why We Miss", ["a", "b"])] },
          { name: "Hidden Potential", chapters: [ch("Six Profiles", ["c"]), ch("Underachievers", ["b", "gone"])] },
        ],
      }),
      book({
        id: "equity",
        short: "Excellence for All",
        notes: ["a", "b", "c"],
        parts: [{ name: "One", chapters: [ch("Gap", ["a"])] }],
      }),
      book({ id: "studio", short: "Studio", area: "teachers", kind: "interview", audience: ["Primary Teachers", "Secondary Teachers"], subjects: ["Pedagogy"],
        interview: { questions: [["The best stolen move", "x"]], cast: ["a", "b"] } }),
      book({ id: "borrow", short: "Can I Borrow That?", area: "teachers", kind: "blank", audience: ["Primary Teachers"], subjects: ["Pedagogy"] }),
      book({ id: "nine", area: "gifted", notes: ["a"], parts: [{ name: "P", chapters: [ch("x", ["a"])] }], cites_books: ["missed"] }),
      book({ id: "ten", area: "gifted", notes: ["a"], parts: [{ name: "P", chapters: [ch("y", ["a"])] }] }),
    ],
  });
}

describe("studio model", () => {
  it("parses invalid data to an empty studio", () => {
    expect(parseStudioData({ nope: true }).books).toEqual([]);
  });

  it("flattens chapters with running indexes", () => {
    const data = fixture();
    expect(flatChapters(data.books[0]).map(c => [c.part, c.index])).toEqual([[0, 0], [0, 1], [1, 2], [1, 3]]);
    expect(chapterCount(data.books[2])).toBe(2);
  });

  it("counts words already in Knowledge once per note and skips notes that never arrived", () => {
    const data = fixture();
    const w = alreadyWritten(data.books[0], data);
    expect(w.words).toBe(1800);
    expect(w.notes).toBe(3);
    expect(w.missing).toBe(1);
    expect(w.ink).toBe(0.75);
  });

  it("finds shared research and cornerstones", () => {
    const data = fixture();
    expect(sharedNotes(data.books[0], data.books[1], data)).toEqual(["a", "b", "c"]);
    expect(cornerstones(data)[0]).toMatchObject({ ref: "a" });
    expect(cornerstones(data)[0].books).toHaveLength(4);
  });

  it("picks the best-covered part and its fullest chapter", () => {
    const data = fixture();
    const move = nextMove(data.books[0], data)!;
    expect(move.partName).toBe("Hidden Potential");
    expect(move.chapter.title).toBe("Underachievers");
    expect(move.chapterWords).toBe(1000);
  });

  it("flags a book leaning on one source only when it has enough chapters", () => {
    const data = fixture();
    expect(singleSourceRisk(data.books[0], data)).toBeNull();
    const heavy = book({ id: "heavy", parts: [{ name: "P", chapters: Array.from({ length: 7 }, (_, i) => ch(`c${i}`, i < 6 ? ["a"] : ["b"])) }] });
    expect(singleSourceRisk(heavy, data)).toMatchObject({ ref: "a", leaning: 6, researched: 7 });
  });

  it("notices merges, series fit, cornerstones, citations and lost notes", () => {
    const data = fixture();
    const ids = insights(data).map(i => i.id.split(":")[0]);
    expect(ids).toEqual(expect.arrayContaining(["merge", "series", "cornerstone", "cites", "missing"]));
    const merge = insights(data).find(i => i.id.startsWith("merge"))!;
    expect(merge.title).toContain("The best stolen move");
  });

  it("drops insights once decided", () => {
    const data = fixture();
    const first = insights(data)[0];
    data.decisions[first.id] = { choice: "dismiss", at: "2026-10-08T00:00:00.000Z" };
    expect(insights(data).map(i => i.id)).not.toContain(first.id);
  });

  it("suggests unlinked notes that match the chapter title", () => {
    const data = fixture();
    const docs = [
      { id: "p1", title: "Universal screening for gifted students", excerpt: "screening every student" },
      { id: "p2", title: "Recipe for bread", excerpt: "flour" },
      { id: "a", title: "Universal screening linked", excerpt: "screening" },
    ];
    const target = { title: "Universal Screening", notes: ["a"] };
    expect(suggestNotes(data.books[0], target, docs).map(d => d.id)).toEqual(["p1"]);
  });

  it("assembles a draft from quoted paragraphs, three per source at most", () => {
    const data = fixture();
    const para = (n: number, extra = "") =>
      `${extra} Paragraph ${n} talks about gifted students and how teachers miss underachievers in ordinary classrooms every single day of the school year.`;
    const outline = ["- Underachievers one two three four five six seven eight nine ten", "- Underachievers eleven twelve thirteen fourteen fifteen sixteen seventeen"].join("\n");
    const body = ["# Heading", para(1, "Underachievers"), outline, para(2), para(3, "Underachievers"), para(4), "too short"].join("\n\n");
    const draft = assembleDraft(data.books[0], { title: "Underachievers", notes: [] }, [{ id: "s", title: "Src", body }]);
    expect(draft).toHaveLength(3);
    expect(draft[0].text).toContain("Underachievers");
    expect(draft.every(p => p.source.id === "s")).toBe(true);
    expect(draft.some(p => p.text.includes("eleven"))).toBe(false);
    const md = draftMarkdown(data.books[0], flatChapters(data.books[0])[3], draft, "08/10/26");
    expect(md).toContain("chapter 4");
    expect(md).toContain("— from “Src”");
  });

  it("formats word counts", () => {
    expect([formatWords(950), formatWords(1200), formatWords(31400)]).toEqual(["950", "1.2k", "31k"]);
  });
});
