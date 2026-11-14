import { z } from 'zod';
import { QuizQuestionDraftSchema } from '../quiz/core';

/**
 * Station Rotation: a lesson mode (pedagogical_mode 'station_rotation').
 * Students move around a map of stations. Each station is a top-level
 * section of ordinary blocks (tagged `rotation_station`), played in a fixed
 * card order: arrival recall, goal, steps, hints, gate, after-gate steps,
 * done when, exit check, collect. A pretest of three questions a station sets
 * each student's level there. Gates are practice only: they never write a
 * mark. What a student collects goes onto an evidence board that feeds the
 * finale (the section tagged `rotation_finale`).
 *
 * Publish splits the draft. `PublicRotationSchema` goes in the published
 * snapshot: no pretest answers, no gate answers, no lock answer and no model
 * answer. Those stay in the stored config (netlify/functions/_shared/rotation.mjs)
 * and every mark is worked out on the server.
 *
 * Records are keyed by string ids and checked loosely (z.record(z.string())),
 * so the generated server copy parses the same as the browser.
 */

export const ROTATION_KINDS = ['facts', 'concepts', 'procedures', 'analysis', 'perspectives', 'teacher'] as const;
export type RotationKind = (typeof ROTATION_KINDS)[number];

/** The knowledge type suggests a mode and blocks. A suggestion, never a lock, and never matched to the student. */
export const ROTATION_KIND_INFO: Record<RotationKind, { label: string; mode: string; blocks: string[] }> = {
  facts: { label: 'Facts and vocabulary', mode: 'Retrieval: flashcards and quiz', blocks: ['flashcards', 'quiz_question'] },
  concepts: { label: 'Concepts and principles', mode: 'Elaboration: concept map', blocks: ['concept_map', 'rich_text'] },
  procedures: { label: 'Procedures and skills', mode: 'Worked then faded example', blocks: ['faded_example', 'rich_text'] },
  analysis: { label: 'Analysis and evaluation', mode: 'Close reading: annotate, then argue', blocks: ['annotation', 'hinge_question'] },
  perspectives: { label: 'Perspectives and values', mode: 'Positions: take a side, then justify it', blocks: ['continuum_line', 'rich_text'] },
  teacher: { label: 'Teacher station', mode: 'Small group with the teacher', blocks: ['with_teacher'] }
};

export const ROTATION_LEVELS = ['support', 'core', 'extend'] as const;
export type RotationLevel = (typeof ROTATION_LEVELS)[number];
export const ROTATION_LEVEL_LABELS: Record<RotationLevel, string> = { support: 'Support', core: 'Core', extend: 'Extend' };

export const ROTATION_DIALS = ['guided', 'standard', 'open'] as const;
export type RotationDial = (typeof ROTATION_DIALS)[number];
export const ROTATION_DIAL_LABELS: Record<RotationDial, string> = { guided: 'Guided', standard: 'Standard', open: 'Open' };

export const ROTATION_PATHS = ['fixed', 'free_all', 'choose_n', 'must_may', 'unlocks'] as const;
export type RotationPath = (typeof ROTATION_PATHS)[number];
export const ROTATION_PATH_LABELS: Record<RotationPath, string> = {
  fixed: 'Fixed order',
  free_all: 'Free order, all stations',
  choose_n: 'Choose some of the stations',
  must_may: 'Must-do plus may-do',
  unlocks: 'Unlocks (one station opens another)'
};

export const ROTATION_FALLBACKS = ['choose_n_minus_1', 'skip_finale_build', 'none'] as const;
export type RotationFallback = (typeof ROTATION_FALLBACKS)[number];
export const ROTATION_FALLBACK_LABELS: Record<RotationFallback, string> = {
  choose_n_minus_1: 'Drop one station: they choose all but one',
  skip_finale_build: 'Skip the finale build',
  none: 'Nothing: keep going'
};

/** Content roles a block in a station section can take (block.settings.rotation_role). Absent means a step. */
export const ROTATION_ROLES = ['recall', 'goal', 'step', 'hint', 'gate', 'after', 'done', 'exit'] as const;
export type RotationRole = (typeof ROTATION_ROLES)[number];
export const ROTATION_ROLE_LABELS: Record<RotationRole, string> = {
  recall: 'Arrival recall',
  goal: 'Goal',
  step: 'Step',
  hint: 'Hint',
  gate: 'Gate',
  after: 'Step after the gate',
  done: 'Done when',
  exit: 'Exit check'
};
/** The order a station card plays its blocks in, by role. Blocks keep their section order within a role. */
export const ROTATION_ROLE_ORDER: RotationRole[] = ['recall', 'goal', 'step', 'hint', 'gate', 'after', 'done', 'exit'];

export const DEFAULT_LINK_WORDS = ['causes', 'makes worse', 'is evidence for', 'slows recovery of'];
export const DEFAULT_FINALE_FORMATS = ['One-page brief', 'Annotated diagram', 'Two-minute talk'];
export const DEFAULT_DEBRIEF = ['Why did you choose that order? Would you choose it again?', 'Which piece changed your explanation the most?'];

const Id = z.string().regex(/^[a-z0-9_-]{1,40}$/);

export const WRITTEN_CHECKS = ['technique_named', 'exact_quote', 'technique_fits', 'effect_linked'] as const;
export type WrittenCheck = (typeof WRITTEN_CHECKS)[number];
export const WRITTEN_CHECK_LABELS: Record<WrittenCheck, string> = {
  technique_named: 'Technique named correctly',
  exact_quote: 'Exact quote from the passage',
  technique_fits: 'The technique is really at work in that quote',
  effect_linked: 'The effect links to the idea'
};

/** A written answer, checked by rules then the standard-lane model, that opens the rest of the station. Practice only. */
export const WrittenGateSchema = z.object({
  prompt: z.string().max(600).default(''),
  passage: z.string().max(4000).default(''),
  /** One mark per point. */
  marks: z.number().int().min(1).max(6).default(3),
  /** What each effect must link to: "isolation". */
  idea: z.string().max(120).default(''),
  checks: z.array(z.enum(WRITTEN_CHECKS)).max(4).default(['technique_named', 'exact_quote', 'technique_fits', 'effect_linked']),
  different_techniques: z.boolean().default(true),
  pass_at: z.number().int().min(1).max(6).default(3),
  pass_at_support: z.number().int().min(1).max(6).optional(),
  /** Optional: quotes the teacher expects and the techniques that fit them. The checker may accept others it can justify. */
  answer_key: z.array(z.object({ quote: z.string().max(400), techniques: z.array(z.string().max(80)).max(6) })).max(12).optional(),
  max_checks: z.number().int().min(1).max(6).default(3),
  /** Teacher only; never sent to students or to the checker. */
  model_answer: z.string().max(3000).optional(),
  /** Daily cap per class in A$. At the cap, written gates become teacher checks for the rest of the day. */
  daily_cap_aud: z.number().min(0).max(50).default(3)
});
export type WrittenGate = z.infer<typeof WrittenGateSchema>;

/** Question kinds a rush round can mark on the spot. Short answers are marked exactly (no AI, no near misses). */
export const RUSH_ITEM_KINDS = ['multiple_choice', 'true_false', 'odd_one_out', 'quote_technique', 'short_answer'] as const;
export const MAX_STATION_LOCKS = 6;
export const LOCK_CHECK_KINDS = ['rush', 'ai'] as const;
export type LockCheckKind = (typeof LOCK_CHECK_KINDS)[number];
export const LOCK_CHECK_LABELS: Record<LockCheckKind, string> = { rush: 'Rush', ai: 'AI check' };

/** A rush round: get `streak` right in a row within `seconds`. Marked on the server; keys never reach the browser. */
export const RushCheckSchema = z.object({
  kind: z.literal('rush'),
  /** Saved half-written while drafting; publish runs the full check. */
  items: z.array(QuizQuestionDraftSchema).max(30).default([]),
  streak: z.number().int().min(3).max(10).default(6),
  seconds: z.number().int().min(30).max(300).default(90)
});
/** One or two sentences, judged by the fast lane against the teacher's model answer and criteria. Both stay on the server. */
export const AiCheckSchema = z.object({
  kind: z.literal('ai'),
  prompt: z.string().max(500).default(''),
  model_answer: z.string().max(1000).default(''),
  criteria: z.array(z.string().max(200)).max(4).default([])
});
export const LockCheckSchema = z.discriminatedUnion('kind', [RushCheckSchema, AiCheckSchema]);
export type LockCheck = z.infer<typeof LockCheckSchema>;

/**
 * One lock in a station's chain. Blocks belong to a lock through
 * `block.settings.rotation_lock = lock.id`; a lock's blocks show once the lock
 * before it is passed. The reward is a Viva Kit card the student keeps.
 * (Not the finale's `LockQuestionSchema`.)
 */
export const StationLockSchema = z.object({
  id: Id,
  title: z.string().max(80).default(''),
  check: LockCheckSchema,
  reward: z.object({ title: z.string().max(80).default(''), text: z.string().max(400).default('') }).default({ title: '', text: '' })
});
export type StationLock = z.infer<typeof StationLockSchema>;

export const StationSchema = z.object({
  id: Id,
  title: z.string().max(120).default(''),
  kind: z.enum(ROTATION_KINDS).default('concepts'),
  strand: z.string().max(40).optional(),
  outcomes: z.array(z.string().max(200)).max(6).default([]),
  minutes: z.number().int().min(1).max(90).default(20),
  seats: z.number().int().min(1).max(40).default(6),
  /** "Back bench". A QR code links to the station. */
  location: z.string().max(80).optional(),
  must_do: z.boolean().optional(),
  unlock_after: z.array(Id).max(8).optional(),
  /** One letter or a short code, breakout only. */
  token: z.string().max(4).optional(),
  /** The evidence card text this station produces. */
  piece: z.string().max(300).default(''),
  /** Marks an offline station done. */
  offline_code: z.string().max(20).optional(),
  /** Map position, 0 to 100 each way. Absent: laid out automatically. */
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  /** The station's gate, when it is a written answer. A hinge gate is a block in the section instead. */
  written_gate: WrittenGateSchema.optional(),
  /** Teacher station only: what to say to a group sent here, per misconception. */
  script: z.string().max(600).optional(),
  /** Optional chain of locks. None: the station works as a plain card. */
  locks: z.array(StationLockSchema).max(MAX_STATION_LOCKS).optional()
});
export type Station = z.infer<typeof StationSchema>;

export const PretestItemSchema = z.object({
  id: Id,
  station: Id,
  /** Saved half-written while drafting; publish runs the full check. */
  question: QuizQuestionDraftSchema,
  /** Missing it routes the student to the teacher station. */
  misconception: z.boolean().optional()
});
export type PretestItem = z.infer<typeof PretestItemSchema>;

export const LockOptionSchema = z.object({ id: Id, text: z.string().max(300) });
export const LockQuestionSchema = z.object({
  prompt: z.string().max(500).default(''),
  options: z.array(LockOptionSchema).max(5).default([]),
  correct_id: z.string().max(40).default('')
});
export type LockQuestion = z.infer<typeof LockQuestionSchema>;

export const RotationFinaleSchema = z.object({
  lock: LockQuestionSchema.optional(),
  /** The build: what students write, with their board's cards and links in place. */
  build_prompt: z.string().max(400).default('Write your recommendation, using your evidence.'),
  formats: z.array(z.string().max(60)).max(5).default([...DEFAULT_FINALE_FORMATS]),
  debrief: z.array(z.string().max(300)).max(4).default([...DEFAULT_DEBRIEF])
});
export type RotationFinale = z.infer<typeof RotationFinaleSchema>;

export const RotationSettingsSchema = z.object({
  class_id: z.string().max(64).default(''),
  dial: z.enum(ROTATION_DIALS).default('standard'),
  /** Extend passed at two stations opens route choice. */
  fade_dial: z.boolean().default(true),
  path: z.enum(ROTATION_PATHS).default('free_all'),
  choose_n: z.number().int().min(1).max(8).optional(),
  evidence: z.enum(['board', 'list']).default('board'),
  link_words: z.array(z.string().min(1).max(40)).min(2).max(6).default([...DEFAULT_LINK_WORDS]),
  stations: z.array(StationSchema).max(9).default([]),
  pretest: z.array(PretestItemSchema).max(30).default([]),
  finale: RotationFinaleSchema.default({ build_prompt: 'Write your recommendation, using your evidence.', formats: [...DEFAULT_FINALE_FORMATS], debrief: [...DEFAULT_DEBRIEF] }),
  /** Breakout framing; optional. */
  story: z.object({ title: z.string().max(120), intro: z.string().max(800) }).optional(),
  behind_fallback: z.enum(ROTATION_FALLBACKS).default('choose_n_minus_1'),
  /** Lesson length when it isn't scheduled; the timetable's wins when it is. */
  minutes: z.number().int().min(10).max(240).optional(),
  /** Students start in class and finish at home: time past the bell is homework, not over budget. */
  finish_at_home: z.boolean().optional()
});
export type RotationSettings = z.infer<typeof RotationSettingsSchema>;

/** A written gate as students see it: no answer key, no model answer, no cost cap. */
export const PublicWrittenGateSchema = WrittenGateSchema.pick({ prompt: true, passage: true, marks: true, idea: true, checks: true, different_techniques: true, pass_at: true, pass_at_support: true, max_checks: true });
export type PublicWrittenGate = z.infer<typeof PublicWrittenGateSchema>;

/** A lock as the snapshot carries it: enough to draw the closed chain. Items, rewards and later blocks come from the server's status. */
export const PublicLockSummarySchema = z.object({ id: Id, title: z.string(), kind: z.enum(LOCK_CHECK_KINDS) });
export type PublicLockSummary = z.infer<typeof PublicLockSummarySchema>;

export const PublicStationSchema = StationSchema.omit({ written_gate: true, offline_code: true, script: true, locks: true }).extend({
  written_gate: PublicWrittenGateSchema.optional(),
  has_offline_code: z.boolean().optional(),
  locks: z.array(PublicLockSummarySchema).optional()
});
export type PublicStation = z.infer<typeof PublicStationSchema>;

/** What the published snapshot carries. Pretest questions and every key come from the server. */
export const PublicRotationSchema = z.object({
  dial: z.enum(ROTATION_DIALS),
  fade_dial: z.boolean(),
  path: z.enum(ROTATION_PATHS),
  choose_n: z.number().int().optional(),
  evidence: z.enum(['board', 'list']),
  link_words: z.array(z.string()),
  stations: z.array(PublicStationSchema),
  finale: z.object({
    lock: z.object({ prompt: z.string(), options: z.array(LockOptionSchema) }).optional(),
    build_prompt: z.string(),
    formats: z.array(z.string()),
    debrief: z.array(z.string())
  }),
  story: z.object({ title: z.string(), intro: z.string() }).optional(),
  behind_fallback: z.enum(ROTATION_FALLBACKS),
  pretest_count: z.number().int()
});
export type PublicRotation = z.infer<typeof PublicRotationSchema>;

export const PRESETS = ['carousel', 'choice', 'teacher_led', 'breakout'] as const;
export type RotationPreset = (typeof PRESETS)[number];
/** A preset only sets path, dial and evidence. */
export const PRESET_INFO: Record<RotationPreset, { label: string; blurb: string; path: RotationPath; dial: RotationDial; evidence: 'board' | 'list' }> = {
  carousel: { label: 'Carousel', blurb: 'Fixed order · every station', path: 'fixed', dial: 'guided', evidence: 'list' },
  choice: { label: 'Choice board', blurb: 'Must-do plus may-do', path: 'must_may', dial: 'open', evidence: 'board' },
  teacher_led: { label: 'Teacher-led', blurb: 'Pretest routes groups', path: 'free_all', dial: 'guided', evidence: 'list' },
  breakout: { label: 'Breakout', blurb: 'Story, letters, final lock', path: 'free_all', dial: 'standard', evidence: 'board' }
};

/** The control dial: what each setting changes. */
export const DIAL_TABLE: Array<{ row: string; guided: string; standard: string; open: string }> = [
  { row: 'Route', guided: 'Next station recommended for you', standard: 'Recommended, you can pick another', open: 'You choose' },
  { row: 'Level', guided: 'Set by the pretest', standard: 'Pretest level, you can change it', open: 'Pretest level, you can change it' },
  { row: 'Hints', guided: 'Offered after a minute', standard: 'Open when you ask', open: 'Open when you ask' },
  { row: 'Finale format', guided: 'One format', standard: 'Pick one of three', open: 'Any format' }
];

/** Per-student state as the server keeps it. */
export type RotationAttempt = {
  text: string;
  at: string;
  /** Rule results per point: which checks passed by rule. */
  rules: Array<{ point: number; check: WrittenCheck; ok: boolean; reason?: string }>;
  /** Model verdicts per point and check. */
  verdicts: Array<{ point: number; check: WrittenCheck; verdict: 'pass' | 'fail' | 'unsure'; reason?: string }>;
  outcome: 'passed' | 'not_yet' | 'teacher';
  feedback: string[];
  cost_usd?: number;
  flagged_text?: boolean;
};
export type GateState = 'open' | 'backup' | 'flagged' | 'passed' | 'unlocked';
export type RotationGate = {
  attempts: Array<{ choice?: string; reason?: string; at: string; correct?: boolean; backup?: boolean }>;
  written?: RotationAttempt[];
  state: GateState;
  appeal_at?: string;
  teacher?: { decision: 'pass' | 'keep'; at: string };
};
export type RotationWork = {
  pretest: Record<string, { correct: boolean; at: string }>;
  levels: Record<string, RotationLevel>;
  level_overrides: Record<string, RotationLevel>;
  opened: string[];
  current?: string;
  done: string[];
  collected: string[];
  hints: Record<string, number>;
  recall: Record<string, { correct: boolean; at: string }>;
  gates: Record<string, RotationGate>;
  exits: Record<string, { correct: boolean; at: string; answered: string[] }>;
  board: { pos: Record<string, { x: number; y: number }>; links: Array<{ from: string; to: string; word: string }> };
  teacher_group?: string;
  called_at?: string;
  hand_up_at?: string;
  finale: { lock_passed?: boolean; build?: string; format?: string; debrief?: Record<string, string> };
  /** Station locks: station id → lock id → progress. */
  locks?: Record<string, Record<string, StationLockWork>>;
};
/** One lock's progress as the server keeps it. */
export type StationLockWork = {
  passed_at?: string;
  /** Set when the teacher opened it. */
  teacher_at?: string;
  rush?: { started_at?: string; streak: number; best: number; answered: number; last_at?: string; queue: string[] };
  ai?: Array<{ text: string; at: string; outcome: 'passed' | 'not_yet' | 'teacher'; fix?: string; counted?: boolean; cost_usd?: number; capped?: boolean; flagged_text?: boolean; unavailable?: boolean }>;
  /** Sent to the teacher: out of AI checks, the daily cap, or text that talked to the marker. */
  flagged?: boolean;
};
