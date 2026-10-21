import type { Block } from '@/schemas/block';

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
};
