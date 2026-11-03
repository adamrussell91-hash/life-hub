/**
 * One-off fold of old faded examples: adjacent old blocks become one block whose
 * steps keep the old block ids, so saved answers still resolve. Old blocks that
 * stand alone are left as they are; they convert on read.
 */
const GENERIC_CRITERIA = ['Answers the question', 'Uses words from the extract', 'Says what those words show'];
/** Keys every block has. Anything else (a sleeve, say) stops a later block folding in. */
const PLAIN_KEYS = new Set(['id', 'type', 'block_type', 'variant', 'visibility', 'content', 'created_at', 'updated_at']);

const isOldFaded = (b) => b?.block_type === 'faded_example' && Array.isArray(b.content?.parts);
const labelsOf = (b) => b.content.parts.map((p) => p.label);
const isBare = (b) => Object.entries(b).every(([key, value]) => PLAIN_KEYS.has(key) || value == null || (Array.isArray(value) && value.length === 0));

function foldable(first, next) {
  return first.visibility === next.visibility
    && JSON.stringify(labelsOf(first)) === JSON.stringify(labelsOf(next))
    && isBare(next);
}

function foldRun(run) {
  const first = run[0];
  const labels = labelsOf(first);
  const written = new Set(run.flatMap((b) => (b.content.blanks ?? []).map((i) => labels[i])));
  const prompt = first.content.prompt ?? '';
  return {
    ...first,
    content: {
      prompt,
      part_labels: labels,
      steps: run.map((b) => ({
        id: b.id,
        ...(b.content.prompt && b.content.prompt !== prompt ? { prompt: b.content.prompt } : {}),
        extract: b.content.extract ?? '',
        answers: b.content.parts.map((p) => p.answer),
        blanks: b.content.blanks ?? []
      })),
      criteria: Object.fromEntries([...written].map((label) => [label, GENERIC_CRITERIA])),
      ...(run.some((b) => b.content.gate === false) ? { gate: false } : {})
    }
  };
}

/** Folds runs through nested blocks. Running it again changes nothing. */
export function foldFadedRuns(blocks) {
  const result = { blocks: [], folded: 0, skipped: [], oldBlocks: 0 };
  const walkList = (list) => {
    const inner = foldFadedRuns(list);
    result.folded += inner.folded;
    result.oldBlocks += inner.oldBlocks;
    result.skipped.push(...inner.skipped);
    return inner.blocks;
  };
  const descend = (block) => {
    const c = block.content;
    if (Array.isArray(c?.blocks)) return { ...block, content: { ...c, blocks: walkList(c.blocks) } };
    if (Array.isArray(c?.columns)) return { ...block, content: { ...c, columns: c.columns.map((col) => ({ ...col, blocks: walkList(col.blocks ?? []) })) } };
    if (Array.isArray(c?.tabs)) return { ...block, content: { ...c, tabs: c.tabs.map((tab) => ({ ...tab, blocks: walkList(tab.blocks ?? []) })) } };
    return block;
  };
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!isOldFaded(block)) {
      result.blocks.push(descend(block));
      continue;
    }
    result.oldBlocks += 1;
    const run = [block];
    while (isOldFaded(blocks[i + 1])) {
      const next = blocks[i + 1];
      if (!foldable(block, next)) {
        result.skipped.push(next.id);
        break;
      }
      run.push(next);
      result.oldBlocks += 1;
      i += 1;
    }
    if (run.length > 1) {
      result.folded += run.length;
      result.blocks.push(foldRun(run));
    } else result.blocks.push(block);
  }
  return result;
}
