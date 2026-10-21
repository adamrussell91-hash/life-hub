// packages/problem-solver/tools/feedback-matrix.mjs
import { countSlots, nextIndexed, open, parseSlot } from '../slots.mjs';

export const FEEDBACK_QUADRANTS = Object.freeze(['suggestion', 'compliment', 'change', 'question']);
export const THEME_TAGS = Object.freeze(['do_more', 'question', 'change']);
const PER_QUADRANT = 6;
const PER_THEME = 4;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** The why and how nodes hanging from one theme, in placement order. */
export function satellitesOf(run, themeId) {
  const out = { why: [], how: [] };
  for (const edge of run.edges) {
    if (edge.kind !== 'of' || edge.to !== themeId) continue;
    const node = run.nodes.find((item) => item.id === edge.from);
    const name = parseSlot(node?.slot)?.name;
    if (name === 'why' || name === 'how') out[name].push(node);
  }
  return out;
}

const filledQuadrants = (run) => FEEDBACK_QUADRANTS.filter((q) => countSlots(run, q) > 0).length;
const themeWithHow = (run) => run.nodes.some((node) => parseSlot(node.slot)?.name === 'theme' && satellitesOf(run, node.id).how.length > 0);

export const feedbackMatrix = Object.freeze({
  id: 'feedback_matrix',
  name: 'Feedback matrix',
  kind: 'review',
  step: 'improve',
  when: 'Feedback from yourself or others needs sorting into something you can act on: what to try, keep, stop and clarify, then the themes that matter most, why they matter and how to act.',
  failureModes: [
    'Only collecting compliments, or only complaints.',
    'Treating every comment as equally important instead of choosing themes.',
    'Themes with no "how", so nothing changes.',
    'Feedback about people rather than the work or the process.'
  ],
  steps: [
    { id: 'collect', title: 'Part one: sort the feedback', prompt: 'Your own and others\': suggestions to try, compliments to keep, changes to stop or remove, questions to clarify.' },
    { id: 'themes', title: 'Part two: choose themes', prompt: 'Pick the themes with the most impact: something to do more of, a question to settle, or a change to make.' },
    { id: 'why_how', title: 'Ask why and how', prompt: 'For each theme ask why it matters and how to act on it.' },
    { id: 'act', title: 'Act', prompt: 'Turn the hows into actions; for what works, how to repeat it elsewhere.' }
  ],
  slots: {
    suggestion: 'A suggestion: something to try or improve',
    compliment: 'A compliment: something to keep doing',
    change: 'A change: something to stop or remove',
    question: 'A question: something unclear to settle',
    theme: 'A theme with the most impact',
    why: 'Why the theme matters (a root cause or a priority)',
    how: 'How to act on the theme',
    action: 'An action to take'
  },
  nodeTags: { theme: THEME_TAGS },
  edgeKinds: ['of'],
  requiredLinks: {
    why: { kind: 'of', message: 'Link each why to the theme it explains (link kind "of", from the why to the theme).' },
    how: { kind: 'of', message: 'Link each how to the theme it acts on (link kind "of", from the how to the theme).' }
  },
  nextSlots(run) {
    const items = FEEDBACK_QUADRANTS.map((q) => nextIndexed(run, q, PER_QUADRANT));
    if (filledQuadrants(run) < 3) return open(...items);
    const themes = countSlots(run, 'theme') > 0;
    return open(
      ...items,
      nextIndexed(run, 'theme', 4),
      themes ? nextIndexed(run, 'why', 16) : null,
      themes ? nextIndexed(run, 'how', 16) : null,
      themeWithHow(run) ? nextIndexed(run, 'action', 6) : null
    );
  },
  canEdge(run, from, to, kind) {
    const name = nameOf(run, from);
    return kind === 'of' && (name === 'why' || name === 'how') && nameOf(run, to) === 'theme' && !run.edges.some((edge) => edge.kind === 'of' && edge.from === from) && satellitesOf(run, to)[name].length < PER_THEME;
  },
  complete(run) {
    return filledQuadrants(run) >= 3 && themeWithHow(run) && countSlots(run, 'action') > 0;
  }
});
