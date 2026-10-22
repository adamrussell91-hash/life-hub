// packages/get-things-done/catalogue.mjs
// The Get Things Done Book's techniques as data (Krogerus and Tschäppeler), for Gear Shifter.
// Generated once from the private book pack, then kept by hand. `chapter` is the printed
// chapter range (the supplied conversion has no internal page numbers); `seeAlso` holds only
// the book's own cross-references and `pairsWell` our own suggestions. `reuse` names the
// Problem Solver tool a variant is built on; `merged` lists cut chapters folded into an entry.
// Every other id starts with `gt_`. No book text lives here.

export const SECTIONS = Object.freeze([
  Object.freeze({ key: 'doing_things', title: 'Doing things', chapter: Object.freeze([5, 49]), route: 'doing' }),
  Object.freeze({ key: 'before_doing', title: 'What to do before you do anything', chapter: Object.freeze([51, 85]), route: 'before' }),
  Object.freeze({ key: 'working_with_others', title: 'How to get others to do things', chapter: Object.freeze([87, 117]), route: 'others' }),
  Object.freeze({ key: 'doing_differently', title: 'Doing things differently', chapter: Object.freeze([119, 143]), route: 'differently' }),
  Object.freeze({ key: 'reviewing', title: 'What to do with the things you have done', chapter: Object.freeze([145, 163]), route: 'after' })
]);

/** Chart families: the shared Decision Book families plus `ratings` (Structured Evaluation). */
export const FAMILIES = Object.freeze(['path', 'list', 'quadrant', 'curve', 'scales', 'ratings']);

const W = 'worksheet';
const L = 'lens';
const g = (section, id, title, chapter, family, tier, { seeAlso = [], pairsWell = [], reuse = null, merged = [] } = {}) =>
  Object.freeze({ id, section, title, chapter: Object.freeze(chapter), family, tier, seeAlso: Object.freeze(seeAlso), pairsWell: Object.freeze(pairsWell), reuse, merged: Object.freeze(merged) });

export const CATALOGUE = Object.freeze([
  g('doing_things', 'gt_procrastination', 'Procrastination', [6, 9], 'list', W, { seeAlso: ['gt_pomodoro', 'gt_five_second_rule'], pairsWell: ['gt_paralysis_by_analysis'] }),
  g('doing_things', 'gt_pomodoro', 'The Pomodoro Technique', [10, 11], 'path', W, { pairsWell: ['gt_deep_work'] }),
  g('doing_things', 'gt_compartmentalisation', 'Compartmentalisation', [12, 15], 'path', W, { seeAlso: ['gt_five_twenty_five_rule'], pairsWell: ['gt_inbox_management'] }),
  g('doing_things', 'gt_rapid_prototyping', 'Rapid Prototyping', [16, 19], 'path', W, { seeAlso: ['gt_radical_transparency'], pairsWell: ['gt_structured_evaluation'], merged: ['gt_new_work'] }),
  g('doing_things', 'gt_bursty_communication', 'Bursty Communication', [20, 23], 'path', W, { seeAlso: ['gt_likeability'], pairsWell: ['gt_brainstorming'] }),
  g('doing_things', 'gt_inbox_management', 'Inbox Management', [24, 27], 'path', W, { pairsWell: ['gt_deep_work'] }),
  g('doing_things', 'gt_kanban', 'Kanban', [28, 31], null, W, { seeAlso: ['gt_to_do_list'], pairsWell: ['gt_pomodoro'], reuse: 'kanban' }),
  g('doing_things', 'gt_five_whys', 'The 5 Whys Method', [32, 33], null, W, { pairsWell: ['problem_tree'], reuse: 'five_whys' }),
  g('doing_things', 'gt_five_second_rule', 'The 5-Second Rule', [34, 37], 'quadrant', W, { seeAlso: ['gt_procrastination'], pairsWell: ['gt_pomodoro'] }),
  g('doing_things', 'gt_triage', 'Triage', [38, 41], 'path', W, { pairsWell: ['gt_batching'] }),
  g('doing_things', 'gt_paralysis_by_analysis', 'Paralysis by Analysis', [42, 45], 'list', L, { pairsWell: ['gt_five_second_rule'] }),
  g('doing_things', 'gt_book_of_books', 'The Book of Books (Bob)', [46, 50], 'path', W, { pairsWell: ['knowledge_management'] }),
  g('before_doing', 'gt_getting_a_project_done', 'Getting a Project Done', [52, 55], 'path', W, { seeAlso: ['gt_bursty_communication', 'gt_brainstorming', 'gt_structured_evaluation', 'gt_rapid_prototyping', 'gt_five_whys', 'gt_reversed_effort', 'gt_budgeting', 'gt_small_gifts', 'gt_circle_of_competence', 'gt_compartmentalisation', 'gt_deep_work', 'gt_pomodoro', 'gt_five_second_rule', 'gt_transactional_model', 'gt_kanban', 'gt_circle_of_influence', 'gt_project_evaluation'], pairsWell: ['smart'] }),
  g('before_doing', 'gt_budgeting', 'Budgeting', [56, 57], 'list', W, { pairsWell: ['gt_delphi_method'] }),
  g('before_doing', 'gt_batching', 'Batching', [58, 61], 'list', W, { seeAlso: ['gt_triage'], pairsWell: ['gt_inbox_management'] }),
  g('before_doing', 'gt_delphi_method', 'The Delphi Method', [62, 65], 'path', W, { pairsWell: ['gt_structured_evaluation'] }),
  g('before_doing', 'gt_to_do_list', 'The To-Do List', [66, 69], 'list', W, { seeAlso: ['gt_deep_work'], pairsWell: ['kanban'] }),
  g('before_doing', 'gt_motivation', 'Motivation', [70, 71], 'curve', L, { merged: ['gt_matthew_effect'] }),
  g('before_doing', 'gt_deep_work', 'Deep Work', [72, 75], 'list', W, { pairsWell: ['gt_pomodoro'] }),
  g('before_doing', 'gt_tactics_versus_strategies', 'Tactics Versus Strategies', [76, 79], 'quadrant', W, { pairsWell: ['gt_getting_a_project_done'] }),
  g('before_doing', 'gt_routines', 'Routines', [84, 86], 'list', W, { pairsWell: ['gt_journalling'] }),
  g('working_with_others', 'gt_appreciation', 'Appreciation', [88, 91], 'list', L, { pairsWell: ['gt_small_gifts'] }),
  g('working_with_others', 'gt_radical_transparency', 'Radical Transparency', [92, 95], 'list', W, { pairsWell: ['gt_sandwich_feedback'] }),
  g('working_with_others', 'gt_sandwich_feedback', 'Sandwich Feedback', [96, 99], 'list', L, { pairsWell: ['gt_radical_transparency'] }),
  g('working_with_others', 'gt_likeability', 'Likeability', [100, 103], 'quadrant', W, { pairsWell: ['gt_small_gifts'] }),
  g('working_with_others', 'gt_small_gifts', 'The Theory of Small Gifts', [104, 107], 'list', L, { pairsWell: ['gt_appreciation'] }),
  g('working_with_others', 'gt_brainstorming', 'Brainstorming', [108, 113], 'path', W, { seeAlso: ['gt_structured_evaluation'], pairsWell: ['lotus_blossom'] }),
  g('working_with_others', 'gt_structured_evaluation', 'Structured Evaluation', [114, 118], 'ratings', W, { pairsWell: ['decision_matrix'] }),
  g('doing_differently', 'gt_circle_of_competence', 'The Circle of Competence', [120, 123], 'list', W, { seeAlso: ['gt_five_twenty_five_rule'], pairsWell: ['dm_rumsfeld'] }),
  g('doing_differently', 'gt_five_twenty_five_rule', 'The 5/25 Rule', [124, 127], 'list', W, { seeAlso: ['gt_circle_of_competence'], pairsWell: ['gt_circle_of_influence'] }),
  g('doing_differently', 'gt_circle_of_influence', 'The Circle of Influence', [128, 131], 'list', W, { pairsWell: ['fifteen_percent'] }),
  g('doing_differently', 'gt_disruptive_innovation', 'Disruptive Innovation', [132, 135], 'list', L, { pairsWell: ['gt_rapid_prototyping'] }),
  g('doing_differently', 'gt_kotter_change', 'Kotter’s 8-Step Model of Change', [136, 139], 'path', W, { pairsWell: ['gt_kanban'] }),
  g('reviewing', 'gt_project_evaluation', 'Project Evaluation', [146, 149], 'list', W, { pairsWell: ['after_action_review'], merged: ['gt_myth_of_achievement'] }),
  g('reviewing', 'gt_transactional_model', 'The Transactional Model', [154, 157], 'scales', W, { pairsWell: ['gt_routines'] }),
  g('reviewing', 'gt_journalling', 'Journalling', [158, 159], 'path', W, { seeAlso: ['gt_circle_of_influence'], pairsWell: ['gt_project_evaluation'] }),
  g('reviewing', 'gt_reversed_effort', 'The Law of Reversed Effort', [160, 164], 'path', L, { pairsWell: ['gt_circle_of_influence'] })
]);

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

/** The entry with this id, or null. */
export const entry = (id) => BY_ID.get(id) ?? null;

/** The entries of a section, in chapter order. */
export const entriesInSection = (key) => CATALOGUE.filter((e) => e.section === key);

