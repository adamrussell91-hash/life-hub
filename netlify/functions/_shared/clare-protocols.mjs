export const CLARE_PROTOCOLS = [
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

export const CLARE_ADHD_PROTOCOLS = [
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

export const CLARE_PROTOCOL_IDS = new Set([
  ...CLARE_PROTOCOLS.map(item => item.id),
  ...CLARE_ADHD_PROTOCOLS.map(item => item.id)
]);

export function isBriefingProtocol(id) {
  return id === 'morning-sweep' || id === 'tomorrow-setup' || id === 'weekly-reset' || id === 'high-stakes';
}

export function isClareToolkit(id) {
  return id === 'shatter-start' || id === 'time-map' || id === 'open-loops';
}

export function readProtocolId(value) {
  return typeof value === 'string' && CLARE_PROTOCOL_IDS.has(value) ? value : undefined;
}
