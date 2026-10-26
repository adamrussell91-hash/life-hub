/** Every threshold the insight views use, in one place so they can be tuned. Shares are 0–1. */
export const BANDS = {
  /** A tag below this is Weak. */
  weak: 0.5,
  /** At or above this (and confident enough, when asked) is Secure. */
  secure: 0.8,
  secureConfidence: 2.5,
  /** A tag needs this many questions before it gets a band. */
  minQuestions: 2,
  /** A student needs this many items on a tag to be put in a group. */
  groupMin: 2
} as const;

/** Pre-tests usually ask two questions per technique, so two items are enough for a focus area or a secure tag. */
export const FOCUS = { below: 0.6, minItems: 2, max: 3, secureMinItems: 2 } as const;

/** Next steps: when a tag calls for reteaching the class, a small group, or moving on. */
export const NEXT = {
  /** Fewer students assessed than this, and a tag makes no move. */
  minStudents: 3,
  /** This share of the students assessed weak: reteach to the class. */
  reteachShare: 0.5,
  /** A small group is this many weak students. */
  groupMin: 2,
  groupMax: 6,
  /** Two small groups sharing this much of their students become one card. */
  sameGroup: 0.6,
  /** This share secure, with at most one weak: move on. */
  moveOnShare: 2 / 3
} as const;

export const FLAGS = {
  /** Students sure (3) but below full marks on one tag. */
  sureWrongStudents: 2,
  /** Share of full-mark answers given at confidence 1. */
  guessShare: 0.25,
  guessMin: 2
} as const;

export const ITEM = {
  alphaMinAttempts: 5,
  alphaMinItems: 3,
  discriminationMinAttempts: 10,
  tooEasy: 0.95,
  tooHard: 0.05
} as const;

export const FOLLOW_UP = {
  defaultCount: 5,
  min: 3,
  max: 10,
  /** From recorded Ann quiz builds (US$0.26–0.36 for about 10 questions, 21 Oct 2026). */
  cost: 'about A$0.30 to A$0.55',
  /** Shown instead of the plan sheet: a follow-up lesson goes after its quiz, in the same unit. */
  noUnit: 'This quiz isn’t in a unit, so a follow-up can’t be placed after it.'
} as const;

/**
 * Skills climb a ladder, so they are placed on a rung, not banded. `from` is the
 * lowest share (0–1) that reaches each rung; under `capable` is below Capable.
 * A starting guess to tune once real marks are in.
 */
export const RUNG_CUTS = { capable: 0.4, skilled: 0.6, accomplished: 0.8, excellent: 0.9 } as const;

/** The syllabus Grid: a student needs this many items on a row to get a colour. */
export const GRID = { minItems: 1 } as const;
