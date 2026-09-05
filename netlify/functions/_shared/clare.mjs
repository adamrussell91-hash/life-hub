import { dumpVoiceLine } from './clare-dump.mjs';
import {
  buildOpenLoopsToolkit,
  buildShatterToolkit,
  buildTimeMapToolkit,
  sortOpenLoops,
  buildOpenLoopsChoice
} from './clare-desk.mjs';

export const CLARE_DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
export const CLARE_CALIBRATION_PREFIX = 'clare_calibration/';
export const CLARE_CALIBRATIONS_INDEX = 'clare_calibration/_index';
export const CLARE_NEGOTIATION_PREFIX = 'clare_negotiations/';
export const FRAMEWORK_PREFIX = 'frameworks/';

const BASE_BY_DOMAIN = {
  teaching: 60,
  life: 30,
  wedding: 45,
  health: 30,
  other: 40
};
const MAX_DELTAS = 20;

export const DEFAULT_FRAMEWORKS = [
  {
    id: 'fw_timeboxing',
    name: 'Timeboxing',
    reasoning_template: 'Timebox this and stop at the bell.'
  },
  {
    id: 'fw_eat_the_frog',
    name: 'Eat the frog',
    reasoning_template: 'Do the ugliest piece first so the rest of the day is lighter.'
  },
  {
    id: 'fw_eisenhower',
    name: 'Eisenhower',
    reasoning_template: 'Sort urgent vs important before you spend the hour.'
  }
];

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function includesAny(hay, needles) {
  return needles.some(n => hay.includes(n));
}

export function selectFramework(input, frameworks) {
  const byId = new Map(frameworks.map(item => [item.id, item]));
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  const backlogHit = input.backlog_titles?.some(title => title.toLowerCase() === input.title.trim().toLowerCase()) ?? false;
  let id = 'fw_timeboxing';
  let reasoningExtra = '';
  if (backlogHit || includesAny(text, ['overdue', 'sitting', 'still not', 'keep putting', 'procrast', 'frog'])) {
    id = 'fw_eat_the_frog';
    reasoningExtra = backlogHit ? ' It is already on the backlog without a due date.' : '';
  } else if (includesAny(text, ['decide', 'priority', 'urgent vs', 'important', 'triage', 'which first'])) {
    id = 'fw_eisenhower';
  } else if (includesAny(text, ['marking', 'write', 'draft', 'research', 'plan', 'open-ended', 'essay'])) {
    id = 'fw_timeboxing';
  } else if (input.priority === 'urgent' || input.priority === 'high') {
    id = 'fw_eat_the_frog';
  } else if (input.domain === 'wedding' || input.domain === 'life') {
    id = 'fw_eisenhower';
  }
  const framework = byId.get(id) ?? frameworks[0];
  if (!framework) throw new Error('Framework library is empty');
  return { framework, reasoning: framework.reasoning_template + reasoningExtra };
}

export function baseEstimateMinutes(input) {
  let minutes = BASE_BY_DOMAIN[input.domain] ?? 40;
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  if (includesAny(text, ['marking', 'batch'])) minutes += 30;
  if (includesAny(text, ['lesson', 'pack', 'unit'])) minutes += 25;
  if (includesAny(text, ['email', 'reply', 'quick'])) minutes = Math.max(15, minutes - 25);
  if (includesAny(text, ['meeting', 'call'])) minutes = 30;
  if (input.priority === 'urgent') minutes = Math.round(minutes * 0.85);
  return Math.max(15, Math.round(minutes / 5) * 5);
}

export function applyCalibration(baseMinutes, calibration) {
  if (!calibration || calibration.sample_count < 2) {
    return {
      minutes: baseMinutes,
      note: calibration ? 'Estimate will get sharper the more you use Clare.' : null
    };
  }
  const bias = avg(calibration.recent_deltas ?? []);
  const calibrated = Math.max(
    15,
    Math.round((calibration.calibrated_default_minutes + baseMinutes + bias) / 2 / 5) * 5
  );
  const note = bias > 5
    ? `You usually add about ${Math.round(bias)} minutes to my guesses in ${calibration.domain}.`
    : bias < -5
      ? `You usually trim about ${Math.round(Math.abs(bias))} minutes off my guesses in ${calibration.domain}.`
      : `My ${calibration.domain} guesses have been close lately.`;
  return { minutes: calibrated, note };
}

export function buildProposal(input, frameworks, calibration) {
  const { framework, reasoning } = selectFramework(input, frameworks);
  const base = baseEstimateMinutes(input);
  const { minutes, note } = applyCalibration(base, calibration);
  let proposedMinutes = minutes;
  let protocolReasoning = reasoning;
  switch (input.protocol_id) {
    case 'shrink-first-step':
      proposedMinutes = Math.min(25, proposedMinutes);
      protocolReasoning += ' Start with one small first move, then decide whether the rest deserves another block.';
      break;
    case 'shatter-start':
      proposedMinutes = Math.min(15, proposedMinutes);
      protocolReasoning += ' Sixty seconds, one physical cue — then we talk about the rest.';
      break;
    case 'time-map':
      proposedMinutes = Math.max(proposedMinutes, Math.round((minutes * 2) / 5) * 5);
      protocolReasoning += ' Time map: hidden setup and wrap almost always double the honest guess.';
      break;
    case 'high-stakes':
      protocolReasoning += input.due_date
        ? ` High-stakes: ${input.due_date} is close and this has not moved.`
        : ' High-stakes: name the finish line or it will keep sliding.';
      break;
    case 'open-loops':
      protocolReasoning += ' This is a Now item — one next action, not a new guilt pile.';
      break;
    default:
      break;
  }
  return {
    title: input.title.trim(),
    domain: input.domain,
    description: input.description?.trim() ?? '',
    priority: input.priority ?? 'medium',
    due_date: input.due_date ?? null,
    parent_project_id: input.parent_project_id ?? null,
    framework_id: framework.id,
    framework_name: framework.name,
    reasoning: protocolReasoning,
    proposed_minutes: proposedMinutes,
    suggested_accepted_minutes: proposedMinutes,
    calibration_note: note,
    protocol_id: input.protocol_id
  };
}

export function emptyCalibration(domain, nowIso) {
  return {
    schema_version: 1,
    id: `clare_cal_${domain}`,
    domain,
    sample_count: 0,
    sum_proposed: 0,
    sum_accepted: 0,
    actual_sample_count: 0,
    sum_actual: 0,
    recent_deltas: [],
    calibrated_default_minutes: BASE_BY_DOMAIN[domain] ?? 40,
    updated_at: nowIso
  };
}

export function recordNegotiationSample(calibration, proposed, accepted, nowIso) {
  const delta = accepted - proposed;
  const recent = [...(calibration.recent_deltas ?? []), delta].slice(-MAX_DELTAS);
  const sample_count = calibration.sample_count + 1;
  const sum_proposed = calibration.sum_proposed + proposed;
  const sum_accepted = calibration.sum_accepted + accepted;
  const meanAccepted = sum_accepted / sample_count;
  const bias = avg(recent);
  return {
    ...calibration,
    sample_count,
    sum_proposed,
    sum_accepted,
    recent_deltas: recent,
    calibrated_default_minutes: Math.max(15, Math.round((meanAccepted + bias) / 5) * 5),
    updated_at: nowIso
  };
}

export function recordActualSample(calibration, estimated, actual, nowIso) {
  const actual_sample_count = calibration.actual_sample_count + 1;
  const sum_actual = calibration.sum_actual + actual;
  const meanActual = sum_actual / actual_sample_count;
  const drift = actual - estimated;
  const recent = [...(calibration.recent_deltas ?? []), drift].slice(-MAX_DELTAS);
  return {
    ...calibration,
    actual_sample_count,
    sum_actual,
    recent_deltas: recent,
    calibrated_default_minutes: Math.max(15, Math.round((meanActual + avg(recent)) / 5) * 5),
    updated_at: nowIso
  };
}

export function backlogTitles(tasks) {
  return (tasks ?? [])
    .filter(task => (task.status === 'open' || task.status === 'deferred') && !task.due_date)
    .map(task => task.title)
    .filter(Boolean);
}

function proposalFromDumpItem(item, frameworks, calibration, protocolId) {
  const proposal = buildProposal(
    {
      title: item.title,
      domain: item.domain,
      priority: item.priority,
      due_date: item.due_date,
      parent_project_id: item.parent_project_id,
      protocol_id: protocolId
    },
    frameworks,
    calibration
  );
  return {
    ...proposal,
    dump_kind: item.kind,
    question: item.question
  };
}

function isActionableDump(item) {
  return item.kind !== 'note' && item.kind !== 'meta' && item.actionable !== false;
}

export function assembleDumpResult(
  items,
  frameworks,
  calibrationFor,
  protocolId,
  agent = 'clare'
) {
  const questions = [];
  const notes = [];
  let working = items;

  if (protocolId === 'open-loops') {
    const loops = sortOpenLoops(items);
    working = loops.now;
    for (const item of loops.later) notes.push(`Later: ${item.title}`);
    for (const item of loops.trash) notes.push(`Trash: ${item.title}`);
  }

  if (protocolId === 'shatter-start') {
    const first = working.find(item => isActionableDump(item)) ?? working[0];
    working = first ? [first] : [];
  }

  const proposals = [];
  for (const item of working) {
    if (item.kind === 'meta' || !item.actionable) continue;
    if (item.kind === 'note') {
      notes.push(item.title);
      if (item.question) questions.push(item.question);
      continue;
    }
    if (item.existing_title) {
      if (item.question) questions.push(item.question);
      continue;
    }
    proposals.push(proposalFromDumpItem(item, frameworks, calibrationFor(item.domain), protocolId));
    if (item.question) questions.push(item.question);
  }

  let toolkit = null;
  const focus = items.find(item => isActionableDump(item)) ?? items[0];
  if (protocolId === 'shatter-start' && focus) toolkit = buildShatterToolkit(focus);
  if (protocolId === 'time-map' && focus) {
    toolkit = buildTimeMapToolkit(focus, proposals[0]?.proposed_minutes ?? 45);
  }
  if (protocolId === 'open-loops') toolkit = buildOpenLoopsToolkit(items);

  const choice = protocolId === 'open-loops' ? buildOpenLoopsChoice(items) : null;

  return {
    voice: dumpVoiceLine(items),
    proposals,
    questions,
    notes,
    toolkit,
    mutations: [],
    agent,
    ...(choice ? { choice } : {})
  };
}
