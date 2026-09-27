import { aggregateNutrition, getLoggingCompleteness, hasRecoveryBonus, resolveDayType } from '../core/aggregate.js';
import {
  extractAboutMe,
  extractConstraints,
  extractCrossAgentCoordination,
  extractLongTermTrends,
  extractRecentAgentActions,
  extractThisMonth,
  extractThisWeek,
  extractTodaysStatus
} from '../core/constraints.js';
import {
  buildLiveStatusProse,
  dedupeRecentActions,
  extractTodaysStatusBlock,
  mergeLiveStatusOverMarkdown,
  sanitizeCentralNode
} from '../core/central-node-write.js';
import { openGovernanceEntries } from '../core/governance-log.js';
import { getDayTargets } from '../core/targets.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';
import { buildBindingGoal } from './binding-goal.js';
import {
  buildDomainWeekly,
  buildGovernanceHeatSeries,
  parseCrossAgentEdges
} from './central-node-charts.js';
import {
  buildBoardLoops,
  buildFatSeries,
  buildHubLoad,
  buildKnowledgeTopics,
  buildMoodStrip,
  buildTrainingWeeks,
  buildWeightPoint,
  parseDepositLines,
  parseWeightTarget
} from './central-node-board.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function workoutCompleted(events, date) {
  return events.some(({ record }) => (
    record.type === 'workout' && record.date === date && record.status === 'completed'
  ));
}

function eatingTargetsForDay(events, date, targetsConfig) {
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : null;
  const proteinTarget = targets?.protein_g ?? 0;
  const fatCeiling = targets?.fat_ceiling_g ?? 0;
  const hitProtein = proteinTarget > 0 && nutrition.protein_g >= proteinTarget;
  const underFatCeiling = fatCeiling > 0 && nutrition.fat_g <= fatCeiling;

  return { date, hitEatingTargets: hitProtein && underFatCeiling };
}

function statusProseForDisplay(markdown, events, date) {
  const live = buildLiveStatusProse(events, date);
  if (!live) {
    const block = extractTodaysStatusBlock(markdown);
    if (block.dateKey && block.dateKey !== date && block.body) {
      return `${block.body}\n\n_Status stamp is ${block.dateKey}; live logs for ${date} not found._`;
    }
    return extractTodaysStatus(markdown);
  }
  const block = extractTodaysStatusBlock(markdown);
  if (block.dateKey === date && block.body) {
    return mergeLiveStatusOverMarkdown(block.body, live);
  }
  return live;
}

// Slugs used by the Cursor Automations in life-hub-data/config/automations.
const PATCH_PROPOSERS = {
  'hammond-sweep': "Hammond's daily sweep",
  'hammond-weekly': "Hammond's weekly prep",
  'hammond-monthly': "Hammond's monthly audit prep",
  'sara-scan': "Sara's weekly health scan"
};

function patchProposer(slug) {
  if (PATCH_PROPOSERS[slug]) return PATCH_PROPOSERS[slug];
  const name = String(slug ?? '').trim();
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : 'An agent';
}

const PATCH_SECTION_LABELS = {
  about_me: 'About Me',
  constraints: 'Constraints & Priorities',
  todays_status: "Today's Status",
  this_week: 'This Week',
  this_month: 'This Month',
  long_term_trends: 'Long-Term Trends',
  cross_agent: 'Cross-Agent Coordination',
  recent_actions: 'Recent Agent Actions',
  purpose: 'Purpose',
  writing_rules: 'Writing Rules',
  agent_directory: 'Agent Directory'
};

/** Queued Confirm-class Central Node patches, newest first, as Needs-you cards. */
export function buildPendingPatchCards(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(entry => typeof entry?.patch?.payload?.summary === 'string' && entry.patch.payload.summary.trim())
    .map(entry => {
      const payload = entry.patch.payload;
      return {
        id: entry.id,
        summary: payload.summary.trim(),
        proposer: patchProposer(entry.slug),
        section: PATCH_SECTION_LABELS[entry.patch.section] ?? String(entry.patch.section ?? ''),
        op: String(entry.patch.op ?? ''),
        createdAt: entry.createdAt,
        evidence: typeof entry.evidence === 'string' ? entry.evidence.trim() : '',
        text: typeof payload.text === 'string' ? payload.text : '',
        match: typeof payload.match === 'string' ? payload.match : ''
      };
    })
    .reverse();
}

export function buildCentralNodeModel({
  events,
  targetsConfig,
  centralNodeMarkdown,
  date,
  governanceLogMarkdown,
  inverseLinks,
  urlWatches,
  hubSignals,
  hiddenLoopIds,
  pendingCnPatches
}) {
  if (!date) throw new RangeError('Central Node display date is unavailable');
  const markdown = sanitizeCentralNode(centralNodeMarkdown ?? '', date);

  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);

  const week = weekDates.map(day => ({ date: day, protein_g: aggregateNutrition(events, day).protein_g }));
  const loggingMonth = monthDates.map(day => {
    const completeness = getLoggingCompleteness(events, day);
    return { date: day, complete: completeness.complete === completeness.total };
  });
  const exerciseMonth = monthDates.map(day => ({ date: day, completed: workoutCompleted(events, day) }));
  const eatingMonth = monthDates.map(day => eatingTargetsForDay(events, day, targetsConfig));

  const yearStart = `${date.slice(0, 4)}-01-01`;
  const yearDates = enumerateDateKeys(yearStart, date);
  const loggingYear = yearDates.map(day => {
    const completeness = getLoggingCompleteness(events, day);
    return { date: day, complete: completeness.complete === completeness.total };
  });
  const exerciseYear = yearDates.map(day => ({ date: day, completed: workoutCompleted(events, day) }));
  const eatingYear = yearDates.map(day => eatingTargetsForDay(events, day, targetsConfig));
  const domainWeekly = buildDomainWeekly(events, date);
  const crossAgent = parseCrossAgentEdges(extractCrossAgentCoordination(markdown));
  const governanceOpen = openGovernanceEntries(
    typeof governanceLogMarkdown === 'string' ? governanceLogMarkdown : '',
    date
  );
  const governanceHeat = buildGovernanceHeatSeries(governanceOpen, date);

  const nutrition = aggregateNutrition(events, date);
  const completeness = getLoggingCompleteness(events, date);
  const constraints = extractConstraints(markdown);
  let fatCeiling = 50;
  try {
    if (targetsConfig) {
      fatCeiling = getDayTargets(targetsConfig, date, resolveDayType(events, date), hasRecoveryBonus(events, date)).fat_ceiling_g;
    }
  } catch {
    fatCeiling = 50;
  }
  const signals = hubSignals && typeof hubSignals === 'object' ? hubSignals : {};
  const boardLoops = buildBoardLoops({
    today: date,
    governanceLogMarkdown,
    centralNodeMarkdown: markdown,
    weekFlags: signals.weekFlags,
    tasks: signals.tasks,
    hiddenIds: hiddenLoopIds
  });

  return {
    date,
    sections: {
      aboutMe: extractAboutMe(markdown),
      constraints,
      todaysStatus: statusProseForDisplay(markdown, events, date),
      thisWeek: extractThisWeek(markdown),
      thisMonth: extractThisMonth(markdown),
      longTermTrends: extractLongTermTrends(markdown),
      crossAgentCoordination: extractCrossAgentCoordination(markdown),
      recentAgentActions: dedupeRecentActions(extractRecentAgentActions(markdown))
    },
    fat: buildFatSeries(events, date, { fatCeiling }),
    weight: {
      point: buildWeightPoint(events),
      target: parseWeightTarget(constraints)
    },
    trainingWeeks: buildTrainingWeeks(events, date),
    moodStrip: buildMoodStrip(events, date),
    hubLoad: buildHubLoad({
      date,
      scheduledLessons: signals.scheduledLessons,
      tasks: signals.tasks,
      events
    }),
    knowledgeTopics: buildKnowledgeTopics(signals.knowledgePages, date),
    deposits: [
      ...parseDepositLines(extractCrossAgentCoordination(markdown)),
      ...parseDepositLines(dedupeRecentActions(extractRecentAgentActions(markdown)))
    ],
    openLoops: boardLoops.loops,
    needsYou: boardLoops.needsYou,
    pendingPatches: buildPendingPatchCards(pendingCnPatches),
    completeness,
    liveStatus: {
      completeness,
      snapshot: {
        calories: nutrition.calories,
        protein_g: nutrition.protein_g,
        fat_g: nutrition.fat_g
      }
    },
    week,
    loggingMonth,
    exerciseMonth,
    eatingMonth,
    loggingYear,
    exerciseYear,
    eatingYear,
    domainWeekly,
    crossAgent,
    governanceOpen,
    governanceHeat,
    bindingGoal: buildBindingGoal({ events, date, targetsConfig }),
    inverseLinks: inverseLinks && typeof inverseLinks === 'object'
      ? inverseLinks
      : { groups: [], status: 'ready' },
    urlWatches: urlWatches && typeof urlWatches === 'object'
      ? urlWatches
      : { watches: [], status: 'ready' }
  };
}
