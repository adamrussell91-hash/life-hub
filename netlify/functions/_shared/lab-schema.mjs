// Generated from apps/teaching/src/lab/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/lab/schema.ts
import { z } from "zod";
var LAB_LEVELS = ["supplied", "students", "pairs"];
var LAB_JUDGE = ["pick", "rate"];
var LAB_LANGUAGE_LEVELS = ["Form", "Sentence", "Word"];
var LAB_STEPS = ["Question", "Design", "Predict", "Make", "Test", "Result", "Name it", "Explain"];
var LAB_LEVEL_LABELS = {
  supplied: "You supply it",
  students: "Students write it",
  pairs: "Pairs design it"
};
var LAB_EXPLAIN_BLOCK_ID = "lab_explain";
var LAB_EXPLAIN_QUESTION_ID = "lab_explain_q";
var LabFeatureSchema = z.object({
  name: z.string().min(1).max(60),
  level: z.enum(LAB_LANGUAGE_LEVELS)
});
var LabPairSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  students: z.array(z.string().min(1).max(64)).min(1).max(4)
});
var LabSettingsSchema = z.object({
  class_id: z.string().max(64).default(""),
  level: z.enum(LAB_LEVELS),
  question: z.string().max(200).default(""),
  why: z.string().max(400).default(""),
  /** Pairs design it: the claim the class tests. */
  claim: z.string().max(200).optional(),
  /** The two supplied levels: what stays the same. */
  same: z.string().max(300).optional(),
  /** The two supplied levels: what changes, two to five options. */
  options: z.array(z.string().max(40)).max(5).optional(),
  /** You supply it: one text per option. */
  texts: z.array(z.string().max(4e3)).max(5).optional(),
  /** Pairs design it: the text every pair changes. Line breaks are kept. */
  control: z.string().max(4e3).optional(),
  /** Students write it: what to write. */
  task: z.string().max(300).optional(),
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().max(200).default(""),
  /** Rate on a line: the two end labels. */
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),
  /** Counts as a win (pick: choices ahead) or a change (rate: points out of 10). Set before any data. */
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(20), z.string().max(200)).optional(),
  features: z.array(LabFeatureSchema).max(12).optional(),
  pairs: z.array(LabPairSchema).max(20).optional(),
  /** Teacher only. */
  debrief: z.string().max(1200).default(""),
  explain_prompt: z.string().max(400).default("")
});
var PublicLabSchema = z.object({
  level: z.enum(LAB_LEVELS),
  question: z.string().max(200),
  why: z.string().max(400),
  claim: z.string().max(200).optional(),
  same: z.string().max(300).optional(),
  options: z.array(z.string().max(40)).max(5).optional(),
  task: z.string().max(300).optional(),
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().max(200),
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(20), z.string().max(200)).optional(),
  features: z.array(LabFeatureSchema).max(12).optional(),
  explain_prompt: z.string().max(400)
});
var LAB_DEFAULT_FEATURES = [
  { name: "Line break (enjambment)", level: "Form" },
  { name: "Hedging (modality)", level: "Sentence" },
  { name: "Sentence type", level: "Sentence" },
  { name: "Punctuation (caesura)", level: "Sentence" },
  { name: "Repetition", level: "Sentence" },
  { name: "Word choice (connotation)", level: "Word" }
];
var LAB_DEFAULT_NOTE_PROMPTS = {
  Question: "Where do you hear it? Quote it.",
  Design: "Why this change? What is it doing in the original?",
  Predict: "Because\u2026",
  Test: "Which version sounded most different? What had changed in it?",
  Result: "What do the dots show? Look at the spread and the overlap.",
  "Name it": "What does this feature do to the voice of the speaker?"
};
function labDefaults(level) {
  const judge = level === "students" ? "pick" : "rate";
  return {
    level,
    judge,
    threshold: judge === "pick" ? 8 : 1,
    notes_on: level === "pairs",
    note_prompts: { ...LAB_DEFAULT_NOTE_PROMPTS },
    ...judge === "rate" ? { ends: level === "pairs" ? ["Not at all", "Completely"] : ["A little", "Completely"] } : {},
    ...level === "pairs" ? { features: LAB_DEFAULT_FEATURES.map((f) => ({ ...f })) } : { options: ["", ""] },
    ...level === "supplied" ? { texts: ["", ""] } : {}
  };
}
function seedLab(classId, level = "supplied") {
  return LabSettingsSchema.parse({ class_id: classId, ...labDefaults(level) });
}
var filled = (text) => typeof text === "string" && text.trim().length > 0;
function labIssues(settings) {
  const out = [];
  if (!filled(settings.class_id)) out.push("Choose the class this lab is for.");
  if (!filled(settings.question)) out.push("Write the lab\u2019s question.");
  if (!filled(settings.judge_question)) out.push("Write the question readers answer.");
  if (settings.judge === "rate" && !(settings.ends && filled(settings.ends[0]) && filled(settings.ends[1]))) out.push("Label both ends of the line readers rate on.");
  if (settings.level === "pairs") {
    if (!filled(settings.claim)) out.push("Write the claim to test.");
    if (!filled(settings.control)) out.push("Paste the control text.");
    if (!settings.features?.length) out.push("List at least one feature to name.");
    if (settings.judge !== "rate") out.push("Pairs design it is judged by rating on a line.");
    if (!settings.pairs?.length) out.push("Make the pairs.");
  } else {
    const options = settings.options ?? [];
    if (options.length < 2 || options.some((o) => !filled(o))) out.push("Name at least two options under Changed.");
    else if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) out.push("Give each option under Changed its own name.");
  }
  if (settings.level === "supplied") {
    const texts = settings.texts ?? [];
    if (texts.length !== (settings.options ?? []).length || texts.some((t) => !filled(t))) out.push("Paste one text for each option.");
  }
  if (settings.level === "students") {
    if (!filled(settings.task)) out.push("Say what students write.");
    if (settings.judge !== "pick") out.push("Students write it is judged by picking one.");
  }
  return out;
}
function explainPrompt(settings) {
  if (filled(settings.explain_prompt)) return settings.explain_prompt.trim();
  return settings.level === "pairs" ? "Does the evidence support the claim? Write one analytical paragraph." : "Explain the result.";
}
function labExplainBlock(settings, now = (/* @__PURE__ */ new Date()).toISOString(), createdAt = now) {
  return {
    id: LAB_EXPLAIN_BLOCK_ID,
    type: "block",
    block_type: "question_set",
    variant: "medium",
    visibility: "student_teacher",
    content: { questions: [{ id: LAB_EXPLAIN_QUESTION_ID, prompt: explainPrompt(settings), kind: "short_answer" }] },
    created_at: createdAt,
    updated_at: now,
    schema_version: 1
  };
}
function withExplainBlock(blocks, settings, now = (/* @__PURE__ */ new Date()).toISOString()) {
  const had = blocks.find((b) => b.id === LAB_EXPLAIN_BLOCK_ID);
  const fresh = labExplainBlock(settings, now, had?.created_at ?? now);
  return had ? blocks.map((b) => b.id === LAB_EXPLAIN_BLOCK_ID ? fresh : b) : [...blocks, fresh];
}
function explainBlockCurrent(blocks, settings) {
  const block = blocks.find((b) => b.id === LAB_EXPLAIN_BLOCK_ID);
  return block?.block_type === "question_set" && block.content?.questions?.length === 1 && block.content.questions[0]?.prompt === explainPrompt(settings);
}
function publicLab(settings) {
  return PublicLabSchema.parse({
    level: settings.level,
    question: settings.question,
    why: settings.why,
    ...settings.level === "pairs" && settings.claim ? { claim: settings.claim } : {},
    ...settings.level !== "pairs" && settings.same ? { same: settings.same } : {},
    ...settings.level !== "pairs" && settings.options ? { options: settings.options } : {},
    ...settings.level === "students" && settings.task ? { task: settings.task } : {},
    judge: settings.judge,
    judge_question: settings.judge_question,
    ...settings.judge === "rate" && settings.ends ? { ends: settings.ends } : {},
    threshold: settings.threshold,
    notes_on: settings.notes_on,
    ...settings.notes_on && settings.note_prompts ? { note_prompts: settings.note_prompts } : {},
    ...settings.level === "pairs" && settings.features ? { features: settings.features } : {},
    explain_prompt: settings.explain_prompt
  });
}
export {
  LAB_DEFAULT_FEATURES,
  LAB_DEFAULT_NOTE_PROMPTS,
  LAB_EXPLAIN_BLOCK_ID,
  LAB_EXPLAIN_QUESTION_ID,
  LAB_JUDGE,
  LAB_LANGUAGE_LEVELS,
  LAB_LEVELS,
  LAB_LEVEL_LABELS,
  LAB_STEPS,
  LabFeatureSchema,
  LabPairSchema,
  LabSettingsSchema,
  PublicLabSchema,
  explainBlockCurrent,
  explainPrompt,
  labDefaults,
  labExplainBlock,
  labIssues,
  publicLab,
  seedLab,
  withExplainBlock
};
