import { capabilityIdsForAgent, loadCapability } from './registry.mjs';

const KEYWORD_HINTS = [
  {
    ids: ['track.open-challenge', 'track.log-progress', 'track.close-challenge'],
    patterns: [/challenge/i, /tracker/i, /streak/i, /no sugar/i, /sugar[- ]free/i, /week of/i]
  },
  {
    ids: ['remember.set-week-flag', 'remember.note-context'],
    patterns: [/remember/i, /\bflag\b/i, /traveling/i, /this week/i, /note that/i]
  },
  {
    ids: ['research.save-brief', 'research.expiring-brief'],
    patterns: [/look(?:ed|ing)? up/i, /research/i, /save (?:this|a) brief/i, /artifact/i]
  },
  {
    ids: ['publish.surface-widget'],
    patterns: [/widget/i, /progress bar/i, /on the (nutrition|fitness|mind|body) tab/i]
  },
  {
    ids: ['coordinate.request-cn-write'],
    patterns: [/central node/i, /\bcn\b/i, /tell hammond/i, /cross[- ]agent/i]
  },
  {
    ids: ['plan.week-meals'],
    patterns: [/meal plan/i, /plan (?:the |my )?week/i, /marley spoon/i]
  },
  {
    ids: ['lookup.food-brand-au', 'lookup.save-food-library', 'log.entry'],
    patterns: [/log (?:my |a )?meal/i, /calories/i, /macros/i, /\bate\b/i, /food library/i]
  },
  {
    ids: ['log.entry', 'lookup.save-exercise-library'],
    patterns: [/workout/i, /session/i, /log (?:my )?sets/i]
  },
  {
    ids: ['publish.cn-patch', 'publish.governance-log-entry'],
    patterns: [/audit/i, /governance/i, /weekly review/i]
  },
  {
    ids: ['os.capability-scoreboard'],
    patterns: [/what can you (?:do|actually)/i, /your (?:tools|capabilities|capacities)/i, /scoreboard/i]
  }
];

/**
 * Same-call intent pass (locked decision): narrow shortcuts from the user
 * message; always keep os.propose-action.
 */
export function selectCapabilityIdsForTurn({ slug, message, maxShortcuts = 8 } = {}) {
  const all = capabilityIdsForAgent(slug);
  const always = ['os.propose-action', 'os.capability-scoreboard'].filter(id => all.includes(id));
  const selected = new Set(always);

  const text = typeof message === 'string' ? message : '';
  for (const hint of KEYWORD_HINTS) {
    if (!hint.patterns.some(re => re.test(text))) continue;
    for (const id of hint.ids) {
      if (all.includes(id)) selected.add(id);
    }
  }

  // Domain defaults when nothing matched beyond always-on.
  if (selected.size <= always.length) {
    for (const id of all) {
      if (id.startsWith('log.') || id.startsWith('lookup.save')) selected.add(id);
    }
  }

  const ordered = all.filter(id => selected.has(id));
  const propose = ordered.filter(id => id === 'os.propose-action');
  const rest = ordered.filter(id => id !== 'os.propose-action').slice(0, maxShortcuts);
  return [...propose, ...rest];
}

export function scoreboardForAgent(slug, { message } = {}) {
  return selectCapabilityIdsForTurn({ slug, message }).map(id => {
    const def = loadCapability(id);
    return {
      id,
      risk: def?.risk ?? 'confirm',
      one_liner: def?.prompt_one_liner ?? id
    };
  });
}
