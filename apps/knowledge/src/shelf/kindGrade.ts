/**
 * Book-note kind grader. Implementation lives with the server batch ops so the
 * CLI, unit tests and Netlify handler share one parse/prompt (V4).
 */
export {
  CRYSTALLISED_KINDS,
  FLUID_KINDS,
  KIND_PRECEDENCE,
  KIND_SYSTEM,
  kindPrompt,
  parseKindGrade,
} from "../../../../netlify/functions/_shared/knowledge-shelf-kinds.mjs";
