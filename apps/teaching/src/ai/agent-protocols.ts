import type { AgentSlug } from '@/ai/agents';

export interface AgentProtocolPill {
  id: string;
  label: string;
  explain: string;
  steer: string;
}

export interface AgentProtocolPack {
  firstName: string;
  pills: AgentProtocolPill[];
  waitLines: string[];
}

export const AGENT_PROTOCOL_PACKS: Record<AgentSlug, AgentProtocolPack> = {
  ann: {
    firstName: 'Ann',
    pills: [
      { id: 'lesson-diagnosis', label: 'Lesson diagnosis', explain: 'Diagnose the lesson before prescribing changes.', steer: 'Diagnose the lesson before prescribing changes; ground the diagnosis in a specific activity, question, or transition.' },
      { id: 'sharpen-explanation', label: 'Sharpen an explanation', explain: 'Tighten an explanation around one precise teaching move.', steer: 'Tighten the explanation around one precise teaching move and preserve the lesson’s intent.' },
      { id: 'check-questions', label: 'Check the questions', explain: 'Test whether the questions reveal the learning you need.', steer: 'Check whether the questions expose understanding and propose only the smallest useful repair.' },
      { id: 'sequence-lesson', label: 'Sequence the lesson', explain: 'Order the activities so each one earns the next.', steer: 'Review the lesson sequence and make each activity earn the next.' },
      { id: 'reduce-overload', label: 'Reduce overload', explain: 'Simplify the lesson without thinning its intellectual work.', steer: 'Reduce unnecessary cognitive load without thinning the intellectual work.' }
    ],
    waitLines: [
      'Reading the lesson closely…',
      'Checking the teaching move…',
      'Following the lesson sequence…',
      'Testing the question quality…',
      'Looking for the precise hinge…',
      'Marking the muddy bit…',
      'Comparing intent with activity…',
      'Checking what pupils must notice…',
      'Tracing the cognitive load…',
      'Sharpening one useful note…'
    ]
  },
  clementine: {
    firstName: 'Clementine',
    pills: [
      { id: 'find-the-claim', label: 'Find the claim', explain: 'Locate the idea the lesson or assessment is actually arguing.', steer: 'Locate the controlling claim, name it plainly, and organise the response around it.' },
      { id: 'cut-the-waffle', label: 'Cut the waffle', explain: 'Remove hedging and throat-clearing so the idea can breathe.', steer: 'Cut throat-clearing, vague hedges, and summary that is pretending to be argument.' },
      { id: 'stress-test', label: 'Stress-test it', explain: 'Probe the evidence, warrant, and structure for weak joins.', steer: 'Stress-test the evidence, warrant, and structure, then name the most consequential weak join.' },
      { id: 'starting-block', label: 'Give me a start', explain: 'Create a concrete first sentence or block to break the blank page.', steer: 'Break starting paralysis with one concrete sentence or lesson block Adam can react to.' },
      { id: 'tighten-structure', label: 'Tighten the structure', explain: 'Reorder the material so the reasoning becomes visible.', steer: 'Reorder the material so the reasoning is visible and every part has one job.' }
    ],
    waitLines: [
      'Locating the actual claim…',
      'Removing some throat-clearing…',
      'Checking where the evidence lands…',
      'Interrogating the warrant…',
      'Finding the sentence with a spine…',
      'Untangling the argument…',
      'Reading for elegant structure…',
      'Testing the weakest paragraph…',
      'Looking past the competent summary…',
      'Rescuing the useful idea…'
    ]
  },
  hammond: {
    firstName: 'Hammond',
    pills: [
      { id: 'teaching-sitrep', label: 'Teaching sitrep', explain: 'Triage what is live in the lesson and what needs attention.', steer: 'Give a concise teaching sitrep: what we know, what needs attention, and what can wait.' },
      { id: 'make-the-call', label: 'Make the call', explain: 'Choose one direction when the lesson has competing priorities.', steer: 'Make one clear strategic call between the competing teaching priorities.' },
      { id: 'set-next-move', label: 'Set the next move', explain: 'Name the single next action that closes the biggest gap.', steer: 'Name the single next move that closes the largest practical gap.' },
      { id: 'alignment-check', label: 'Alignment check', explain: 'Check that the lesson activity serves the intended outcome.', steer: 'Check alignment between the intended outcome, the activity, and the evidence of learning.' }
    ],
    waitLines: [
      'Reviewing the teaching brief…',
      'Taking the lesson sitrep…',
      'Checking the objective…',
      'Assessing the field…',
      'Mapping the next move…',
      'Weighing the priorities…',
      'Checking lesson alignment…',
      'Reading the mission log…',
      'Identifying the decisive point…',
      'Holding the line on scope…'
    ]
  },
  clare: {
    firstName: 'Clare',
    pills: [
      { id: 'untangle-this', label: 'Untangle this', explain: 'Turn a messy teaching thought into a clear shape.', steer: 'Untangle the brain dump, preserve what matters, and give it a clear shape.' },
      { id: 'order-the-steps', label: 'Order the steps', explain: 'Put the teaching actions into a workable sequence.', steer: 'Sequence the teaching actions in the order Adam can actually do them.' },
      { id: 'shrink-first-step', label: 'Shrink the first step', explain: 'Reduce the starting move until it is almost impossible to avoid.', steer: 'Break paralysis by shrinking the first step to a concrete action that takes only a few minutes.' },
      { id: 'tighten-instructions', label: 'Tighten instructions', explain: 'Make student instructions shorter, clearer, and harder to misread.', steer: 'Tighten the student instructions while preserving the intended task.' },
      { id: 'make-checklist', label: 'Make a checklist', explain: 'Turn the moving parts into a compact action checklist.', steer: 'Convert the moving parts into a short, ordered checklist using a review-only or schema-valid proposal.' }
    ],
    waitLines: [
      'Catching the loose ends…',
      'Turning the brain dump right-side up…',
      'Finding the first tiny step…',
      'Putting the chaos in order…',
      'Shortening the instruction avalanche…',
      'Making the list behave…',
      'Sorting urgent from merely loud…',
      'Pinning down the next move…',
      'De-tangling the lesson bits…',
      'Putting the competent core to work…'
    ]
  }
};

export function protocolsForAgent(slug: AgentSlug): AgentProtocolPack {
  return AGENT_PROTOCOL_PACKS[slug];
}

export function findAgentProtocol(slug: AgentSlug, protocolId?: string): AgentProtocolPill | null {
  if (!protocolId) return null;
  return protocolsForAgent(slug).pills.find((pill) => pill.id === protocolId) ?? null;
}

export function protocolSteerBlock(slug: AgentSlug, protocolId?: string): string {
  const pill = findAgentProtocol(slug, protocolId);
  if (!pill) return '';
  return [
    `Adam chose the "${pill.label}" move for this turn.`,
    `Run the ${pill.label} protocol in character from your first word.`,
    pill.steer,
    'Do not narrate routing, describe the protocol, or claim the lesson has already changed.'
  ].join(' ');
}

export function pickAgentWaitLine(
  slug: AgentSlug,
  { exclude, random = Math.random }: { exclude?: string; random?: () => number } = {}
): string {
  const lines = protocolsForAgent(slug).waitLines;
  const pool = exclude ? lines.filter((line) => line !== exclude) : lines;
  const choices = pool.length ? pool : lines;
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index]!;
}
