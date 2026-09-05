import { loadPromptFile } from "../clementine/loadFromDisk";

/** Node / Netlify only — do not import from browser code. */
export function makeNoteProtocol(cwd = process.cwd()): string {
  return loadPromptFile("clementine-make-note.md", cwd);
}
