import { describe, expect, it } from "vitest";
import type { GraphNodeDatum } from "./keywordGraph";
import { buildMemoryIndex, findTwins, inferLatentCauses, linesOfThinking, reinstate, settleAttractor } from "./showAllMemory";

const day = 86_400_000;
function note(id: string, label: string, topic: string, daysIn: number, text = ""): GraphNodeDatum & { text: string } {
  return {
    id,
    kind: "leaf",
    label,
    count: 1,
    color: "#5b8ec8",
    soft: "",
    ink: "",
    r: 3,
    parentKeyword: topic,
    hubLabels: [topic],
    createdAt: new Date(Date.parse("2025-01-01") + daysIn * day).toISOString(),
    text,
  };
}

// Two lines of thinking: retrieval practice (from day 0), then gifted education (from day 30).
const nodes = [
  note("r1", "Retrieval practice strengthens memory", "Learning", 0, "retrieval practice testing effect memory recall"),
  note("r2", "Retrieval practice in the classroom", "Learning", 1, "retrieval practice testing effect recall quizzes"),
  note("r3", "Spaced retrieval practice", "Learning", 2, "retrieval practice spacing testing effect memory"),
  note("r4", "Low stakes quizzing for retrieval", "Learning", 3, "retrieval quizzes testing effect recall memory"),
  note("g1", "Identifying gifted students", "Gifted", 30, "gifted identification talent acceleration ability"),
  note("g2", "Acceleration for gifted learners", "Gifted", 31, "gifted acceleration talent ability enrichment"),
  note("g3", "Enrichment and talent development", "Gifted", 32, "gifted talent enrichment acceleration ability"),
  note("g4", "Twice exceptional gifted learners", "Gifted", 33, "gifted twice exceptional talent ability identification"),
  note("c1", "Retrieval practice strengthens memory", "Learning", 60, "retrieval practice testing effect memory recall"),
];
const mem = buildMemoryIndex(nodes, node => (node as (typeof nodes)[number]).text);

describe("latent cause inference", () => {
  const result = inferLatentCauses(mem, { alpha: 0.15 });

  it("starts a new line when a note is unlike anything before it", () => {
    expect(result.byNote.get("r1")?.kind).toBe("birth");
    expect(result.byNote.get("g1")?.kind).toBe("birth");
    expect(result.byNote.get("g1")?.cause).not.toBe(result.byNote.get("r1")?.cause);
  });

  it("files a note that fits under the line that explains it", () => {
    for (const id of ["r2", "r3", "r4", "c1"]) expect(result.byNote.get(id)?.cause).toBe(result.byNote.get("r1")?.cause);
    for (const id of ["g2", "g3", "g4"]) expect(result.byNote.get(id)?.cause).toBe(result.byNote.get("g1")?.cause);
    expect(result.byNote.get("r2")?.via).toBeTruthy();
  });

  it("names lines that grew, oldest first", () => {
    const lines = linesOfThinking(result, 4);
    expect(lines.map(line => line.founder)).toEqual(["r1", "g1"]);
    expect(lines[1]?.topic).toBe("Gifted");
  });
});

describe("attractor dynamics", () => {
  it("settles a cue into the cluster it belongs to", () => {
    const settling = settleAttractor(mem, ["g2"], { k: 4 });
    expect(new Set(settling.attractor)).toEqual(new Set(["g1", "g2", "g3", "g4"]));
    expect(settling.settledTopic).toBe("Gifted");
    expect(settling.frames.length).toBeGreaterThan(2);
  });
});

describe("reinstatement", () => {
  it("brings back what was written around the same time", () => {
    const back = reinstate(mem, "g2", 2);
    expect(back.context).toEqual(expect.arrayContaining(["g1", "g3"]));
    expect(back.context).not.toContain("r1");
    expect(back.topics[0]).toEqual({ topic: "Gifted", count: 3 });
  });
});

describe("differentiation", () => {
  it("finds copies and says what tells near-twins apart", () => {
    const twins = findTwins(mem, { min: 0.4 });
    expect(twins[0]).toMatchObject({ a: "c1", b: "r1", alike: 1 });
    const near = twins.find(twin => twin.alike < 1);
    expect(near && near.onlyA.length + near.onlyB.length).toBeGreaterThan(0);
  });
});

describe("differentiation and numbered series", () => {
  it("does not call a numbered series copies", () => {
    const series = [note("w4", "Week 4 Lecture", "Uni", 0, "lecture notes week"), note("w9", "Week 9 Lecture", "Uni", 5, "lecture notes week")];
    const index = buildMemoryIndex(series, node => (node as (typeof series)[number]).text);
    expect(findTwins(index, { min: 0.4 })).toEqual([]);
  });
});
