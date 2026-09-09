import type { ActiveEscalation } from '@/schemas/project';

/**
 * Missing-Student Escalation Ladder — borrowed from wilderness/solo-travel
 * "dead man's switch" check-in apps: fixed tiers, computed from real elapsed
 * wall-clock time (not a JS interval) so it survives a reload mid-incident.
 */
export type EscalationTier = {
  minutes: number;
  label: string;
  what: string;
  level: 'info' | 'warn' | 'danger';
};

export const ESCALATION_TIERS: EscalationTier[] = [
  { minutes: 0, label: 'T+0', what: "Muster short — nudge the coordinator's phone", level: 'info' },
  { minutes: 3, label: 'T+3', what: 'Still short — nudge the second supervising staff member', level: 'warn' },
  {
    minutes: 7,
    label: 'T+7',
    what: 'Draft the parent + Police message with last confirmed location and time',
    level: 'danger'
  },
  { minutes: 10, label: 'T+10', what: 'Per policy — confirm and send', level: 'danger' }
];

/** Index into ESCALATION_TIERS for how far along an active escalation is right now. */
export function currentEscalationTierIndex(
  escalation: ActiveEscalation,
  now: Date = new Date()
): number {
  const startedAt = new Date(escalation.started_at).getTime();
  if (Number.isNaN(startedAt)) return 0;
  const elapsedMinutes = (now.getTime() - startedAt) / 60_000;
  let index = 0;
  for (let i = 0; i < ESCALATION_TIERS.length; i++) {
    if (elapsedMinutes >= ESCALATION_TIERS[i]!.minutes) index = i;
  }
  return index;
}

export function isEscalationAtFinalTier(escalation: ActiveEscalation, now: Date = new Date()): boolean {
  return currentEscalationTierIndex(escalation, now) === ESCALATION_TIERS.length - 1;
}
