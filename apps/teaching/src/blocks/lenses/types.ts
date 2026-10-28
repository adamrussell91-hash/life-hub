import type { Block } from '@/schemas/block';
import type { SleeveConfig } from '@/schemas/lens';
import type { ToolkitKind } from '@/toolkit/library';
import type { SleeveLevel, SleeveText } from '@/toolkit/sleeves';

/**
 * A lens is an optional thinking process attached to an existing block, never
 * a separate block type. Stepped lenses are mostly data: a list of steps that
 * the shared engine walks students through, always ending in Write it down.
 */
export type LensLevel = 'support' | 'core' | 'extend';
export const LENS_LEVELS: readonly LensLevel[] = ['support', 'core', 'extend'];
export const LEVEL_LABELS: Record<LensLevel, string> = { support: 'Support', core: 'Core', extend: 'Extend' };
/** What students see, so nobody is labelled by ability on screen. */
export const STUDENT_LEVEL_LABELS: Record<LensLevel, string> = { support: 'More help', core: 'Standard', extend: 'Stretch' };

export type LensChoice = { value: string; label: string; detail: string };
export type LensStep = {
  id: string;
  title: string;
  prompt: string;
  support: string;
  /** A choice step: students pick one option instead of writing notes. */
  choices?: LensChoice[];
};
/** The closing step: either a sentence frame or, at Extend, a writing challenge. */
export type WriteItDown = { frame?: string; challenge?: string; checklist: string[]; example?: string };

/** Fields every stepped lens config shares. */
export type LensConfig = {
  focus: string;
  mode: 'notes' | 'discussion';
  level?: LensLevel;
  /** Students may switch level; on unless the teacher turns it off. */
  student_level?: boolean;
  [key: string]: unknown;
};
export type StepContext = { level: LensLevel; choice?: string; block: Block };

export type SteppedLens = {
  id: string;
  label: string;
  /** Picker heading, e.g. Kaplan, Literature. */
  group: string;
  /** One-line summary under the label in the picker. */
  path: string;
  symbol: () => SVGSVGElement;
  /** Levels this lens has written. Only 'core' hides the level controls. */
  levels: readonly LensLevel[];
  /** Appended to the lesson and block storage key for a student's notes. */
  storageSuffix: string;
  /** Used for print and teacher review when a choice step has no answer yet. */
  printChoice?: string;
  canAttach: (block: Block) => boolean;
  read: (block: Block) => LensConfig | undefined;
  write: <T extends Block>(block: T, config: LensConfig) => T;
  remove: <T extends Block>(block: T) => T;
  create: (block: Block) => LensConfig;
  /** Steps with the teacher's overrides applied. Write it down is added by the engine. */
  steps: (config: LensConfig, ctx: StepContext) => LensStep[];
  setStepText: (config: LensConfig, ctx: StepContext, stepId: string, field: 'prompt' | 'support', value: string) => LensConfig;
  writeItDown: (config: LensConfig, ctx: StepContext) => WriteItDown;
  /** Extra setup controls, e.g. Windows & Mirrors' Answer with. */
  setupFields?: (draft: LensConfig, update: (next: LensConfig) => void) => HTMLElement[];
  /**
   * A lens that draws its own walk (Reasoning's chart). The engine draws the
   * heading and level pills, then hands it the rest of the workspace.
   */
  walk?: (args: { config: LensConfig; ctx: StepContext; storageKey?: string; preview: boolean; onDone: () => void }) => HTMLElement;
  /** Replaces the default print sheet. */
  print?: (config: LensConfig, ctx: StepContext) => HTMLElement;
};

/**
 * A sleeve lays one Thinking Toolkit item over the block students are already
 * answering. It never walks: it opens in place with See it, Do it and Check it.
 */
export type SleeveLens = {
  kind: 'sleeve';
  /** Lens id, `sleeve:<library id>`. */
  id: string;
  /** Library id, e.g. `value:clarity`. */
  toolkitId: string;
  toolkitKind: ToolkitKind;
  label: string;
  goal: string;
  levels: readonly SleeveLevel[];
  canAttach: (block: Block) => boolean;
  read: (block: Block) => SleeveConfig | undefined;
  write: <T extends Block>(block: T, config: SleeveConfig) => T;
  remove: <T extends Block>(block: T) => T;
  create: () => SleeveConfig;
  /** The text at one level, with the teacher's overrides applied at their start level. */
  content: (level: SleeveLevel, config: SleeveConfig) => SleeveText;
};
