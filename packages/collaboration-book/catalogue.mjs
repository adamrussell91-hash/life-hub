// packages/collaboration-book/catalogue.mjs
// The Collaboration Book's models as data (Krogerus and Tschäppeler), for the Collaboration Book
// tool. Generated once from the private book pack, then kept by hand. No book text, quotation or
// page number lives here. `seeAlso` holds the book's own cross-references (an entry folded into
// another resolves to its parent) and `pairsWell` our own suggestions. `reuse` names the tool a
// variant is built on; `merged` lists the cut-down entries folded into a parent. Every id starts
// with `cb_`. Every model draws with a shared Decision Book family.

/** The three source sections, in the book's order. `route` is the group id a session stores. */
export const SECTIONS = Object.freeze([
  Object.freeze({ key: 'solving_problems', title: 'Solving Problems', route: 'problems' }),
  Object.freeze({ key: 'achieving_goals', title: 'Achieving Your Goals', route: 'goals' }),
  Object.freeze({ key: 'creating_trust', title: 'Creating Trust', route: 'trust' })
]);

/** Chart families: the shared Decision Book families the models use. */
export const FAMILIES = Object.freeze(['path', 'list', 'quadrant', 'scales', 'tension']);

const m = (section, id, title, family, tier, { seeAlso = [], pairsWell = [], reuse = null, merged = [] } = {}) =>
  Object.freeze({ id, section, title, family, tier, seeAlso: Object.freeze(seeAlso), pairsWell: Object.freeze(pairsWell), reuse, merged: Object.freeze(merged) });

export const CATALOGUE = Object.freeze([
  m('solving_problems', 'cb_two_pizza', 'The Two-Pizza Rule', 'list', 'lens', { pairsWell: ['dm_team', 'cb_hybrid'] }),
  m('solving_problems', 'cb_tuckman', 'Tuckman’s Stages', 'path', 'worksheet', { pairsWell: ['dm_drexler_sibbet', 'cb_psych_safety'] }),
  m('solving_problems', 'cb_run_change', 'Run the Bank versus Change the Bank', 'tension', 'lens', { seeAlso: ['cb_saying_no'], pairsWell: ['cb_purpose'] }),
  m('solving_problems', 'cb_hybrid', 'Hybrid Work', 'quadrant', 'worksheet', { pairsWell: ['cb_workshops'] }),
  m('solving_problems', 'cb_new_pay', 'New Pay', 'list', 'lens', { pairsWell: ['cb_corporate_culture'] }),
  m('solving_problems', 'cb_red_blue', 'Red Team versus Blue Team', 'list', 'worksheet', { pairsWell: ['cb_premortem', 'dm_swiss_cheese'] }),
  m('solving_problems', 'cb_agility', 'Agility', 'quadrant', 'worksheet', { pairsWell: ['cb_sociocracy', 'cb_servant'], merged: ['cb_flat'] }),
  m('solving_problems', 'cb_integrative', 'Integrative Decision-Making', 'path', 'worksheet', { seeAlso: ['cb_consent'], pairsWell: ['cb_sociocracy'] }),
  m('solving_problems', 'cb_psych_safety', 'Psychological Safety', 'quadrant', 'lens', { pairsWell: ['cb_vulnerability', 'cb_workshops'] }),
  m('solving_problems', 'cb_ladder', 'The Ladder of Inference', 'path', 'worksheet', { pairsWell: ['perspective_shift', 'cb_nunchi'], merged: ['cb_positive_intent'] }),
  m('solving_problems', 'cb_bad_apple', 'The Bad Apple Experiment', 'path', 'worksheet', { pairsWell: ['cb_radical_candor', 'cb_ladder'] }),
  m('solving_problems', 'cb_reciprocity', 'The Reciprocity Ring', 'list', 'worksheet', { pairsWell: ['cb_vulnerability'] }),
  m('solving_problems', 'cb_radical_candor', 'Radical Candor', 'quadrant', 'worksheet', { pairsWell: ['feedback_matrix', 'cb_trust_triangle'] }),
  m('solving_problems', 'cb_four_in_one', '4-in-1 Perspective', 'scales', 'lens', { pairsWell: ['cb_burnout'] }),
  m('solving_problems', 'cb_burnout', 'Burnout', 'list', 'lens', { pairsWell: ['cb_four_in_one', 'cb_corporate_culture'] }),
  m('achieving_goals', 'cb_small_wins', 'Small Wins', 'path', 'worksheet', { pairsWell: ['fifteen_percent', 'cb_north_star'] }),
  m('achieving_goals', 'cb_cooperation', 'Tools of Cooperation', 'list', 'worksheet', { pairsWell: ['cb_agility', 'cb_purpose'] }),
  m('achieving_goals', 'cb_servant', 'Servant Leadership', 'list', 'lens', { pairsWell: ['cb_sutton_boss'] }),
  m('achieving_goals', 'cb_reorg', 'Reorg', 'list', 'lens', { pairsWell: ['cb_small_wins', 'cb_consent'] }),
  m('achieving_goals', 'cb_premortem', 'The Premortem', 'path', 'worksheet', { seeAlso: ['cb_postmortem'], pairsWell: ['dm_swiss_cheese', 'cb_red_blue'] }),
  m('achieving_goals', 'cb_postmortem', 'The Postmortem', 'path', 'worksheet', { pairsWell: ['double_loop', 'cb_premortem'], reuse: 'after_action_review' }),
  m('achieving_goals', 'cb_workshops', 'Workshops', 'list', 'worksheet', { pairsWell: ['cb_psych_safety', 'cb_consent'] }),
  m('achieving_goals', 'cb_consent', 'Consensus versus Consent', 'list', 'worksheet', { seeAlso: ['cb_purpose'], pairsWell: ['cb_integrative'] }),
  m('achieving_goals', 'cb_purpose', 'Purpose', 'path', 'worksheet', { pairsWell: ['intent_statement', 'cb_north_star'], merged: ['cb_two_workers'] }),
  m('achieving_goals', 'cb_north_star', 'North Star Metrics', 'path', 'worksheet', { pairsWell: ['smart', 'cb_purpose'] }),
  m('achieving_goals', 'cb_saying_no', 'Saying No', 'tension', 'worksheet', { pairsWell: ['dm_yes_no', 'cb_run_change'], merged: ['cb_saying_yes'] }),
  m('creating_trust', 'cb_corporate_culture', 'Corporate Culture', 'list', 'lens', { pairsWell: ['cb_burnout', 'cb_new_pay'], reuse: 'dm_maslow' }),
  m('creating_trust', 'cb_team_culture', 'Team Culture', 'list', 'worksheet', { pairsWell: ['cb_purpose', 'cb_diversity'] }),
  m('creating_trust', 'cb_trust_triangle', 'The Trust Triangle', 'list', 'lens', { pairsWell: ['cb_radical_candor', 'cb_ladder'] }),
  m('creating_trust', 'cb_sutton_boss', 'Sutton’s Good and Bad Bosses', 'list', 'worksheet', { pairsWell: ['cb_nunchi', 'cb_servant'] }),
  m('creating_trust', 'cb_vulnerability', 'Building a Team', 'path', 'worksheet', { pairsWell: ['cb_psych_safety', 'cb_reciprocity'] }),
  m('creating_trust', 'cb_diversity', 'Diversity', 'list', 'worksheet', { pairsWell: ['cb_team_culture', 'cb_workshops'] }),
  m('creating_trust', 'cb_performance_trust', 'Performance versus Trust', 'quadrant', 'lens', { pairsWell: ['dm_team', 'cb_trust_triangle'] }),
  m('creating_trust', 'cb_sociocracy', 'Sociocracy', 'list', 'worksheet', { seeAlso: ['cb_agility', 'cb_consent', 'cb_small_wins'], pairsWell: ['cb_integrative'] }),
  m('creating_trust', 'cb_nunchi', 'Nunchi', 'path', 'worksheet', { pairsWell: ['cb_sutton_boss', 'cb_workshops'] })
]);

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

/** The entry with this id, or null. */
export const entry = (id) => BY_ID.get(id) ?? null;

/** The entries of a section, in the book's order. */
export const entriesInSection = (key) => CATALOGUE.filter((e) => e.section === key);
