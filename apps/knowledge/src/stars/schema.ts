import { z } from "zod";
import { buildStarsLayout } from "./templates";

export const StarsTemplateIdSchema = z.enum([
  "eye",
  "bridge",
  "cycle",
  "spiral",
  "tree",
  "compass",
]);
export type StarsTemplateId = z.infer<typeof StarsTemplateIdSchema>;

export const StarsRelationTypeSchema = z.enum([
  "supports",
  "complicates",
  "extends",
  "applies",
  "contrasts",
  "builds_on",
]);
export type StarsRelationType = z.infer<typeof StarsRelationTypeSchema>;

export const StarsNoteSchema = z.object({
  pageId: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().default(""),
  role: z.string().min(1),
});
export type StarsNote = z.infer<typeof StarsNoteSchema>;

export const StarsRelationSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: StarsRelationTypeSchema,
  explanation: z.string().min(1),
});
export type StarsRelation = z.infer<typeof StarsRelationSchema>;

export const StarsClaimSchema = z.object({
  text: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
});
export type StarsClaim = z.infer<typeof StarsClaimSchema>;

const StarsProposalBaseSchema = z.object({
  version: z.literal(1).default(1),
  query: z.string().min(1),
  title: z.string().min(1),
  symbol: z.object({
    templateId: StarsTemplateIdSchema,
    label: z.string().min(1),
    meaning: z.string().min(1),
  }),
  notes: z.array(StarsNoteSchema).min(5).max(10),
  relations: z.array(StarsRelationSchema).min(4).max(24),
  synthesis: z.object({
    summary: z.string().min(1),
    claims: z.array(StarsClaimSchema).min(1).max(6),
    tensions: z.array(z.string()).default([]),
    gaps: z.array(z.string()).default([]),
  }),
});

function validateConstellationLinks(value: z.infer<typeof StarsProposalBaseSchema>, context: z.RefinementCtx) {
  const ids = new Set(value.notes.map(note => note.pageId));
  const relationPairs = new Set(value.relations.map(relation =>
    [relation.sourceId, relation.targetId].sort().join("\u0000"),
  ));
  if (ids.size !== value.notes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Notes must be unique." });
  }
  value.relations.forEach((relation, index) => {
    if (!ids.has(relation.sourceId) || !ids.has(relation.targetId) || relation.sourceId === relation.targetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relations", index],
        message: "Relationship endpoints must be distinct selected notes.",
      });
    }
  });
  value.synthesis.claims.forEach((claim, index) => {
    if (claim.sourceIds.some(id => !ids.has(id))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["synthesis", "claims", index, "sourceIds"],
        message: "Claim sources must be selected notes.",
      });
    }
  });
  const layout = buildStarsLayout(value.symbol.templateId, value.notes.length);
  layout.segments.forEach((segment, index) => {
    const sourceId = value.notes[segment.source]?.pageId;
    const targetId = value.notes[segment.target]?.pageId;
    if (!sourceId || !targetId || relationPairs.has([sourceId, targetId].sort().join("\u0000"))) return;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relations", index],
      message: "Every drawn symbol line must have a grounded relationship.",
    });
  });
}

export const StarsProposalSchema = StarsProposalBaseSchema.superRefine(validateConstellationLinks);
export type StarsProposal = z.infer<typeof StarsProposalSchema>;

export const SavedConstellationSchema = StarsProposalBaseSchema.extend({
  id: z.string().regex(/^stars_[a-z0-9_-]+$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sky: z.object({
    x: z.number().min(0.08).max(0.92),
    y: z.number().min(0.12).max(0.84),
    rotation: z.number(),
    scale: z.number().min(0.7).max(1.3),
  }),
}).superRefine(validateConstellationLinks);
export type SavedConstellation = z.infer<typeof SavedConstellationSchema>;

function jsonCandidate(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const text = fenced ?? raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

export function parseStarsProposal(raw: string): StarsProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate(raw));
  } catch {
    throw new Error("Clementine returned a constellation the Stars renderer could not read.");
  }
  const result = StarsProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Clementine's constellation was incomplete. Try the search again.");
  }
  return result.data;
}
