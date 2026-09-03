import {
  CLARE_ADHD_PROTOCOLS,
  CLARE_PROTOCOLS,
  CLARE_WAIT_LINES
} from '@/domain/clare-protocols';

/** Tasks Hub chat roster — Clare plus the StressFlag network, portraits from the sibling hubs. */

export type ChatAgentSlug = 'clare' | 'hammond' | 'penelope' | 'vera';

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
  inboxName?: 'General Hammond' | 'Penelope Rose Quillian' | 'Dr Vera Lenz';
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
    protocols: CLARE_PROTOCOLS,
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
    inboxName: 'General Hammond',
    placeholder: "What's running. Or name the drift.",
    canEyebrow: 'Hammond can',
    protocols: [
      {
        id: 'whats-running',
        label: "What's running",
        explain: 'Sitrep from the StressFlag inbox Clare already routed.'
      },
      {
        id: 'year-on-year',
        label: 'Year on year',
        explain: 'Recurrence notes — the collisions that keep coming back.'
      },
      {
        id: 'drifting',
        label: "Something's drifting",
        explain: 'Name the pattern before it becomes next October’s mess.'
      },
      {
        id: 'specialist',
        label: 'Hand to specialist',
        explain: 'Who else on the network should see this texture.'
      }
    ],
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
  },
  {
    slug: 'penelope',
    name: 'Penelope Rose Quillian',
    firstName: 'Penelope',
    colour: '#8F373E',
    accent: '#8F373E',
    avatarSrc: '/assets/agents/penelope.jpg',
    inboxName: 'Penelope Rose Quillian',
    placeholder: 'Tell me the texture of the day.',
    canEyebrow: 'Penelope can',
    protocols: [
      {
        id: 'read-texture',
        label: 'Read the texture',
        explain: 'What Clare flagged for the diary layer.'
      },
      {
        id: 'check-in',
        label: 'Check in',
        explain: 'A prompt to write tonight, if the flags warrant it.'
      }
    ],
    waitLines: [
      'Opening the daybook…',
      'Setting the scene…',
      'Recalling a chapter…',
      'Dusting the diary…',
      'Finding the right word…',
      'Pouring a little tea…',
      'Flipping back a page…',
      'Gathering the gossip…',
      'Warming up the quill…',
      'Listening for the motif…'
    ]
  },
  {
    slug: 'vera',
    name: 'Dr Vera Lenz',
    firstName: 'Vera',
    colour: '#37598A',
    accent: '#37598A',
    avatarSrc: '/assets/agents/vera.jpg',
    inboxName: 'Dr Vera Lenz',
    placeholder: 'Sit with it. Or name the pattern.',
    canEyebrow: 'Vera can',
    protocols: [
      {
        id: 'sit-with-this',
        label: 'Sit with this',
        explain: 'Hold the pressure pattern without rushing to fix it.'
      },
      {
        id: 'think-this-through',
        label: 'Think this through',
        explain: 'What the flags say about the interior load.'
      }
    ],
    waitLines: [
      'Sitting with this…',
      'Looking at the pattern…',
      'Holding the thought…',
      'Checking the room…',
      'Letting that land…',
      'Reading between sessions…',
      'Finding the quiet bit…',
      'Turning it over once…',
      'Not rushing this…',
      'Watching what repeats…'
    ]
  }
];

export function agentBySlug(slug: string | null | undefined): ChatAgent {
  return CHAT_AGENTS.find((agent) => agent.slug === slug) ?? CHAT_AGENTS[0];
}

export function isChatAgentSlug(value: string): value is ChatAgentSlug {
  return CHAT_AGENTS.some((agent) => agent.slug === value);
}
