/**
 * Runtime activation policy — maps intent classes to required retrieval.
 * Not Cursor coding discipline. Not a capability count. This is what makes
 * installed tools become user-facing behaviour.
 */

/** Soft intent classes — patterns are evidence of class, not brittle keywords. */
const INTENT_RULES = [
  {
    id: 'training_overview',
    agents: ['chadwick'],
    requiredTools: ['get_fitness_snapshot', 'compare_workout_windows'],
    patterns: [
      /how(?:'s| is| has)? (?:my |the )?train/i,
      /training (?:been |going|lately|this (?:week|month))/i,
      /am i on track (?:with )?(?:train|fitness|gym)/i,
      /fitness (?:overview|dashboard|summary)/i,
      /how(?:'s| is) (?:my )?(?:gym|lifting|progress)/i
    ]
  },
  {
    id: 'training_decline',
    agents: ['chadwick'],
    requiredTools: ['get_load_status', 'get_pain_training_summary', 'get_fitness_snapshot', 'get_body_state'],
    patterns: [
      /declin/i,
      /weaker|stall(?:ed|ing)?|plateau/i,
      /why (?:am i |is (?:my )?)?(?:struggl|regress|getting worse)/i,
      /performance (?:drop|down|off)/i,
      /feeling (?:flat|weak|overtrained)/i
    ]
  },
  {
    id: 'nutrition_overview',
    agents: ['brisket'],
    requiredTools: ['get_nutrition_snapshot', 'get_nutrition_adherence'],
    patterns: [
      /how(?:'s| is| has)? (?:my )?(?:eating|nutrition|diet|macros)/i,
      /adherence/i,
      /on track (?:with |for )?(?:protein|calories|nutrition|eating)/i,
      /this week(?:'s)? (?:food|meals|macros|protein)/i
    ]
  },
  {
    id: 'focus_today',
    agents: ['clare'],
    requiredTools: ['get_tasks_focus'],
    patterns: [
      /what should i (?:focus on|do) today/i,
      /priorit(?:y|ise|ize)/i,
      /what(?:'s| is) (?:on )?(?:my )?(?:plate|day|today)/i,
      /morning sweep/i,
      /what have i got today/i
    ]
  },
  {
    id: 'improve_lesson',
    agents: ['ann'],
    requiredTools: ['search_teaching', 'get_teaching_context'],
    patterns: [
      /improve (?:tomorrow(?:'s)? |today(?:'s)? |(?:the |my )?)?(?:year \d+ )?lesson/i,
      /help (?:me )?(?:with |fix )?tomorrow(?:'s)?/i,
      /(?:year|y)\s*10/i,
      /lesson (?:plan|for|tomorrow|today)/i,
      /unit (?:sequence|plan)/i
    ]
  },
  {
    id: 'knowledge_lookup',
    agents: ['clementine'],
    requiredTools: ['search_knowledge'],
    patterns: [
      /what do i (?:already )?have (?:about|on)/i,
      /what (?:do i |have i )?know about/i,
      /search (?:my )?(?:notes|archive|knowledge)/i,
      /in (?:my )?(?:notes|archive|corpus)/i,
      /cognitive load/i
    ]
  },
  {
    id: 'weight_trend',
    agents: ['sara'],
    requiredTools: ['get_body_state', 'get_weight_trend'],
    patterns: [
      /weight (?:change|trend|unusual|moving)/i,
      /is my weight/i,
      /body (?:fat|composition|trend)/i,
      /unusual.*weight|weight.*unusual/i
    ]
  },
  {
    id: 'diary_pattern',
    agents: ['penelope'],
    requiredTools: ['search_diary_records'],
    patterns: [
      /have i (?:been )?feeling (?:like )?this/i,
      /often(?:\?|$)/i,
      /mentioned (?:this|feeling) before/i,
      /diary (?:history|pattern|entries)/i,
      /prior entries|earlier (?:this|in the) (?:week|month)/i
    ]
  },
  {
    id: 'mind_pattern',
    agents: ['vera'],
    requiredTools: ['search_mind_records'],
    patterns: [
      /pattern (?:have you |across |in )?/i,
      /across (?:our )?recent sessions/i,
      /what (?:have you|did you) notice/i,
      /themes? (?:across|in|from) (?:our |recent )?sessions/i
    ]
  },
  {
    id: 'routine_helping',
    agents: ['hyaluronica'],
    requiredTools: ['get_skincare_adherence', 'list_skincare_routines', 'search_skincare_records'],
    patterns: [
      /is (?:this |my )?routine\b.{0,40}\bhelp/i,
      /routine\b.{0,40}\b(?:working|helping|adherence)/i,
      /is (?:my )?(?:am|pm)\b.{0,20}\b(?:helping|working)/i,
      /treatment\b.{0,40}\b(?:timeline|helping|working)/i,
      /(?:skincare|skin care|skin)\b.{0,40}\b(?:help|working|better|worse|improv)/i,
      /is (?:this|it|my (?:routine|treatment)) (?:actually )?help/i
    ]
  },
  {
    id: 'life_slipping',
    agents: ['hammond'],
    requiredTools: ['inspect_hub_signals'],
    patterns: [
      /what is slipping/i,
      /slipping across/i,
      /across my life/i,
      /full picture|needs attention|open loops/i,
      /what(?:'s| is) (?:falling|getting) (?:behind|dropped)/i
    ]
  },
  {
    id: 'history_search',
    agents: ['chadwick', 'brisket', 'sara', 'penelope', 'vera', 'hyaluronica', 'clare', 'ann', 'clementine'],
    requiredToolsByAgent: {
      chadwick: ['search_workout_records'],
      brisket: ['search_nutrition_records'],
      sara: ['search_medical_records', 'get_weight_trend'],
      penelope: ['search_diary_records'],
      vera: ['search_mind_records'],
      hyaluronica: ['search_skincare_records'],
      clare: ['search_tasks'],
      ann: ['search_teaching'],
      clementine: ['search_knowledge']
    },
    patterns: [
      /have i mentioned/i,
      /did i (?:ever |already )?(?:log|write|note|say)/i,
      /search (?:my |the )?(?:records|history|notes)/i,
      /look(?:ing)? (?:this )?up in (?:my )?(?:records|history)/i
    ]
  }
];

const CATALOGUES = {
  chadwick: [
    'Fitness sessions (data/fitness) — get_fitness_snapshot, get_last_workout, search_workout_records, compare_workout_windows, get_training_volume, get_working_weights, get_long_term_fitness, get_session_comparisons, get_exercise_history, get_load_status, get_pain_training_summary, get_region_strength, get_workout_template',
    'Body composition/tape (data/body) — get_body_state',
    'Exercise library — search_exercise_library',
    'Prompt may include a bounded Recent sessions list; that is metadata, not a substitute for calling tools when Adam asks how training is going, about decline, load, pain, volume, or comparisons.'
  ],
  brisket: [
    'Nutrition logs (data/nutrition) — get_nutrition_snapshot, get_nutrition_adherence, search_nutrition_records, get_nutrition_targets',
    'Challenge trackers — list_nutrition_challenges / mark tools',
    'Food library — check before web_search; save_food_library_entry for verified AU figures',
    'Body state may be preloaded — still call nutrition tools for week/month adherence questions.'
  ],
  sara: [
    'Body composition/weight/tape — get_body_state, get_weight_trend',
    'Medical Overview — search_medical_records, brief_medical_appointment',
    'Never answer personalised body/medical questions from generic knowledge when these tools can retrieve Adam\'s records.'
  ],
  penelope: [
    'Diary records (data/mind diary) — search_diary_records, get_diary_range',
    'Mind digest / on-this-day may be preloaded — still search when Adam refers to patterns, recurrence, or earlier events.',
    'Do not ask him to paste prior entries that tools can retrieve.'
  ],
  vera: [
    'Mind sessions + diary metadata — get_mind_session, search_mind_records',
    'Ground every claimed pattern in retrieved session evidence. Cross-session comparison requires search_mind_records first.'
  ],
  hyaluronica: [
    'Routines + product library — list_skincare_routines, search_skincare_library',
    'Routine/treatment history — get_skincare_adherence, search_skincare_records',
    'Treatment state / nutrition→skin week may be preloaded — still retrieve history when asking if a routine is helping.'
  ],
  clare: [
    'Tasks store — get_tasks_focus (open tasks, deadlines, capacity, stress), search_tasks, get_task',
    'Inspect Tasks data before suggesting what Adam should do next. Do not invent rows.'
  ],
  ann: [
    'Teaching store — search_teaching, get_teaching_context (class/unit/lesson/calendar window)',
    'Inspect existing material before recommending or changing teaching work.'
  ],
  clementine: [
    'Knowledge corpus — search_knowledge (notes, tags, connected sources, claims)',
    'Search stored notes before synthesising. Distinguish retrieved notes from new synthesis.',
    'Teaching-hub protocol path is intentional for school workplace turns; Knowledge prompts remain the research spine.'
  ],
  hammond: [
    'Cross-hub signals — inspect_hub_signals (Tasks/Teaching/Life digests available this turn)',
    'Full Central Node + governance tail may be preloaded — still call inspect_hub_signals when asking what is slipping across life.',
    'State which hubs lacked usable evidence. Do not invent rows.'
  ]
};

const SHARED_RULES = [
  'Retrieval sequence when stored information is relevant: (1) decide which Life Hub sources apply, (2) inspect available-source metadata, (3) call domain tools for missing records, (4) continue if results are truncated/incomplete, (5) prefer deterministic tool numbers over guesses, (6) label retrieved facts vs calculated vs inference, (7) name unavailable sources honestly, (8) answer, (9) propose durable writes only when appropriate.',
  'Never answer from generic knowledge when relevant personal records exist and are accessible via your tools.',
  'Never treat missing/failed/truncated context as "no data" — say which source failed or was cut.',
  'Adam does not need magic wording like "search my records" or "use the fitness tool". Ordinary questions still require retrieval.',
  'Do not dump all records into chat. Progressive retrieval: metadata first, then tools for the relevant slice.'
];

/**
 * Specialist agents pack their domain on substantive turns even when no
 * regex intent fires. Patterns refine tool sets; they are not a whitelist
 * of the only sentences that may retrieve evidence.
 */
const DOMAIN_DEFAULTS = {
  chadwick: ['get_fitness_snapshot', 'compare_workout_windows'],
  brisket: ['get_nutrition_snapshot', 'get_nutrition_adherence'],
  sara: ['get_body_state', 'get_weight_trend'],
  penelope: ['search_diary_records'],
  vera: ['search_mind_records'],
  hyaluronica: ['get_skincare_adherence', 'search_skincare_records'],
  clare: ['get_tasks_focus'],
  ann: ['search_teaching', 'get_teaching_context'],
  clementine: ['search_knowledge'],
  hammond: ['inspect_hub_signals']
};

const SMALL_TALK_RE =
  /^(hi|hey|hello|howdy|yo|thanks|thank you|ty|ok|okay|cheers|bye|good (?:morning|afternoon|evening|night)|just checking in|testing|ping)(?:[.!?\s]*)$/i;

/** Ordinary greetings / acknowledgements — not domain work. */
const SOCIAL_FILLER_RE =
  /^(hey|hi|hello|howdy|yo)\b[\w\s,',.!?]{0,40}$/i;

export function isSubstantiveTurn(message) {
  const text = String(message ?? '').trim();
  if (text.length < 12) return false;
  if (SMALL_TALK_RE.test(text)) return false;
  if (SOCIAL_FILLER_RE.test(text) && !/[?]/.test(text)) return false;
  return true;
}

export function classifyIntent(slug, message) {
  const text = typeof message === 'string' ? message : '';
  for (const rule of INTENT_RULES) {
    if (!rule.agents.includes(slug)) continue;
    if (!rule.patterns.some(re => re.test(text))) continue;
    const requiredTools = rule.requiredTools
      ?? rule.requiredToolsByAgent?.[slug]
      ?? [];
    return { id: rule.id, requiredTools: [...requiredTools] };
  }
  const defaults = DOMAIN_DEFAULTS[slug];
  if (defaults && isSubstantiveTurn(text)) {
    return { id: 'domain_default', requiredTools: [...defaults] };
  }
  return { id: 'none', requiredTools: [] };
}

export function catalogueForAgent(slug) {
  const lines = CATALOGUES[slug];
  if (!lines?.length) return '';
  return [
    `Available data sources & retrieval tools for ${slug}:`,
    ...lines.map(line => `- ${line}`),
    ...SHARED_RULES.map(line => `- ${line}`)
  ].join('\n');
}

export function formatAvailableSourcesMeta(meta = {}) {
  const lines = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value == null || value === '') continue;
    if (typeof value === 'object' && value.error) {
      lines.push(`- ${key}: UNAVAILABLE (${value.error}) — do not invent this domain.`);
      continue;
    }
    if (typeof value === 'object') {
      const bits = [];
      if (value.count != null) bits.push(`count=${value.count}`);
      if (value.from && value.to) bits.push(`${value.from}→${value.to}`);
      if (value.truncated) bits.push(`truncated kept=${value.kept ?? '?'} omitted=${value.omitted ?? '?'}`);
      if (value.note) bits.push(value.note);
      lines.push(`- ${key}: ${bits.join('; ') || 'present'}`);
      continue;
    }
    lines.push(`- ${key}: ${value}`);
  }
  if (!lines.length) return '';
  return `Available context metadata this turn (not full records — retrieve with tools when needed):\n${lines.join('\n')}`;
}

/**
 * @returns {{
 *   intentClass: string,
 *   requiredTools: string[],
 *   forceToolChoice: boolean,
 *   catalogueBlock: string,
 *   activationBlock: string
 * }}
 */
export function activationForTurn({ slug, message, sourceMeta } = {}) {
  if (typeof slug !== 'string' || !slug) {
    return {
      intentClass: 'none',
      requiredTools: [],
      forceToolChoice: false,
      catalogueBlock: '',
      activationBlock: ''
    };
  }

  const intent = classifyIntent(slug, message);
  const catalogueBlock = [catalogueForAgent(slug), formatAvailableSourcesMeta(sourceMeta)]
    .filter(Boolean)
    .join('\n\n');

  let activationBlock = '';
  if (intent.requiredTools.length) {
    activationBlock = [
      `Activation this turn (intent class: ${intent.id}):`,
      `You MUST call these retrieval tools before answering: ${intent.requiredTools.join(', ')}.`,
      'Do not ask Adam to paste data that those tools can return.',
      'If a tool returns truncated=true or ok:false / unavailable, say so explicitly and continue with what you have — never present failure as an empty clean result.',
      'Cite retrieved dates, ranges, or record ids when you lean on them.'
    ].join('\n');
  }

  return {
    intentClass: intent.id,
    requiredTools: intent.requiredTools,
    forceToolChoice: intent.requiredTools.length > 0,
    catalogueBlock,
    activationBlock
  };
}

/** Test helper: list rules (read-only). */
export function listIntentRules() {
  return INTENT_RULES.map(rule => ({
    id: rule.id,
    agents: [...rule.agents],
    requiredTools: rule.requiredTools ? [...rule.requiredTools] : undefined,
    requiredToolsByAgent: rule.requiredToolsByAgent
      ? Object.fromEntries(Object.entries(rule.requiredToolsByAgent).map(([k, v]) => [k, [...v]]))
      : undefined
  }));
}
