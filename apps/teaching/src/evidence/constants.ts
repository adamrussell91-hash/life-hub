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

export const FOCUS = { below: 0.6, minItems: 3, max: 3, secureMinItems: 3 } as const;

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
  cost: 'about A$0.30 to A$0.55'
} as const;
