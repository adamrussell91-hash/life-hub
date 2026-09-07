/**
 * Phase 5 — one kernel entry for Life, Tasks, Teaching, and Knowledge.
 * Presentation stays on each surface. Retrieval, memory, and tool trim do not.
 */
import { assembleEvidencePack } from './evidence-packs.mjs';
import { applyKernelToTurn, kernelTraceEvent } from './agent-kernel.mjs';
import {
  memoryInterpretationLines,
  memoryPromptBlock,
  parseMemoryStore,
  searchMemories
} from './agent-memory.mjs';

export const AGENT_SURFACES = Object.freeze(['life', 'tasks', 'teaching', 'knowledge']);

function recallOutsideKernel(stores, message, slug, now) {
  if (stores?.memoryLoadError) {
    return {
      memory: [],
      memoryMeta: { kept: 0, omitted: 0 },
      prompt: [
        memoryPromptBlock([], { kept: 0, omitted: 0 }),
        'Limitations:',
        '- [failed] Layered memory store unavailable'
      ].join('\n'),
      interpretation: memoryInterpretationLines([]).join('\n')
    };
  }
  const loaded = parseMemoryStore(stores?.memories ?? []);
  if (!loaded.ok) {
    return {
      memory: [],
      memoryMeta: { kept: 0, omitted: 0 },
      prompt: [
        'Layered memory (not source records):',
        '- [failed] Layered memory store unavailable'
      ].join('\n'),
      interpretation: memoryInterpretationLines([]).join('\n')
    };
  }
  const recalled = searchMemories(loaded, message, {
    agent: slug,
    now: now instanceof Date ? now : new Date(now),
    limit: 8
  });
  return {
    memory: recalled.items,
    memoryMeta: { kept: recalled.kept, omitted: recalled.omitted },
    prompt: memoryPromptBlock(recalled.items, recalled),
    interpretation: memoryInterpretationLines(recalled.items).join('\n')
  };
}

export function runSurfaceAgentTurn({
  surface,
  slug,
  message,
  today,
  now = new Date(),
  stores = {},
  tools = [],
  env = {},
  flag,
  sourceMeta = {}
} = {}) {
  if (!AGENT_SURFACES.includes(surface)) {
    throw new TypeError(`unknown surface: ${surface}`);
  }
  const pack = assembleEvidencePack({ slug, message, today, stores, now, sourceMeta });
  const kernelApplied = applyKernelToTurn({
    slug,
    message,
    today,
    now,
    stores,
    sourceMeta,
    tools,
    env,
    flag
  });
  const kernelWorkflow = kernelApplied.kernel?.plan?.workflow;
  const kernelOwnsTurn = Boolean(kernelApplied.enabled && kernelWorkflow && kernelWorkflow !== 'none');
  let memory = kernelApplied.kernel?.memory ?? [];
  let memoryMeta = kernelApplied.kernel?.memoryMeta ?? { kept: 0, omitted: 0 };
  let extraPrompt = '';
  let extraInterpretation = '';
  if (!kernelOwnsTurn && pack.active) {
    const recalled = recallOutsideKernel(stores, message, slug, now);
    memory = recalled.memory;
    memoryMeta = recalled.memoryMeta;
    extraPrompt = recalled.prompt;
    extraInterpretation = recalled.interpretation;
  }
  return {
    surface,
    slug,
    pack,
    kernel: kernelApplied.kernel,
    enabled: kernelApplied.enabled,
    tools: kernelOwnsTurn ? kernelApplied.tools : tools,
    forceToolChoice: kernelOwnsTurn ? kernelApplied.forceToolChoice : null,
    promptBlock: [kernelApplied.promptBlock || pack.promptBlock, extraPrompt].filter(Boolean).join('\n\n'),
    interpretationBlock: [kernelApplied.interpretationBlock, extraInterpretation].filter(Boolean).join('\n'),
    memory,
    memoryMeta,
    trace: kernelTraceEvent(kernelApplied.kernel)
  };
}
