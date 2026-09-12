import * as keys from '../src/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '../src/services/store';
import type { SeedData } from '../src/services/types';
import { searchEntities } from '../src/domain/queries';
import { TaskCreateSchema, TaskUpdateSchema } from '../src/schemas/task';
import { ProjectCreateSchema, ProjectUpdateSchema, type ComplianceModule } from '../src/schemas/project';
import { TransitMapCreateSchema, TransitMapUpdateSchema } from '../src/schemas/map';
import { ProgramCreateSchema, ProgramUpdateSchema } from '../src/schemas/program';
import { AreaCreateSchema, AreaUpdateSchema } from '../src/schemas/area';
import { GoalCreateSchema, GoalUpdateSchema } from '../src/schemas/goal';
import { TaskPropertyConfigSchema } from '../src/schemas/task-properties';
import { WorkBlockCreateSchema, WorkBlockUpdateSchema } from '../src/schemas/work-block';
import { WorkSessionCreateSchema, WorkSessionUpdateSchema } from '../src/schemas/work-session';
import { PlanningProfileUpdateSchema } from '../src/schemas/planning-profile';
import { PlanningDirectionUpdateSchema } from '../src/schemas/planning-direction';

export function createMemoryKv(): KvAdapter & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

export interface MockApiOptions {
  seed: SeedData;
}

export function createMockApi({ seed }: MockApiOptions) {
  const kv = createMemoryKv();
  let seeded = false;
  const LOCAL_PASSPHRASE = 'tasks-hub-local';
  let authenticated = false;

  const SETH_ID = 'person_00000000-0000-4000-8000-000000000001';
  const syntheticPeople = new Map<
    string,
    { id: string; display_name: string; sort_name: string | null; lifecycle_status: string }
  >([
    [
      SETH_ID,
      {
        id: SETH_ID,
        display_name: 'Seth Example',
        sort_name: 'Example, Seth',
        lifecycle_status: 'active'
      }
    ]
  ]);
  const syntheticLinks = new Map<
    string,
    {
      id: string;
      source_ref: string;
      target_ref: string;
      relationship_type: string;
      status: string;
      temporal_mode: string;
      context_key: string | null;
      occurred_at: string | null;
      valid_from: string | null;
      valid_to: string | null;
    }
  >();

  function endpointForRef(ref: string) {
    const parts = ref.split(':');
    if (parts[0] === 'shared' && parts[1] === 'person') {
      const person = syntheticPeople.get(parts[2]!);
      return {
        ref,
        kind: 'person',
        display_label: person?.display_name ?? 'Person',
        supporting_label: null,
        href: null,
        lifecycle_status: person?.lifecycle_status ?? null,
        visibility: 'operator'
      };
    }
    if (parts[0] === 'professional' && parts[1] === 'communication') {
      return {
        ref,
        kind: 'communication',
        display_label: 'Communication',
        supporting_label: null,
        href: `/professional/#/communication/${parts[2]}`,
        lifecycle_status: 'completed',
        visibility: 'operator'
      };
    }
    if (parts[0] === 'tasks' && parts[1] === 'task') {
      return {
        ref,
        kind: 'task',
        display_label: 'Task',
        supporting_label: null,
        href: null,
        lifecycle_status: 'open',
        visibility: 'operator'
      };
    }
    return {
      ref,
      kind: 'unknown',
      display_label: ref,
      supporting_label: null,
      href: null,
      lifecycle_status: null,
      visibility: 'operator'
    };
  }

  async function ensure() {
    if (!seeded) {
      await seedIfEmpty(kv, keys, seed);
      seeded = true;
    }
  }

  function store() {
    return createTasksStore(kv, keys);
  }

  function json(status: number, body: unknown) {
    return { status, body };
  }

  async function handle(method: string, urlPath: string, body?: unknown) {
    await ensure();
    const url = new URL(urlPath, 'http://local.test');
    const path = url.pathname;

    if (path === '/api/session' && method === 'GET') {
      return json(200, { ok: true, data: { authenticated } });
    }
    if (path === '/api/auth' && method === 'POST') {
      const passphrase = (body as { passphrase?: string })?.passphrase;
      if (typeof passphrase === 'string' && passphrase.trim() === LOCAL_PASSPHRASE) {
        authenticated = true;
        return json(200, { ok: true, data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 } });
      }
      return json(401, { ok: false, error: { code: 'invalid_credentials', message: 'Invalid passphrase' } });
    }
    if (path === '/api/logout' && method === 'POST') {
      authenticated = false;
      return json(200, { ok: true, data: { loggedOut: true } });
    }

    // Public Corey capacity — token only, no session
    if (path === '/api/capacity' && method === 'GET' && url.searchParams.get('token')) {
      const sPublic = store();
      const view = await sPublic.getPublicCapacityByToken(url.searchParams.get('token')!);
      if (!view) {
        return json(404, { ok: false, error: { code: 'not_found', message: 'Unknown share' } });
      }
      return json(200, { ok: true, data: view });
    }

    if (!authenticated && path.startsWith('/api/')) {
      return json(401, { ok: false, error: { code: 'unauthenticated', message: 'Sign in required' } });
    }

    const s = store();
    const id = url.searchParams.get('id');

    if (path === '/api/tasks') {
      if (method === 'GET') {
        if (id) {
          const task = await s.getTask(id);
          if (!task) return json(404, { ok: false, error: { code: 'not_found', message: 'Task not found' } });
          return json(200, { ok: true, data: task });
        }
        return json(200, { ok: true, data: { tasks: await s.listTasks() } });
      }
      if (method === 'POST') {
        const parsed = TaskCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createTask(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = TaskUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateTask(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteTask(id, body as { agent?: string; reason?: string } | undefined);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/projects') {
      if (method === 'GET') {
        if (id) {
          const project = await s.getProject(id);
          if (!project) return json(404, { ok: false, error: { code: 'not_found', message: 'Project not found' } });
          return json(200, { ok: true, data: project });
        }
        return json(200, { ok: true, data: { projects: await s.listProjects() } });
      }
      if (method === 'POST') {
        const parsed = ProjectCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createProject(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = ProjectUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateProject(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteProject(id, body as { agent?: string; reason?: string } | undefined);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/areas') {
      if (method === 'GET') {
        if (id) {
          const area = await s.getArea(id);
          if (!area) return json(404, { ok: false, error: { code: 'not_found', message: 'Area not found' } });
          return json(200, { ok: true, data: area });
        }
        return json(200, { ok: true, data: { areas: await s.listAreas() } });
      }
      if (method === 'POST') {
        const parsed = AreaCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createArea(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = AreaUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateArea(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteArea(id);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/goals') {
      if (method === 'GET') {
        if (id) {
          const goal = await s.getGoal(id);
          if (!goal) return json(404, { ok: false, error: { code: 'not_found', message: 'Goal not found' } });
          return json(200, { ok: true, data: goal });
        }
        return json(200, { ok: true, data: { goals: await s.listGoals() } });
      }
      if (method === 'POST') {
        const parsed = GoalCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createGoal(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = GoalUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateGoal(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteGoal(id);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/maps') {
      if (method === 'GET') {
        if (id) {
          const map = await s.getMap(id);
          if (!map) return json(404, { ok: false, error: { code: 'not_found', message: 'Map not found' } });
          return json(200, { ok: true, data: map });
        }
        return json(200, { ok: true, data: { maps: await s.listMaps() } });
      }
      if (method === 'POST') {
        const parsed = TransitMapCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createMap(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = TransitMapUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateMap(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteMap(id);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/programs') {
      if (method === 'GET') {
        if (id) {
          const program = await s.getProgram(id);
          if (!program) return json(404, { ok: false, error: { code: 'not_found', message: 'Program not found' } });
          return json(200, { ok: true, data: program });
        }
        return json(200, { ok: true, data: { programs: await s.listPrograms() } });
      }
      if (method === 'POST') {
        const parsed = ProgramCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createProgram(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = ProgramUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateProgram(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteProgram(id);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/templates') {
      if (method === 'GET') {
        return json(200, {
          ok: true,
          data: {
            frameworks: await s.listFrameworks(),
            excursion_templates: await s.listExcursionTemplates(),
            task_templates: await s.listTaskTemplates(),
            project_templates: await s.listProjectTemplates()
          }
        });
      }
      if (method === 'POST') {
        const b = body as Record<string, unknown>;
        if (b.action === 'save_task_as_template') {
          return json(201, {
            ok: true,
            data: await s.saveTaskAsTemplate(String(b.task_id), String(b.name))
          });
        }
        if (b.action === 'create_task_from_template') {
          return json(201, {
            ok: true,
            data: await s.createTaskFromTemplate(String(b.template_id), (b.overrides as object) ?? {})
          });
        }
        if (b.action === 'create_project_from_template') {
          return json(201, {
            ok: true,
            data: await s.createProjectFromTemplate(
              String(b.template_id),
              (b.overrides as object) ?? {}
            )
          });
        }
        if (b.action === 'save_project_as_template') {
          return json(201, {
            ok: true,
            data: await s.saveProjectAsTemplate(String(b.project_id), String(b.name))
          });
        }
        if (b.action === 'create_excursion_from_template') {
          return json(201, {
            ok: true,
            data: await s.createExcursionFromTemplate({
              excursion_template_id: String(b.excursion_template_id),
              title: String(b.title),
              event_date: String(b.event_date),
              student_group_reference:
                b.student_group_reference === undefined || b.student_group_reference === null
                  ? null
                  : String(b.student_group_reference),
              description: b.description === undefined ? undefined : String(b.description),
              compliance_modules: Array.isArray(b.compliance_modules)
                ? (b.compliance_modules as ComplianceModule[])
                : undefined,
              lead_time_overrides:
                b.lead_time_overrides && typeof b.lead_time_overrides === 'object'
                  ? (b.lead_time_overrides as Record<string, number>)
                  : undefined
            })
          });
        }
      }
    }

    if (path === '/api/search' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const [tasks, projects] = await Promise.all([s.listTasks(), s.listProjects()]);
      return json(200, { ok: true, data: searchEntities(tasks, projects, q) });
    }

    if (path === '/api/clare') {
      if (method === 'GET') {
        const domain = url.searchParams.get('domain');
        if (domain) {
          return json(200, {
            ok: true,
            data: { calibration: await s.getClareCalibration(domain as 'teaching') }
          });
        }
        return json(200, { ok: true, data: { calibrations: await s.listClareCalibrations() } });
      }
      if (method === 'POST') {
        const b = body as Record<string, unknown>;
        if (b.action === 'propose') {
          return json(200, {
            ok: true,
            data: await s.proposeWithClare({
              title: String(b.title ?? ''),
              domain: b.domain as 'teaching',
              description: b.description === undefined ? undefined : String(b.description),
              priority: b.priority as 'medium' | undefined,
              protocol_id:
                b.protocol_id === undefined
                  ? undefined
                  : (String(b.protocol_id) as import('../src/domain/clare-protocols').ClareProtocolId),
              due_date: b.due_date === undefined || b.due_date === null ? null : String(b.due_date)
            })
          });
        }
        if (b.action === 'brief') {
          return json(200, {
            ok: true,
            data: await s.briefWithClare({
              protocol_id:
                b.protocol_id === undefined
                  ? undefined
                  : (String(b.protocol_id) as import('../src/domain/clare-protocols').ClareProtocolId)
            })
          });
        }
        if (b.action === 'dump' || b.action === 'dump_stream') {
          const dump = await s.processDumpWithClare({
            text: String(b.text ?? ''),
            domain: b.domain === undefined ? undefined : (b.domain as 'teaching'),
            protocol_id:
              b.protocol_id === undefined
                ? undefined
                : (String(b.protocol_id) as import('../src/domain/clare-protocols').ClareProtocolId),
            recent_thread: Array.isArray(b.recent_thread)
              ? (b.recent_thread as Array<{ role: 'user' | 'assistant'; text: string }>)
              : undefined,
            agent_slug:
              b.agent_slug === undefined
                ? undefined
                : (String(b.agent_slug) as import('../src/domain/agent-protocol').AgentProtocolSlug),
            focus:
              b.focus && typeof b.focus === 'object'
                ? (b.focus as { type?: string; id?: string })
                : undefined
          });
          if (b.action === 'dump') {
            return json(200, { ok: true, data: dump });
          }
          const voice = typeof dump.voice === 'string' ? dump.voice : '';
          const mid = Math.max(1, Math.ceil(voice.length / 2));
          const laterNotes = (dump.notes ?? [])
            .map((note: unknown) => String(note))
            .filter((note: string) => note.startsWith('Later: '))
            .map((note: string, index: number) => ({
              id: `later-${index}`,
              label: note.slice('Later: '.length).trim(),
              detail: 'Later'
            }))
            .filter((row: { label: string }) => row.label);
          const choice =
            dump.choice ??
            (laterNotes.length
              ? {
                  type: 'choice' as const,
                  title: 'Pull anything into Now?',
                  hint: 'Clare parked these as Later. Pick any that need a next action today.',
                  multi: true,
                  confirmLabel: 'Move to Now',
                  choices: laterNotes.slice(0, 8)
                }
              : null);
          const events = [
            { type: 'status', text: 'Sorting the dump…' },
            {
              type: 'plan_status',
              id: 'clare-dump',
              heading: 'Dump',
              steps: ['Sort items', 'Draft voice', 'Build cards'],
              current: 0
            },
            {
              type: 'plan_status',
              id: 'clare-dump',
              heading: 'Dump',
              steps: ['Sort items', 'Draft voice', 'Build cards'],
              current: 1
            },
            ...(voice ? [{ type: 'text', delta: voice.slice(0, mid) }, { type: 'text', delta: voice.slice(mid) }] : []),
            {
              type: 'plan_status',
              id: 'clare-dump',
              heading: 'Dump',
              steps: ['Sort items', 'Draft voice', 'Build cards'],
              current: 2
            },
            { type: 'dump_result', result: choice ? { ...dump, choice } : dump },
            ...(choice ? [choice] : []),
            { type: 'done' }
          ];
          const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
          return new Response(body, {
            status: 200,
            headers: {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-store'
            }
          });
        }
        if (b.action === 'apply_mutations') {
          return json(200, {
            ok: true,
            data: await s.applyAgentMutations(
              Array.isArray(b.mutations)
                ? (b.mutations as import('../src/domain/agent-mutations').AgentMutation[])
                : []
            )
          });
        }
        if (b.action === 'accept') {
          return json(201, {
            ok: true,
            data: await s.acceptClareProposal({
              proposal: b.proposal as import('../src/domain/clare').ClareProposal,
              accepted_minutes: Number(b.accepted_minutes),
              framework_id: b.framework_id === undefined ? undefined : String(b.framework_id)
            })
          });
        }
        if (b.action === 'accept_batch') {
          const items = Array.isArray(b.items) ? b.items : [];
          return json(201, {
            ok: true,
            data: await s.acceptClareBatch(
              items.map((item) => {
                const row = item as {
                  proposal: import('../src/domain/clare').ClareProposal;
                  accepted_minutes: number;
                  framework_id?: string;
                };
                return {
                  proposal: row.proposal,
                  accepted_minutes: Number(row.accepted_minutes),
                  framework_id: row.framework_id
                };
              })
            )
          });
        }
        if (b.action === 'record_actual') {
          return json(200, {
            ok: true,
            data: await s.recordClareActual(String(b.task_id), Number(b.actual_minutes))
          });
        }
      }
    }

    if (path === '/api/stall') {
      if (method === 'GET') {
        return json(200, { ok: true, data: { reviews: await s.listReviewLogs() } });
      }
      if (method === 'POST') {
        const b = body as Record<string, unknown>;
        if (b.action === 'flag_stalled') {
          return json(200, {
            ok: true,
            data: await s.flagStalledProjects({
              weeks: b.weeks === undefined ? undefined : Number(b.weeks)
            })
          });
        }
        if (b.action === 'resolve') {
          return json(200, {
            ok: true,
            data: await s.resolveStalledProject({
              project_id: String(b.project_id),
              outcome: b.outcome as 'revived' | 'frankensteined' | 'buried',
              reason: String(b.reason ?? ''),
              merge_into_project_id:
                b.merge_into_project_id === undefined || b.merge_into_project_id === null
                  ? null
                  : String(b.merge_into_project_id)
            })
          });
        }
      }
    }

    if (path === '/api/stress-flags') {
      if (method === 'GET') {
        const inbox = url.searchParams.get('inbox');
        if (inbox) {
          return json(200, {
            ok: true,
            data: { flags: await s.listAgentInbox(inbox), inbox }
          });
        }
        return json(200, {
          ok: true,
          data: {
            flags: await s.listStressFlags(),
            judgment: await s.getIntuitiveScanMeta()
          }
        });
      }
      if (method === 'POST') {
        const b = body as Record<string, unknown>;
        if (b.action === 'scan') {
          return json(200, { ok: true, data: await s.scanAndRaiseStressFlags() });
        }
        if (b.action === 'intuitive_scan') {
          const { localStubJudge } = await import('../src/ai/intuitive-judge');
          return json(200, {
            ok: true,
            data: await s.runIntuitiveScan({
              judge: process.env.ANTHROPIC_API_KEY?.trim() ? undefined : localStubJudge
            })
          });
        }
        if (b.action === 'raise') {
          return json(201, {
            ok: true,
            data: await s.raiseStressFlag({
              pattern_description: String(b.pattern_description ?? ''),
              pattern_kind: (b.pattern_kind as 'manual') ?? 'manual',
              source_project_or_task_id:
                b.source_project_or_task_id === undefined || b.source_project_or_task_id === null
                  ? null
                  : String(b.source_project_or_task_id),
              fingerprint: b.fingerprint === undefined ? undefined : String(b.fingerprint)
            })
          });
        }
      }
    }

    if (path === '/api/capacity') {
      if (method === 'GET') {
        return json(200, {
          ok: true,
          data: {
            snapshot: await s.getCapacitySnapshot(),
            share: await s.getCapacityShare()
          }
        });
      }
      if (method === 'POST') {
        const b = body as Record<string, unknown>;
        if (b.action === 'ensure_share') {
          return json(200, { ok: true, data: { share: await s.ensureCapacityShare() } });
        }
        if (b.action === 'rotate_share') {
          return json(200, { ok: true, data: { share: await s.rotateCapacityShare() } });
        }
      }
    }

    if (path === '/api/reviews') {
      if (method === 'GET') {
        const projectId = url.searchParams.get('project_id');
        if (projectId) {
          return json(200, {
            ok: true,
            data: { variance: await s.getProjectVariance(projectId) }
          });
        }
        return json(200, { ok: true, data: { reviews: await s.listReviewLogs() } });
      }
      if (method === 'POST') {
        const b = body as Record<string, unknown>;
        if (b.action === 'close') {
          return json(200, {
            ok: true,
            data: await s.closeProject({
              project_id: String(b.project_id),
              reason: String(b.reason ?? '')
            })
          });
        }
      }
    }

    if (path === '/api/task-properties') {
      if (method === 'GET') {
        return json(200, { ok: true, data: await s.getTaskProperties() });
      }
      if (method === 'PUT') {
        const parsed = TaskPropertyConfigSchema.parse(body);
        return json(200, { ok: true, data: await s.updateTaskProperties(parsed) });
      }
    }

    if (path === '/api/work-blocks') {
      if (method === 'GET') {
        if (id) {
          const block = await s.getWorkBlock(id);
          if (!block) return json(404, { ok: false, error: { code: 'not_found', message: 'Work block not found' } });
          return json(200, { ok: true, data: block });
        }
        return json(200, { ok: true, data: { work_blocks: await s.listWorkBlocks() } });
      }
      if (method === 'POST') {
        const parsed = WorkBlockCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createWorkBlock(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = WorkBlockUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateWorkBlock(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteWorkBlock(id);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/work-sessions') {
      if (method === 'GET') {
        if (id) {
          const session = await s.getWorkSession(id);
          if (!session) return json(404, { ok: false, error: { code: 'not_found', message: 'Work session not found' } });
          return json(200, { ok: true, data: session });
        }
        return json(200, { ok: true, data: { work_sessions: await s.listWorkSessions() } });
      }
      if (method === 'POST') {
        const parsed = WorkSessionCreateSchema.parse(body);
        return json(201, { ok: true, data: await s.createWorkSession(parsed) });
      }
      if (method === 'PATCH' && id) {
        const parsed = WorkSessionUpdateSchema.parse(body);
        return json(200, { ok: true, data: await s.updateWorkSession(id, parsed) });
      }
      if (method === 'DELETE' && id) {
        await s.deleteWorkSession(id);
        return json(200, { ok: true, data: { deleted: true } });
      }
    }

    if (path === '/api/planning-profile') {
      if (method === 'GET') {
        return json(200, { ok: true, data: await s.getPlanningProfile() });
      }
      if (method === 'PATCH' || method === 'PUT') {
        const parsed = PlanningProfileUpdateSchema.parse(body ?? {});
        return json(200, { ok: true, data: await s.updatePlanningProfile(parsed) });
      }
    }

    if (path === '/api/planning-direction') {
      if (method === 'GET') {
        return json(200, { ok: true, data: await s.getPlanningDirection() });
      }
      if (method === 'PATCH' || method === 'PUT') {
        const parsed = PlanningDirectionUpdateSchema.parse(body ?? {});
        return json(200, { ok: true, data: await s.updatePlanningDirection(parsed) });
      }
    }

    if (path === '/api/entities/search' && method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const includeArchived = url.searchParams.get('include_archived') === 'true';
      const kinds = new Set((url.searchParams.get('kinds') ?? 'person').split(','));
      const groups: Record<string, unknown[]> = { person: [], organisation: [], task: [] };
      if (kinds.has('person')) {
        for (const person of syntheticPeople.values()) {
          if (!includeArchived && person.lifecycle_status === 'archived') continue;
          if (['deleted', 'deidentified'].includes(person.lifecycle_status)) continue;
          if (
            !query ||
            person.display_name.toLowerCase().includes(query) ||
            (person.sort_name ?? '').toLowerCase().includes(query)
          ) {
            groups.person.push({
              ref: `shared:person:${person.id}`,
              kind: 'person',
              display_label: person.display_name,
              supporting_label: null,
              href: null,
              lifecycle_status: person.lifecycle_status,
              visibility: 'operator'
            });
          }
        }
      }
      return json(200, { ok: true, data: { groups } });
    }

    if (path === '/api/universal-links') {
      if (method === 'GET') {
        const entityRef = url.searchParams.get('entity_ref');
        const linkId = url.searchParams.get('id');
        if (linkId) {
          const link = syntheticLinks.get(linkId);
          if (!link) {
            return json(404, { ok: false, error: { code: 'not_found', message: 'Link not found' } });
          }
          return json(200, { ok: true, data: { link } });
        }
        if (entityRef) {
          const outgoing = [...syntheticLinks.values()]
            .filter((link) => link.source_ref === entityRef && link.status === 'current')
            .map((link) => ({
              link,
              endpoint: endpointForRef(link.target_ref)
            }));
          const incoming = [...syntheticLinks.values()]
            .filter((link) => link.target_ref === entityRef && link.status === 'current')
            .map((link) => ({
              link,
              endpoint: endpointForRef(link.source_ref)
            }));
          return json(200, { ok: true, data: { outgoing, incoming } });
        }
        return json(400, {
          ok: false,
          error: { code: 'missing_selector', message: 'selector required' }
        });
      }
      if (method === 'POST') {
        const input = body as {
          source_ref?: string;
          target_ref?: string;
          relationship_type?: string;
        };
        if (!input?.source_ref || !input?.target_ref || !input?.relationship_type) {
          return json(400, { ok: false, error: { code: 'invalid_input', message: 'Invalid link' } });
        }
        for (const key of ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds']) {
          if (Object.prototype.hasOwnProperty.call(input as object, key)) {
            return json(400, {
              ok: false,
              error: { code: 'access_field_not_accepted', message: `Field "${key}" is not accepted.` }
            });
          }
        }
        const id = `ul_${Buffer.from(`${input.source_ref}|${input.target_ref}|${input.relationship_type}`)
          .toString('hex')
          .slice(0, 32)}`;
        if (syntheticLinks.has(id)) {
          return json(200, { ok: true, data: { link: syntheticLinks.get(id), created: false } });
        }
        const link = {
          id,
          source_ref: input.source_ref,
          target_ref: input.target_ref,
          relationship_type: input.relationship_type,
          status: 'current',
          temporal_mode: 'timeless',
          context_key: null,
          occurred_at: null,
          valid_from: null,
          valid_to: null
        };
        syntheticLinks.set(id, link);
        return json(201, { ok: true, data: { link, created: true } });
      }
      if (method === 'PATCH' && id) {
        const action = url.searchParams.get('action');
        const link = syntheticLinks.get(id);
        if (!link) {
          return json(404, { ok: false, error: { code: 'not_found', message: 'Link not found' } });
        }
        if (action === 'end') {
          const validTo =
            (body as { valid_to?: string })?.valid_to ?? new Date().toISOString().slice(0, 10);
          link.status = 'ended';
          link.valid_to = validTo;
          syntheticLinks.set(id, link);
          return json(200, { ok: true, data: { link } });
        }
        if (action === 'suppress') {
          const reason = (body as { reason?: string })?.reason;
          if (typeof reason !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(reason)) {
            return json(400, {
              ok: false,
              error: { code: 'invalid_reason_code', message: 'Invalid reason code.' }
            });
          }
          link.status = 'suppressed';
          syntheticLinks.set(id, link);
          return json(200, { ok: true, data: { link } });
        }
        return json(400, { ok: false, error: { code: 'invalid_action', message: 'Unsupported action' } });
      }
    }

    return json(404, { ok: false, error: { code: 'not_found', message: `No mock route ${method} ${path}` } });
  }

  return {
    async handleNodeRequest(
      req: { method?: string; url?: string; on: Function; headers: { [k: string]: unknown } },
      res: { statusCode: number; setHeader: Function; end: Function }
    ) {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve());
      });
      let body: unknown;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = undefined;
        }
      }
      const result = await handle(req.method ?? 'GET', req.url ?? '/', body);
      if (result instanceof Response) {
        res.statusCode = result.status;
        result.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        res.end(await result.text());
        return;
      }
      res.statusCode = result.status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(result.body));
    }
  };
}
