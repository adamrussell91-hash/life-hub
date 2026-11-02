// packages/walkthrus/catalogue.mjs
// Teaching WalkThrus as data: ids, set, series, printed page and technique name only, plus the
// book's own cross-references (ids). Step text, summaries and figures never live in this
// repository; they are served from the private data repo (see netlify/functions/walkthrus-text).
// Series codes and page numbers are per set, so `Q&F | 96` stays unambiguous once more sets arrive.

export const SERIES = Object.freeze([
  Object.freeze({ key: 'QF', code: 'Q&F', name: 'Questioning and feedback' }),
  Object.freeze({ key: 'PR', code: 'P&R', name: 'Practice and retrieval' }),
  Object.freeze({ key: 'EM', code: 'E&M', name: 'Explaining and modelling' }),
  Object.freeze({ key: 'CP', code: 'CP', name: 'Curriculum planning' }),
  Object.freeze({ key: 'BR', code: 'B&R', name: 'Behaviour and relationships' }),
  Object.freeze({ key: 'MB', code: 'MB', name: 'Mode B teaching' })
]);

export const seriesByKey = (key) => SERIES.find((s) => s.key === key) ?? null;

const slug = (name) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const technique = (set, series, name, page, seeAlso) => {
  const id = `w${set}-${slug(name)}`;
  return Object.freeze({ id, set, kind: 'technique', series, code: seriesByKey(series).code, page, name, glyph: id, see_also: Object.freeze(seeAlso) });
};

const t = (series, name, page, seeAlso = []) => technique(1, series, name, page, seeAlso);
const t2 = (series, name, page, seeAlso = []) => technique(2, series, name, page, seeAlso);

const TECHNIQUES = [
  t('QF', 'Check for understanding', 96),
  t('QF', 'Cold calling', 90),
  t('QF', 'Show-me boards', 94),
  t('QF', 'Think, pair, share', 92),
  t('QF', 'Say it again better', 98),
  t('QF', 'Probing questions', 100),
  t('QF', 'Process questions', 102),
  t('QF', 'Whole class feedback', 108),
  t('QF', 'Feedback that moves forward', 104),
  t('QF', 'Feedback as actions', 106),
  t('PR', 'Quizzing', 112),
  t('PR', 'Weekly and monthly review', 122),
  t('PR', 'Elaborative interrogation', 114),
  t('PR', 'Using a knowledge organiser', 116),
  t('PR', 'Rehearsal and performance', 118),
  t('PR', 'Peer supported retrieval', 120),
  t('PR', 'Concrete examples', 124),
  t('PR', 'Guided practice', 126),
  t('PR', 'Independent practice', 128),
  t('PR', 'Building fluency', 130),
  t('EM', 'Live modelling', 78),
  t('EM', 'Worked examples and backward fading', 68),
  t('EM', 'Dual coding', 70),
  t('EM', 'Deliberate vocabulary development', 72),
  t('EM', 'Big picture, small picture', 74),
  t('EM', 'Abstract models with concrete examples', 76),
  t('EM', 'Scaffolding', 80),
  t('EM', 'Metacognitive talk', 82),
  t('EM', 'Set the standards', 84),
  t('EM', 'Head on misconceptions', 86),
  t('CP', 'Sequence concepts in small steps', 52),
  t('CP', 'Designing a knowledge rich curriculum', 50),
  t('CP', 'Coherent mapping', 54),
  t('CP', 'Blend knowledge and experience', 56),
  t('CP', 'Pitch it up', 58),
  t('CP', 'Plan for reading', 60),
  t('CP', 'Tiered questions and problems', 62),
  t('CP', 'Deliver core; signpost hinterland', 64),
  t('BR', 'Rehearse routines', 44),
  t('BR', 'Positive relationships', 36),
  t('BR', 'Establish your expectations', 38),
  t('BR', 'Signal, pause, insist', 40),
  t('BR', 'Positive framing', 42),
  t('BR', 'Choices and consequences', 46),
  t('MB', 'Collaborative learning', 134),
  t('MB', 'Oracy: debating', 142),
  t('MB', 'Homework as guided study', 136),
  t('MB', 'Enquiry projects', 138),
  t('MB', 'Open response tasks', 140),
  t('MB', 'Oracy: talk for writing', 144),
  t('MB', 'Oracy: instructional inputs', 146),
  t('MB', 'Independent learning: pre reading', 148),

  // Teaching WalkThrus 2. The How chapters stay out, as they do for the first book.
  t2('BR', 'Assertiveness', 36, ['w1-positive-framing']),
  t2('BR', 'Getting lessons started', 38, ['w1-establish-your-expectations', 'w1-rehearse-routines', 'w1-signal-pause-insist', 'w1-check-for-understanding']),
  t2('BR', 'Gather around: demonstrations & stories', 40, ['w1-cold-calling', 'w1-check-for-understanding']),
  t2('BR', 'Keeping on task', 42, ['w1-check-for-understanding', 'w1-guided-practice']),
  t2('BR', 'Silence is golden', 44, ['w1-cold-calling', 'w1-think-pair-share']),
  t2('BR', 'Transitions between activities', 46, []),
  t2('BR', 'Lesson disruption', 48, ['w1-establish-your-expectations', 'w1-positive-framing', 'w1-choices-and-consequences']),
  t2('BR', 'Perspective: the dot in the empty square', 50, ['w1-positive-framing', 'w1-choices-and-consequences']),
  t2('CP', 'Trivium in practice', 54, ['w1-coherent-mapping', 'w1-deliver-core-signpost-hinterland']),
  t2('CP', 'Mode A: Mode B', 56, ['w1-enquiry-projects', 'w1-independent-learning-pre-reading', 'w2-museum-gallery-visits', 'w1-open-response-tasks', 'w1-oracy-debating', 'w1-oracy-instructional-inputs', 'w1-collaborative-learning', 'w2-oracy-public-speaking', 'w2-oracy-recitation-and-performance', 'w2-self-directed-learning']),
  t2('CP', 'Diversity: ways into curriculum building', 58, []),
  t2('CP', 'Authentic connections', 60, ['w1-designing-a-knowledge-rich-curriculum', 'w1-sequence-concepts-in-small-steps', 'w1-coherent-mapping', 'w1-blend-knowledge-and-experience']),
  t2('CP', 'Themes & topics', 62, ['w2-authentic-connections', 'w1-blend-knowledge-and-experience']),
  t2('CP', 'Learning objectives vs tasks', 64, ['w1-check-for-understanding', 'w2-make-everyone-think']),
  t2('CP', 'Responsive lesson planning', 66, ['w1-designing-a-knowledge-rich-curriculum', 'w1-coherent-mapping', 'w1-blend-knowledge-and-experience', 'w2-learning-objectives-vs-tasks']),
  t2('CP', 'Teach to the top', 68, ['w1-pitch-it-up']),
  t2('CP', 'SEND: aim high, plan support', 70, []),
  t2('CP', 'Textbooks & workbooks', 72, []),
  t2('EM', 'Pre-reading instructions for complex texts', 76, ['w1-probing-questions', 'w1-cold-calling', 'w1-check-for-understanding']),
  t2('EM', 'Whole-class reading routines', 78, []),
  t2('EM', 'Developing reading fluency', 80, []),
  t2('EM', 'Summarising academic reading', 82, []),
  t2('EM', 'Giving practical demonstrations', 84, ['w2-gather-around-demonstrations-and-stories', 'w1-deliberate-vocabulary-development', 'w1-cold-calling']),
  t2('EM', 'Dual coding: diagrams', 86, []),
  t2('EM', 'Analogies', 88, ['w1-check-for-understanding']),
  t2('EM', 'SEND: addressing cognitive difficulties', 90, ['w2-send-aim-high-plan-support', 'w1-guided-practice']),
  t2('EM', 'Compare, contrast & categorise', 92, ['w1-big-picture-small-picture', 'w1-weekly-and-monthly-review']),
  t2('EM', 'Exemplars', 94, ['w2-compare-contrast-and-categorise', 'w2-success-criteria', 'w1-check-for-understanding', 'w1-guided-practice', 'w1-independent-practice']),
  t2('QF', 'No opt out', 98, ['w1-cold-calling']),
  t2('QF', 'Hands up for asking or ideas', 100, ['w1-cold-calling', 'w1-probing-questions', 'w1-check-for-understanding']),
  t2('QF', 'Randomised questioning', 102, ['w1-cold-calling']),
  t2('QF', 'Normalise error & uncertainty', 104, ['w1-probing-questions', 'w2-no-opt-out', 'w1-say-it-again-better']),
  t2('QF', 'Redrafting', 106, ['w2-exemplars']),
  t2('QF', 'Selective marking', 108, ['w1-set-the-standards', 'w2-success-criteria', 'w2-spot-your-mistakes']),
  t2('QF', 'Spot your mistakes', 110, ['w1-guided-practice']),
  t2('QF', 'Success criteria', 112, ['w1-check-for-understanding', 'w1-rehearsal-and-performance', 'w1-whole-class-feedback', 'w1-feedback-as-actions', 'w1-scaffolding']),
  t2('PR', 'Make everyone think', 116, ['w1-cold-calling', 'w1-check-for-understanding']),
  t2('PR', 'Multiple-choice questions', 118, ['w1-show-me-boards']),
  t2('PR', 'Flash cards', 120, ['w1-using-a-knowledge-organiser', 'w1-elaborative-interrogation', 'w1-peer-supported-retrieval']),
  t2('PR', 'Dual coding: mapping', 122, ['w1-big-picture-small-picture', 'w2-exemplars', 'w1-live-modelling', 'w1-using-a-knowledge-organiser', 'w2-flash-cards', 'w2-practise-explaining', 'w1-check-for-understanding']),
  t2('PR', 'Practise explaining', 124, ['w1-think-pair-share', 'w1-cold-calling']),
  t2('PR', 'Thresholds & pathways', 126, ['w2-teach-to-the-top']),
  t2('PR', 'A ladder of difficulty', 128, []),
  t2('PR', 'The FACE it revision model', 130, ['w2-flash-cards', 'w1-using-a-knowledge-organiser']),
  t2('MB', 'Hands on', 134, ['w1-blend-knowledge-and-experience', 'w2-museum-gallery-visits', 'w1-think-pair-share', 'w1-cold-calling', 'w1-check-for-understanding', 'w1-open-response-tasks']),
  t2('MB', 'Oracy: public speaking', 136, ['w1-rehearsal-and-performance']),
  t2('MB', 'Oracy: presentations', 138, ['w1-oracy-instructional-inputs', 'w1-dual-coding', 'w1-check-for-understanding']),
  t2('MB', 'Oracy: recitation & performance', 140, ['w2-oracy-public-speaking', 'w1-rehearsal-and-performance']),
  t2('MB', 'Off-piste', 142, ['w2-fw-trivium']),
  t2('MB', 'Self-directed learning', 144, ['w1-independent-practice']),
  t2('MB', 'Museum/gallery visits', 146, []),
  t2('MB', 'Online class forums', 148, [])
];

const framework = (set, key, name, page, seeAlso) => {
  const id = `w${set}-fw-${key}`;
  return Object.freeze({ id, set, kind: 'framework', series: null, code: 'FW', page, name, glyph: id, see_also: Object.freeze(seeAlso) });
};
const f = (key, name) => framework(1, key, name, null, []);
const f2 = (key, name, page, seeAlso = []) => framework(2, key, name, page, seeAlso);

const FRAMEWORKS = [
  f('rosenshine', 'Rosenshine’s principles'),
  f('willingham', 'Willingham’s principles'),
  f('marge', 'MARGE'),
  f('wiliam', 'Wiliam’s five strategies'),
  f('berger', 'Berger’s principles'),

  f2('learning', 'A model for learning', 12, []),
  f2('whole-class', 'Whole-class teaching', 15, ['w2-fw-nuthall']),
  f2('cpd', 'Successful CPD', 16, []),
  f2('practice-perfect', 'Practice perfect', 18, []),
  f2('nuthall', 'Hidden lives of learners', 20, []),
  f2('learning-scientists', 'The Learning Scientists’ six', 22, ['w1-dual-coding', 'w1-elaborative-interrogation', 'w1-peer-supported-retrieval', 'w1-abstract-models-with-concrete-examples']),
  f2('sweller', 'The ABCDE of cognitive load theory', 24, []),
  f2('fiorella-mayer', 'Learning as a generative activity', 26, []),
  f2('apprenticeship', 'Cognitive apprenticeship', 28, []),
  f2('trivium', 'Trivium 21c', 30, ['w2-trivium-in-practice'])
];

export const CATALOGUE = Object.freeze([...TECHNIQUES, ...FRAMEWORKS]);
export const CATALOGUE_IDS = Object.freeze(CATALOGUE.map((e) => e.id));
export const techniqueById = (id) => CATALOGUE.find((e) => e.id === id) ?? null;
export const isTechniqueId = (id) => typeof id === 'string' && CATALOGUE.some((e) => e.id === id && e.kind === 'technique');
export const techniquesOf = (setId) => CATALOGUE.filter((e) => e.set === setId && e.kind === 'technique');
export const frameworksOf = (setId) => CATALOGUE.filter((e) => e.set === setId && e.kind === 'framework');
/** The techniques whose own see_also names this one: the book's links, read backwards. */
export const pointedToBy = (id) => TECHNIQUES.filter((e) => e.see_also.includes(id)).map((e) => e.id);
/** How a page reference reads away from the board: page numbers repeat between books, so later books say which. */
export const pageRefOf = (e) => `${e.set > 1 ? `Book ${e.set} · ` : ''}${e.code} | ${e.page}`;
