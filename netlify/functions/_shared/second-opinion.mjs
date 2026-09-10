const AGENTS = [
  { id: 'sara', label: 'Sara' },
  { id: 'chadwick', label: 'Chadwick' },
  { id: 'clare', label: 'Clare' },
  { id: 'ann', label: 'Ann' }
];

export function buildSecondOpinionChoice({ title, decisionId } = {}) {
  const decision = typeof title === 'string' ? title.trim() : '';
  if (!decision) return null;
  return {
    type: 'choice',
    title: 'Ask for a second look?',
    hint: decisionId
      ? `Another agent can append to “${decision}” (${decisionId}).`
      : `Another agent can append to “${decision}”.`,
    multi: false,
    confirmLabel: 'Ask',
    choices: AGENTS.map(agent => ({
      id: agent.id,
      label: `Ask ${agent.label} about ${decision}`
    }))
  };
}
