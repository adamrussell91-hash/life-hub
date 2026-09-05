/** User-facing protocol pills + in-character wait lines for Life Hub chat. */

export const AGENT_PROTOCOLS = {
  brisket: {
    firstName: 'Brisket',
    eyebrow: 'Brisket can',
    pills: [
      { id: 'log-meal', label: 'Log a meal', steer: 'Logging protocol', explain: 'Record what you ate so Brisket can put it on the day.' },
      { id: 'flare-up', label: 'Flare-up eating', steer: 'Active flare-up protocol', explain: 'Shift today’s food onto the gentler flare-up rules.' },
      { id: 'weekend', label: 'Weekend / eating out', steer: 'Weekend / eating out', explain: 'Plan or log a meal out without blowing the week.' },
      { id: 'forward-plan', label: 'Plan the rest of today', steer: 'Forward-plan remaining meals', explain: 'Map the remaining meals so the day still lands.' },
      { id: 'why-ate', label: 'Why I ate that', steer: 'Psychology & behaviour', explain: 'Talk through the urge or the choice, not just the macros.' }
    ]
  },
  chadwick: {
    firstName: 'Chadwick',
    eyebrow: 'Chadwick can',
    pills: [
      { id: 'next-session', label: 'Save plan', steer: 'Logging protocol — status planned; design today’s session and put it on Fitness. Do not mark it completed.', explain: 'Build today’s workout and park it on Fitness.' },
      { id: 'log-session', label: 'Log actuals', steer: 'Logging protocol — status completed; log actuals for what Adam already lifted.', explain: 'Write down the session he already finished.' },
      { id: 'missed-day', label: 'Missed a day', steer: 'Adherence (2+ missed days → lower the bar)', explain: 'Get moving again without running the full program.' },
      { id: 'program-check', label: "How's the program", steer: 'Rotation, deload, and aesthetic bias', explain: 'Check rotation, deload, and whether the plan still fits.' },
      { id: 'form-safety', label: 'Form / safety', steer: 'Safety', explain: 'Flag pain or form before you push.' }
    ]
  },
  hyaluronica: {
    firstName: 'Hyaluronica',
    eyebrow: 'Hyaluronica can',
    pills: [
      { id: 'tonight', label: 'What to use tonight', steer: 'Advise from the Current AM/PM rotation', explain: 'Ask what belongs on tonight’s routine.' },
      { id: 'whats-on', label: "What's in my routine", steer: 'Routines and library — membership is the source of truth', explain: 'See what is actually on AM or PM right now.' },
      { id: 'add-library', label: 'Add to the library', steer: 'Routines and library', explain: 'Save a product to the shelf for later.' },
      { id: 'am-pm', label: 'AM vs PM', steer: 'Routines and library — AM/PM membership', explain: 'Sort what belongs in the morning versus night.' },
      { id: 'irritating', label: "Something's irritating", steer: 'Advise; do not invent a routine from shelf flags', explain: 'Work out what’s stinging or breaking you out.' }
    ]
  },
  sara: {
    firstName: 'Sara',
    eyebrow: 'Sara can',
    pills: [
      { id: 'read-results', label: 'Read these results', steer: 'Interpret from Medical Overview', explain: 'Walk through labs or visit notes you already have.' },
      { id: 'tracking', label: 'How am I tracking', steer: 'Weekly health scan posture', explain: 'Look at the recent body and health trend.' },
      { id: 'log-reading', label: 'Log a reading', steer: 'Logging protocol (body figures and medical visits)', explain: 'Record a weight, tape, or visit figure.' },
      { id: 'weekly-scan', label: 'Weekly scan', steer: 'Weekly health scan posture', explain: 'Do the weekly health-scan pass.' },
      { id: 'something-off', label: "Something's off", steer: 'Interpret; name concerns without catastrophising', explain: 'Name a concern without catastrophising it.' }
    ]
  },
  penelope: {
    firstName: 'Penelope',
    eyebrow: 'Penelope can',
    pills: [
      { id: 'start-diary', label: 'Start a diary', steer: 'Interview flow (every time)', explain: 'Open a fresh interview about the day.' },
      { id: 'continue', label: 'Continue', steer: 'Interview flow — continue one question at a time', explain: 'Pick up the diary questions where you left off.' },
      { id: 'on-this-day', label: 'On this day', steer: 'On this day', explain: 'Look back at what you wrote on this date before.' },
      { id: 'just-a-thought', label: 'Just a thought', steer: 'Interview flow — follow his lead, one question', explain: 'Offer one thing and let her follow it.' }
    ]
  },
  vera: {
    firstName: 'Vera',
    eyebrow: 'Vera can',
    pills: [
      { id: 'thinking-partner', label: 'Think this through', steer: 'Job — thinking partner, one open question', explain: 'Sit with a question as a thinking partner.' },
      { id: 'sit-with-this', label: 'Sit with this', steer: 'Presence — sit with it first', explain: 'Stay with the feeling instead of fixing it.' },
      { id: 'dropping-anchor', label: 'Dropping Anchor', steer: 'Dropping Anchor (ACE)', explain: 'Run the ACE grounding exercise.' },
      { id: 'close-session', label: 'Close the session', steer: 'Closing — always three parts; log mind_session if there is one', explain: 'End the hour and record it if there is one.' }
    ]
  },
  hammond: {
    firstName: 'Hammond',
    eyebrow: 'Hammond can',
    pills: [
      { id: 'whats-running', label: "What's running", steer: 'Session Triage (gateway)', explain: 'Triage what’s live across the hubs.' },
      { id: 'decision', label: 'Decision help', steer: 'Decision Priority Hierarchy (provisional)', explain: 'Work a choice through the priority hierarchy.' },
      { id: 'weekly-review', label: 'Weekly review', steer: 'Follow-on protocols — Weekly Review', explain: 'Do the weekly governance pass.' },
      { id: 'drifting', label: "Something's drifting", steer: 'Follow-on protocols — Drift', explain: 'Name a drift before it becomes a problem.' },
      { id: 'specialist', label: 'Talk to a specialist', steer: 'Specialist pattern relay', explain: 'Hand the pattern to the right specialist.' }
    ]
  },
  ann: {
    firstName: 'Ann',
    eyebrow: 'Ann can',
    pills: [
      { id: 'lesson-diagnosis', label: 'Lesson diagnosis', steer: 'Diagnose the lesson before prescribing changes', explain: 'Find the hinge that is failing before rewriting.' },
      { id: 'sharpen-explanation', label: 'Sharpen an explanation', steer: 'Tighten one teaching move', explain: 'One precise classroom repair.' },
      { id: 'check-questions', label: 'Check the questions', steer: 'Test whether questions reveal learning', explain: 'Probe the questions before adding more.' },
      { id: 'sequence-lesson', label: 'Sequence the lesson', steer: 'Make each activity earn the next', explain: 'Order the flow so the work builds.' },
      { id: 'reduce-overload', label: 'Reduce overload', steer: 'Cut load without thinning the thinking', explain: 'Simplify without dumbing down.' }
    ]
  },
  clementine: {
    firstName: 'Clementine',
    eyebrow: 'Clementine can',
    pills: [
      { id: 'find-the-claim', label: 'Find the claim', steer: 'Locate the controlling claim', explain: 'Name what the text is actually arguing.' },
      { id: 'cut-the-waffle', label: 'Cut the waffle', steer: 'Remove throat-clearing', explain: 'Strip hedges so the idea can breathe.' },
      { id: 'stress-test', label: 'Stress-test it', steer: 'Probe evidence and warrant', explain: 'Find the weakest join in the argument.' },
      { id: 'starting-block', label: 'Give me a start', steer: 'One concrete first sentence or block', explain: 'Break the blank page with one solid move.' },
      { id: 'tighten-structure', label: 'Tighten the structure', steer: 'Make the reasoning visible', explain: 'Reorder so every part has one job.' }
    ]
  },
  clare: {
    firstName: 'Clare',
    eyebrow: 'Clare can',
    pills: [
      { id: 'morning-sweep', label: 'Morning sweep', steer: 'Brief today: the one thing, then overdue, then flags', explain: 'Get the day oriented without a guilt pile.' },
      { id: 'brain-dump', label: 'Brain dump', steer: 'Now / Later / Trash, then propose Now', explain: 'Turn the chaos into the smallest honest next move.' },
      { id: 'shatter-start', label: 'Shatter start', steer: 'One-minute first move with a physical cue', explain: 'Unstick a frozen task.' },
      { id: 'time-map', label: 'Time map', steer: 'Hidden setup and wrap usually double the guess', explain: 'Make the estimate honest.' },
      { id: 'open-loops', label: 'Open loops', steer: 'Name the unfinished threads that are stealing attention', explain: 'Surface what is still open.' }
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
  ],
  ann: [
    'Reading the lesson closely…',
    'Checking the teaching move…',
    'Following the lesson sequence…',
    'Testing the question quality…',
    'Looking for the precise hinge…',
    'Marking the muddy bit…',
    'Comparing intent with activity…',
    'Checking what pupils must notice…',
    'Tracing the cognitive load…',
    'Sharpening one useful note…',
    'Keeping the repair small…',
    'Grounding this in the classroom…'
  ],
  clementine: [
    'Locating the actual claim…',
    'Removing some throat-clearing…',
    'Checking where the evidence lands…',
    'Interrogating the warrant…',
    'Finding the sentence with a spine…',
    'Untangling the argument…',
    'Reading for elegant structure…',
    'Testing the weakest paragraph…',
    'Looking past the competent summary…',
    'Rescuing the useful idea…',
    'Making the reasoning visible…',
    'Cutting what does not earn its keep…'
  ],
  clare: [
    'Sorting the dump…',
    'Finding the smallest next move…',
    'Checking the clock…',
    'Clearing the open loops…',
    'Naming what is actually Now…',
    'Parking the Later pile…',
    'Looking for the stuck point…',
    'Mapping the hidden setup time…',
    'Keeping this ADHD-honest…',
    'Shrinking the first step…',
    'Scanning overdue without the lecture…',
    'Building one confirmable change…'
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
