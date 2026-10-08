// Studio: the book ideas Adam hasn't written yet. One JSON file in the Knowledge
// data repo (studio/books.json) holds the ideas, their chapter plans, the notes
// each chapter leans on, and Adam's decisions on Clementine's suggestions.
// Notes themselves stay where they are; Studio only points at them.
import { getKnowledgeContent, putKnowledgeContent } from './knowledge-data.mjs';
import { applyStudioOp, parseStudioText } from './knowledge-studio-ops.mjs';

export { applyStudioOp, emptyStudio, parseStudioText, STUDIO_STAGES } from './knowledge-studio-ops.mjs';

export const STUDIO_FILE = 'studio/books.json';

const describe = op =>
  op.op === 'idea' ? `Studio: new idea “${String(op.title).slice(0, 60)}”`
    : op.op === 'stage' ? `Studio: ${op.bookId} → ${op.stage}`
      : op.op === 'decide' ? `Studio: decided ${String(op.insightId).slice(0, 60)}`
        : `Studio: ${op.op} note on ${op.bookId}`;

export async function readStudio(deps) {
  const file = await getKnowledgeContent(STUDIO_FILE, deps);
  return { doc: parseStudioText(file?.text ?? ''), sha: file?.sha };
}

/** Read, apply, write. On a collision, re-read and re-apply once. */
export async function writeStudioOp(op, deps, { now } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { doc, sha } = await readStudio(deps);
    const next = applyStudioOp(doc, op, { now });
    try {
      await putKnowledgeContent(STUDIO_FILE, `${JSON.stringify(next, null, 1)}\n`, { ...deps, sha, message: describe(op) });
      return next;
    } catch (error) {
      if (error?.status !== 409 || attempt === 1) throw error;
    }
  }
  throw invalid('save collided, try again', 409, 'conflict');
}
