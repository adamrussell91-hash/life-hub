import type { FrameworkEntry } from '@/schemas/templates';
import type { Project } from '@/schemas/project';
import type { Task, TaskDomain } from '@/schemas/task';
import type { ClareCalibration } from '@/schemas/clare';
import type { ClareProtocolId } from '@/domain/clare-protocols';
import type { DumpItem } from '@/domain/clare-dump';
import { HUB_TZ, hubWeekdayLong, toHubDateKey } from '@/domain/queries';
import { lifeContextToPromptBlock, type LifeContextDigest } from '@/domain/life-context';

export type ClareDumpDigestItem = {
  index: number;
  raw: string;
  parser_title: string;
  kind: DumpItem['kind'];
  domain: TaskDomain;
  priority: Task['priority'];
  due_date: string | null;
  existing_on_board: boolean;
  propose: boolean;
};

export type ClareDumpDigest = {
  dump_text: string;
  /** Adam's calendar day in the hub timezone — never the server's UTC date. */
  today: string;
  today_weekday: string;
  timezone: string;
  preferred_domain: TaskDomain;
  protocol_id: ClareProtocolId | null;
  frameworks: Array<{
    id: string;
    name: string;
    best_suited: string;
    reasoning_template: string;
  }>;
  items: ClareDumpDigestItem[];
  open_tasks: Array<{ id: string; title: string; due_date: string | null; domain: TaskDomain }>;
  projects: Array<{ id: string; title: string }>;
  calibrations: Array<{
    domain: TaskDomain;
    sample_count: number;
    calibrated_default_minutes: number;
    typical_delta_minutes: number | null;
  }>;
  /** Life Hub's operational digest — energy, mood, upcoming events, active goals. Never clinical detail. */
  life_context: string | null;
  /** Live operating manual from Blobs (Clare may rewrite via tool). */
  operating_protocol: string;
  /** Prior turns in this chat window for continuity. */
  recent_thread: Array<{ role: 'user' | 'assistant'; text: string }>;
};

function typicalDelta(cal: ClareCalibration): number | null {
  if (cal.sample_count < 2 || !cal.recent_deltas.length) return null;
  const bias =
    cal.recent_deltas.reduce((sum, delta) => sum + delta, 0) / cal.recent_deltas.length;
  return Math.round(bias);
}

export function buildClareDumpDigest(input: {
  text: string;
  items: DumpItem[];
  frameworks: FrameworkEntry[];
  tasks: Task[];
  projects: Project[];
  calibrations: ClareCalibration[];
  preferredDomain: TaskDomain;
  protocolId?: ClareProtocolId;
  now?: Date;
  timezone?: string;
  lifeContext?: LifeContextDigest | null;
  operatingProtocol?: string;
  recentThread?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): ClareDumpDigest {
  const now = input.now ?? new Date();
  const timezone = input.timezone ?? HUB_TZ;
  const open = input.tasks
    .filter((task) => task.status !== 'done' && task.status !== 'dead')
    .slice(0, 40)
    .map((task) => ({
      id: task.id,
      title: task.title,
      due_date: task.due_date,
      domain: task.domain
    }));

  return {
    dump_text: input.text.trim(),
    today: toHubDateKey(now, timezone),
    today_weekday: hubWeekdayLong(now, timezone),
    timezone,
    preferred_domain: input.preferredDomain,
    protocol_id: input.protocolId ?? null,
    frameworks: input.frameworks.map((framework) => ({
      id: framework.id,
      name: framework.name,
      best_suited: framework.best_suited_task_pattern,
      reasoning_template: framework.reasoning_template
    })),
    items: input.items.map((item, index) => ({
      index,
      raw: item.raw,
      parser_title: item.title,
      kind: item.kind,
      domain: item.domain,
      priority: item.priority,
      due_date: item.due_date,
      existing_on_board: Boolean(item.existing_title),
      propose: item.actionable && item.kind !== 'note' && item.kind !== 'meta' && !item.existing_title
    })),
    open_tasks: open,
    projects: input.projects.map((project) => ({ id: project.id, title: project.title })),
    calibrations: input.calibrations.map((cal) => ({
      domain: cal.domain,
      sample_count: cal.sample_count,
      calibrated_default_minutes: cal.calibrated_default_minutes,
      typical_delta_minutes: typicalDelta(cal)
    })),
    life_context: lifeContextToPromptBlock(input.lifeContext ?? null),
    operating_protocol: (input.operatingProtocol ?? '').slice(0, 12_000),
    recent_thread: (input.recentThread ?? []).slice(-12).map((turn) => ({
      role: turn.role,
      text: turn.text.slice(0, 500)
    }))
  };
}
