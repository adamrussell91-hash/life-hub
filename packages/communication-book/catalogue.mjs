// packages/communication-book/catalogue.mjs
// The Communication Book's models as data (Krogerus and Tschäppeler), for the Communication Book
// tool. Generated once from the private book pack, then kept by hand. No book text, quotation or
// page number lives here. `seeAlso` holds the book's own cross-references (an entry folded into
// another resolves to its parent) and `pairsWell` our own suggestions. `reuse` names the tool a
// variant is built on; `merged` lists the cut-down entries folded into a parent. Every id starts
// with `cm_` (the Collaboration Book owns `cb_`). Every model draws with a shared Decision Book
// family.

/**
 * The five source sections, in the book's order. `route` is the group id a session stores: the
 * book has five sections but a session places itself in one of three situations (route.mjs), so
 * two pairs of sections share a group.
 */
export const SECTIONS = Object.freeze([
  Object.freeze({ key: 'job_career', title: 'Job and Career', route: 'prepare' }),
  Object.freeze({ key: 'self_knowledge', title: 'Self and Knowledge', route: 'relate' }),
  Object.freeze({ key: 'love_friendship', title: 'Love and Friendship', route: 'relate' }),
  Object.freeze({ key: 'words_meanings', title: 'Words and Meanings', route: 'read' }),
  Object.freeze({ key: 'conclusion', title: 'Conclusion', route: 'read' })
]);

/** Chart families: the shared Decision Book families the models use. */
export const FAMILIES = Object.freeze(['path', 'list', 'quadrant']);

const m = (section, id, title, family, tier, { seeAlso = [], pairsWell = [], reuse = null, merged = [] } = {}) =>
  Object.freeze({ id, section, title, family, tier, seeAlso: Object.freeze(seeAlso), pairsWell: Object.freeze(pairsWell), reuse, merged: Object.freeze(merged) });

export const CATALOGUE = Object.freeze([
  m('job_career', 'cm_persuasion', 'Six Principles of Persuasion', 'list', 'lens', { pairsWell: ['cm_rhetoric', 'cm_framing'] }),
  m('job_career', 'cm_meetings', 'Rules of Meetings', 'list', 'worksheet', { pairsWell: ['cm_groupthink', 'cm_peak_end'] }),
  m('job_career', 'cm_boss_talk', 'Boss Talk', 'quadrant', 'worksheet', { pairsWell: ['cm_feedback', 'dm_hersey_blanchard'] }),
  m('job_career', 'cm_salami', 'The Salami Tactic', 'list', 'worksheet', { pairsWell: ['cm_social_judgement', 'cm_negotiation'] }),
  m('job_career', 'cm_rhetoric', 'Theory of Rhetoric', 'list', 'worksheet', { pairsWell: ['cm_persuasion', 'cm_six_words'] }),
  m('job_career', 'cm_storytelling', 'Storytelling', 'path', 'worksheet', { seeAlso: ['cm_rhetoric'], pairsWell: ['cm_six_words', 'cm_peak_end'] }),
  m('job_career', 'cm_negotiation', 'Principled Negotiation', 'list', 'worksheet', { pairsWell: ['dm_conflict', 'cm_salami'] }),
  m('job_career', 'cm_feedback', 'The Feedback Method', 'quadrant', 'worksheet', { pairsWell: ['dm_feedback_box', 'feedback_matrix', 'dm_appreciative'] }),
  m('job_career', 'cm_groupthink', 'Groupthink', 'list', 'lens', { seeAlso: ['cm_decoding'], pairsWell: ['dm_cognitive_bias', 'cm_standpoint'], merged: ['cm_silence', 'cm_cultivation'] }),
  m('job_career', 'cm_intercultural', 'Intercultural Communication', 'list', 'lens', { pairsWell: ['cm_expectancy', 'cm_listening'] }),
  m('self_knowledge', 'cm_self_talk', 'Self-Talk', 'list', 'lens', { pairsWell: ['dm_dissonance', 'cm_staircase'] }),
  m('self_knowledge', 'cm_listening', 'Active Listening', 'list', 'worksheet', { pairsWell: ['cm_four_layers', 'cm_proust'], merged: ['cm_small_talk'] }),
  m('self_knowledge', 'cm_iceberg', 'The Iceberg Model', 'list', 'lens', { seeAlso: ['cm_six_words', 'cm_four_layers', 'cm_lasswell'], pairsWell: ['dm_johari'] }),
  m('self_knowledge', 'cm_speech_act', 'The Speech Act Theory', 'list', 'lens', { pairsWell: ['cm_four_layers', 'cm_cooperative'] }),
  m('self_knowledge', 'cm_social_judgement', 'The Social Judgement Theory', 'list', 'lens', { seeAlso: ['cm_persuasion'], pairsWell: ['cm_salami'] }),
  m('self_knowledge', 'cm_apology', 'The Sorry Matrix', 'quadrant', 'worksheet', { pairsWell: ['cm_nonviolent', 'cm_peak_end'] }),
  m('self_knowledge', 'cm_six_words', 'The Six-Word Rule', 'list', 'worksheet', { pairsWell: ['cm_storytelling', 'cm_cooperative'] }),
  m('love_friendship', 'cm_proust', 'Proust’s Questionnaire', 'path', 'worksheet', { seeAlso: ['cm_listening'], pairsWell: ['cm_iceberg'] }),
  m('love_friendship', 'cm_nonviolent', 'Nonviolent Communication', 'path', 'worksheet', { pairsWell: ['cm_apology', 'dm_conflict'] }),
  m('love_friendship', 'cm_cooperative', 'The Cooperative Principle', 'list', 'worksheet', { pairsWell: ['cm_six_words', 'cm_speech_act'], merged: ['cm_white_lies'] }),
  m('love_friendship', 'cm_expectancy', 'The Expectancy Violations Theory', 'list', 'lens', { pairsWell: ['cm_intercultural'] }),
  m('love_friendship', 'cm_four_layers', 'Schulz von Thun’s Communication Model', 'list', 'worksheet', { pairsWell: ['cm_transactional', 'cm_decoding'], merged: ['cm_watzlawick'] }),
  m('love_friendship', 'cm_game_theory', 'Game Theory', 'list', 'worksheet', { pairsWell: ['dm_prisoners'] }),
  m('love_friendship', 'cm_second_order', 'Second-Order Observation', 'list', 'lens', { pairsWell: ['dm_johari', 'cm_standpoint'], reuse: 'perspective_shift' }),
  m('love_friendship', 'cm_transactional', 'Transactional Analysis', 'list', 'lens', { pairsWell: ['cm_four_layers', 'cm_nonviolent'] }),
  m('love_friendship', 'cm_staircase', 'L’Esprit de l’escalier', 'list', 'worksheet', { pairsWell: ['cm_self_talk', 'cm_six_words'] }),
  m('words_meanings', 'cm_framing', 'The Framing Effect', 'list', 'lens', { pairsWell: ['cm_persuasion', 'cm_decoding'], merged: ['cm_euphemisms'] }),
  m('words_meanings', 'cm_medium', 'McLuhan’s Media Theory', 'list', 'lens', { seeAlso: ['cm_uses'], pairsWell: ['cm_lasswell'] }),
  m('words_meanings', 'cm_lasswell', 'Lasswell’s Communication Model', 'path', 'worksheet', { pairsWell: ['cm_decoding', 'cm_sophism'] }),
  m('words_meanings', 'cm_uses', 'The Uses and Gratifications Theory', 'list', 'lens', { seeAlso: ['cm_medium'], pairsWell: ['cm_self_talk'], merged: ['cm_fomo'] }),
  m('words_meanings', 'cm_decoding', 'The Encoding/Decoding Model', 'list', 'lens', { pairsWell: ['cm_four_layers', 'cm_standpoint'] }),
  m('words_meanings', 'cm_sophism', 'Sophism', 'list', 'lens', { seeAlso: ['cm_rhetoric'], pairsWell: ['cm_lasswell', 'dm_cognitive_bias'] }),
  m('words_meanings', 'cm_standpoint', 'The Standpoint Theory', 'list', 'lens', { pairsWell: ['perspective_shift', 'cm_groupthink'] }),
  m('conclusion', 'cm_peak_end', 'The Peak-End Rule', 'list', 'lens', { pairsWell: ['cm_apology', 'cm_meetings'] })
]);

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

/** The entry with this id, or null. */
export const entry = (id) => BY_ID.get(id) ?? null;

/** The entries of a section, in the book's order. */
export const entriesInSection = (key) => CATALOGUE.filter((e) => e.section === key);
