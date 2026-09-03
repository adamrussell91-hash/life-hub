import type { ChatAgent } from '@/chat/agents';
import type { StressFlag } from '@/schemas/stress';

function flagLines(flags: StressFlag[]): string[] {
  return flags.slice(0, 5).map((flag) => {
    const note = flag.recurrence_note ? ` ${flag.recurrence_note}` : '';
    return `- ${flag.pattern_description}${note}`;
  });
}

/** In-character sitrep from a network agent's StressFlag inbox. */
export function networkBriefing(
  agent: ChatAgent,
  flags: StressFlag[],
  {
    userText,
    protocolId
  }: {
    userText?: string;
    protocolId?: string;
  } = {}
): string {
  const lines = flagLines(flags);
  const heard = userText?.trim();

  if (agent.slug === 'hammond') {
    const lead = heard
      ? `Heard. ${heard.length > 80 ? 'I have the note.' : `“${heard}”`}`
      : protocolId === 'year-on-year'
        ? 'Year-on-year pass.'
        : protocolId === 'drifting'
          ? 'Drift check.'
          : protocolId === 'specialist'
            ? 'Specialist relay.'
            : 'Sitrep.';
    if (!flags.length) {
      return [
        lead,
        'Inbox is clear. Quiet is either a gift or a blind spot.',
        protocolId === 'specialist'
          ? 'No texture to hand on. Clare, Penelope, and Vera stay dark until something routes.'
          : 'What do you want to look at?'
      ].join('\n');
    }
    const closer =
      protocolId === 'specialist'
        ? 'Penelope has the diary layer. Vera has the interior. I keep the year-on-year board.'
        : protocolId === 'year-on-year'
          ? 'If a collision keeps returning, that is the mission — not the next due date.'
          : 'That is what Clare routed. Name the call, or leave it with me.';
    return [lead, '**On the board**', ...lines, closer].join('\n');
  }

  if (agent.slug === 'penelope') {
    const lead = heard
      ? `Darling, I have that. ${heard}`
      : protocolId === 'check-in'
        ? 'A check-in, then.'
        : 'The daybook is open.';
    if (!flags.length) {
      return [
        lead,
        'No pressure flags on my desk. The page is blank, which is either peace or a skipped entry.',
        'Tell me the texture anyway — one scene will do.'
      ].join('\n');
    }
    return [
      lead,
      '**Texture Clare sent over**',
      ...lines,
      protocolId === 'check-in'
        ? 'If any of that is still in your body tonight, write it. I will not tidy it into a task.'
        : 'That is the weather on my desk. What do you actually want on the page?'
    ].join('\n');
  }

  const lead = heard
    ? `I heard you. ${heard}`
    : protocolId === 'think-this-through'
      ? 'Let us look at the load, not the list.'
      : 'We can sit with this.';
  if (!flags.length) {
    return [
      lead,
      'Nothing is routed to me yet. If the pressure is sitting under the work, we can look at that without turning it into a task.'
    ].join('\n');
  }
  return [
    lead,
    '**What keeps arriving**',
    ...lines,
    protocolId === 'think-this-through'
      ? 'The pattern is the load, not any one deadline. What do you notice in your body when you read that?'
      : 'We do not have to fix it in this turn. Name what is true, then stop.'
  ].join('\n');
}
