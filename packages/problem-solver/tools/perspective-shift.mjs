// packages/problem-solver/tools/perspective-shift.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const has = (run, slot) => run.nodes.some((node) => node.slot === slot);

export const perspectiveShift = Object.freeze({
  id: 'perspective_shift',
  name: 'Perspective shift',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Several people are affected or involved, and their needs, worries or views may change what the problem really is. Builds empathy and lowers conflict.',
  failureModes: [
    'One person\'s view presented as everyone\'s.',
    'Imagined views with no input gathered from the person.',
    'Insights that restate a complaint instead of a need ("It helps when…", "I can\'t … when …").',
    'Skipping the reframe, so nothing changes.'
  ],
  steps: [
    { id: 'stakeholders', title: 'Identify stakeholders', prompt: 'List the people affected by the problem or by a solution to it.' },
    { id: 'input', title: 'Gather input', prompt: 'For each, find out what drives them: motivations, concerns and values, ideally from them or from research.' },
    { id: 'viewpoints', title: 'Analyse viewpoints', prompt: 'Step into their view; question the assumptions and biases you have taken as given.' },
    { id: 'insights', title: 'Synthesise insights', prompt: 'Write one insight statement per stakeholder, such as "It helps when…" or "I can\'t … when …".' },
    { id: 'reframe', title: 'Reframe', prompt: 'Revise the problem or the goal in light of what the perspectives showed.' }
  ],
  slots: {
    stakeholder: 'Someone affected by the problem or its solution',
    view: 'Their view of it, in their terms: what they think, question, wish or worry about',
    insight: 'Their insight statement: "It helps when…" or "I can\'t … when …"',
    reframe: 'The problem or goal, reframed by these perspectives'
  },
  edgeKinds: [],
  nextSlots(run) {
    if (hasSlot(run, 'reframe')) return [];
    const rows = [];
    for (let i = 1; i <= countSlots(run, 'stakeholder'); i += 1) {
      if (!has(run, `view:${i}`)) rows.push(`view:${i}`);
      else if (!has(run, `insight:${i}`)) rows.push(`insight:${i}`);
    }
    return open(nextIndexed(run, 'stakeholder', 8), ...rows, countSlots(run, 'insight') >= 2 ? 'reframe' : null);
  },
  complete(run) {
    return countSlots(run, 'insight') >= 2 && hasSlot(run, 'reframe');
  }
});
