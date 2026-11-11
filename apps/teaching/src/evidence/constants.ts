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

/** Mastery on the student profile: top-end results on this many separate checkpoints (quizzes or assessed pieces). */
export const MASTERY = { checkpoints: 2 } as const;

/**
 * Evidence from a game (`game:{lesson}:{game}`). A right answer in a game is only
 * ever "right once": games never count toward mastery or a full circle, whatever
 * the strength (Adam, 11 Nov).
 */
export const GAME_SOURCE_PREFIX = 'game:';
export const isGameSource = (source: string): boolean => source === 'game' || source.startsWith(GAME_SOURCE_PREFIX);

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

/**
 * How much to trust the groups on Next steps. Agreement is a rank correlation
 * (Spearman, -1 to 1): 0.6 and up is the usual bar for marks agreeing well.
 */
export const TRUST = {
  /** Students marked on both sides before an agreement figure is shown. */
  minStudents: 5,
  /** At or above: the marks agree well. */
  agree: 0.6,
  /** At or above (and under `agree`): they partly agree. Under it: they don't. */
  partly: 0.3,
  /** A quiz or task agreeing with the rest under this is named as the odd one out. */
  odd: 0.2,
  /** How far scores carry over from one piece to the next when the class has too few marks to say. */
  fallbackReliability: 0.5,
  /** Gain past the usual bounce smaller than this (0–1) counts as no clear gain. */
  gainNoise: 0.05,
  /** Members with marks before and after joining needed to judge a group's gain. */
  groupMembers: 2
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

/** The share a rung tapped on a rubric counts as: each rung's own cut, so `rungOf` reads the same rung back. Below Capable counts as 0.2. */
export const RUBRIC_BELOW = 0.2;
export function rungShare(rung: unknown): number | null {
  if (rung === 'below') return RUBRIC_BELOW;
  return rung === 'capable' || rung === 'skilled' || rung === 'accomplished' || rung === 'excellent' ? RUNG_CUTS[rung] : null;
}

/** The syllabus Grid: a student needs this many items on a row to get a colour. */
export const GRID = { minItems: 1 } as const;

/** Next steps' three answers: the biggest priorities, who needs support, who can be extended. */
export const PRIORITY = {
  /** Most priorities shown: more than this is a list, not a priority. */
  max: 3,
  /** A lesson this many days away counts as coming up. */
  soonDays: 14,
  /** The class median falling this far counts as urgent; a student falling this far is flagged. */
  falling: 0.1,
  /** Added to a priority's weight: it comes up in a lesson, an assessment, or it is falling. */
  boost: { lesson: 0.5, assessment: 1, falling: 0.25 },
  /** This few questions, and a priority says so. */
  fewQuestions: 3,
  /** A student averaging under this with a focus area needs support. */
  supportBelow: 0.65,
  /** A student falling, and still under this, also needs support. */
  fallingBelow: 0.75,
  /** A student averaging this, with a secure tag, can be extended. */
  extendFrom: 0.75,
  /** Tags named per student. */
  tags: 2
} as const;

/**
 * The teacher-only Over time tab on a student's page. Scores are whole percents.
 * These copy the Next steps guesses: check them against a real class.
 */
export const OVER_TIME = {
  /** A tag at or above this now is Secure. */
  secure: 75,
  /** Under this now, or down by `down` or more from first to latest, is Needs work. */
  needsWork: 55,
  down: 8,
  /** Rising or Slipping needs this much change from first to latest. */
  move: 8,
  /** Stuck: this many pieces or more, all inside a band this wide, all under `needsWork`. */
  stuckPieces: 3,
  stuckBand: 10,
  /** Stuck: the same named mix-up this many times or more. */
  stuckMixUps: 3,
  /** A knowledge piece counts towards a deep understanding's tier at this share or more (0–1). */
  pieceHeld: 0.75
} as const;
