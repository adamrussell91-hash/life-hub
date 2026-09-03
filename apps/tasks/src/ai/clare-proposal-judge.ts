import { CLARE_PROPOSAL_MODEL } from '@/ai/models';
import { createAnthropicMessageWithTools } from '@/ai/anthropic';
import type { ClareDumpDigest } from '@/domain/clare-digest';
import type { DumpKind } from '@/domain/clare-dump';
import { CLARE_AGENT_TOOLS, createClareToolHandler, type ClareToolRuntime } from '@/domain/clare-tools';
import { parseAgentMutations, type AgentMutation } from '@/domain/agent-mutations';
import type { AgentProtocolSlug } from '@/domain/agent-protocol';
import type { TaskDomain, TaskPriority } from '@/schemas/task';
import { createEmbedBlock } from '@/blocks/create-block';

const AGENT_NAMES: Record<AgentProtocolSlug, string> = {
  clare: 'Clare DeMind',
  hammond: 'General Hammond',
  penelope: 'Penelope Rose Quillian',
  vera: 'Dr Vera Lenz'
};

/** Hard shell shared by every Tasks Hub chat agent. Live protocol is injected per turn. */
export function buildAgentSystemShell(slug: AgentProtocolSlug = 'clare'): string {
  const name = AGENT_NAMES[slug] ?? 'Clare DeMind';
  return `You are ${name} on Tasks Hub. Talk like Claude in the room: capable, direct, useful. There is no "you can't do that" — if the hub or repo can do it, you can propose it (or apply prefs/protocol immediately via tools).

Adam may dump work, ask questions, correct you, change how you work, edit pages, edit code, or just talk. All of that is valid.

Tools (use freely — do not guess):
- check_clock / set_timezone
- read_protocol / update_protocol (your live manual — rewrite when sticky prefs change)
- search_board / get_task / get_project (tasks & projects include page_blocks)
- list_inbox (StressFlags for Hammond / Penelope / Vera)
- list_maps / get_map
- read_repo_file (Tasks Hub source — then propose repo_file mutations)

Confirm-before-write: return structured JSON. Task creates go in items[]. Hub/repo edits go in mutations[]. Protocol/timezone tools apply immediately.

items[] — new tasks/comms/notes (Clare-shaped). Empty when there is no new work.
mutations[] — any of:
- {"kind":"task_update","task_id":"...","patch":{...},"summary":"..."}
- {"kind":"project_update","project_id":"...","patch":{...},"summary":"..."}
- {"kind":"page_blocks","entity_type":"task"|"project","entity_id":"...","page_blocks":[...],"summary":"..."}
- {"kind":"repo_file","path":"src/...","content":"...","commit_message":"...","summary":"..."}
- {"kind":"map_update","map_id":"...","patch":{...},"summary":"..."}

For page/code edits: get_task/get_project/read_repo_file first, then return the full intended page_blocks or file content in mutations. Do not invent entity ids.

Never bounce Adam for "not bringing a dump." Never invent rival dates. digest.recent_thread is continuity. digest.operating_protocol is your starting manual.
If Adam answers a leave-or-new duplicate question with "make a new one" / "leave it", use the original quoted title — never treat those short replies as task titles.

After tools settle, JSON only:
{"voice":"...","items":[],"mutations":[]}`;
}

/** @deprecated use buildAgentSystemShell('clare') — kept for existing imports/tests */
export const CLARE_PROPOSAL_SYSTEM = buildAgentSystemShell('clare');

export function buildClareSystemPrompt(
  digest: ClareDumpDigest,
  slug: AgentProtocolSlug = 'clare'
): string {
  const protocol = digest.operating_protocol?.trim();
  const shell = buildAgentSystemShell(slug);
  if (!protocol) return shell;
  return `${shell}

---
LIVE OPERATING PROTOCOL (follow this; you may update it with update_protocol):
${protocol.slice(0, 12_000)}
---`;
}


export type ClareJudgedProposalRow = {
  title: string;
  description: string;
  kind: DumpKind;
  domain: TaskDomain;
  priority: TaskPriority;
  due_date: string | null;
  framework_id: string;
  reasoning: string;
  proposed_minutes: number;
  existing_task_id: string | null;
  parent_project_id: string | null;
  question: string | null;
};

export type ClareProposalJudgment = {
  voice: string | null;
  items: ClareJudgedProposalRow[];
  mutations: AgentMutation[];
  model: string | null;
  /** False when the model's reply could not be parsed at all — callers should fall back rather than trust an empty read. */
  ok: boolean;
};

export type ClareProposalJudge = (digest: ClareDumpDigest) => Promise<ClareProposalJudgment>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FRAMEWORK_IDS = new Set(['fw_eat_the_frog', 'fw_timeboxing', 'fw_eisenhower']);
const DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low']);
const KINDS = new Set<DumpKind>(['task', 'communication', 'note', 'meta']);
const MAX_ITEMS = 25;

function readDueDate(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === 'null') return null;
  return ISO_DATE.test(text) ? text : null;
}

function clampMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 45;
  return Math.max(15, Math.min(180, Math.round(n / 5) * 5));
}

function cleanTitle(value: unknown): string | null {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');
  if (text.length < 3) return null;
  return text.slice(0, 96);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanNullableId(value: unknown, validIds: Set<string>): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return validIds.has(text) ? text : null;
}

/** Pull item rows out of model text (raw JSON or fenced). */
export function parseClareProposalJudgment(text: string, digest: ClareDumpDigest): ClareProposalJudgment {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1]?.trim() ?? trimmed;
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { voice: null, items: [], mutations: [], model: null, ok: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.slice(start, end + 1));
  } catch {
    return { voice: null, items: [], mutations: [], model: null, ok: false };
  }

  const body = parsed as { voice?: unknown; items?: unknown; mutations?: unknown };
  const voice =
    typeof body.voice === 'string' && body.voice.trim().length > 8
      ? body.voice.trim().slice(0, 800)
      : null;

  const rows = Array.isArray(body.items) ? body.items : [];
  const openTaskIds = new Set(digest.open_tasks.map((t) => t.id));
  const projectIds = new Set(digest.projects.map((p) => p.id));
  const items: ClareJudgedProposalRow[] = [];

  for (const row of rows) {
    if (items.length >= MAX_ITEMS) break;
    if (!row || typeof row !== 'object') continue;
    const bodyRow = row as Record<string, unknown>;

    const title = cleanTitle(bodyRow.title);
    if (!title) continue;

    const kindRaw = String(bodyRow.kind ?? 'task').trim() as DumpKind;
    const domainRaw = String(bodyRow.domain ?? digest.preferred_domain).trim();
    const priorityRaw = String(bodyRow.priority ?? 'medium').trim();
    const frameworkId = String(bodyRow.framework_id ?? 'fw_timeboxing').trim();

    items.push({
      title,
      description: cleanText(bodyRow.description, 500),
      kind: KINDS.has(kindRaw) ? kindRaw : 'task',
      domain: DOMAINS.has(domainRaw) ? (domainRaw as TaskDomain) : digest.preferred_domain,
      priority: PRIORITIES.has(priorityRaw) ? (priorityRaw as TaskPriority) : 'medium',
      due_date: readDueDate(bodyRow.due_date),
      framework_id: FRAMEWORK_IDS.has(frameworkId) ? frameworkId : 'fw_timeboxing',
      reasoning: cleanText(bodyRow.reasoning, 280),
      proposed_minutes: clampMinutes(bodyRow.proposed_minutes),
      existing_task_id: cleanNullableId(bodyRow.existing_task_id, openTaskIds),
      parent_project_id: cleanNullableId(bodyRow.parent_project_id, projectIds),
      question:
        typeof bodyRow.question === 'string' && bodyRow.question.trim()
          ? cleanText(bodyRow.question, 240)
          : null
    });
  }

  return {
    voice,
    items,
    mutations: parseAgentMutations(body.mutations),
    model: null,
    ok: true
  };
}

export function createClareProposalJudge(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  tools?: ClareToolRuntime;
  agentSlug?: AgentProtocolSlug;
}): ClareProposalJudge {
  const model = options.model ?? CLARE_PROPOSAL_MODEL;
  const agentSlug = options.agentSlug ?? options.tools?.agentSlug ?? 'clare';
  return async (digest) => {
    const toolRuntime: ClareToolRuntime = options.tools ?? {
      getTimezone: () => digest.timezone,
      setTimezone: async (timezone) => ({
        ok: true,
        timezone,
        note: 'Timezone noted for this turn only (prefs store not wired).'
      }),
      getProtocol: () => digest.operating_protocol || 'No protocol loaded.',
      setProtocol: async (markdown) => ({
        ok: true,
        markdown,
        note: 'Protocol noted for this turn only (store not wired).'
      }),
      agentSlug
    };
    const text = await createAnthropicMessageWithTools({
      apiKey: options.apiKey,
      model,
      system: buildClareSystemPrompt(digest, agentSlug),
      user: JSON.stringify(digest),
      tools: CLARE_AGENT_TOOLS,
      onTool: createClareToolHandler(toolRuntime),
      maxTokens: 4096,
      maxRounds: 8,
      fetchImpl: options.fetchImpl
    });
    const judgment = parseClareProposalJudgment(text, digest);
    return { ...judgment, model };
  };
}

export function defaultClareProposalJudge(
  env: NodeJS.ProcessEnv = process.env,
  tools?: ClareToolRuntime,
  agentSlug?: AgentProtocolSlug
): ClareProposalJudge | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    return createClareProposalJudge({
      apiKey,
      model: env.CLARE_PROPOSAL_MODEL?.trim() || undefined,
      tools,
      agentSlug: agentSlug ?? tools?.agentSlug ?? 'clare'
    });
  }
  // Local / no-key: still answer questions and stage page mutations; dumps fall through via ok:false.
  return localStubClareJudge(agentSlug ?? tools?.agentSlug ?? 'clare', tools);
}

/** Offline stand-in so `npm run dev` can still exercise chat, Q&A, and page mutations. */
export function localStubClareJudge(
  agentSlug: AgentProtocolSlug = 'clare',
  tools?: ClareToolRuntime
): ClareProposalJudge {
  return async (digest) => {
    const text = digest.dump_text.trim();
    const lower = text.toLowerCase();
    const urlMatch = text.match(/https?:\/\/[^\s)\]]+/i);

    if (urlMatch && /\b(add|attach|put|link|page|embed|on the task)\b/i.test(lower)) {
      const withoutUrl = lower.replace(urlMatch[0].toLowerCase(), ' ');
      const task =
        digest.open_tasks.find((row) => {
          const title = row.title.toLowerCase();
          return title.length >= 4 && withoutUrl.includes(title.slice(0, Math.min(18, title.length)));
        }) ?? digest.open_tasks[0];
      if (!task) {
        return {
          ok: true,
          model: 'local-stub',
          voice: 'I do not see an open task to hang that URL on yet — create one first.',
          items: [],
          mutations: []
        };
      }
      const embed = createEmbedBlock(`blk_${Date.now().toString(36)}`, 'generic');
      embed.content.url = urlMatch[0];
      embed.content.title = urlMatch[0];
      const existing = tools?.getTask ? await tools.getTask(task.id) : null;
      const prior = Array.isArray(existing?.page_blocks) ? existing.page_blocks : [];
      return {
        ok: true,
        model: 'local-stub',
        voice: `Got it — I will put that URL on “${task.title}”. Confirm when you are ready.`,
        items: [],
        mutations: [
          {
            kind: 'page_blocks',
            summary: `Add URL to ${task.title}`,
            entity_type: 'task',
            entity_id: task.id,
            page_blocks: [...prior, embed]
          }
        ]
      };
    }

    const looksLikeQuestion =
      /\?/.test(text) || /^(what|where|when|why|how|who|is it|are you|do you)\b/i.test(lower);
    const looksLikeWork =
      /\b(email|mark|write|book|call|prep|finish|sort|organise|organize|due|tomorrow|today i need)\b/i.test(
        lower
      );
    if (looksLikeQuestion && !looksLikeWork) {
      if (/\b(day|date|today|sydney|timezone|clock)\b/i.test(lower)) {
        return {
          ok: true,
          model: 'local-stub',
          voice: `It's ${digest.today_weekday} ${digest.today} in ${digest.timezone}.`,
          items: [],
          mutations: []
        };
      }
      return {
        ok: true,
        model: 'local-stub',
        voice: `Hearing you. I am ${agentSlug} on the desk with ${digest.open_tasks.length} open tasks in view — dump work or ask me to edit a page whenever.`,
        items: [],
        mutations: []
      };
    }

    return { ok: false, voice: null, items: [], mutations: [], model: 'local-stub' };
  };
}
