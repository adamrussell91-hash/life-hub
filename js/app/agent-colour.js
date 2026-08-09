import { avatarForSlug } from './agent-avatars.js';

export const DEFAULT_AGENT_COLOUR = '#376FB7';

export function agentColour(agentsConfig, slug) {
  const agents = Array.isArray(agentsConfig?.agents) ? agentsConfig.agents : [];
  const fromConfig = agents.find(candidate => candidate.slug === slug);
  if (typeof fromConfig?.colour === 'string' && fromConfig.colour.trim()) {
    return fromConfig.colour.trim();
  }
  const fromRoster = avatarForSlug(slug);
  if (typeof fromRoster?.colour === 'string' && fromRoster.colour.trim()) {
    return fromRoster.colour.trim();
  }
  return DEFAULT_AGENT_COLOUR;
}
