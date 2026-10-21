import type { KaplanLens, KaplanQualifier } from '@/schemas/kaplan';
import {
  KAPLAN_LABELS, KAPLAN_LENSES, KAPLAN_PATHS, canHaveKaplanQualifier, kaplanSteps, kaplanSymbol,
  suggestKaplanFocus, withKaplanQualifier, withoutKaplanQualifier
} from '../kaplan';
import type { LensConfig, SteppedLens, WriteItDown } from './types';

/** Kaplan's saved prompts and supports are three-item tuples; the engine addresses them by these ids. */
const STEP_IDS = ['s1', 's2', 's3'] as const;

const WRITE: Record<KaplanLens, WriteItDown> = {
  patterns: {
    frame: 'Both ___ and ___ [repeat / contrast / change], which suggests ___.',
    checklist: ['Two specific details', 'Names the relationship between them', 'Says what the relationship reveals']
  },
  multiple_perspectives: {
    frame: 'One reading of ___ is ___ because ___. Another is ___ because ___. The stronger reading is ___ because ___.',
    checklist: ['One detail kept in view', 'Two readings, each with a reason', 'A judgement']
  },
  ethics: {
    frame: '___ raises the question of ___. I judge that ___ because ___, although ___.',
    checklist: ['A detail you can point to', 'What is at stake, and for whom', 'A judgement with one complication']
  }
};

function kaplanLens(lens: KaplanLens): SteppedLens {
  return {
    id: `kaplan_${lens}`,
    label: KAPLAN_LABELS[lens],
    group: 'Kaplan',
    path: KAPLAN_PATHS[lens],
    symbol: () => kaplanSymbol(lens),
    levels: ['core'],
    storageSuffix: `kaplan.${lens}`,
    canAttach: canHaveKaplanQualifier,
    read: (block) => block.qualifiers?.find((q) => q.lens === lens) as LensConfig | undefined,
    write: (block, config) => withKaplanQualifier(block, { ...(config as KaplanQualifier), lens }),
    remove: (block) => withoutKaplanQualifier(block, lens),
    create: (block) => ({ lens, focus: suggestKaplanFocus(block), mode: 'notes' }),
    steps: (config) => kaplanSteps(config as KaplanQualifier).map((step, i) => ({ id: STEP_IDS[i]!, ...step })),
    setStepText: (config, _ctx, stepId, field, value) => {
      const i = STEP_IDS.indexOf(stepId as (typeof STEP_IDS)[number]);
      const q = config as KaplanQualifier;
      if (field === 'prompt') {
        const prompts = [...(q.prompts ?? ['', '', ''])] as [string, string, string];
        prompts[i] = value;
        return { ...config, prompts };
      }
      const supports = [...(q.supports ?? [null, null, null])] as [string | null, string | null, string | null];
      supports[i] = value;
      return { ...config, supports };
    },
    writeItDown: () => WRITE[lens]
  };
}

export const KAPLAN_STEPPED_LENSES: readonly SteppedLens[] = KAPLAN_LENSES.map(kaplanLens);
