// packages/decision-book/catalogue.mjs
// The Decision Book's models as data (Krogerus and Tschäppeler). `pages` are the first and
// last printed pages; `kit` is the model's folder in the graphic kit; `seeAlso` holds only the
// book's own cross-references. A model reused from Problem Solver keeps that tool's id;
// every other id starts with `dm_`. No book text lives here.

export const SECTIONS = Object.freeze([
  Object.freeze({ id: 1, key: 'improve_yourself', title: 'How to improve yourself', compass: 'self_improve' }),
  Object.freeze({ id: 2, key: 'understand_yourself', title: 'How to understand yourself better', compass: 'self_understand' }),
  Object.freeze({ id: 3, key: 'understand_others', title: 'How to understand others better', compass: 'others_understand' }),
  Object.freeze({ id: 4, key: 'improve_others', title: 'How to improve others', compass: 'others_improve' })
]);

/** Shared chart families (`oneoff` is drawn bespoke; `table` is a reused Problem Solver chart). */
export const FAMILIES = Object.freeze(['quadrant', 'plot', 'scales', 'curve', 'tension', 'path', 'list', 'table', 'oneoff']);

const W = 'worksheet';
const L = 'lens';
const m = (section, id, title, pages, family, tier, kit, seeAlso = [], reuse = false) =>
  Object.freeze({ id, section, title, pages: Object.freeze(pages), family, tier, kit, seeAlso: Object.freeze(seeAlso), reuse });

export const CATALOGUE = Object.freeze([
  m(1, 'dm_eisenhower', 'The Eisenhower matrix', [10, 11], 'quadrant', W, '01-eisenhower-matrix'),
  m(1, 'swot', 'The SWOT analysis', [12, 13], 'quadrant', W, '02-swot-analysis', [], true),
  m(1, 'dm_bcg_box', 'The BCG box', [14, 15], 'quadrant', W, '03-bcg-box'),
  m(1, 'dm_project_portfolio', 'The project portfolio matrix', [16, 19], 'plot', W, '04-project-portfolio-matrix'),
  m(1, 'dm_feedback_analysis', 'The feedback analysis', [20, 21], 'tension', W, '05-feedback-analysis'),
  m(1, 'dm_whitmore', 'The John Whitmore model', [22, 23], 'list', W, '06-john-whitmore-model', ['dm_flow']),
  m(1, 'dm_rubber_band', 'The rubber band model', [24, 25], 'tension', W, '07-rubber-band-model', ['swot']),
  m(1, 'dm_feedback_box', 'The feedback box', [26, 27], 'quadrant', W, '08-feedback-box'),
  m(1, 'dm_yes_no', 'The Yes/No rule', [28, 29], 'path', W, '09-yes-no-rule'),
  m(1, 'dm_choice_overload', 'The choice overload', [30, 31], 'curve', L, '10-choice-overload'),
  m(1, 'dm_gap_in_market', 'The gap-in-the-market model', [32, 33], 'plot', W, '11-gap-in-the-market-model'),
  m(1, 'morphological', 'The morphological box and SCAMPER', [34, 37], 'table', W, '12-morphological-box-and-scamper', ['dm_outside_box'], true),
  m(1, 'dm_gift', 'The gift model', [38, 39], 'plot', W, '13-gift-model'),
  m(1, 'dm_outside_box', 'Thinking outside the box', [40, 41], 'oneoff', L, '14-thinking-outside-the-box', ['morphological']),
  m(1, 'dm_consequences', 'The consequences model', [42, 43], 'curve', L, '15-consequences-model', ['dm_stop_rule']),
  m(1, 'dm_unconscious', 'The theory of unconscious thinking', [44, 45], 'path', W, '16-theory-of-unconscious-thinking'),
  m(1, 'dm_stop_rule', 'The Stop Rule', [46, 47], 'path', W, '17-stop-rule'),
  m(1, 'dm_buyers_decision', 'The buyer’s decision model', [48, 49], 'path', W, '18-buyers-decision-model'),
  m(2, 'dm_flow', 'The flow model', [52, 53], 'plot', W, '01-flow-model'),
  m(2, 'dm_johari', 'The Johari window', [54, 55], 'quadrant', W, '02-johari-window'),
  m(2, 'dm_dissonance', 'The cognitive dissonance model', [56, 57], 'tension', W, '03-cognitive-dissonance'),
  m(2, 'dm_unimaginable', 'The unimaginable model', [58, 59], 'quadrant', W, '04-unimaginable-model', ['dm_black_box', 'dm_future']),
  m(2, 'dm_elbaek', 'The Uffe Elbæk model', [60, 61], 'scales', W, '05-uffe-elbaek-model'),
  m(2, 'dm_energy', 'The energy model', [62, 63], 'scales', W, '06-energy-model', ['dm_crossroads']),
  m(2, 'dm_political_compass', 'The political compass', [64, 65], 'plot', W, '07-political-compass'),
  m(2, 'dm_performance', 'The personal performance model', [66, 67], 'scales', W, '08-personal-performance', ['dm_rubber_band', 'dm_flow']),
  m(2, 'dm_making_of', 'The making-of model', [68, 71], 'list', W, '09-making-of-model'),
  m(2, 'dm_potential_trap', 'The personal potential trap', [72, 73], 'curve', W, '10-personal-potential-trap'),
  m(2, 'dm_hard_choice', 'The hard choice model', [74, 75], 'quadrant', W, '11-hard-choice-model'),
  m(2, 'dm_cognitive_bias', 'Cognitive bias', [76, 77], 'list', W, '12-cognitive-bias'),
  m(2, 'dm_crossroads', 'The crossroads model', [78, 81], 'list', W, '13-crossroads-model'),
  m(3, 'dm_rumsfeld', 'The Rumsfeld matrix', [84, 87], 'quadrant', W, '01-rumsfeld-matrix', ['dm_black_swan']),
  m(3, 'dm_swiss_cheese', 'The Swiss cheese model', [88, 91], 'path', W, '02-swiss-cheese-model', ['dm_result_optimisation']),
  m(3, 'dm_maslow', 'The Maslow pyramids', [92, 93], 'list', W, '03-maslow-pyramids'),
  m(3, 'dm_sinus_bourdieu', 'The Sinus Milieu and Bourdieu models', [94, 97], 'plot', L, '04-sinus-milieu-and-bourdieu'),
  m(3, 'double_loop', 'The double-loop learning model', [98, 101], 'path', W, '05-double-loop-learning', ['dm_black_box'], true),
  m(3, 'dm_appreciative', 'The AI (appreciative inquiry) model', [102, 103], 'quadrant', W, '06-ai-appreciative-inquiry'),
  m(3, 'pareto', 'The Pareto principle', [104, 105], 'table', W, '07-pareto-principle', ['dm_long_tail'], true),
  m(3, 'dm_long_tail', 'The long-tail model', [106, 107], 'curve', L, '08-long-tail-model', ['pareto']),
  m(3, 'dm_conflict', 'The conflict resolution model', [108, 111], 'list', W, '09-conflict-resolution'),
  m(3, 'dm_black_swan', 'The black swan model', [112, 113], 'curve', W, '10-black-swan-model', ['dm_rumsfeld', 'dm_black_box']),
  m(3, 'dm_chasm', 'The chasm: the diffusion model', [114, 117], 'curve', W, '11-chasm-diffusion-model', ['pareto', 'dm_long_tail']),
  m(3, 'dm_black_box', 'The black box model', [118, 119], 'oneoff', L, '12-black-box-model', ['dm_black_swan']),
  m(3, 'dm_prisoners', 'The prisoner’s dilemma', [120, 123], 'quadrant', W, '13-prisoners-dilemma'),
  m(4, 'dm_team', 'The team model', [126, 127], 'scales', W, '01-team-model'),
  m(4, 'dm_hersey_blanchard', 'The Hersey–Blanchard model', [128, 131], 'quadrant', W, '02-hersey-blanchard'),
  m(4, 'dm_role_playing', 'The role-playing model (Belbin and de Bono)', [132, 135], 'list', W, '03-role-playing-belbin-de-bono', ['dm_drexler_sibbet']),
  m(4, 'dm_result_optimisation', 'The result optimisation model', [136, 137], 'path', W, '04-result-optimisation'),
  m(4, 'dm_pm_triangle', 'The project management triangle', [138, 139], 'tension', W, '05-project-management-triangle'),
  m(4, 'dm_drexler_sibbet', 'The Drexler/Sibbet team performance model', [140, 143], 'path', W, '06-drexler-sibbet', ['dm_role_playing']),
  m(4, 'dm_expectations', 'The expectations model', [144, 145], 'curve', W, '07-expectations-model'),
  m(4, 'dm_future', 'How will we decide in the future?', [146, 149], 'curve', L, '08-closing-essay-future-decisions')
]);

export const CATALOGUE_IDS = Object.freeze(CATALOGUE.map((entry) => entry.id));

/** Problem Solver tool ids Decision Maker uses as they are. */
export const REUSED_TOOL_IDS = Object.freeze(CATALOGUE.filter((entry) => entry.reuse).map((entry) => entry.id));

/** @param {string} id */
export function catalogueEntry(id) {
  return CATALOGUE.find((entry) => entry.id === id) ?? null;
}

/** @param {number} section 1 to 4 */
export function modelsInSection(section) {
  return CATALOGUE.filter((entry) => entry.section === section);
}
