// packages/question-book/catalogue.mjs
// The Question Book (Krogerus and Tschäppeler) as data, for the Question Book tool in Tasks:
// a private notebook of reflection questions in 40 chapters across five groups, plus a "rules
// of the game" card and a chapter where you write your own questions. Generated once from the
// private book pack, then kept by hand. No question text, quotation or page number lives here:
// the questions are read at run time from the private data repository
// (data/tasks/question-book/questions.json in life-hub-data). `when` is our own one-line note.
// The five charts are drawn inside their parent chapters with the Decision Book's quadrant and
// plot families; their structures are short axis words and pass those factories (tests check).

/** Where the server reads the questions from, in the private data repository. */
export const PRIVATE_QUESTIONS_PATH = 'data/tasks/question-book/questions.json';

/** The five groups, in the book's order. */
export const GROUPS = Object.freeze([
  Object.freeze({ key: 'everyday_life', title: 'Everyday life', order: 1 }),
  Object.freeze({ key: 'work_and_money', title: 'Work and money', order: 2 }),
  Object.freeze({ key: 'identity_and_convictions', title: 'Identity and convictions', order: 3 }),
  Object.freeze({ key: 'relationships', title: 'Relationships', order: 4 }),
  Object.freeze({ key: 'life_course', title: 'Life course', order: 5 })
]);

/** What a chapter is: answerable questions, the rules card, or your own questions. */
export const CHAPTER_KINDS = Object.freeze(['questions', 'rules', 'own']);

const counters = {};
const c = (group, id, title, kind, when) => {
  counters[group] = (counters[group] ?? 0) + 1;
  return Object.freeze({ id, title, group, order: counters[group], kind, when });
};

/** The 42 chapters, each group's in the book's order. */
export const CHAPTERS = Object.freeze([
  c('everyday_life', 'qb_right_now', 'Right now', 'questions', 'Use this when you want a grounded snapshot of everyday life.'),
  c('everyday_life', 'qb_rituals_and_routines', 'Rituals & routines', 'questions', 'Use this when your routines deserve a fresh look.'),
  c('everyday_life', 'qb_guilty_pleasures', '(Guilty) pleasures', 'questions', 'Use this when you want to explore what enjoyment and escape do for you.'),
  c('everyday_life', 'qb_house_and_home', 'House & home', 'questions', 'Use this when you want to explore what makes somewhere feel like home.'),
  c('everyday_life', 'qb_pick_your_three', 'Pick your three', 'questions', 'Use this when you want a light entry into personal reflection.'),
  c('everyday_life', 'qb_travel', 'Travel', 'questions', 'Use this when you want to learn from memorable journeys.'),
  c('work_and_money', 'qb_career', 'Career', 'questions', 'Use this when your working life needs reflection beyond a job title.'),
  c('work_and_money', 'qb_in_the_office', 'In the office', 'questions', 'Use this when you want to understand your actual working conditions.'),
  c('work_and_money', 'qb_being_the_boss', 'Being the boss', 'questions', 'Use this when you lead people and want to examine your preferences.'),
  c('work_and_money', 'qb_money_and_possessions', 'Money & possessions', 'questions', 'Use this when you want to separate financial value from personal significance.'),
  c('identity_and_convictions', 'qb_four_rules', 'Four rules of the game', 'rules', 'Use this when a reflection session needs a shared frame.'),
  c('identity_and_convictions', 'qb_who_you_are', 'Who you are', 'questions', 'Use this when you want to distinguish inherited stories from your own experience.'),
  c('identity_and_convictions', 'qb_who_you_really_are', 'Who you really are', 'questions', 'Use this when you want to test self-labels against actual behaviour.'),
  c('identity_and_convictions', 'qb_principles_and_values', 'Principles & values', 'questions', 'Use this when you want to connect convictions with specific choices.'),
  c('identity_and_convictions', 'qb_politics_and_beliefs', 'Politics & beliefs', 'questions', 'Use this when you want to explore changes in your public convictions.'),
  c('identity_and_convictions', 'qb_thinking_green', 'Thinking green', 'questions', 'Use this when you want to connect environmental concern with everyday choices.'),
  c('identity_and_convictions', 'qb_making_decisions', 'Making decisions', 'questions', 'Use this when you want to notice your habits before selecting a decision method.'),
  c('identity_and_convictions', 'qb_a_question_of_faith', 'A question of faith', 'questions', 'Use this when you want to explore belief, doubt and meaning.'),
  c('identity_and_convictions', 'qb_your_questions', 'Your questions', 'own', 'Use this when the available prompts miss something important to you.'),
  c('relationships', 'qb_communicating', 'Communicating', 'questions', 'Use this when your conversation habits are getting in the way of being understood.'),
  c('relationships', 'qb_what_your_boss_thinks_about_you', 'What your boss thinks about you', 'questions', 'Use this when you want to compare your self-image with another person’s experience.'),
  c('relationships', 'qb_what_your_colleague_thinks_about_you', 'What your colleague thinks about you', 'questions', 'Use this when you want to compare your self-image with another person’s experience.'),
  c('relationships', 'qb_your_family', 'Your family', 'questions', 'Use this when you want to understand what family relationships passed on to you.'),
  c('relationships', 'qb_you_and_your_siblings', 'You and your siblings', 'questions', 'Use this when you want to understand how sibling relationships differ.'),
  c('relationships', 'qb_what_your_parents_think_about_you', 'What your parents think about you', 'questions', 'Use this when you want to compare your self-image with another person’s experience.'),
  c('relationships', 'qb_love', 'Love', 'questions', 'Use this when you want to understand the lived experience of your relationship.'),
  c('relationships', 'qb_what_your_partner_thinks_about_you', 'What your partner thinks about you', 'questions', 'Use this when you want to compare your self-image with another person’s experience.'),
  c('relationships', 'qb_single_life', 'Single life', 'questions', 'Use this when you want to reflect on being single in your own terms.'),
  c('relationships', 'qb_sex', 'Sex', 'questions', 'Use this when you want a private reflection on desire and intimacy.'),
  c('relationships', 'qb_your_friends', 'Your friends', 'questions', 'Use this when you want to explore the roles and imbalances in your friendships.'),
  c('relationships', 'qb_what_your_friends_think_about_you', 'What your friends think about you', 'questions', 'Use this when you want to compare your self-image with another person’s experience.'),
  c('life_course', 'qb_last_year', 'Last year', 'questions', 'Use this when you want to understand what changed over the past year.'),
  c('life_course', 'qb_mind_and_body', 'Mind & body', 'questions', 'Use this when you want to reflect on the relationship between your body and daily life.'),
  c('life_course', 'qb_first_time_last_time', 'First time – last time', 'questions', 'Use this when you want to compare early and recent experiences.'),
  c('life_course', 'qb_childhood_memories', 'Childhood memories', 'questions', 'Use this when you want to explore early experiences behind your present story.'),
  c('life_course', 'qb_thinking_about_having_children', 'Thinking about having children', 'questions', 'Use this when you want to examine hopes and assumptions about parenthood.'),
  c('life_course', 'qb_being_a_parent', 'Being a parent', 'questions', 'Use this when you want to explore how parenting has changed your priorities.'),
  c('life_course', 'qb_happiness', 'Happiness', 'questions', 'Use this when you want to notice the conditions that affect your happiness.'),
  c('life_course', 'qb_fears_and_anxieties', 'Fears & anxieties', 'questions', 'Use this when you want to understand a fear in the context of your life.'),
  c('life_course', 'qb_your_future', 'Your future', 'questions', 'Use this when you want to examine hopes and the direction of your life.'),
  c('life_course', 'qb_dying', 'Dying', 'questions', 'Use this when you want to consider mortality and what deserves attention.'),
  c('life_course', 'qb_final_questions', 'Final questions', 'questions', 'Use this when you want to bring several life themes together.')
]);

/** The rules card's four agreements, in our own short words (the `rules` chapter). */
export const RULES = Object.freeze([
  Object.freeze({ id: 'immediate', label: 'Start with an immediate response' }),
  Object.freeze({ id: 'honest', label: 'Answer honestly' }),
  Object.freeze({ id: 'revise', label: 'Allow revision' }),
  Object.freeze({ id: 'listen', label: 'Listen carefully' })
]);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
};

const quadrantCells = (x, y) => [
  { id: 'upper_left', label: `${x.low} / ${y.high}`, col: 0, row: 0, fill: 'tint' },
  { id: 'upper_right', label: `${x.high} / ${y.high}`, col: 1, row: 0, fill: 'tint' },
  { id: 'lower_left', label: `${x.low} / ${y.low}`, col: 0, row: 1, fill: 'tint' },
  { id: 'lower_right', label: `${x.high} / ${y.low}`, col: 1, row: 1, fill: 'tint' }
];
const quadrant = (id, chapter, title, x, y, item) => ({ id, chapter, title, family: 'quadrant', structure: { axes: { x, y }, cells: quadrantCells(x, y), item, minItems: 1, minCells: 1 } });

/**
 * The five charts, each answered inside its parent chapter by one `chart` question. The
 * possessions plot keeps the book's − and + poles; positions run 1–10 underneath, as the plot
 * family places them.
 */
export const CHARTS = deepFreeze([
  quadrant('qb_communication_map', 'qb_communicating', 'How you talk about different topics',
    { label: 'Amount of detail', low: 'sparingly', high: 'in detail' }, { label: 'Tone', low: 'enthusiastically', high: 'negatively' }, 'One of six topics A–F'),
  quadrant('qb_paid_work_map', 'qb_career', 'Paid jobs: enjoyment and pay',
    { label: 'Pay', low: 'well paid', high: 'badly paid' }, { label: 'Enjoyment', low: 'no fun', high: 'fun' }, 'A job you have been paid to do'),
  quadrant('qb_pain_map', 'qb_mind_and_body', 'Pain experienced and inflicted',
    { label: 'Role', low: 'experienced', high: 'inflicted on somebody else' }, { label: 'Kind of pain', low: 'physically', high: 'mentally' }, 'A recollection of pain'),
  {
    id: 'qb_possessions_map', chapter: 'qb_money_and_possessions', title: 'Possessions: financial and personal value', family: 'plot',
    structure: { axes: { x: { label: 'personal value', low: '-', high: '+' }, y: { label: 'monetary value', low: '-', high: '+' } }, point: 'A valuable possession', max: 5, minPoints: 1 }
  },
  quadrant('qb_friendship_map', 'qb_your_friends', 'Friends: age and perceived happiness',
    { label: 'Age relative to me', low: 'younger than me', high: 'older than me' }, { label: 'Happiness relative to me', low: 'unhappier than me', high: 'happier than me' }, 'One of five friends')
]);

const byId = new Map(CHAPTERS.map((ch) => [ch.id, ch]));
const chartById = new Map(CHARTS.map((ch) => [ch.id, ch]));

/** A chapter by id, or null. */
export const chapter = (id) => byId.get(id) ?? null;

/** A chart by id, or null. */
export const chart = (id) => chartById.get(id) ?? null;

/** A group's chapters, in order. */
export const chaptersInGroup = (key) => CHAPTERS.filter((ch) => ch.group === key);

/** A chapter's charts. */
export const chartsInChapter = (id) => CHARTS.filter((ch) => ch.chapter === id);

/** The chapter where you write your own questions, and the rules card. */
export const OWN_CHAPTER = 'qb_your_questions';
export const RULES_CHAPTER = 'qb_four_rules';
