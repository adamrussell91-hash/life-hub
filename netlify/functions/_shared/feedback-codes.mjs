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
 * step toward the rung above. Generic stand-ins; the saved library holds the real ones.
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
  return Array.isArray(saved?.codes) && saved.codes.length ? saved.codes : DEFAULT_FEEDBACK_CODES;
}

export async function writeFeedbackCodes(store, input) {
  const codes = cleanFeedbackCodes(input);
  await store.setJSON(CODES_KEY, { codes, updated_at: new Date().toISOString() });
  return codes;
}
