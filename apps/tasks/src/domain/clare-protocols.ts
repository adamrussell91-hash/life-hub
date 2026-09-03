export type ClareSprintId =
  | 'morning-sweep'
  | 'tomorrow-setup'
  | 'weekly-reset'
  | 'high-stakes'
  | 'shrink-first-step';

export type ClareToolkitId = 'shatter-start' | 'time-map' | 'open-loops';

export type ClareProtocolId = ClareSprintId | ClareToolkitId;

export type ClareProtocol = {
  id: ClareProtocolId;
  label: string;
  explain: string;
};

/** Named sprints from Clare’s operating manual. */
export const CLARE_PROTOCOLS: readonly ClareProtocol[] = [
  {
    id: 'morning-sweep',
    label: 'Morning sweep',
    explain: 'Clare briefs today: the one thing that matters, then overdue, then flags.'
  },
  {
    id: 'tomorrow-setup',
    label: 'Tomorrow',
    explain: 'Clare lays out tomorrow and asks what from today should carry forward.'
  },
  {
    id: 'weekly-reset',
    label: 'Weekly reset',
    explain: 'Clare names the crunch days and the overdue items that need a decision.'
  },
  {
    id: 'high-stakes',
    label: 'High-stakes',
    explain: 'Clare surfaces the deadline that has not moved, without a lecture.'
  },
  {
    id: 'shrink-first-step',
    label: 'Shrink first move',
    explain: 'Clare turns the dump into the smallest honest first move you can start.'
  }
];

/** ADHD executive-function tools. Run from a dump, not as a silent write. */
export const CLARE_ADHD_PROTOCOLS: readonly ClareProtocol[] = [
  {
    id: 'shatter-start',
    label: 'Shatter this',
    explain: 'Clare breaks a stuck task into a one-minute first move with a physical cue.'
  },
  {
    id: 'time-map',
    label: 'Time map',
    explain: 'Clare names the hidden sub-tasks that usually blow the estimate.'
  },
  {
    id: 'open-loops',
    label: 'Open loops',
    explain: 'Clare sorts the dump into Now, Later, and Trash, then proposes Now.'
  }
];

export function isClareSprint(id: ClareProtocolId | undefined): id is ClareSprintId {
  return (
    id === 'morning-sweep' ||
    id === 'tomorrow-setup' ||
    id === 'weekly-reset' ||
    id === 'high-stakes' ||
    id === 'shrink-first-step'
  );
}

export function isClareToolkit(id: ClareProtocolId | undefined): id is ClareToolkitId {
  return id === 'shatter-start' || id === 'time-map' || id === 'open-loops';
}

export function isBriefingProtocol(id: ClareProtocolId | undefined): boolean {
  return (
    id === 'morning-sweep' ||
    id === 'tomorrow-setup' ||
    id === 'weekly-reset' ||
    id === 'high-stakes'
  );
}

export const CLARE_WAIT_LINES = [
  'Untangling the moving parts…',
  'Putting a timer on the chaos…',
  'Checking where this could pinch…',
  'Finding the smallest honest first move…',
  'Measuring the task against the week…',
  'Testing the estimate for wishful thinking…',
  'Choosing a framework that earns its keep…',
  'Separating urgent from merely noisy…',
  'Looking for effort hiding in the seams…',
  'Turning the knot into a next action…',
  'Checking the deadline has enough runway…',
  'Making the plan smaller and truer…'
] as const;
