// netlify/functions/_shared/thinking-threads/briefs.mjs
// Brief -> frame (spec section 4): what goes out to a detour, drafted as plain strings from the
// situation, the question and the digest. No AI; the person edits the draft in the tool.
//
// A brief: { threadId, situation, digest, from: { sessionId, stepId, stepTitle, workSoFar }, question }
import { BOOK_KINDS } from '../../../../packages/problem-solver/books.mjs';
import { CHAPTERS } from '../../../../packages/question-book/catalogue.mjs';
import { getOption, shortlist, signalsFromText } from '../../../../packages/thinking-map/index.mjs';
import { catalog as PROTOCOL_CATALOG } from '../../../../config/knowledge/cognitive/definitions.mjs';

/** The engine session kind each tool's detour starts as (its full kind, never a quick flow). */
export const TOOL_KIND = Object.freeze({
  'problem-solver': 'full',
  'decision-book': 'decision',
  'get-things-done': 'shift',
  'rules-book': 'rules',
  'change-book': 'change',
  'collaboration-book': 'collab',
  'communication-book': 'talk'
});

/** The tool a session kind belongs to (flows included). */
export const KIND_TOOL = Object.freeze({
  full: 'problem-solver', lightning: 'problem-solver',
  decision: 'decision-book', quick: 'decision-book',
  shift: 'get-things-done', start: 'get-things-done',
  rules: 'rules-book', change: 'change-book', collab: 'collaboration-book', talk: 'communication-book'
});

export const ENGINE_TOOLS = Object.freeze(Object.keys(TOOL_KIND));

/** The protocol mode a detour runs in unless the person picks another. */
export const DETOUR_MODES = Object.freeze({
  fates: 'sprint', horizon: 'brief', refinery: 'build-break', cartographers: 'focused',
  mirror: 'quick', consilium: 'standard', witness: 'standard', tribunal: 'quick'
});

const FRAME_KEYS = Object.freeze({
  full: ['goal', 'whatIsTrue', 'whatCanBeDone'],
  ...Object.fromEntries(Object.entries(BOOK_KINDS).map(([kind, book]) => [kind, [...book.frameKeys]]))
});

/** Frame keys that hold a placement of known ids (compass, route, group): left for the coach to place. */
const PLACE_KEYS = Object.freeze(new Set(Object.values(BOOK_KINDS).map((book) => book.placeKey)));

const clean = (value, max = 600) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value.map((item) => clean(item, 300)).filter(Boolean) : []);
const sentence = (items) => items.join('; ');

function parts(brief) {
  const digest = brief?.digest ?? {};
  return {
    situation: clean(brief?.situation, 2000),
    question: clean(brief?.question, 400),
    facts: list(digest.facts),
    choices: list(digest.choices),
    restsOn: list(digest.restsOn),
    openQuestions: list(digest.openQuestions),
    stepTitle: clean(brief?.from?.stepTitle, 120),
    workSoFar: clean(brief?.from?.workSoFar, 1200)
  };
}

/** What each frame key is drafted from. Keys with nothing to draft stay empty. */
function draftKey(key, p) {
  const known = sentence([...p.facts, ...p.restsOn, ...(p.workSoFar ? [p.workSoFar] : [])]);
  const main = p.question || p.situation;
  switch (key) {
    case 'goal': return p.question ? `Answer: ${p.question}` : p.situation;
    case 'decision': return main;
    case 'need': return main;
    case 'change': return main;
    case 'situation': return p.situation;
    case 'whatIsTrue':
    case 'known': return known;
    case 'whatCanBeDone': return sentence(p.choices);
    case 'stay': return sentence(p.restsOn);
    case 'outcome': return p.question ? `A clear answer to: ${p.question}` : '';
    default: return '';
  }
}

/**
 * A detour's opening for an engine tool: the session kind, a title, the opening text the coach
 * reads first, and the drafted frame (`frame`, key -> string, for the person to confirm or
 * change). Placement keys (compass, route, group) are left empty: they take known ids only.
 */
export function frameFromBrief(tool, brief) {
  const kind = TOOL_KIND[tool];
  if (!kind) throw Object.assign(new Error(`No frame for ${tool}.`), { status: 400, code: 'validation_error' });
  const p = parts(brief);
  const keys = FRAME_KEYS[kind];
  const frame = Object.fromEntries(keys.map((key) => [key, PLACE_KEYS.has(key) ? '' : clean(draftKey(key, p), 600)]));
  const lines = [
    p.situation,
    p.question ? `The question for this detour: ${p.question}` : null,
    p.stepTitle ? `It comes from the step "${p.stepTitle}".` : null,
    ...keys.filter((key) => frame[key]).map((key) => `Draft ${key}: ${frame[key]}`)
  ].filter(Boolean);
  return {
    tool,
    kind,
    title: clean(p.question || p.situation, 120),
    text: lines.join('\n').slice(0, 12000) || 'A detour from another tool.',
    frame
  };
}

const words = (text) => new Set(String(text ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? []);

/**
 * Thought Starter's chapter and 2 to 4 question ids. The chapter is the option's own when it is a
 * chapter, else the best chapter for the brief's signals. `questions` is the chapter's question
 * list read at run time from the private file ({ id, prompt }); the ones sharing most words with
 * the brief come first, in chapter order on a tie. Question text never leaves this function.
 */
export function questionsFromBrief(brief, optionId, questions = []) {
  const option = optionId ? getOption(optionId) : null;
  let chapterId = option?.kind === 'chapter' ? option.id : null;
  if (!chapterId) {
    const p = parts(brief);
    const signals = signalsFromText(`${p.question} ${p.situation}`);
    chapterId = shortlist({ signals, limit: 40 }).find((o) => o.kind === 'chapter')?.id ?? 'qb_making_decisions';
  }
  const asked = words(`${brief?.question ?? ''} ${brief?.situation ?? ''}`);
  const ranked = (Array.isArray(questions) ? questions : [])
    .filter((q) => q && typeof q.id === 'string')
    .map((q, order) => ({ id: q.id, order, score: [...words(q.prompt)].filter((w) => asked.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 3)
    .sort((a, b) => a.order - b.order);
  return { chapterId, questionIds: ranked.map((q) => q.id) };
}

/** The chapter ids Thought Starter can answer in a detour. */
export const QUESTION_CHAPTER_IDS = Object.freeze(CHAPTERS.filter((c) => c.kind === 'questions').map((c) => c.id));

/** The thread digest as plain text, for a protocol's `userContext`. */
export function digestText(digest) {
  const d = digest ?? {};
  const block = (label, items) => (list(items).length ? `${label}: ${sentence(list(items))}.` : null);
  return [block('Facts', d.facts), block('Choices', d.choices), block('Rests on', d.restsOn), block('Open questions', d.openQuestions)].filter(Boolean).join('\n');
}

/**
 * A protocol's intake drafted from the brief, using its field ids (config/knowledge/cognitive/
 * definitions.mjs). Required fields are never left empty. The digest goes in as `userContext`.
 */
export function intakeFromBrief(protocolId, brief) {
  const def = PROTOCOL_CATALOG.find((p) => p.id === protocolId);
  if (!def) throw Object.assign(new Error(`Unknown protocol: ${protocolId}`), { status: 400, code: 'validation_error' });
  const p = parts(brief);
  const main = p.question || p.situation;
  const known = sentence([...p.facts, ...p.restsOn]);
  const open = sentence(p.openQuestions);
  const drafts = {
    fates: { task: main, constraints: sentence(p.restsOn), success: p.question ? `A usable answer to: ${p.question}` : '', priorAttempts: p.workSoFar },
    horizon: { focus: main, trajectory: known, desiredFuture: sentence(p.choices), tensions: open },
    refinery: { claim: p.choices[0] || main, context: p.situation || main, audience: 'Myself, to decide with', inputType: 'raw', weaknesses: open },
    cartographers: { topic: main, purpose: p.stepTitle ? `To answer the question for the step "${p.stepTitle}"` : `To answer: ${main}` },
    mirror: { conflict: main, behaviour: known, priorWork: p.workSoFar },
    consilium: { dilemma: main, parties: 'The people this choice touches (to fill in)', constraints: sentence(p.restsOn) || 'None named yet', priorReasoning: p.workSoFar, tensions: open },
    witness: { instance: p.situation || main, outcome: sentence(p.choices), process: p.workSoFar, concerns: open },
    tribunal: { problem: main, entrenchment: open || 'It has come back more than once', framing: p.situation || main, priorAttempts: p.workSoFar }
  }[protocolId] ?? {};
  const intake = {};
  for (const field of def.intake) {
    const value = field.id === 'userContext' ? digestText(brief?.digest) : clean(drafts[field.id] ?? '', 4000);
    if (value) intake[field.id] = value;
    else if (field.required) intake[field.id] = main || 'To fill in';
  }
  return intake;
}
