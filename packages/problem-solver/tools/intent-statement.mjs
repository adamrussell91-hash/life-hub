// packages/problem-solver/tools/intent-statement.mjs
import { hasSlot } from '../slots.mjs';

const ORDER = ['problem', 'stakeholders', 'failures', 'approach', 'opportunity', 'risk'];

export const intentStatement = Object.freeze({
  id: 'intent_statement',
  name: 'Intent statement',
  kind: 'statement',
  step: 'analyse',
  when: 'At the end of Analyse, to set out the problem and the plan to tackle it in a way others can follow: who is involved, what went wrong before, why this approach, what it is worth and what could go wrong.',
  failureModes: [
    'Past failures skipped, so the tone is unrealistically hopeful.',
    'An approach that does not say why it will work this time.',
    'Risks listed with no likelihood or mitigation.'
  ],
  steps: [
    { id: 'problem', title: 'Define the problem', prompt: 'A short definition of the problem in its context.' },
    { id: 'stakeholders', title: 'Identify stakeholders', prompt: 'Who is affected, and who needs to act.' },
    { id: 'failures', title: 'Acknowledge failures', prompt: 'What has gone wrong with past attempts, or could go wrong now.' },
    { id: 'approach', title: 'The approach', prompt: 'Why this effort will succeed: people, timing, processes, methods.' },
    { id: 'opportunity', title: 'Highlight the opportunity', prompt: 'What solving it is worth.' },
    { id: 'risk', title: 'Assess the risks', prompt: 'What could go wrong, how likely, and how to reduce it.' }
  ],
  slots: { problem: 'The problem in context', stakeholders: 'Who is affected or must act', failures: 'Past or likely failures', approach: 'Why this approach will work', opportunity: 'What solving it is worth', risk: 'Risks, likelihood and mitigation' },
  edgeKinds: [],
  nextSlots(run) {
    const next = ORDER.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return hasSlot(run, 'risk');
  }
});
