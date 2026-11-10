// packages/thinking-map/signals.mjs
// The map's signals and the `when` lines no catalogue holds. Every option's signals are its
// section's defaults (SECTION_SIGNALS) joined with its own extras (ID_SIGNALS, keyed by option
// id). Tool-level and protocol options have no section, so their signals and `when` live here
// in full. Plain data, no AI; the words are our own.

export const SIGNAL_IDS = Object.freeze([
  'choice', 'person', 'group', 'values', 'stuck', 'change_over_time',
  'message', 'getting_started', 'argument', 'future', 'ethics', 'self_knowledge'
]);

/** Signals for each tool-level option (`tool:<toolId>`). */
export const TOOL_SIGNALS = Object.freeze({
  'problem-solver': ['stuck', 'choice'],
  'decision-book': ['choice', 'values', 'future'],
  'get-things-done': ['getting_started', 'stuck'],
  'rules-book': ['stuck', 'group', 'self_knowledge'],
  'change-book': ['change_over_time', 'future'],
  'collaboration-book': ['group', 'person'],
  'communication-book': ['message', 'person', 'argument'],
  'question-book': ['self_knowledge', 'values']
});

/** A "use this when" line for each tool-level option. */
export const TOOL_WHEN = Object.freeze({
  'problem-solver': 'A real problem that needs defining, analysing and a plan, step by step.',
  'decision-book': 'A choice to settle: weigh the options, name what it rests on and set a review.',
  'get-things-done': 'Something feels too big or too stuck to start; you need one small, dated experiment.',
  'rules-book': 'A moment at work or in life you cannot read clearly; one rule of thumb may show it.',
  'change-book': 'A change you are living through or want to make, and how it may unfold over time.',
  'collaboration-book': 'Working with others: a shared problem, a shared goal, or trust that needs building.',
  'communication-book': 'One exchange that matters: a talk to prepare, a relationship to mend, a message to read.',
  'question-book': 'You want to think privately about yourself, your values or your life before deciding anything.'
});

/** Signals and `when` for each protocol option (`protocol:<id>`). */
export const PROTOCOL_SIGNALS = Object.freeze({
  fates: ['stuck', 'getting_started', 'future'],
  horizon: ['future', 'change_over_time', 'choice'],
  refinery: ['argument'],
  cartographers: ['argument', 'getting_started'],
  mirror: ['values', 'self_knowledge'],
  consilium: ['ethics', 'values', 'choice'],
  witness: ['self_knowledge'],
  tribunal: ['stuck', 'change_over_time']
});

export const PROTOCOL_WHEN = Object.freeze({
  fates: 'The question is wide open ("what could we even do?") and needs ideas spun, cut and weighed.',
  horizon: 'A direction question: where things are heading against where you want them to be in years.',
  refinery: 'A choice or claim rests on one argument that needs building, breaking and rebuilding.',
  cartographers: 'A step needs reading first: turn sources into a map fit for the purpose.',
  mirror: 'What you do and what you say you want pull apart, and your values seem to clash.',
  consilium: 'A choice has an ethical side and you want it weighed from incompatible standpoints.',
  witness: 'The thinking is done and you want to know how far to trust how it went.',
  tribunal: 'An entrenched problem keeps coming back however it is framed.'
});

/** Signals for Problem Solver's process models (`ps:<modelId>`). */
export const PS_MODEL_SIGNALS = Object.freeze({
  seven_step: ['stuck', 'choice'],
  polya: ['stuck', 'getting_started'],
  triz: ['stuck', 'choice']
});

/** Section defaults per tool. Keys are each catalogue's own `section` (or Thought Starter's `group`). */
export const SECTION_SIGNALS = Object.freeze({
  'decision-book': Object.freeze({
    1: ['choice'],
    2: ['self_knowledge'],
    3: ['person', 'group'],
    4: ['group']
  }),
  'get-things-done': Object.freeze({
    doing_things: ['getting_started', 'stuck'],
    before_doing: ['getting_started'],
    working_with_others: ['group', 'person'],
    doing_differently: ['change_over_time', 'stuck'],
    reviewing: ['self_knowledge']
  }),
  'rules-book': Object.freeze({
    workplace: ['group', 'stuck'],
    change: ['change_over_time'],
    people: ['self_knowledge', 'person'],
    life: ['values', 'future']
  }),
  'change-book': Object.freeze({
    explaining_our_world: ['change_over_time', 'future'],
    explaining_my_world: ['self_knowledge', 'values'],
    changing_my_world: ['change_over_time', 'choice'],
    changing_our_world: ['change_over_time', 'group'],
    appendix: ['change_over_time']
  }),
  'collaboration-book': Object.freeze({
    solving_problems: ['group'],
    achieving_goals: ['group', 'getting_started'],
    creating_trust: ['group', 'person']
  }),
  'communication-book': Object.freeze({
    job_career: ['message', 'person'],
    self_knowledge: ['self_knowledge', 'message'],
    love_friendship: ['person', 'message'],
    words_meanings: ['message', 'argument'],
    conclusion: ['message']
  }),
  'question-book': Object.freeze({
    everyday_life: ['self_knowledge'],
    work_and_money: ['self_knowledge', 'choice'],
    identity_and_convictions: ['values', 'self_knowledge'],
    relationships: ['person', 'self_knowledge'],
    life_course: ['future', 'self_knowledge']
  })
});

/** Extra signals for single options, on top of their section's. */
export const ID_SIGNALS = Object.freeze({
  dm_consequences: ['future'],
  dm_stop_rule: ['future'],
  dm_political_compass: ['values', 'ethics'],
  dm_prisoners: ['ethics', 'choice'],
  dm_conflict: ['argument', 'person'],
  dm_black_swan: ['future'],
  dm_future: ['future', 'choice'],
  dm_crossroads: ['choice', 'values'],
  dm_hard_choice: ['choice', 'values'],
  dm_rubber_band: ['choice'],
  dm_cognitive_bias: ['argument'],
  dm_feedback_box: ['message', 'person'],
  dm_feedback_analysis: ['self_knowledge'],
  dm_chasm: ['change_over_time'],
  dm_maslow: ['values'],
  gt_procrastination: ['stuck'],
  gt_paralysis_by_analysis: ['choice'],
  gt_motivation: ['self_knowledge'],
  gt_sandwich_feedback: ['message'],
  gt_radical_transparency: ['message'],
  gt_kotter_change: ['change_over_time', 'group'],
  gt_disruptive_innovation: ['future'],
  gt_journalling: ['self_knowledge'],
  gt_brainstorming: ['getting_started'],
  gt_structured_evaluation: ['choice'],
  rb_ten_ten_ten: ['choice', 'future'],
  rb_occam: ['argument'],
  rb_korzybski: ['argument', 'message'],
  rb_wiio: ['message'],
  rb_comfort: ['stuck', 'change_over_time'],
  rb_region_beta: ['stuck'],
  rb_one_step: ['getting_started'],
  rb_chesterton: ['choice'],
  ch_decision: ['choice'],
  ch_climate_disaster: ['ethics', 'future'],
  ch_othering: ['person', 'ethics'],
  ch_future: ['future'],
  ch_science: ['argument'],
  ch_anti_change: ['stuck'],
  ch_unhappiness: ['self_knowledge'],
  cb_integrative: ['choice'],
  cb_consent: ['choice'],
  cb_radical_candor: ['message', 'person'],
  cb_saying_no: ['message'],
  cb_premortem: ['future'],
  cb_postmortem: ['self_knowledge'],
  cb_diversity: ['ethics'],
  cb_burnout: ['self_knowledge', 'stuck'],
  cb_ladder: ['argument'],
  cm_negotiation: ['argument', 'choice'],
  cm_rhetoric: ['argument'],
  cm_sophism: ['argument', 'ethics'],
  cm_persuasion: ['argument'],
  cm_nonviolent: ['argument'],
  cm_game_theory: ['choice'],
  cm_framing: ['argument'],
  cm_apology: ['values'],
  qb_principles_and_values: ['ethics'],
  qb_politics_and_beliefs: ['ethics'],
  qb_a_question_of_faith: ['values'],
  qb_making_decisions: ['choice'],
  qb_career: ['future'],
  qb_communicating: ['message'],
  qb_your_future: ['change_over_time'],
  qb_last_year: ['change_over_time']
});

/** Keyword rules for signalsFromText: the fallback when the guide cannot be reached. */
export const SIGNAL_KEYWORDS = Object.freeze({
  choice: /\b(choose|choosing|choice|decide|deciding|decision|option|options|whether|either|versus|vs\.?|which one|pick)\b/i,
  person: /\b(he|she|they|partner|friend|flatmate|colleague|boss|manager|neighbour|neighbor|parent|mother|father|sibling|someone|relationship)\b/i,
  group: /\b(team|group|committee|class|staff|club|department|everyone|together|meeting|meetings|colleagues)\b/i,
  values: /\b(value|values|matter|matters|important to me|meaning|meaningful|priorit(y|ies)|principle|principles|believe|belief)\b/i,
  stuck: /\b(stuck|again and again|keeps? (happening|coming back)|going in circles|can'?t (seem|work out)|nothing works|same problem|loop)\b/i,
  change_over_time: /\b(change|changing|changed|transition|shift|moving|new job|over time|lately|habit|habits|years)\b/i,
  message: /\b(say|tell|talk|conversation|email|message|reply|letter|speech|present|presentation|feedback|word|words)\b/i,
  getting_started: /\b(start|starting|begin|procrastinat\w*|too big|overwhelm\w*|where to begin|get going|put off)\b/i,
  argument: /\b(argue|argument|case for|claim|thesis|persuade|convince|essay|evidence|reason|reasons)\b/i,
  future: /\b(future|plan|plans|next year|long[- ]term|five years|ten years|career|retire|heading)\b/i,
  ethics: /\b(ethic\w*|moral\w*|right thing|fair|unfair|wrong|honest|dishonest|loyal\w*|harm)\b/i,
  self_knowledge: /\b(myself|who i am|why i|my own|i keep|i always|i never|i feel|feelings|anxious|happy|unhappy)\b/i
});
