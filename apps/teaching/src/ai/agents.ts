export type AgentSlug = 'ann' | 'clementine' | 'hammond' | 'clare';

export interface AgentDefinition {
  slug: AgentSlug;
  name: string;
  colour: string;
  avatarSrc: string;
  heroSrc: string;
  nameTriggers: string[];
  protocolFile: string;
}

export const DEFAULT_AGENT_SLUG: AgentSlug = 'ann';
export const LAST_AGENT_STORAGE_KEY = 'teaching_hub_ai_last_agent';

export const AGENTS: AgentDefinition[] = [
  {
    slug: 'ann',
    name: "Ann O'Tation",
    colour: '#5B141A',
    avatarSrc: '/assets/agents/ann.png',
    heroSrc: '/assets/agents/full/ann.png',
    nameTriggers: ["ann o'tation", 'ann otation', 'ann'],
    protocolFile: 'ann-protocol.md'
  },
  {
    slug: 'clementine',
    name: 'Professor Clementine Haig',
    colour: '#3B57A8',
    avatarSrc: '/assets/agents/clementine.png',
    heroSrc: '/assets/agents/full/clementine.png',
    nameTriggers: ['professor clementine haig', 'clementine haig', 'clementine', 'haig'],
    protocolFile: 'clementine-protocol.md'
  },
  {
    slug: 'hammond',
    name: 'General Hammond',
    colour: '#2D2D2D',
    avatarSrc: '/assets/agents/hammond.png',
    heroSrc: '/assets/agents/full/hammond.png',
    nameTriggers: ['general hammond', 'hammond'],
    protocolFile: 'hammond-protocol.md'
  },
  {
    slug: 'clare',
    name: 'Clare DèMind',
    colour: '#F7DD4C',
    avatarSrc: '/assets/agents/clare.png',
    heroSrc: '/assets/agents/full/clare.png',
    nameTriggers: ['clare dèmind', 'clare demind', 'clare'],
    protocolFile: 'clare-protocol.md'
  }
];

export function agentBySlug(slug: string): AgentDefinition | null {
  return AGENTS.find((a) => a.slug === slug) ?? null;
}

export function agentColour(slug: string): string {
  return agentBySlug(slug)?.colour ?? '#376FB7';
}

export function readLastAgentSlug(): AgentSlug {
  try {
    const raw = localStorage.getItem(LAST_AGENT_STORAGE_KEY);
    if (raw && agentBySlug(raw)) return raw as AgentSlug;
  } catch {
    /* ignore */
  }
  return DEFAULT_AGENT_SLUG;
}

export function writeLastAgentSlug(slug: AgentSlug): void {
  try {
    localStorage.setItem(LAST_AGENT_STORAGE_KEY, slug);
  } catch {
    /* ignore */
  }
}
