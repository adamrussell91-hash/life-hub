// packages/problem-solver/tools/problem-statement.mjs
import { hasSlot } from '../slots.mjs';

const ORDER = ['problem', 'impact', 'benefit', 'statement'];

export const problemStatement = Object.freeze({
  id: 'problem_statement',
  name: 'Problem statement',
  kind: 'statement',
  when: 'After a diagnostic tool: summarise the problem, its impacts and the benefits of solving it.',
  steps: [
    { id: 'problem', title: 'State the problem', prompt: 'Identify the gap or issue that currently exists, with essential context. When and where is it occurring? Does it reflect any trends?' },
    { id: 'impact', title: 'Describe the impact', prompt: 'Describe the cost of doing nothing, or the impacts of leaving it unresolved. Quantify impacts with numeric or measurable data where possible.' },
    { id: 'benefit', title: 'Highlight the benefits', prompt: 'What benefits will solving it have? Who will benefit? Use data points to communicate urgency.' },
    { id: 'statement', title: 'Compose the statement', prompt: 'In a few sentences, combine the problem, impacts and solution benefits.' }
  ],
  slots: { problem: 'The problem', impact: 'Impacts of leaving it', benefit: 'Benefits of solving it', statement: 'The composed statement' },
  edgeKinds: [],
  nextSlots(run) {
    const next = ORDER.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return hasSlot(run, 'statement');
  }
});
