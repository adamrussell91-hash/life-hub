import type { PageBlock } from '@/schemas/page-block';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

export type AgentMutation =
  | {
      kind: 'task_update';
      summary: string;
      task_id: string;
      patch: Record<string, unknown>;
    }
  | {
      kind: 'project_update';
      summary: string;
      project_id: string;
      patch: Record<string, unknown>;
    }
  | {
      kind: 'page_blocks';
      summary: string;
      entity_type: 'task' | 'project';
      entity_id: string;
      page_blocks: PageBlock[];
    }
  | {
      kind: 'repo_file';
      summary: string;
      path: string;
      content: string;
      commit_message: string;
    }
  | {
      kind: 'map_update';
      summary: string;
      map_id: string;
      patch: Record<string, unknown>;
    };

const MAX_MUTATIONS = 12;
const MAX_PAGE_BLOCKS = 80;
const MAX_REPO_CHARS = 120_000;

function cleanSummary(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || 'Apply change').slice(0, 200);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Parse model mutation rows — unknown kinds dropped. */
export function parseAgentMutations(raw: unknown): AgentMutation[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentMutation[] = [];
  for (const row of raw) {
    if (out.length >= MAX_MUTATIONS) break;
    const body = asRecord(row);
    if (!body) continue;
    const kind = String(body.kind ?? '').trim();
    const summary = cleanSummary(body.summary);

    if (kind === 'task_update') {
      const task_id = String(body.task_id ?? '').trim();
      const patch = asRecord(body.patch);
      if (!task_id || !patch) continue;
      out.push({ kind, summary, task_id, patch });
      continue;
    }
    if (kind === 'project_update') {
      const project_id = String(body.project_id ?? '').trim();
      const patch = asRecord(body.patch);
      if (!project_id || !patch) continue;
      out.push({ kind, summary, project_id, patch });
      continue;
    }
    if (kind === 'page_blocks') {
      const entity_type = String(body.entity_type ?? '').trim();
      const entity_id = String(body.entity_id ?? '').trim();
      if ((entity_type !== 'task' && entity_type !== 'project') || !entity_id) continue;
      const blocks = Array.isArray(body.page_blocks) ? body.page_blocks : null;
      if (!blocks) continue;
      out.push({
        kind,
        summary,
        entity_type,
        entity_id,
        page_blocks: blocks.slice(0, MAX_PAGE_BLOCKS) as PageBlock[]
      });
      continue;
    }
    if (kind === 'repo_file') {
      const path = String(body.path ?? '')
        .trim()
        .replace(/^\/+/, '');
      const content = String(body.content ?? '');
      if (!path || path.includes('..') || content.length > MAX_REPO_CHARS) continue;
      out.push({
        kind,
        summary,
        path,
        content,
        commit_message: String(body.commit_message ?? body.message ?? summary).slice(0, 200)
      });
      continue;
    }
    if (kind === 'map_update') {
      const map_id = String(body.map_id ?? '').trim();
      const patch = asRecord(body.patch);
      if (!map_id || !patch) continue;
      out.push({ kind, summary, map_id, patch });
    }
  }
  return out;
}

export function mutationLabel(mutation: AgentMutation): string {
  switch (mutation.kind) {
    case 'task_update':
      return `Update task ${mutation.task_id}`;
    case 'project_update':
      return `Update project ${mutation.project_id}`;
    case 'page_blocks':
      return `Edit ${mutation.entity_type} page ${mutation.entity_id}`;
    case 'repo_file':
      return `Write ${mutation.path}`;
    case 'map_update':
      return `Update map ${mutation.map_id}`;
  }
}

/** Fields agents may patch on a task (no silent id/schema hijacks). */
export function sanitizeTaskPatch(patch: Record<string, unknown>): Partial<Task> {
  const out: Record<string, unknown> = {};
  const allow = [
    'title',
    'description',
    'status',
    'priority',
    'domain',
    'due_date',
    'due_time',
    'estimated_duration',
    'parent_project_id',
    'tags',
    'page_blocks',
    'bucket',
    'kind'
  ] as const;
  for (const key of allow) {
    if (key in patch) out[key] = patch[key];
  }
  return out as Partial<Task>;
}

export function sanitizeProjectPatch(patch: Record<string, unknown>): Partial<Project> {
  const out: Record<string, unknown> = {};
  const allow = [
    'title',
    'description',
    'status',
    'type',
    'current_end_date',
    'page_blocks',
    'tags',
    'arc_summary'
  ] as const;
  for (const key of allow) {
    if (key in patch) out[key] = patch[key];
  }
  return out as Partial<Project>;
}
