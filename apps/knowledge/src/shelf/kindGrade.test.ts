import { describe, expect, it } from "vitest";
import { kindFromBody } from "./model";
import { parseKindGrade } from "./kindGrade";

// Real body text from knowledge-hub-data gold notes (D4) — not invented strings.
const REAL = {
  person: `# Paul G. Bahn on Prehistoric Art: Evidence, Interpretation, and Cognitive History

## Why Bahn matters for understanding prehistoric cognition

*The Knowledge Gene* invokes Bahn because prehistoric art is among the most powerful evidence for early symbolic cognition — the capacity to represent, communicate, and think abstractly. Bahn is the field's most prominent English-language synthesiser of the evidence on what that art actually is and what it can and cannot be said to mean.

## Who Bahn is

Paul Gerard Bahn is a British archaeologist, translator, writer and broadcaster with extensive publications on archaeological topics, particularly prehistoric art.`,
  idea: `## Overview

A **supergene** is a chromosomal region encompassing multiple neighbouring genes that are inherited together as a single unit because recombination between them is suppressed. Supergenes permit the co-segregation of co-adapted alleles that together produce a complex, integrated phenotype — effectively allowing polygenic traits to be inherited as if they were controlled by a single Mendelian locus.`,
  case: `## Authority and Expert Consensus

The E.O. Wilson versus Richard Dawkins group-selection debate (BBC Radio 4's *The Life Scientific*) illustrates how consensus serves as an indicator of expert trustworthiness—and how consensus arguments themselves can be resisted. Dawkins cited a letter to *Nature* signed by 140 eminent evolutionary biologists against Wilson's theory.`,
  debate: `## Key Interpretive Cautions

The chapter warns against over-interpreting Brodmann-style maps: "the precise division of the cortex into different areas of specialisation... oversimplifies and misleads the reader." Sensory areas are more extensive than initially described, and motor responses can be evoked from stimulating "sensory" areas. This caution applies to treating neat lobe-by-lobe area lists as literal, sharply bounded maps.

The concept of "association cortex" is presented as a term of convenience rather than settled science. The text states plainly that "precisely what they associate is not known," and the older serial model (sensory areas feed association areas feed motor areas) "has not been established" by recent clinical and experimental evidence.`,
  bridge: `# The Gestalt Property: Whole-Brain Perception and Its Implications for Learning

## In the Book

*The Neural Mind* appears to be using the gestalt property as a neurological claim, not merely a perceptual one: the brain's default operation is not to assemble meaning from isolated inputs but to construct it holistically, at the level of organised wholes. This is a foundational move for any argument about how minds actually process information — and it sits against any pedagogy that begins with parts and hopes the whole will eventually emerge.`,
} as const;

function reply(kind: string, fallback: string, evidence: string, confidence = 0.9, reason = "fits") {
  return JSON.stringify({ kind, fallback, evidence, reason, confidence });
}

describe("kindFromBody", () => {
  it("reads Kind lines with the same tolerance as Verdict", () => {
    expect(kindFromBody("Kind: person\n\n# Title")).toBe("person");
    expect(kindFromBody("> Kind: idea")).toBe("idea");
    expect(kindFromBody("- **Kind:** case")).toBe("case");
    expect(kindFromBody("* Kind：debate")).toBe("debate");
    expect(kindFromBody("Kind: bridge")).toBe("bridge");
  });
  it("has no prose fallback", () => {
    expect(kindFromBody(REAL.person)).toBeUndefined();
    expect(kindFromBody("This note is about a debate in the field.")).toBeUndefined();
  });
});

describe("parseKindGrade", () => {
  it("accepts a high-confidence crystallised grade on real note text", () => {
    const grade = parseKindGrade(reply("idea", "idea", "A **supergene** is a chromosomal region", 0.95), REAL.idea);
    expect(grade).toMatchObject({ kind: "idea", kindGuessed: false, downgraded: false });
  });

  it("downgrades debate/bridge when the evidence quote is missing (D1)", () => {
    const grade = parseKindGrade(
      reply("debate", "idea", "this sentence is not in the note", 0.9, "looks contested"),
      REAL.debate,
    );
    expect(grade.kind).toBe("idea");
    expect(grade.kindGuessed).toBe(true);
    expect(grade.downgraded).toBe(true);
    expect(grade.kindReason).toMatch(/^Downgraded: quote not found/);
  });

  it("keeps debate when the quote is present (whitespace/case tolerant)", () => {
    const grade = parseKindGrade(
      reply("debate", "idea", "precisely what they associate is not known", 0.85),
      REAL.debate,
    );
    expect(grade).toMatchObject({ kind: "debate", kindGuessed: false, downgraded: false });
  });

  it("keeps bridge when the quote points outside the book", () => {
    const grade = parseKindGrade(
      reply("bridge", "idea", "it sits against any pedagogy that begins with parts", 0.88),
      REAL.bridge,
    );
    expect(grade).toMatchObject({ kind: "bridge", kindGuessed: false });
  });

  it("marks low confidence and missing confidence as guessed (D1)", () => {
    expect(parseKindGrade(reply("person", "person", "Paul Gerard Bahn is a British archaeologist", 0.4), REAL.person).kindGuessed).toBe(true);
    expect(parseKindGrade(JSON.stringify({ kind: "case", fallback: "case", evidence: "E.O. Wilson versus Richard Dawkins", reason: "x" }), REAL.case).kindGuessed).toBe(true);
  });

  it("returns unreadable for garbage so the caller can retry then default", () => {
    expect(parseKindGrade("not json", REAL.idea)).toEqual({ unreadable: true });
    expect(parseKindGrade(JSON.stringify({ kind: "mystery", fallback: "idea", evidence: "x", confidence: 1 }), REAL.idea)).toEqual({
      unreadable: true,
    });
  });

  it("grades each gold kind against real body text without inventing strings (D4)", () => {
    expect(parseKindGrade(reply("person", "person", "Paul Gerard Bahn is a British archaeologist", 0.9), REAL.person).kind).toBe("person");
    expect(parseKindGrade(reply("idea", "idea", "inherited together as a single unit", 0.9), REAL.idea).kind).toBe("idea");
    expect(parseKindGrade(reply("case", "case", "E.O. Wilson versus Richard Dawkins group-selection debate", 0.9), REAL.case).kind).toBe("case");
    expect(parseKindGrade(reply("debate", "idea", "has not been established", 0.9), REAL.debate).kind).toBe("debate");
    expect(parseKindGrade(reply("bridge", "idea", "Implications for Learning", 0.9), REAL.bridge).kind).toBe("bridge");
  });
});
