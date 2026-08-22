/** User-facing protocol pills + in-character wait lines for Life Hub chat. */

export const AGENT_PROTOCOLS = {
  brisket: {
    firstName: 'Brisket',
    eyebrow: 'Brisket can',
    pills: [
      { id: 'log-meal', label: 'Log a meal', steer: 'Logging protocol' },
      { id: 'flare-up', label: 'Flare-up eating', steer: 'Active flare-up protocol' },
      { id: 'weekend', label: 'Weekend / eating out', steer: 'Weekend / eating out' },
      { id: 'forward-plan', label: 'Plan the rest of today', steer: 'Forward-plan remaining meals' },
      { id: 'why-ate', label: 'Why I ate that', steer: 'Psychology & behaviour' }
    ]
  },
  chadwick: {
    firstName: 'Chadwick',
    eyebrow: 'Chadwick can',
    pills: [
      { id: 'log-session', label: 'Log a session', steer: 'Logging protocol — status completed' },
      { id: 'next-session', label: 'Next session', steer: 'Logging protocol — status planned; design today’s session' },
      { id: 'missed-day', label: 'Missed a day', steer: 'Adherence (2+ missed days → lower the bar)' },
      { id: 'program-check', label: "How's the program", steer: 'Rotation, deload, and aesthetic bias' },
      { id: 'form-safety', label: 'Form / safety', steer: 'Safety' }
    ]
  },
  hyaluronica: {
    firstName: 'Hyaluronica',
    eyebrow: 'Hyaluronica can',
    pills: [
      { id: 'tonight', label: 'What to use tonight', steer: 'Advise from the Current AM/PM rotation' },
      { id: 'whats-on', label: "What's in my routine", steer: 'Routines and library — membership is the source of truth' },
      { id: 'add-library', label: 'Add to the library', steer: 'Routines and library' },
      { id: 'am-pm', label: 'AM vs PM', steer: 'Routines and library — AM/PM membership' },
      { id: 'irritating', label: "Something's irritating", steer: 'Advise; do not invent a routine from shelf flags' }
    ]
  },
  sara: {
    firstName: 'Sara',
    eyebrow: 'Sara can',
    pills: [
      { id: 'read-results', label: 'Read these results', steer: 'Interpret from Medical Overview' },
      { id: 'tracking', label: 'How am I tracking', steer: 'Weekly health scan posture' },
      { id: 'log-reading', label: 'Log a reading', steer: 'Logging protocol (body figures and medical visits)' },
      { id: 'weekly-scan', label: 'Weekly scan', steer: 'Weekly health scan posture' },
      { id: 'something-off', label: "Something's off", steer: 'Interpret; name concerns without catastrophising' }
    ]
  },
  penelope: {
    firstName: 'Penelope',
    eyebrow: 'Penelope can',
    pills: [
      { id: 'start-diary', label: 'Start a diary', steer: 'Interview flow (every time)' },
      { id: 'continue', label: 'Continue', steer: 'Interview flow — continue one question at a time' },
      { id: 'on-this-day', label: 'On this day', steer: 'On this day' },
      { id: 'just-a-thought', label: 'Just a thought', steer: 'Interview flow — follow his lead, one question' }
    ]
  },
  vera: {
    firstName: 'Vera',
    eyebrow: 'Vera can',
    pills: [
      { id: 'thinking-partner', label: 'Think this through', steer: 'Job — thinking partner, one open question' },
      { id: 'sit-with-this', label: 'Sit with this', steer: 'Presence — sit with it first' },
      { id: 'dropping-anchor', label: 'Dropping Anchor', steer: 'Dropping Anchor (ACE)' },
      { id: 'close-session', label: 'Close the session', steer: 'Closing — always three parts; log mind_session if there is one' }
    ]
  },
  hammond: {
    firstName: 'Hammond',
    eyebrow: 'Hammond can',
    pills: [
      { id: 'whats-running', label: "What's running", steer: 'Session Triage (gateway)' },
      { id: 'decision', label: 'Decision help', steer: 'Decision Priority Hierarchy (provisional)' },
      { id: 'weekly-review', label: 'Weekly review', steer: 'Follow-on protocols — Weekly Review' },
      { id: 'drifting', label: "Something's drifting", steer: 'Follow-on protocols — Drift' },
      { id: 'specialist', label: 'Talk to a specialist', steer: 'Specialist pattern relay' }
    ]
  }
};

export const AGENT_STATUS_LINES = {
  brisket: [
    'Lassoing some stats…',
    'Hog-tying a polyphenol…',
    'Rounding up the macros…',
    'Checking the chuckwagon…',
    'Saddling up a search…',
    'Counting them beans…',
    'Wrestling a nutrition label…',
    'Looking in the pantry…',
    'Wrangling today’s eats…',
    'Dusting off the Food Library…',
    'Corralling a serving size…',
    'Be a goldfish — fetching the facts…'
  ],
  chadwick: [
    'Curling some research…',
    'Flexing on some thinking…',
    'Loading the bar…',
    'Checking the pump journal…',
    'Spotting the numbers…',
    'Warming up a prescription…',
    'Chalking up the plan…',
    'Hitting the stack…',
    'Measuring the gains…',
    'Reracking the evidence…',
    'Getting a pump on the data…',
    'Bro-ing through the library…'
  ],
  hyaluronica: [
    'Checking the shelf, babe…',
    'Melting a peptide in…',
    'Doing a skin audit…',
    'Swatching the routine…',
    'Peeking at the actives…',
    'Layering a thought…',
    'Consulting the vanity…',
    'Scanning the AM/PM…',
    'Reading the label drama…',
    'Buffering a recommendation…',
    'Pressing pause on a pimple…',
    'Mixing a little science…'
  ],
  sara: [
    'Reviewing the chart…',
    'Reading the labs…',
    'Checking the trendline…',
    'Looking at the overview…',
    'Cross-checking a figure…',
    'Opening the record…',
    'Watching that marker…',
    'Pulling the last visit…',
    'Contextualising a number…',
    'Scanning this week’s picture…',
    'Pairing this with the history…',
    'Taking a proper look…'
  ],
  penelope: [
    'Opening the daybook…',
    'Setting the scene…',
    'Recalling a chapter…',
    'Dusting the diary…',
    'Finding the right word…',
    'Pouring a little tea…',
    'Flipping back a page…',
    'Gathering the gossip…',
    'Warming up the quill…',
    'Listening for the motif…',
    'Arranging the flowers of the day…',
    'Steeping a memory…'
  ],
  vera: [
    'Sitting with this…',
    'Looking at the pattern…',
    'Holding the thought…',
    'Checking the room…',
    'Letting that land…',
    'Reading between sessions…',
    'Finding the quiet bit…',
    'Turning it over once…',
    'Not rushing this…',
    'Opening the notes…',
    'Watching what repeats…',
    'Leaving space for it…'
  ],
  hammond: [
    'Getting the full picture…',
    'Walking the board…',
    'Checking the mission log…',
    'Assessing the field…',
    'Reviewing the brief…',
    'Looking at the trends…',
    'Opening Central Node…',
    'Taking a sitrep…',
    'Reading the last orders…',
    'Mapping the next move…',
    'Checking what’s running…',
    'Holding the line…'
  ]
};

export const FALLBACK_STATUS_LINES = ['Thinking…'];

const GENERIC_STATUS_COPY = new Set([
  'On it…',
  'Looking that up…',
  'Researching…',
  'Thinking…',
  'Loading your logs…',
  'Wrapping up…'
]);

export function protocolsForSlug(slug) {
  return AGENT_PROTOCOLS[slug] ?? null;
}

export function findProtocol(slug, protocolId) {
  if (!slug || !protocolId) return null;
  return protocolsForSlug(slug)?.pills.find(pill => pill.id === protocolId) ?? null;
}

export function protocolSteerBlock(slug, protocolId) {
  const pill = findProtocol(slug, protocolId);
  if (!pill) return '';
  return [
    `Adam chose the "${pill.label}" protocol for this turn (${pill.steer} in your operating manual).`,
    'Run that protocol in character from your first word.',
    'Do not narrate routing, name this as a system feature, or dump a description of what the protocol is.',
    'If he also wrote a message, treat it as the start of that protocol.'
  ].join(' ');
}

export function statusLinesForSlug(slug) {
  return AGENT_STATUS_LINES[slug] ?? FALLBACK_STATUS_LINES;
}

export function isAgentStatusLine(slug, text) {
  if (typeof text !== 'string') return false;
  return statusLinesForSlug(slug).includes(text);
}

export function isGenericStatusCopy(text) {
  return GENERIC_STATUS_COPY.has(text);
}

export function pickStatusLine(slug, { exclude, random = Math.random } = {}) {
  const lines = statusLinesForSlug(slug);
  const pool = exclude ? lines.filter(line => line !== exclude) : lines;
  const list = pool.length ? pool : lines;
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)));
  return list[index];
}

export function normalizeProtocolId(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !/^[a-z0-9-]+$/.test(trimmed)) return undefined;
  return trimmed;
}
