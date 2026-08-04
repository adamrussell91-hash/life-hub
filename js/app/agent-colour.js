export const DEFAULT_AGENT_COLOUR = '#376FB7';

export function agentColour(agentsConfig, slug) {
  const agents = Array.isArray(agentsConfig?.agents) ? agentsConfig.agents : [];
  const agent = agents.find(candidate => candidate.slug === slug);
  return typeof agent?.colour === 'string' ? agent.colour : DEFAULT_AGENT_COLOUR;
}
