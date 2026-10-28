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
const t = (series, name, page, seeAlso = []) => {
  const id = `w1-${slug(name)}`;
  return Object.freeze({ id, set: 1, kind: 'technique', series, code: seriesByKey(series).code, page, name, glyph: id, see_also: Object.freeze(seeAlso) });
};

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
  t('MB', 'Independent learning: pre reading', 148)
];

const f = (key, name) => {
  const id = `w1-fw-${key}`;
  return Object.freeze({ id, set: 1, kind: 'framework', series: null, code: 'FW', page: null, name, glyph: id, see_also: Object.freeze([]) });
};

const FRAMEWORKS = [
  f('rosenshine', 'Rosenshine’s principles'),
  f('willingham', 'Willingham’s principles'),
  f('marge', 'MARGE'),
  f('wiliam', 'Wiliam’s five strategies'),
  f('berger', 'Berger’s principles')
];

export const CATALOGUE = Object.freeze([...TECHNIQUES, ...FRAMEWORKS]);
export const CATALOGUE_IDS = Object.freeze(CATALOGUE.map((e) => e.id));
export const techniqueById = (id) => CATALOGUE.find((e) => e.id === id) ?? null;
export const isTechniqueId = (id) => typeof id === 'string' && CATALOGUE.some((e) => e.id === id && e.kind === 'technique');
export const techniquesOf = (setId) => CATALOGUE.filter((e) => e.set === setId && e.kind === 'technique');
export const frameworksOf = (setId) => CATALOGUE.filter((e) => e.set === setId && e.kind === 'framework');
