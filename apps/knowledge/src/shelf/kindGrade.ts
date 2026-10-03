/**
 * Book-note kind grader. Implementation lives with the server batch ops so the
 * CLI, unit tests and Netlify handler share one parse/prompt (V4).
 */
export {
  kindPrompt,
  parseKindGrade,
  FLUID_KINDS,
  KIND_PRECEDENCE,
  CRYSTALLISED_KINDS,
  KIND_SYSTEM,
} from "../../../../netlify/functions/_shared/knowledge-shelf-kinds.mjs";
