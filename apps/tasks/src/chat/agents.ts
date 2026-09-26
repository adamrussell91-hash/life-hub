import {
  CLARE_ADHD_PROTOCOLS,
  CLARE_VIEW_PROTOCOLS,
  CLARE_WAIT_LINES
} from '@/domain/clare-protocols';

/** Tasks Hub chat roster — Clare and Hammond (Goals / chat personas). */

export type ChatAgentSlug = 'clare' | 'hammond';

export type ChatProtocol = {
  id: string;
  label: string;
  explain: string;
};

export type ChatAgent = {
  slug: ChatAgentSlug;
  name: string;
  firstName: string;
  /** Picker ring — confirmed character colours from Life / Teaching Hub. */
  colour: string;
  /** Chat accent. Clare stays Wave so yellow identity colour never becomes body text. */
  accent: string;
  avatarSrc: string;
  placeholder: string;
  canEyebrow: string;
  protocols: readonly ChatProtocol[];
  stuckEyebrow?: string;
  stuckProtocols?: readonly ChatProtocol[];
  waitLines: readonly string[];
};

export const DEFAULT_AGENT_SLUG: ChatAgentSlug = 'clare';

export const CHAT_AGENTS: readonly ChatAgent[] = [
  {
    slug: 'clare',
    name: 'Clare DeMind',
    firstName: 'Clare',
    colour: '#F7DD4C',
    accent: 'var(--wave)',
    avatarSrc: '/assets/agents/clare.png',
    placeholder: 'Dump the chaos. One thing, or twelve.',
    canEyebrow: 'Clare can',
    protocols: CLARE_VIEW_PROTOCOLS,
    stuckEyebrow: 'When stuck',
    stuckProtocols: CLARE_ADHD_PROTOCOLS,
    waitLines: CLARE_WAIT_LINES
  },
  {
    slug: 'hammond',
    name: 'General Hammond',
    firstName: 'Hammond',
    colour: '#2D2D2D',
    accent: '#2D2D2D',
    avatarSrc: '/assets/agents/hammond.jpg',
    placeholder: "What's running. Or name the drift.",
    canEyebrow: 'Hammond can',
    // Empty tray hides cleanly in build-chat-view.
    protocols: [],
    waitLines: [
      'Getting the full picture…',
      'Walking the board…',
      'Checking the mission log…',
      'Assessing the field…',
      'Reviewing the brief…',
      'Looking at the trends…',
      'Taking a sitrep…',
      'Reading the last orders…',
      'Mapping the next move…',
      'Checking what’s running…',
      'Holding the line…'
    ]
  }
];

export function agentBySlug(slug: string | null | undefined): ChatAgent {
  return CHAT_AGENTS.find((agent) => agent.slug === slug) ?? CHAT_AGENTS[0];
}

export function isChatAgentSlug(value: string): value is ChatAgentSlug {
  return CHAT_AGENTS.some((agent) => agent.slug === value);
}
