// packages/change-book/catalogue.mjs
// The Change Book's models as data (Krogerus and Tschäppeler), for the Change Book tool.
// Generated once from the private book pack, then kept by hand. No book text, quotation or page
// number lives here. `seeAlso` holds the book's own cross-references and `pairsWell` our own
// suggestions. `reuse` names the Problem Solver tool a variant is built on; `merged` lists the
// cut-down entries folded into a parent. Every id starts with `ch_`.
// Two models have Change Book families of their own (families/): time_value (Multitasking) and
// attribution ((Un)Happiness).

/** The five source sections, in the book's order. `route` is the group id a session stores. */
export const SECTIONS = Object.freeze([
  Object.freeze({ key: 'explaining_our_world', title: 'Explaining our world', route: 'world' }),
  Object.freeze({ key: 'explaining_my_world', title: 'Explaining my world', route: 'self' }),
  Object.freeze({ key: 'changing_my_world', title: 'Changing my world', route: 'mine' }),
  Object.freeze({ key: 'changing_our_world', title: 'Changing our world', route: 'ours' }),
  Object.freeze({ key: 'appendix', title: 'Appendix', route: null })
]);

/** Chart families: the shared Decision Book families, then the Change Book's own two. */
export const FAMILIES = Object.freeze(['path', 'list', 'quadrant', 'curve', 'scales', 'plot', 'tension', 'time_value', 'attribution']);

const m = (section, id, title, family, tier, { seeAlso = [], pairsWell = [], reuse = null, merged = [] } = {}) =>
  Object.freeze({ id, section, title, family: reuse ? null : family, tier, seeAlso: Object.freeze(seeAlso), pairsWell: Object.freeze(pairsWell), reuse, merged: Object.freeze(merged) });

export const CATALOGUE = Object.freeze([
  m('explaining_our_world', 'ch_three_t', 'The 3-T Model', 'list', 'lens', { pairsWell: ['dm_team'] }),
  m('explaining_our_world', 'ch_rhizome', 'The Rhizome Model', 'list', 'lens', { pairsWell: ['concept_map', 'ch_objectivity'], reuse: 'concept_map' }),
  m('explaining_our_world', 'ch_braess', 'The Braess Paradox', 'list', 'lens', { pairsWell: ['causal_map', 'ch_preemption'] }),
  m('explaining_our_world', 'ch_science', 'The Science Model', 'list', 'lens', { pairsWell: ['double_loop', 'dm_black_swan', 'ch_objectivity'] }),
  m('explaining_my_world', 'ch_meaning_of_life', 'The Meaning of Life Model', 'quadrant', 'worksheet', { pairsWell: ['decision_matrix', 'dm_crossroads', 'ch_decision'] }),
  m('explaining_my_world', 'ch_counterculture', 'The Counterculture Model', 'path', 'lens', { pairsWell: ['ch_objectivity'] }),
  m('explaining_my_world', 'ch_othering', 'The Othering Model', 'quadrant', 'worksheet', { pairsWell: ['perspective_shift', 'dm_cognitive_bias'], merged: ['ch_prejudice'] }),
  m('changing_my_world', 'ch_decision', 'The Decision Model', 'path', 'worksheet', { pairsWell: ['dm_choice_overload', 'dm_stop_rule', 'dm_unconscious'] }),
  m('changing_my_world', 'ch_multitasking', 'The Multitasking Model', 'time_value', 'worksheet', { pairsWell: ['eisenhower', 'ch_sustainability'] }),
  m('changing_my_world', 'ch_sustainability', 'The Sustainability Model', 'list', 'lens', { pairsWell: ['ch_future'] }),
  m('changing_my_world', 'ch_unhappiness', 'The (Un)Happiness Model', 'attribution', 'worksheet', { pairsWell: ['force_field', 'ch_change'], merged: ['ch_dictatorship'] }),
  m('changing_my_world', 'ch_change', 'The Change Model', 'curve', 'lens', { pairsWell: ['force_field', 'ch_anti_change'] }),
  m('changing_my_world', 'ch_objectivity', 'The Objectivity Model', 'list', 'lens', { pairsWell: ['perspective_shift', 'ch_science'] }),
  m('changing_our_world', 'ch_transparency', 'The Transparency Model', 'list', 'worksheet', { pairsWell: ['ch_objectivity'] }),
  m('changing_our_world', 'ch_swarm_intelligence', 'The Swarm Intelligence Model', 'list', 'lens', { pairsWell: ['dm_role_playing', 'dm_cognitive_bias'] }),
  m('changing_our_world', 'ch_preemption', 'The Preemption Model', 'list', 'lens', { pairsWell: ['causal_map', 'ch_braess'] }),
  m('changing_our_world', 'ch_climate_disaster', 'The Climate Disaster Model', 'quadrant', 'worksheet', { pairsWell: ['dm_unimaginable', 'decision_matrix', 'ch_preemption'] }),
  m('changing_our_world', 'ch_innovation', 'The Innovation Model', 'list', 'lens', { pairsWell: ['problem_reduction', 'dm_chasm'], merged: ['ch_back_of_napkin'] }),
  m('changing_our_world', 'ch_future', 'The Future Model', 'list', 'lens', { seeAlso: ['ch_sustainability'], pairsWell: ['ch_climate_disaster'] }),
  m('appendix', 'ch_anti_change', 'The Anti-Change Model', 'list', 'lens', { pairsWell: ['from_to', 'dm_rubber_band', 'ch_change'] })
]);

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

/** The entry with this id, or null. */
export const entry = (id) => BY_ID.get(id) ?? null;

/** The entries of a section, in the book's order. */
export const entriesInSection = (key) => CATALOGUE.filter((e) => e.section === key);
