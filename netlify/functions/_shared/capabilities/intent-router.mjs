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
    ids: ['publish.surface-widget', 'plan.week-meals'],
    patterns: [/meal plan widget/i, /week(?:ly)? meal/i, /on the nutrition tab/i]
  },
  {
    ids: ['track.close-challenge'],
    patterns: [/close (?:the |this )?challenge/i, /challenge verdict/i, /dispute (?:the )?judge/i]
  },
  {
    ids: ['remember.note-context', 'coordinate.request-cn-write'],
    patterns: [/loan (?:a )?capacity/i, /borrow (?:from|capacity)/i, /ask (?:chadwick|brisket|hammond|sara) to/i]
  },
  {
    ids: ['lookup.save-food-library', 'lookup.food-brand-au'],
    patterns: [/food library/i, /save (?:to |this )?(?:brand|product)/i, /fsanz/i, /woolworths/i, /coles/i]
  },
  {
    ids: ['lookup.save-exercise-library'],
    patterns: [/exercise library/i, /save (?:this )?exercise/i]
  },
  {
    ids: ['research.save-brief', 'research.expiring-brief'],
    patterns: [/look(?:ed|ing)? up/i, /research/i, /save (?:this|a) brief/i, /artifact/i, /clinical/i]
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
  },
  {
    ids: ['intuition.edit-pack'],
    patterns: [/intuition/i, /standing prior/i, /update (?:the )?flare/i, /remember that going forward/i]
  },
  {
    ids: ['os.promote-shortcut'],
    patterns: [/promote (?:this |that )?(?:to )?(?:a )?shortcut/i, /make (?:this|that) a (?:named )?shortcut/i, /named capacity/i]
  },
  {
    ids: ['os.list-promoted-shortcuts', 'os.run-promoted-shortcut'],
    patterns: [/promoted shortcut/i, /run (?:the |that |a )?promoted/i, /list promoted/i, /catalogued shortcut/i]
  },
  {
    ids: ['tasks.create', 'tasks.update'],
    patterns: [
      /\b(?:add|create|write|make|capture|log)\b.{0,48}\b(?:task|tasks|todo|to-do|item)/i,
      /\b(?:task|tasks|todo|appraisal)\b/i,
      /brain ?dump/i,
      /\bi (?:need|have) to\b/i,
      /\badd (?:these|this|a)\b/i,
      /\bupdate (?:the |this |my )?task\b/i,
      /\bappend\b/i
    ]
  }
];

/** Domain write shortcuts that stay attached whenever the agent owns them. */
const PINNED_CAPABILITY_IDS = ['tasks.create', 'tasks.update'];

/**
 * Same-call intent pass (locked decision): narrow shortcuts from the user
 * message; always keep os.propose-action.
 */
export function selectCapabilityIdsForTurn({ slug, message, maxShortcuts = 8 } = {}) {
  const all = capabilityIdsForAgent(slug);
  const always = ['os.propose-action', 'os.capability-scoreboard'].filter(id => all.includes(id));
  const pinned = PINNED_CAPABILITY_IDS.filter(id => all.includes(id));
  const selected = new Set([...always, ...pinned]);

  const text = typeof message === 'string' ? message : '';
  for (const hint of KEYWORD_HINTS) {
    if (!hint.patterns.some(re => re.test(text))) continue;
    for (const id of hint.ids) {
      if (all.includes(id)) selected.add(id);
    }
  }

  // Domain defaults when nothing matched beyond always-on + pinned writes.
  if (selected.size <= always.length + pinned.length) {
    for (const id of all) {
      if (id.startsWith('log.') || id.startsWith('lookup.save') || id.startsWith('tasks.')) selected.add(id);
    }
  }

  const ordered = all.filter(id => selected.has(id));
  const propose = ordered.filter(id => id === 'os.propose-action');
  const keep = new Set([...always, ...pinned]);
  const restKeep = ordered.filter(id => keep.has(id) && id !== 'os.propose-action');
  const restOther = ordered
    .filter(id => id !== 'os.propose-action' && !keep.has(id))
    .slice(0, Math.max(0, maxShortcuts - restKeep.length));
  return [...propose, ...restKeep, ...restOther];
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
