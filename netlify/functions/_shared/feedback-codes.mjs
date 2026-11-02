/**
 * Feedback codes: the teacher's marking shorthand (TS, E, AR, FW …), one
 * library shared by Voice block marking and annotation notes.
 *
 *   feedback_codes/library   { codes: [FeedbackCode], updated_at }
 *
 * A code belongs to a group (composition, viva, speaking) and, for the first
 * two, a rubric criterion, so feedback can be summed up criterion by criterion.
 * Speaking codes carry a number key for one-tap marking while listening.
 *
 * The seed below is deliberately short. The full department wording lives in
 * the saved library (Blobs), never in this public repo.
 */
import { isProblemType } from '../../../packages/walkthrus/problem-types.mjs';
import { LADDER_MAX, RUNG_ORDER, SKILL_REF } from './next-steps.mjs';

export const CODES_KEY = 'feedback_codes/library';
export const CODE_COLOURS = ['blue', 'sage', 'peach', 'gold', 'lilac'];
export const CODE_GROUPS = ['composition', 'viva', 'speaking'];
export const CODE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const MAX_FEEDBACK_CODES = 60;
const MAX_LABEL = 60;
const MAX_DESCRIPTOR = 600;

const c = (id, code, label, group, criterion, colour, descriptor, extra = {}) => ({
  id,
  code,
  label,
  group,
  criterion,
  colour,
  descriptor,
  ...extra
});

/**
 * Placeholder ladders: one step per placement rung (below → excellent), the
 * step toward the rung above. Generic stand-ins; a ladder saved on a code wins.
 */
const LADDERS = {
  comp_ts: { skill: 'arguing.thesis', ladder: [
    'Open with one sentence that answers the question in your own words.',
    'Name the idea your whole answer will argue in the first sentence.',
    'Make your opening claim one a reader could argue with.',
    'Shape your opening claim so it sets up the steps of your argument.',
    'Open with a claim that weighs the question and adds a fresh angle.'
  ] },
  comp_ar: { skill: 'arguing.thesis', ladder: [
    'Use a key word from the question in each point you make.',
    'Link each point back to the question in its last sentence.',
    'Show how each point moves your answer to the question forward.',
    'Choose the points that answer this question most sharply.',
    'Weigh which points matter most to the question and say why.'
  ] },
  comp_ad: { skill: 'reading.inference', ladder: [
    'Add one sentence that explains what your quote shows.',
    'Explain what a key word in your quote suggests.',
    'Unpack two layers of meaning in your evidence.',
    'Connect the detail you unpack to the bigger idea of the text.',
    'Weigh two readings of the detail and argue for the stronger one.'
  ] },
  comp_e: { skill: 'arguing.evidence', ladder: [
    'Add a short quote from the text that backs up your point.',
    'Choose a quote of a few words that fits your point exactly.',
    'Blend a short quote into your own sentence.',
    'Use evidence from different parts of the text for one idea.',
    'Pick the evidence that best proves your claim and say why it is strongest.'
  ] },
  viva_pp: { ladder: [
    'Say the key words of the question in your first sentence.',
    'Open by answering the question in your own words.',
    'Link each point back to the words of the question as you go.',
    'Bend your best material so it answers this exact question.',
    'Weigh the question aloud, then argue the answer you reach.'
  ] },
  viva_x: { ladder: [
    'Check one quote and one detail against the text before you speak.',
    'Name the poem and the exact detail for each point you make.',
    'Back each point with a short quote you can say from memory.',
    'Name the technique in your quote and the effect it creates.',
    'Choose the detail that proves your point most sharply and say why.'
  ] },
  viva_np: { ladder: [
    'Practise your first sentence aloud until it comes easily.',
    'Plan what you will say after each dot point before you record.',
    'Give yourself a next move for each point: quote, technique, effect.',
    'Follow your own idea one step further each time you make a point.',
    'Raise and answer the follow-up question yourself.'
  ] },
  speak_fw: { ladder: [
    'Take one silent breath at the start of each new point.',
    'Pause silently where you would reach for a filler word.',
    'Finish each sentence, pause, then start the next idea.',
    'Use your pauses to choose the exact word you want next.',
    'Let every pause sound chosen, right before your key words.'
  ] },
  speak_pf: { ladder: [
    'Speak your first sentence slowly, then keep that speed.',
    'Slow down whenever you say a quote or a technique.',
    'Pause for a beat at the end of each point.',
    'Slow down on your key idea so it lands.',
    'Change your speed on purpose to mark what matters most.'
  ] },
  speak_ps: { ladder: [
    'Practise your point aloud until the words come easily.',
    'Keep moving from one point to the next with a linking word.',
    'Pick up speed through your set-up and slow for your key idea.',
    'Trim your set-up so your best idea arrives sooner.',
    'Change your speed on purpose to keep the listener with you.'
  ] },
  speak_pa: { ladder: [
    'Pause for one breath at the end of each point.',
    'Pause just before you say your quote.',
    'Pause just after your key idea so it can sink in.',
    'Use a longer pause to mark the turn in your argument.',
    'Place your pauses so they shape the whole argument.'
  ] },
  speak_vo: { ladder: [
    'Record your first sentence again a little louder.',
    'Speak to someone at the back of the room.',
    'Keep your voice strong through to the end of each sentence.',
    'Lift your volume on your key words.',
    'Use changes in volume to mark what matters most.'
  ] },
  speak_fl: { ladder: [
    'Glance at your next dot point, then carry on.',
    'Plan one linking phrase to move between your points.',
    'Practise moving between points until the links come easily.',
    'Connect each point to the last in your own words as you go.',
    'Let each point grow out of the one before it.'
  ] },
  speak_to: { ladder: [
    'Choose one key word in each point and stress it.',
    'Lift your voice on the quote, then settle for your explanation.',
    'Match your tone to the idea you are arguing.',
    'Let your tone show which idea matters most.',
    'Shape your tone across the answer so it builds to your main idea.'
  ] },
  speak_tm: { ladder: [
    'Time one run aloud and note where you finish.',
    'Set a time for each point and practise to it.',
    'Give your strongest point the most time.',
    'Add detail or trim it so you finish right on time.',
    'Plan your ending so your last words land right on time.'
  ] }
};

export const DEFAULT_FEEDBACK_CODES = [
  c('comp_ts', 'TS', 'Topic sentence', 'composition', 1, 'lilac', 'Open with a clear concept that answers the question in specific terms and in your own words.'),
  c('comp_ar', 'AR', 'Analysis – relevance', 'composition', 1, 'lilac', 'Answer this question directly. Tie each point back to the words of the question.'),
  c('comp_as', 'AS', 'Analysis – specific', 'composition', 1, 'lilac', 'Turn the generic key terms into something specific to your argument.'),
  c('comp_ad', 'AD', 'Analysis – depth', 'composition', 1, 'lilac', 'Unpack the detail of this point and connect it back to the question.'),
  c('comp_sd', 'SD', 'Structure – development', 'composition', 1, 'lilac', 'Build the idea forward so each point adds something new.'),
  c('comp_e', 'E', 'Evidence', 'composition', 2, 'blue', 'Use evidence that is relevant, accurate, concise and varied.'),
  c('comp_t', 'T', 'Techniques', 'composition', 2, 'blue', 'Name a specific technique and explain its effect. Draw on a range, including form features.'),
  c('comp_ac', 'AC', 'Analysis – coherence', 'composition', 2, 'blue', 'Move from what happens to what it means. Give your own analysis in your own words.'),
  c('comp_sb', 'SB', 'Structure – balance', 'composition', 2, 'blue', 'Balance your analysis across both texts.'),
  c('comp_si', 'SI', 'Structure – integration', 'composition', 2, 'blue', 'Bring the texts together with comparative and evaluative language.'),
  c('comp_s', 'S', 'Structure', 'composition', 3, 'gold', 'Shape the response: a clear opening concept, then the units of analysis.'),
  c('comp_ex', 'EX', 'Expression', 'composition', 3, 'gold', 'Choose precise, high-quality language that carries the argument clearly and lets it move.'),
  c('comp_l', 'L', 'Length', 'composition', 3, 'gold', 'Strike the balance between detail and being succinct.'),
  c('viva_pp', 'PP', 'Pre-prepared', 'viva', 1, 'lilac', 'This sounds prepared for a different question. Respond to the one asked.'),
  c('viva_x', 'X', 'Accuracy', 'viva', 2, 'blue', 'Check this detail against the text and say it precisely.'),
  c('viva_np', 'NP', 'Needed prompting', 'viva', 3, 'gold', 'This needed a prompt to get there. Aim to get there on your own.'),
  c('speak_fw', 'FW', 'Filler word', 'speaking', null, 'peach', 'Filler word. Try a short silent pause instead.', { key: '1' }),
  c('speak_pf', 'PF', 'Pace – too fast', 'speaking', null, 'peach', 'You sped up here. Slow down so the idea lands.', { key: '2' }),
  c('speak_ps', 'PS', 'Pace – too slow', 'speaking', null, 'peach', 'This dragged. Keep the momentum going.', { key: '3' }),
  c('speak_pa', 'PA', 'Pause', 'speaking', null, 'peach', 'Use a deliberate pause to let a key point sink in.', { key: '4', strength_descriptor: 'Well-placed pause. It let the point land.' }),
  c('speak_vo', 'VO', 'Volume', 'speaking', null, 'peach', 'Project your voice so every word carries.', { key: '5' }),
  c('speak_fl', 'FL', 'Fluency', 'speaking', null, 'peach', 'You lost the thread here. Glance at your next dot point and carry on.', { key: '6' }),
  c('speak_to', 'TO', 'Tone', 'speaking', null, 'peach', 'Vary your tone and stress the key words.', { key: '7', strength_descriptor: 'Great emphasis on the key words.' }),
  c('speak_tm', 'TM', 'Timing', 'speaking', null, 'peach', 'Use the full time and finish right on it.', { key: '8' })
].map((code) => (LADDERS[code.id] ? { ...code, ...LADDERS[code.id] } : code));

export class FeedbackCodesError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const MAX_RESOURCE_TITLE = 80;
/** A See how link the teacher sets on a code: a page or a video (optionally from a time). http(s) only. */
function cleanResource(raw) {
  if (!raw || typeof raw !== 'object' || !['link', 'video'].includes(raw.kind)) return null;
  let url;
  try { url = new URL(String(raw.url)); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const out = { kind: raw.kind, url: url.toString(), title: text(raw.title, MAX_RESOURCE_TITLE) };
  const start = Math.floor(Number(raw.start));
  if (raw.kind === 'video' && Number.isFinite(start) && start > 0) out.start = Math.min(start, 24 * 3600);
  return out;
}

/** One step per placement rung, each trimmed and short; anything else drops the ladder. */
function cleanLadder(raw) {
  if (!Array.isArray(raw) || raw.length !== RUNG_ORDER.length) return null;
  const lines = raw.map((line) => (typeof line === 'string' ? line.trim() : ''));
  return lines.every((line) => line && line.length <= LADDER_MAX) ? lines : null;
}

/** Validates a library sent by the teacher. Ids stay stable so old feedback still finds its code. */
export function cleanFeedbackCodes(input) {
  const raw = Array.isArray(input?.codes) ? input.codes : null;
  if (!raw) throw new FeedbackCodesError('Send a list of codes.');
  if (raw.length === 0) throw new FeedbackCodesError('Keep at least one code.');
  if (raw.length > MAX_FEEDBACK_CODES) throw new FeedbackCodesError(`Keep it to ${MAX_FEEDBACK_CODES} codes.`);
  const ids = new Set();
  const letters = new Set();
  const keys = new Set();
  return raw.map((row, index) => {
    const code = text(row?.code, 3).toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(code)) throw new FeedbackCodesError(`Code ${index + 1} needs 1–3 letters.`);
    if (letters.has(code)) throw new FeedbackCodesError(`“${code}” is used twice. Each code must be different.`);
    letters.add(code);
    const label = text(row?.label, MAX_LABEL);
    if (!label) throw new FeedbackCodesError(`“${code}” needs a name.`);
    const group = CODE_GROUPS.includes(row?.group) ? row.group : 'composition';
    const criterion = group === 'speaking' ? null : [1, 2, 3].includes(Number(row?.criterion)) ? Number(row.criterion) : null;
    let id = typeof row?.id === 'string' && /^[a-z0-9_-]{1,40}$/.test(row.id) ? row.id : `code_${code.toLowerCase()}`;
    for (let n = 2; ids.has(id); n++) id = `code_${code.toLowerCase()}_${n}`;
    ids.add(id);
    const out = {
      id,
      code,
      label,
      group,
      criterion,
      colour: CODE_COLOURS.includes(row?.colour) ? row.colour : 'blue',
      descriptor: text(row?.descriptor, MAX_DESCRIPTOR)
    };
    if (group === 'speaking' && CODE_KEYS.includes(String(row?.key)) && !keys.has(String(row.key))) {
      out.key = String(row.key);
      keys.add(out.key);
    }
    const strength = text(row?.strength_descriptor, MAX_DESCRIPTOR);
    if (strength) out.strength_descriptor = strength;
    // Optional: the WalkThrus problem type this code points to, set by the teacher in the editor.
    if (isProblemType(row?.problem_type)) out.problem_type = row.problem_type;
    const resource = cleanResource(row?.resource);
    if (resource) out.resource = resource;
    // Optional: the continuum skill (strand.sub) the code works on, and its next step at each rung.
    if (typeof row?.skill === 'string' && SKILL_REF.test(row.skill)) out.skill = row.skill;
    const ladder = cleanLadder(row?.ladder);
    if (ladder) out.ladder = ladder;
    if (row?.hidden === true) out.hidden = true;
    return out;
  });
}

export async function readFeedbackCodes(store) {
  const saved = await store.get(CODES_KEY, { type: 'json', consistency: 'strong' });
  if (!Array.isArray(saved?.codes) || !saved.codes.length) return DEFAULT_FEEDBACK_CODES;
  // A saved code without a ladder of its own still gets a next step.
  return saved.codes.map((code) => (code.ladder || !LADDERS[code.id] ? code : { ...code, ladder: LADDERS[code.id].ladder }));
}

export async function writeFeedbackCodes(store, input) {
  const codes = cleanFeedbackCodes(input);
  await store.setJSON(CODES_KEY, { codes, updated_at: new Date().toISOString() });
  return codes;
}
