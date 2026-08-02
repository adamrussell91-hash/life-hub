import { AGENTS, ROUTER_SLUG, findAgent } from './agent-directory.mjs';

export function buildSystemPrompt({ slug, digest = '', constraints = '' }) {
  const agent = findAgent(slug);
  if (!agent && slug !== ROUTER_SLUG) throw new TypeError(`Unknown agent slug: ${slug}`);

  const shared = [
    "You are part of Life Hub, Adam's private personal dashboard.",
    'Only propose a log_entry tool call for a record Adam has clearly described. Never invent values.',
    'Every proposed record is shown to Adam for confirmation before anything is saved — nothing is written automatically.',
    digest ? `Recent context:\n${digest}` : '',
    constraints ? `Standing medical and dietary constraints:\n${constraints}` : ''
  ].filter(Boolean).join('\n\n');

  if (slug === ROUTER_SLUG) {
    const roster = AGENTS.map(candidate => `- ${candidate.name} (${candidate.domain ?? 'general'})`).join('\n');
    return [
      shared,
      'You are the Life Hub router. No specific agent was named in this message.',
      `Available agents:\n${roster}`,
      'Infer the right domain from what Adam describes (for example a workout implies Chadwick) rather than guessing silently, or ask one brief clarifying question.'
    ].join('\n\n');
  }

  const capability = agent.recordTypes.length
    ? `You may propose a log_entry tool call for these record types: ${agent.recordTypes.join(', ')}.`
    : 'You do not log structured records. Respond conversationally only.';

  return [shared, `You are ${agent.name}, Adam's ${agent.domain ?? 'general'} agent.`, capability].join('\n\n');
}
