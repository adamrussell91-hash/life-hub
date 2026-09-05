import type { FrameworkEntry } from '@/schemas/templates';
import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { ClareCalibration } from '@/schemas/clare';
import type { ClareJudgedProposalRow } from '@/ai/clare-proposal-judge';
import type { ClareProtocolId } from '@/domain/clare-protocols';
import type { DumpItem, DumpKind } from '@/domain/clare-dump';
import { dumpVoiceLine, duplicateOnBoardQuestion } from '@/domain/clare-dump';
import type { AgentMutation } from '@/domain/agent-mutations';
import type { AgentProtocolSlug } from '@/domain/agent-protocol';
import {
  buildBodyDoubleToolkit,
  buildContextSwitchToolkit,
  buildDopamineMenuToolkit,
  buildInterestFilterToolkit,
  buildOpenLoopsToolkit,
  buildShatterToolkit,
  buildTimeMapToolkit,
  sortOpenLoops,
  type ClareToolkitResult
} from '@/domain/clare-desk';

export type ClareProposalInput = {
  title: string;
  domain: TaskDomain;
  description?: string;
  priority?: TaskPriority;
  due_date?: string | null;
  parent_project_id?: string | null;
  /** Open backlog titles used to detect “sitting untouched” patterns. */
  backlog_titles?: string[];
  protocol_id?: ClareProtocolId;
};

export type ClareFrameworkPick = {
  framework: FrameworkEntry;
  reasoning: string;
};

export type ClareProposal = {
  title: string;
  domain: TaskDomain;
  description: string;
  priority: TaskPriority;
  due_date: string | null;
  parent_project_id: string | null;
  framework_id: string;
  framework_name: string;
  reasoning: string;
  proposed_minutes: number;
  /** Starting point for Adam’s counter — same as proposed until he edits. */
  suggested_accepted_minutes: number;
  calibration_note: string | null;
  protocol_id?: ClareProtocolId;
  dump_kind?: DumpKind;
  question?: string | null;
};

const BASE_BY_DOMAIN: Record<string, number> = {
  teaching: 60,
  life: 30,
  wedding: 45,
  health: 30,
  other: 40
};

function baseMinutesForDomain(domain: TaskDomain): number {
  return BASE_BY_DOMAIN[domain] ?? 40;
}

const MAX_DELTAS = 20;

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

/** Pick a framework and fill its reasoning template with task texture. */
export function selectFramework(
  input: ClareProposalInput,
  frameworks: FrameworkEntry[]
): ClareFrameworkPick {
  const byId = new Map(frameworks.map((f) => [f.id, f]));
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  const backlogHit =
    input.backlog_titles?.some((t) => t.toLowerCase() === input.title.trim().toLowerCase()) ??
    false;

  let id = 'fw_timeboxing';
  let reasoningExtra = '';

  if (
    backlogHit ||
    includesAny(text, ['overdue', 'sitting', 'still not', 'keep putting', 'procrast', 'frog'])
  ) {
    id = 'fw_eat_the_frog';
    reasoningExtra = backlogHit
      ? ' It is already on the backlog without a due date.'
      : '';
  } else if (
    includesAny(text, ['decide', 'priority', 'urgent vs', 'important', 'triage', 'which first'])
  ) {
    id = 'fw_eisenhower';
  } else if (
    includesAny(text, ['marking', 'write', 'draft', 'research', 'plan', 'open-ended', 'essay'])
  ) {
    id = 'fw_timeboxing';
  } else if (input.priority === 'urgent' || input.priority === 'high') {
    id = 'fw_eat_the_frog';
  } else if (input.domain === 'wedding' || input.domain === 'life') {
    id = 'fw_eisenhower';
  }

  const framework = byId.get(id) ?? frameworks[0];
  if (!framework) {
    throw new Error('Framework library is empty');
  }

  const reasoning = framework.reasoning_template + reasoningExtra;
  return { framework, reasoning };
}

export function baseEstimateMinutes(input: ClareProposalInput): number {
  let minutes = baseMinutesForDomain(input.domain);
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  if (includesAny(text, ['marking', 'batch'])) minutes += 30;
  if (includesAny(text, ['lesson', 'pack', 'unit'])) minutes += 25;
  if (includesAny(text, ['email', 'reply', 'quick'])) minutes = Math.max(15, minutes - 25);
  if (includesAny(text, ['meeting', 'call'])) minutes = 30;
  if (input.priority === 'urgent') minutes = Math.round(minutes * 0.85);
  return Math.max(15, Math.round(minutes / 5) * 5);
}

export function applyCalibration(
  baseMinutes: number,
  calibration: ClareCalibration | null
): { minutes: number; note: string | null } {
  if (!calibration || calibration.sample_count < 2) {
    return {
      minutes: baseMinutes,
      note: calibration
        ? 'Estimate will get sharper the more you use Clare.'
        : null
    };
  }
  const bias = avg(calibration.recent_deltas);
  const calibrated = Math.max(
    15,
    Math.round((calibration.calibrated_default_minutes + baseMinutes + bias) / 2 / 5) * 5
  );
  const note =
    bias > 5
      ? `You usually add about ${Math.round(bias)} minutes to my guesses in ${calibration.domain}.`
      : bias < -5
        ? `You usually trim about ${Math.round(Math.abs(bias))} minutes off my guesses in ${calibration.domain}.`
        : `My ${calibration.domain} guesses have been close lately.`;
  return { minutes: calibrated, note };
}

export function applyProtocolToProposal(
  proposal: ClareProposal,
  protocolId?: ClareProtocolId
): ClareProposal {
  if (!protocolId) return proposal;
  let proposedMinutes = proposal.proposed_minutes;
  let protocolReasoning = proposal.reasoning;
  switch (protocolId) {
    case 'shrink-first-step':
      proposedMinutes = Math.min(25, proposedMinutes);
      protocolReasoning += ' Start with one small first move, then decide whether the rest deserves another block.';
      break;
    case 'shatter-start':
      proposedMinutes = Math.min(15, proposedMinutes);
      protocolReasoning += ' Sixty seconds, one physical cue — then we talk about the rest.';
      break;
    case 'time-map':
      proposedMinutes = Math.max(proposedMinutes, Math.round((proposedMinutes * 2) / 5) * 5);
      protocolReasoning += ' Time map: hidden setup and wrap almost always double the honest guess.';
      break;
    case 'high-stakes':
      protocolReasoning += proposal.due_date
        ? ` High-stakes: ${proposal.due_date} is close and this has not moved.`
        : ' High-stakes: name the finish line or it will keep sliding.';
      break;
    case 'open-loops':
      protocolReasoning += ' This is a Now item — one next action, not a new guilt pile.';
      break;
    default:
      break;
  }
  return {
    ...proposal,
    proposed_minutes: proposedMinutes,
    suggested_accepted_minutes: proposedMinutes,
    reasoning: protocolReasoning,
    protocol_id: protocolId
  };
}

export function buildProposal(
  input: ClareProposalInput,
  frameworks: FrameworkEntry[],
  calibration: ClareCalibration | null
): ClareProposal {
  const { framework, reasoning } = selectFramework(input, frameworks);
  const base = baseEstimateMinutes(input);
  const { minutes, note } = applyCalibration(base, calibration);
  const proposal = applyProtocolToProposal(
    {
      title: input.title.trim(),
      domain: input.domain,
      description: input.description?.trim() ?? '',
      priority: input.priority ?? 'medium',
      due_date: input.due_date ?? null,
      parent_project_id: input.parent_project_id ?? null,
      framework_id: framework.id,
      framework_name: framework.name,
      reasoning,
      proposed_minutes: minutes,
      suggested_accepted_minutes: minutes,
      calibration_note: note,
      protocol_id: input.protocol_id
    },
    input.protocol_id
  );
  return proposal;
}

export function emptyCalibration(domain: TaskDomain, nowIso: string): ClareCalibration {
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
    calibrated_default_minutes: baseMinutesForDomain(domain),
    updated_at: nowIso
  };
}

/** Fold an accepted negotiation into calibration (override learning). */
export function recordNegotiationSample(
  calibration: ClareCalibration,
  proposed: number,
  accepted: number,
  nowIso: string
): ClareCalibration {
  const delta = accepted - proposed;
  const recent = [...calibration.recent_deltas, delta].slice(-MAX_DELTAS);
  const sample_count = calibration.sample_count + 1;
  const sum_proposed = calibration.sum_proposed + proposed;
  const sum_accepted = calibration.sum_accepted + accepted;
  const meanAccepted = sum_accepted / sample_count;
  const bias = avg(recent);
  const calibrated_default_minutes = Math.max(
    15,
    Math.round((meanAccepted + bias) / 5) * 5
  );
  return {
    ...calibration,
    sample_count,
    sum_proposed,
    sum_accepted,
    recent_deltas: recent,
    calibrated_default_minutes,
    updated_at: nowIso
  };
}

/** Fold actual_duration vs estimate once a task is done. */
export function recordActualSample(
  calibration: ClareCalibration,
  estimated: number,
  actual: number,
  nowIso: string
): ClareCalibration {
  const actual_sample_count = calibration.actual_sample_count + 1;
  const sum_actual = calibration.sum_actual + actual;
  const meanActual = sum_actual / actual_sample_count;
  const drift = actual - estimated;
  const recent = [...calibration.recent_deltas, drift].slice(-MAX_DELTAS);
  return {
    ...calibration,
    actual_sample_count,
    sum_actual,
    recent_deltas: recent,
    calibrated_default_minutes: Math.max(15, Math.round((meanActual + avg(recent)) / 5) * 5),
    updated_at: nowIso
  };
}

export function frameworkLabel(task: Task, frameworks: FrameworkEntry[]): string | null {
  if (!task.framework_used) return null;
  return frameworks.find((f) => f.id === task.framework_used)?.name ?? task.framework_used;
}

export type ClareDumpResult = {
  voice: string;
  proposals: ClareProposal[];
  questions: string[];
  notes: string[];
  toolkit: ClareToolkitResult | null;
  mutations: AgentMutation[];
  agent: AgentProtocolSlug;
};

function proposalFromDumpItem(
  item: DumpItem,
  frameworks: FrameworkEntry[],
  calibration: ClareCalibration | null,
  protocolId?: ClareProtocolId
): ClareProposal {
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

function proposalFromJudgmentRow(
  row: ClareJudgedProposalRow,
  frameworks: FrameworkEntry[],
  calibration: ClareCalibration | null,
  protocolId?: ClareProtocolId
): ClareProposal {
  const framework =
    frameworks.find((entry) => entry.id === row.framework_id) ?? frameworks[0];
  if (!framework) throw new Error('Framework library is empty');
  const { minutes, note } = applyCalibration(row.proposed_minutes, calibration);
  const reasoning =
    row.reasoning.length > 12 ? row.reasoning : framework.reasoning_template;
  const proposal = applyProtocolToProposal(
    {
      title: row.title,
      domain: row.domain,
      description: row.description,
      priority: row.priority,
      due_date: row.due_date,
      parent_project_id: row.parent_project_id,
      framework_id: framework.id,
      framework_name: framework.name,
      reasoning,
      proposed_minutes: minutes,
      suggested_accepted_minutes: minutes,
      calibration_note: note,
      protocol_id: protocolId,
      dump_kind: row.kind,
      question: row.question
    },
    protocolId
  );
  return proposal;
}

function isActionableDump(item: { kind: DumpKind; actionable?: boolean }): boolean {
  return item.kind !== 'note' && item.kind !== 'meta' && item.actionable !== false;
}

/** Turn parser-split dump items into negotiated proposals. Notes stay questions, not writes. Offline/no-API fallback. */
export function assembleDumpResult(
  items: DumpItem[],
  frameworks: FrameworkEntry[],
  calibrationFor: (domain: TaskDomain) => ClareCalibration | null,
  protocolId?: ClareProtocolId,
  agent: AgentProtocolSlug = 'clare'
): ClareDumpResult {
  const questions: string[] = [];
  const notes: string[] = [];
  let working = items;

  if (protocolId === 'open-loops') {
    const loops = sortOpenLoops(items);
    working = loops.now;
    for (const item of loops.later) {
      notes.push(`Later: ${item.title}`);
    }
    for (const item of loops.trash) {
      notes.push(`Trash: ${item.title}`);
    }
  }

  if (protocolId === 'shatter-start') {
    const first = working.find((item) => isActionableDump(item)) ?? working[0];
    working = first ? [first] : [];
  }

  const proposals: ClareProposal[] = [];
  for (const item of working) {
    if (item.kind === 'meta' || !item.actionable) {
      continue;
    }
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

  let toolkit: ClareToolkitResult | null = null;
  const focus = items.find((item) => isActionableDump(item)) ?? items[0];
  if (protocolId === 'shatter-start' && focus) toolkit = buildShatterToolkit(focus);
  if (protocolId === 'time-map' && focus) {
    const minutes = proposals[0]?.proposed_minutes ?? 45;
    toolkit = buildTimeMapToolkit(focus, minutes);
  }
  if (protocolId === 'open-loops') toolkit = buildOpenLoopsToolkit(items);
  if (protocolId === 'dopamine-menu') toolkit = buildDopamineMenuToolkit(focus);
  if (protocolId === 'body-double' && focus) toolkit = buildBodyDoubleToolkit(focus);
  if (protocolId === 'context-switch' && focus) toolkit = buildContextSwitchToolkit(focus);
  if (protocolId === 'interest-filter' && focus) toolkit = buildInterestFilterToolkit(focus);

  return {
    voice: dumpVoiceLine(items),
    proposals,
    questions,
    notes,
    toolkit,
    mutations: [],
    agent
  };
}

/**
 * Turn Clare's own read of the dump into negotiated proposals. She has already
 * decided the split, kind, domain, priority, due date, duplicates, and whether
 * a question is warranted — this only applies calibration/protocol effects.
 * A successful judge response is authoritative: empty items means no cards.
 */
export function assembleJudgedDumpResult(
  rows: ClareJudgedProposalRow[],
  frameworks: FrameworkEntry[],
  calibrationFor: (domain: TaskDomain) => ClareCalibration | null,
  protocolId?: ClareProtocolId,
  voice?: string | null,
  mutations: AgentMutation[] = [],
  agent: AgentProtocolSlug = 'clare'
): ClareDumpResult {
  const questions: string[] = [];
  const notes: string[] = [];
  let working = rows;

  if (protocolId === 'open-loops') {
    const loops = sortOpenLoops(rows);
    working = loops.now;
    for (const row of loops.later) notes.push(`Later: ${row.title}`);
    for (const row of loops.trash) notes.push(`Trash: ${row.title}`);
  }

  if (protocolId === 'shatter-start') {
    const first = working.find((row) => isActionableDump(row)) ?? working[0];
    working = first ? [first] : [];
  }

  const proposals: ClareProposal[] = [];
  for (const row of working) {
    if (row.kind === 'note' || row.kind === 'meta') {
      notes.push(row.title);
      if (row.question) questions.push(row.question);
      continue;
    }
    if (row.existing_task_id) {
      if (row.question) questions.push(row.question);
      else questions.push(duplicateOnBoardQuestion(row.title));
      continue;
    }
    proposals.push(proposalFromJudgmentRow(row, frameworks, calibrationFor(row.domain), protocolId));
    if (row.question) questions.push(row.question);
  }

  let toolkit: ClareToolkitResult | null = null;
  const focus = rows.find((row) => isActionableDump(row)) ?? rows[0];
  if (protocolId === 'shatter-start' && focus) toolkit = buildShatterToolkit(focus);
  if (protocolId === 'time-map' && focus) {
    const minutes = proposals[0]?.proposed_minutes ?? 45;
    toolkit = buildTimeMapToolkit(focus, minutes);
  }
  if (protocolId === 'open-loops') toolkit = buildOpenLoopsToolkit(rows);
  if (protocolId === 'dopamine-menu') toolkit = buildDopamineMenuToolkit(focus);
  if (protocolId === 'body-double' && focus) toolkit = buildBodyDoubleToolkit(focus);
  if (protocolId === 'context-switch' && focus) toolkit = buildContextSwitchToolkit(focus);
  if (protocolId === 'interest-filter' && focus) toolkit = buildInterestFilterToolkit(focus);

  const fallbackVoice = !rows.length && !mutations.length
    ? 'Got it — what do you want to do next?'
    : !rows.length
      ? 'Right — I have changes ready for you to confirm.'
      : `Right, I read that as ${rows.length} thing${rows.length === 1 ? '' : 's'}. Let me untangle it.`;

  return {
    voice: voice && voice.trim().length > 8 ? voice : fallbackVoice,
    proposals,
    questions,
    notes,
    toolkit,
    mutations,
    agent
  };
}
