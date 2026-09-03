import type { AnthropicTool } from '@/ai/anthropic';
import type { RepoClient } from '@/ai/github-repo';
import {
  applyProtocolUpdate,
  type AgentProtocolSlug,
  type ProtocolUpdateMode
} from '@/domain/agent-protocol';
import { resolveTimeZoneInput } from '@/domain/hub-prefs';
import { HUB_TZ, hubWeekdayLong, searchEntities, toHubDateKey } from '@/domain/queries';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { StressFlag } from '@/schemas/stress';
import type { TransitMap } from '@/schemas/map';

export const CLARE_CHECK_CLOCK_TOOL = 'check_clock';
export const CLARE_SET_TIMEZONE_TOOL = 'set_timezone';
export const CLARE_READ_PROTOCOL_TOOL = 'read_protocol';
export const CLARE_UPDATE_PROTOCOL_TOOL = 'update_protocol';
export const AGENT_SEARCH_TOOL = 'search_board';
export const AGENT_GET_TASK_TOOL = 'get_task';
export const AGENT_GET_PROJECT_TOOL = 'get_project';
export const AGENT_LIST_INBOX_TOOL = 'list_inbox';
export const AGENT_LIST_MAPS_TOOL = 'list_maps';
export const AGENT_GET_MAP_TOOL = 'get_map';
export const AGENT_READ_REPO_FILE_TOOL = 'read_repo_file';

/** Shared tool surface for Clare, Hammond, Penelope, and Vera. */
export const CLARE_AGENT_TOOLS: AnthropicTool[] = [
  {
    name: CLARE_CHECK_CLOCK_TOOL,
    description:
      "Look up Adam's current calendar day and local time in the hub timezone. Never invent a date.",
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: CLARE_SET_TIMEZONE_TOOL,
    description: 'Remember Adam\'s timezone from chat (city or IANA). Persists.',
    input_schema: {
      type: 'object',
      properties: { timezone_or_city: { type: 'string' } },
      required: ['timezone_or_city'],
      additionalProperties: false
    }
  },
  {
    name: CLARE_READ_PROTOCOL_TOOL,
    description: 'Read your live operating protocol before editing it.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: CLARE_UPDATE_PROTOCOL_TOOL,
    description:
      'Rewrite your operating protocol. Modes: replace | append | replace_section (needs section_heading).',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['replace', 'append', 'replace_section'] },
        section_heading: { type: 'string' },
        markdown: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['mode', 'markdown'],
      additionalProperties: false
    }
  },
  {
    name: AGENT_SEARCH_TOOL,
    description: 'Search tasks and projects by text.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: AGENT_GET_TASK_TOOL,
    description: 'Load one task including page_blocks (lesson/page content).',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false
    }
  },
  {
    name: AGENT_GET_PROJECT_TOOL,
    description: 'Load one project including page_blocks.',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
      additionalProperties: false
    }
  },
  {
    name: AGENT_LIST_INBOX_TOOL,
    description: 'List StressFlags in a network inbox (Hammond / Penelope / Vera).',
    input_schema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['General Hammond', 'Penelope Rose Quillian', 'Dr Vera Lenz']
        }
      },
      additionalProperties: false
    }
  },
  {
    name: AGENT_LIST_MAPS_TOOL,
    description: 'List transit maps (id + title).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: AGENT_GET_MAP_TOOL,
    description: 'Load one transit map document.',
    input_schema: {
      type: 'object',
      properties: { map_id: { type: 'string' } },
      required: ['map_id'],
      additionalProperties: false
    }
  },
  {
    name: AGENT_READ_REPO_FILE_TOOL,
    description:
      'Read a file from the Tasks Hub git repo (source code, config, docs). Use before proposing a repo_file mutation.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false
    }
  }
];

export type ClareClockSnapshot = {
  timezone: string;
  today: string;
  today_weekday: string;
  local_time: string;
  utc: string;
};

export type ClareToolRuntime = {
  getTimezone: () => string | Promise<string>;
  setTimezone: (
    timezone: string
  ) => Promise<{ ok: boolean; timezone: string; note: string }> | { ok: boolean; timezone: string; note: string };
  getProtocol: () => string | Promise<string>;
  setProtocol: (
    markdown: string
  ) =>
    | Promise<{ ok: boolean; markdown: string; note: string }>
    | { ok: boolean; markdown: string; note: string };
  listTasks?: () => Promise<Task[]> | Task[];
  listProjects?: () => Promise<Project[]> | Project[];
  getTask?: (id: string) => Promise<Task | null> | Task | null;
  getProject?: (id: string) => Promise<Project | null> | Project | null;
  listInbox?: (agent: string) => Promise<StressFlag[]> | StressFlag[];
  listMaps?: () => Promise<TransitMap[]> | TransitMap[];
  getMap?: (id: string) => Promise<TransitMap | null> | TransitMap | null;
  repo?: RepoClient | null;
  agentSlug?: AgentProtocolSlug;
  now?: () => Date;
};

function formatLocalTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(instant);
}

export function readClareClock(
  instant: Date = new Date(),
  timeZone: string = HUB_TZ
): ClareClockSnapshot {
  const zone = timeZone && timeZone.length ? timeZone : HUB_TZ;
  return {
    timezone: zone,
    today: toHubDateKey(instant, zone),
    today_weekday: hubWeekdayLong(instant, zone),
    local_time: formatLocalTime(instant, zone),
    utc: instant.toISOString()
  };
}

function compactTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    domain: task.domain,
    priority: task.priority,
    due_date: task.due_date,
    parent_project_id: task.parent_project_id,
    page_block_count: task.page_blocks?.length ?? 0
  };
}

function compactProject(project: Project) {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    type: project.type,
    page_block_count: project.page_blocks?.length ?? 0
  };
}

export function createClareToolHandler(runtime: ClareToolRuntime) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    const now = runtime.now?.() ?? new Date();
    if (name === CLARE_CHECK_CLOCK_TOOL) {
      const timezone = await runtime.getTimezone();
      return {
        ...readClareClock(now, timezone),
        reason: typeof input.reason === 'string' ? input.reason.slice(0, 120) : null
      };
    }
    if (name === CLARE_SET_TIMEZONE_TOOL) {
      const raw = String(input.timezone_or_city ?? '').trim();
      const resolved = resolveTimeZoneInput(raw);
      if (!resolved) {
        return {
          ok: false,
          timezone: await runtime.getTimezone(),
          note: `Could not map "${raw}" to a timezone.`
        };
      }
      const saved = await runtime.setTimezone(resolved);
      return { ...saved, clock: readClareClock(now, saved.timezone) };
    }
    if (name === CLARE_READ_PROTOCOL_TOOL) {
      const markdown = await runtime.getProtocol();
      return {
        agent: runtime.agentSlug ?? 'clare',
        markdown,
        chars: markdown.length
      };
    }
    if (name === CLARE_UPDATE_PROTOCOL_TOOL) {
      const mode = String(input.mode ?? 'replace') as ProtocolUpdateMode;
      if (mode !== 'replace' && mode !== 'append' && mode !== 'replace_section') {
        return { ok: false, note: 'mode must be replace, append, or replace_section.' };
      }
      const current = await runtime.getProtocol();
      const applied = applyProtocolUpdate(current, {
        mode,
        markdown: String(input.markdown ?? ''),
        section_heading:
          typeof input.section_heading === 'string' ? input.section_heading : undefined
      });
      if (!applied.ok) return applied;
      const saved = await runtime.setProtocol(applied.markdown);
      return {
        ...saved,
        reason: typeof input.reason === 'string' ? input.reason.slice(0, 200) : null
      };
    }
    if (name === AGENT_SEARCH_TOOL) {
      const query = String(input.query ?? '').trim();
      if (!query) return { ok: false, note: 'query required' };
      const tasks = (await runtime.listTasks?.()) ?? [];
      const projects = (await runtime.listProjects?.()) ?? [];
      const hits = searchEntities(tasks, projects, query);
      return {
        query,
        tasks: hits.tasks.slice(0, 15).map(compactTask),
        projects: hits.projects.slice(0, 10).map(compactProject)
      };
    }
    if (name === AGENT_GET_TASK_TOOL) {
      const id = String(input.task_id ?? '').trim();
      const task = id ? await runtime.getTask?.(id) : null;
      if (!task) return { ok: false, note: `Task not found: ${id}` };
      return { ok: true, task };
    }
    if (name === AGENT_GET_PROJECT_TOOL) {
      const id = String(input.project_id ?? '').trim();
      const project = id ? await runtime.getProject?.(id) : null;
      if (!project) return { ok: false, note: `Project not found: ${id}` };
      return { ok: true, project };
    }
    if (name === AGENT_LIST_INBOX_TOOL) {
      const agent =
        typeof input.agent === 'string' && input.agent.trim()
          ? input.agent.trim()
          : inboxForSlug(runtime.agentSlug);
      if (!agent || !runtime.listInbox) {
        return { ok: false, note: 'No inbox for this agent.' };
      }
      const flags = await runtime.listInbox(agent);
      return {
        agent,
        flags: flags.slice(0, 30).map((flag) => ({
          id: flag.id,
          pattern_description: flag.pattern_description,
          pattern_kind: flag.pattern_kind,
          recurrence_note: flag.recurrence_note,
          source_project_or_task_id: flag.source_project_or_task_id
        }))
      };
    }
    if (name === AGENT_LIST_MAPS_TOOL) {
      const maps = (await runtime.listMaps?.()) ?? [];
      return {
        maps: maps.map((map) => ({ id: map.id, title: map.title, year: map.year }))
      };
    }
    if (name === AGENT_GET_MAP_TOOL) {
      const id = String(input.map_id ?? '').trim();
      const map = id ? await runtime.getMap?.(id) : null;
      if (!map) return { ok: false, note: `Map not found: ${id}` };
      return { ok: true, map };
    }
    if (name === AGENT_READ_REPO_FILE_TOOL) {
      if (!runtime.repo) {
        return {
          ok: false,
          note: 'Repo edits unavailable — set AGENT_REPO_TOKEN (GitHub Contents) on the site.'
        };
      }
      const path = String(input.path ?? '')
        .trim()
        .replace(/^\/+/, '');
      if (!path || path.includes('..')) return { ok: false, note: 'Invalid path.' };
      const file = await runtime.repo.getFile(path);
      if (!file) return { ok: false, note: `File not found: ${path}` };
      return {
        ok: true,
        path: file.path,
        sha: file.sha,
        html_url: file.html_url,
        content: file.content.slice(0, 80_000),
        truncated: file.content.length > 80_000
      };
    }
    return { ok: false, note: `Unknown tool: ${name}` };
  };
}

function inboxForSlug(slug: AgentProtocolSlug | undefined): string | null {
  if (slug === 'hammond') return 'General Hammond';
  if (slug === 'penelope') return 'Penelope Rose Quillian';
  if (slug === 'vera') return 'Dr Vera Lenz';
  return null;
}

export { compactTask, compactProject };
