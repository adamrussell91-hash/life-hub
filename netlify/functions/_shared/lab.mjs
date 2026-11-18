/**
 * Lab lessons: a class tests one claim about language on readers.
 *
 * Publish splits the draft. The lines students may see and the Explain block
 * go in the public snapshot. The whole Plan card (supplied texts, the control,
 * the pairs, the debrief notes) is stored at lab/{lesson}/config and reaches a
 * student only through the round, when the step that shows it is open.
 *
 * Keys are in lab-keys.mjs. No model is called here.
 */
import { LabSettingsSchema, LAB_EXPLAIN_BLOCK_ID, labIssues, publicLab, withExplainBlock } from './lab-schema.mjs';
import { labKeys } from './lab-keys.mjs';

/**
 * What publish stores for a lab: the config (teacher only), the public
 * snapshot's `lab`, the snapshot's blocks (the Explain block alone) and the
 * draft's blocks with the Explain block in place.
 */
export function prepareLabPublish(draft) {
  const parsed = LabSettingsSchema.safeParse(draft?.lab);
  if (!parsed.success) return { problems: ['Fill in the Lab card before you publish.'], config: null, snapshot: null, blocks: [], draftBlocks: draft?.blocks ?? [] };
  const settings = parsed.data;
  const problems = labIssues(settings);
  if (problems.length > 0) return { problems, config: null, snapshot: null, blocks: [], draftBlocks: draft?.blocks ?? [] };
  // One Explain block, the same in the draft and the snapshot, so marking finds the block the students answered.
  const draftBlocks = withExplainBlock(Array.isArray(draft.blocks) ? draft.blocks : [], settings);
  return {
    problems: [],
    config: { ...settings, version: Date.now().toString(36) },
    snapshot: publicLab(settings),
    blocks: draftBlocks.filter((b) => b.id === LAB_EXPLAIN_BLOCK_ID),
    draftBlocks
  };
}

export async function storeLabConfig(store, lessonId, config) {
  await store.setJSON(labKeys(lessonId).config, config);
}

export { LAB_EXPLAIN_BLOCK_ID };
