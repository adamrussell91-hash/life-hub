/**
 * Named capability shortcuts — thin wrappers over propose-action shapes.
 * Auto risk → write immediately when allowlisted.
 * Confirm risk → return { kind: 'propose', proposal } for Confirm.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHALLENGES_DIR,
  RESEARCH_DIR,
  REMEMBER_WEEK_FLAGS_PATH,
  REMEMBER_CONTEXT_NOTES_PATH,
  REMEMBER_LAYERED_MEMORIES_PATH,
  CN_LOANS_PATH,
  WIDGETS_DIR,
  OS_DIR,
  slugify,
  newId,
  challengePath,
  researchPath,
  widgetPath,
  resolveResearchTtl,
  researchExpiresAt,
  parseJsonBlob,
  serializeJson,
  findChallengePath,
  listChallengePaths,
  isCalendarDate,
  addCalendarDays
} from './stores.mjs';
import {
  defaultCadenceForLength,
  resolveCadence,
  sprintLengthDays,
  validateEvidenceSource,
  validateLaneAgent,
  SPRINT_ROSTER,
  computeSprintState
} from '../sprint-evidence.mjs';
import {
  normalizeSprintViz,
  formatVizForConfirm,
  resolveSprintViz
} from '../sprint-viz.mjs';
import {
  isPathAllowedForAgent,
  capabilityIdsForAgent,
  loadCapability,
  loadRegistry,
  capabilitiesRoot
} from './registry.mjs';
import {
  CENTRAL_NODE_SECTIONS,
  applyCentralNodePatch,
  centralNodePatchContentError,
  classifyCentralNodePatchRisk,
  readCentralNodeSectionBody
} from '../../../../apps/life/js/core/central-node-patch.js';
import { validateCentralNodePatchInput } from '../hammond-tools.mjs';
import { getSydneyDateKey } from '../../../../apps/life/js/core/time.js';
import {
  PENDING_CN_PATCHES_PATH,
  addPendingCnPatch,
  createPendingCnPatchId,
  findDuplicatePendingCnPatch,
  parsePendingCnPatches,
  serializePendingCnPatches
} from '../cn-patch-queue.mjs';
import { applyIntuitionEdit } from './intuition.mjs';
import { executeProposeActionWrites, validateProposeActionInput } from './propose-action.mjs';
import { listJSON as listTasksJSON, getJSON as getTasksJSON, newTaskId, TASK_PREFIX, taskKey } from '../tasks-blobs.mjs';
import { isOpenTask } from '../task-liveness.mjs';
import { findTaskTwin } from '../task-duplicates.mjs';
import {
  addMemory,
  applyReflection,
  correctMemory,
  createMemoryStore,
  parseMemoryStore,
  proposeReflection,
  serializeMemoryStore
} from '../agent-memory.mjs';
import { findMealDeletePaths, isMealSlot } from '../delete-meal.mjs';
import { explodeCompoundDumpTitle } from '../clare-dump.mjs';
import { DUE_TIME_FIELD, taskBlockWrite, TIME_BLOCK_FIELDS } from '../task-block-write.mjs';

const CN_OPS = ['upsert_field', 'append_line', 'replace_section', 'delete_lines', 'condense'];

function deny(message) {
  return { kind: 'error', error: message };
}

function ok(message, data = {}) {
  return { kind: 'ok', message, ...data };
}

function propose(proposal) {
  return { kind: 'propose', proposal };
}

function assertAllow(agentSlug, path) {
  if (!isPathAllowedForAgent(agentSlug, path, { mode: 'write' })) {
    throw new Error(`Path not allowlisted for ${agentSlug}: ${path}`);
  }
}

async function writeAllowlisted(client, agentSlug, path, content, message, sha) {
  assertAllow(agentSlug, path);
  return client.writeFile({
    path,
    content,
    message,
    ...(sha ? { sha } : {})
  });
}

function repoTreeOf(ctx) {
  return ctx.repoTree ?? ctx.repoTree ?? [];
}

function fileFromTree(tree, path) {
  if (!Array.isArray(tree)) return null;
  return tree.find(item => item.type === 'blob' && item.path === path) ?? null;
}

async function readJson(ctx, path, fallback) {
  const entry = fileFromTree(repoTreeOf(ctx), path);
  if (!entry?.sha) return { value: structuredClone(fallback), sha: null };
  try {
    const raw = await ctx.readBlob(entry.sha);
    return { value: parseJsonBlob(raw, structuredClone(fallback)), sha: entry.sha };
  } catch {
    return { value: structuredClone(fallback), sha: entry.sha };
  }
}

function buildProposal({ agentSlug, intent, writes, surfaces = ['governance_log'], reads = [] }) {
  return {
    intent,
    reads,
    writes: writes.map(write => ({
      path: write.path,
      mode: write.mode || 'create',
      content: write.content,
      diff: write.diff || `${write.mode || 'create'} ${write.path}`,
      ...(typeof write.title === 'string' && write.title.trim()
        ? { title: write.title.trim() }
        : {})
    })),
    surfaces
  };
}

const CREATE_TASK_MAX_ITEMS = 16;

export function shortcutSchemas() {
  return {
    remember_set_week_flag: {
      name: 'remember_set_week_flag',
      description: 'Set or clear a week-scoped remember flag (auto when allowlisted).',
      input_schema: {
        type: 'object',
        properties: {
          week_id: { type: 'string', description: 'ISO week id YYYY-Www' },
          key: { type: 'string' },
          value: {},
          clear: { type: 'boolean' }
        },
        required: ['week_id', 'key'],
        additionalProperties: false
      }
    },
    remember_note_context: {
      name: 'remember_note_context',
      description: 'Append a durable context note for later turns (auto when allowlisted).',
      input_schema: {
        type: 'object',
        properties: {
          note: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['note'],
        additionalProperties: false
      }
    },
    remember_write_memory: {
      name: 'remember_write_memory',
      description: 'Write or correct layered memory (user/agent/shared/episodic). Not a domain record. mode=reflect always waits for Confirm and cannot change safety or write permissions.',
      input_schema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['add', 'correct', 'reflect'] },
          class: { type: 'string', enum: ['user', 'agent', 'shared', 'episodic'] },
          text: { type: 'string' },
          domain: { type: 'string' },
          expires_at: { type: 'string', description: 'ISO timestamp; omitted means no expiry' },
          memory_id: { type: 'string', description: 'Required for mode=correct' },
          reason: { type: 'string' },
          target: { type: 'string', enum: ['memory', 'protocol', 'eval_case'] },
          impact: { type: 'string', enum: ['low', 'high', 'safety', 'permissions', 'write_allowlist'] }
        },
        required: ['mode', 'text'],
        additionalProperties: false
      }
    },
    track_open_challenge: {
      name: 'track_open_challenge',
      description: 'Propose opening a challenge (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          metric: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['title', 'goal'],
        additionalProperties: false
      }
    },
    track_log_progress: {
      name: 'track_log_progress',
      description: 'Log progress on an open challenge (auto when allowlisted).',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          entry: { type: 'string' },
          value: {},
          date: { type: 'string' }
        },
        required: ['challenge_id', 'entry'],
        additionalProperties: false
      }
    },
    track_close_challenge: {
      name: 'track_close_challenge',
      description: 'Propose closing a challenge with a verdict (Confirm). On dispute, propose a revised verdict.',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          verdict: { type: 'string', enum: ['met', 'missed', 'partial', 'abandoned'] },
          summary: { type: 'string' },
          revised: { type: 'boolean', description: 'True when revising after a dispute' }
        },
        required: ['challenge_id', 'verdict', 'summary'],
        additionalProperties: false
      }
    },
    track_open_sprint: {
      name: 'track_open_sprint',
      description:
        'Open a multi-agent challenge sprint, or upgrade an existing Phase-0 challenge_id to a sprint (Confirm). Lists lanes, headline, cadence, dates and Home-card viz (chart-kit ids from the Sprint viz picker).',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string', description: 'Existing challenge to upgrade in place' },
          title: { type: 'string' },
          goal: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          lead_agent: { type: 'string' },
          notes: { type: 'string' },
          headline: { type: 'object' },
          cadence: { type: 'object' },
          lanes: { type: 'array' },
          viz: {
            type: 'object',
            description: 'Home card charts: { headline, lanes } from Sprint viz picker allowlist (e.g. glide-slope + progress-track)',
            properties: {
              headline: { type: 'string' },
              lanes: { type: 'string' }
            },
            additionalProperties: false
          }
        },
        required: ['title', 'goal', 'lanes'],
        additionalProperties: false
      }
    },
    track_checkin_lane: {
      name: 'track_checkin_lane',
      description: 'Append today\'s lane status/note on your own sprint lane only (auto).',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          status: { type: 'string', enum: ['on_track', 'stalled', 'no_evidence'] },
          note: { type: 'string' },
          date: { type: 'string' },
          kind: { type: 'string', enum: ['daily', 'weekly', 'final'] },
          adam_rating: { type: 'number' },
          adam_win: { type: 'string' },
          adam_snag: { type: 'string' },
          adam_note: { type: 'string' },
          protocol_session_id: { type: 'string' }
        },
        required: ['challenge_id', 'status'],
        additionalProperties: false
      }
    },
    track_link_lane: {
      name: 'track_link_lane',
      description: 'Add a goal_id or task_id to a sprint lane (auto, additive).',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          agent: { type: 'string' },
          goal_id: { type: 'string' },
          task_id: { type: 'string' }
        },
        required: ['challenge_id', 'agent'],
        additionalProperties: false
      }
    },
    track_revise_sprint: {
      name: 'track_revise_sprint',
      description: 'Revise sprint lanes, lead measures, cadence, dates, headline or Home-card viz (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          challenge_id: { type: 'string' },
          title: { type: 'string' },
          goal: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          lead_agent: { type: 'string' },
          notes: { type: 'string' },
          headline: { type: 'object' },
          cadence: { type: 'object' },
          lanes: { type: 'array' },
          viz: {
            type: 'object',
            description: 'Home card charts: { headline, lanes } from Sprint viz picker allowlist',
            properties: {
              headline: { type: 'string' },
              lanes: { type: 'string' }
            },
            additionalProperties: false
          }
        },
        required: ['challenge_id'],
        additionalProperties: false
      }
    },
    coordinate_request_cn_write: {
      name: 'coordinate_request_cn_write',
      description:
        'Write to Central Node. Low-risk lines apply at once: your own Cross-Agent line ("YourName→Agent: …"), a Recent Agent Actions line starting with your name, a Today\'s Status field, or a This Week line. Everything else (Constraints, This Month, Long-Term Trends, About Me, any rewrite or deletion) is queued as a Confirm card on the Central Node page. When the result says awaiting_confirm, tell Adam it is waiting on his Confirm. Never say it is done.',
      input_schema: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: [...CENTRAL_NODE_SECTIONS] },
          op: { type: 'string', enum: [...CN_OPS] },
          summary: { type: 'string', description: 'One short line Adam reads on the Confirm card.' },
          text: { type: 'string', description: 'The line (append_line, upsert_field) or the whole new section body (replace_section, condense).' },
          field: { type: 'string', description: 'Today\'s Status field for upsert_field, e.g. Health.' },
          match: { type: 'string', description: 'delete_lines: remove lines containing this text.' },
          reason: { type: 'string', description: 'The evidence: dated records or what Adam said.' }
        },
        required: ['section', 'op', 'summary', 'reason'],
        additionalProperties: false
      }
    },
    research_save_brief: {
      name: 'research_save_brief',
      description: 'Save a research brief with per-domain TTL (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          domain: {
            type: 'string',
            enum: ['clinical', 'nutrition', 'fitness', 'skincare', 'mind', 'retail', 'general']
          },
          summary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          body: { type: 'string' },
          ttl_days: { type: 'number' }
        },
        required: ['title', 'domain', 'summary'],
        additionalProperties: false
      }
    },
    research_expiring_brief: {
      name: 'research_expiring_brief',
      description: 'List research briefs nearing expiry for this agent.',
      input_schema: {
        type: 'object',
        properties: {
          within_days: { type: 'number' }
        },
        additionalProperties: false
      }
    },
    publish_surface_widget: {
      name: 'publish_surface_widget',
      description: 'Publish one Adam-approved widget template instance (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          template_id: { type: 'string' },
          title: { type: 'string' },
          props: { type: 'object' }
        },
        required: ['template_id', 'title'],
        additionalProperties: false
      }
    },
    plan_week_meals: {
      name: 'plan_week_meals',
      description: 'Propose a week meal plan write (Confirm).',
      input_schema: {
        type: 'object',
        properties: {
          week_id: { type: 'string' },
          meals: { type: 'object' },
          notes: { type: 'string' }
        },
        required: ['week_id', 'meals'],
        additionalProperties: false
      }
    },
    delete_meal: {
      name: 'delete_meal',
      description:
        'Propose deleting a confirmed meal for a date (Confirm). Without slug, removes every file for that meal type (breakfast/lunch/dinner/snack/dessert), including timed (snack-1530) and numbered (snack-2) variants. Pass slug to remove one instance when several exist. Not for macro corrections (use log_entry overwrite for those).',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          meal: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'],
            description: 'Meal type to remove for that date'
          },
          slug: {
            type: 'string',
            description: 'Optional file slug only (e.g. snack-1530). When set, deletes that one file.'
          }
        },
        required: ['date', 'meal'],
        additionalProperties: false
      }
    },
    lookup_food_brand_au: {
      name: 'lookup_food_brand_au',
      description:
        'AU-first nutrition lookup reminder — search Australian sources, then cache with save_food_library_entry.',
      input_schema: {
        type: 'object',
        properties: {
          brand: { type: 'string' },
          product: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['brand', 'product'],
        additionalProperties: false
      }
    },
    os_capability_scoreboard: {
      name: 'os_capability_scoreboard',
      description: 'Return this agent\'s capability scoreboard (surface when useful / when asked).',
      input_schema: {
        type: 'object',
        properties: {
          detail: { type: 'boolean' }
        },
        additionalProperties: false
      }
    },
    intuition_edit_pack: {
      name: 'intuition_edit_pack',
      description: 'Update a standing intuition pack this agent owns (judgment only — never gates capacity). Auto when allowlisted.',
      input_schema: {
        type: 'object',
        properties: {
          pack_id: { type: 'string', description: 'Existing intuition pack id, e.g. flare-rules' },
          summary: { type: 'string' },
          guidance: { type: 'string' },
          reason: { type: 'string', description: 'Why this prior is changing' }
        },
        required: ['pack_id', 'reason'],
        additionalProperties: false
      }
    },
    os_promote_shortcut: {
      name: 'os_promote_shortcut',
      description: 'Propose promoting a repeated durable pattern into a named shortcut draft for Adam to Confirm (does not mutate the live registry).',
      input_schema: {
        type: 'object',
        properties: {
          proposed_id: { type: 'string', description: 'e.g. track.morning-weigh-in' },
          tool_name: { type: 'string' },
          summary: { type: 'string' },
          example_intent: { type: 'string' },
          example_writes: { type: 'array', items: { type: 'object' } },
          risk: { type: 'string', enum: ['auto', 'confirm'] }
        },
        required: ['proposed_id', 'summary', 'example_intent'],
        additionalProperties: false
      }
    },
    os_list_promoted_shortcuts: {
      name: 'os_list_promoted_shortcuts',
      description: 'List Adam-confirmed promoted shortcut drafts under data/os/promoted-shortcuts (catalog only; does not execute them).',
      input_schema: {
        type: 'object',
        properties: {
          limit: { type: 'number' }
        },
        additionalProperties: false
      }
    },
    os_run_promoted_shortcut: {
      name: 'os_run_promoted_shortcut',
      description: 'Run a promoted shortcut draft by proposed_id. Replays its example_writes (or provided writes) as a Confirm propose-action. Does not mutate the live capabilities registry.',
      input_schema: {
        type: 'object',
        properties: {
          proposed_id: { type: 'string', description: 'e.g. track.morning-weigh-in' },
          intent: { type: 'string', description: 'Optional intent override' },
          writes: {
            type: 'array',
            items: { type: 'object' },
            description: 'Optional write override; defaults to the draft example_writes'
          }
        },
        required: ['proposed_id'],
        additionalProperties: false
      }
    },
    create_task: {
      name: 'create_task',
      description:
        `Create one or more Tasks Hub rows immediately. Use this — not GitHub file paths and not Central Node — when Adam names work to capture. Pass title for one task, or items[] (at most ${CREATE_TASK_MAX_ITEMS}; call again for more). Omit due_date only when the work is not for today — otherwise it lands on Today. due_time is a deadline only ("due by 5pm"). When Adam time-blocks ("3–4pm", "at 3 for 15 min"), pass start_time + end_time instead: the task gets a linked block on the calendar. NEVER merge distinct actions into one title — use items[] for related rows on one Confirm. Never mention this limit or the tool name in chat.`,
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          due_time: DUE_TIME_FIELD,
          ...TIME_BLOCK_FIELDS,
          parent_project_id: { type: 'string' },
          parent_task_id: { type: 'string' },
          estimated_duration: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
          waiting_on: { type: 'string' },
          waiting_since: { type: 'string' },
          follow_up_at: { type: 'string' },
          waiting_status: { type: 'string', enum: ['waiting', 'follow_up_due', 'resolved'] },
          target_date: { type: 'string' },
          review_at: { type: 'string' },
          contexts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string' },
                value: { type: 'string' }
              }
            }
          },
          cognitive_load: { type: 'string', enum: ['low', 'medium', 'high'] },
          depth: { type: 'string', enum: ['deep', 'shallow', 'admin'] },
          items: {
            type: 'array',
            description: 'Multiple tasks from one list. Each needs a title.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] },
                priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                due_date: { type: 'string' },
                due_time: DUE_TIME_FIELD,
          ...TIME_BLOCK_FIELDS,
                parent_project_id: { type: 'string' },
                parent_task_id: { type: 'string' },
                estimated_duration: { type: 'number' },
                tags: { type: 'array', items: { type: 'string' } },
                waiting_on: { type: 'string' },
                waiting_since: { type: 'string' },
                follow_up_at: { type: 'string' },
                waiting_status: { type: 'string', enum: ['waiting', 'follow_up_due', 'resolved'] },
                target_date: { type: 'string' },
                review_at: { type: 'string' },
                contexts: { type: 'array', items: { type: 'object' } },
                cognitive_load: { type: 'string', enum: ['low', 'medium', 'high'] },
                depth: { type: 'string', enum: ['deep', 'shallow', 'admin'] }
              },
              required: ['title'],
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      }
    },
    update_task: {
      name: 'update_task',
      description:
        'Patch an existing Tasks Hub row (Confirm). Call get_task first when appending so you know the current shape. Use append_description to add notes without replacing the rest of the task. due_time is a deadline only; to time-block a task pass start_time + end_time (adds a linked calendar block). To move or block several tasks in one Confirm, pass items[{task_id, due_date, due_time, start_time, end_time, ...}] — do not fire one update_task per row.',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          append_description: { type: 'string', description: 'Appended to the existing description at Confirm time.' },
          status: { type: 'string', enum: ['open', 'in_progress', 'done', 'deferred', 'dead'] },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
          domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] },
          due_date: { type: 'string' },
          due_time: DUE_TIME_FIELD,
          ...TIME_BLOCK_FIELDS,
          target_date: { type: 'string' },
          review_at: { type: 'string' },
          parent_project_id: { type: 'string' },
          parent_task_id: { type: 'string' },
          estimated_duration: { type: 'number' },
          kind: { type: 'string' },
          bucket: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          waiting_on: { type: 'string' },
          waiting_since: { type: 'string' },
          follow_up_at: { type: 'string' },
          items: {
            type: 'array',
            description: 'Batch patch several tasks in one Confirm (preferred for multi-slot reschedules).',
            items: {
              type: 'object',
              properties: {
                task_id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                append_description: { type: 'string' },
                status: { type: 'string', enum: ['open', 'in_progress', 'done', 'deferred', 'dead'] },
                priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] },
                due_date: { type: 'string' },
                due_time: DUE_TIME_FIELD,
          ...TIME_BLOCK_FIELDS,
                target_date: { type: 'string' },
                estimated_duration: { type: 'number' },
                tags: { type: 'array', items: { type: 'string' } }
              },
              required: ['task_id'],
              additionalProperties: false
            }
          },
          waiting_status: { type: 'string', enum: ['waiting', 'follow_up_due', 'resolved'] },
          contexts: { type: 'array', items: { type: 'object' } },
          cognitive_load: { type: 'string', enum: ['low', 'medium', 'high'] },
          depth: { type: 'string', enum: ['deep', 'shallow', 'admin'] }
        },
        // task_id for a single patch; or items[] for a multi-task Confirm. Handler enforces one of them.
        additionalProperties: false
      }
    }
  };
}

export function isShortcutTool(name) {
  return Boolean(shortcutSchemas()[name]);
}

async function handleRememberSetWeekFlag(ctx, input) {
  const weekId = String(input.week_id || '').trim();
  const key = String(input.key || '').trim();
  if (!weekId || !key) return deny('week_id and key are required');
  const path = REMEMBER_WEEK_FLAGS_PATH;
  const { value: data, sha } = await readJson(ctx, path, { weeks: {} });
  if (!data.weeks || typeof data.weeks !== 'object') data.weeks = {};
  if (!data.weeks[weekId] || typeof data.weeks[weekId] !== 'object') data.weeks[weekId] = {};
  if (input.clear) delete data.weeks[weekId][key];
  else data.weeks[weekId][key] = input.value ?? true;
  data.updated_at = new Date().toISOString();
  data.updated_by = ctx.agentSlug;
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(data),
    `remember: week flag ${weekId}/${key}`,
    sha
  );
  return ok(input.clear ? `Cleared ${key} for ${weekId}` : `Set ${key} for ${weekId}`, { path });
}

async function handleRememberNoteContext(ctx, input) {
  const note = String(input.note || '').trim();
  if (!note) return deny('note is required');
  const path = REMEMBER_CONTEXT_NOTES_PATH;
  const { value: data, sha } = await readJson(ctx, path, { notes: [] });
  if (!Array.isArray(data.notes)) data.notes = [];
  data.notes.push({
    id: newId('note'),
    agent_id: ctx.agentSlug,
    note,
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    created_at: new Date().toISOString()
  });
  data.updated_at = new Date().toISOString();
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(data),
    'remember: context note',
    sha
  );
  return ok('Context note saved', { path });
}

async function handleRememberWriteMemory(ctx, input) {
  const mode = String(input.mode || 'add').trim();
  const text = String(input.text || '').trim();
  if (!text) return deny('text is required');
  if (mode === 'reflect') {
    const reflection = proposeReflection({
      target: input.target || 'memory',
      impact: input.impact || 'low',
      reason: input.reason || text,
      payload: {
        text,
        class: input.class || 'agent',
        domain: input.domain || null,
        expires_at: input.expires_at || null
      },
      agent: ctx.agentSlug
    });
    if (reflection.forbidden) {
      return deny(reflection.message);
    }
    if (reflection.target !== 'memory') {
      return deny('Reflection of protocol or eval_case cannot write those files from this tool. Use os_propose_action after Adam confirms.');
    }
    const path = REMEMBER_LAYERED_MEMORIES_PATH;
    const { value: data, sha } = await readJson(ctx, path, { version: 1, items: [] });
    const store = createMemoryStore(parseMemoryStore(data).items);
    const applied = applyReflection(store, reflection, { actor: ctx.agentSlug });
    if (!applied.ok) return deny(applied.error);
    return propose(
      buildProposal({
        agentSlug: ctx.agentSlug,
        intent: reflection.message,
        surfaces: ['confirm_card', 'governance_log'],
        writes: [{
          path,
          mode: sha ? 'overwrite' : 'create',
          content: serializeMemoryStore(applied.store),
          diff: `reflection ${reflection.target}: ${text.slice(0, 80)}`
        }]
      })
    );
  }

  const path = REMEMBER_LAYERED_MEMORIES_PATH;
  const { value: data, sha } = await readJson(ctx, path, { version: 1, items: [] });
  const store = createMemoryStore(parseMemoryStore(data).items);
  let result;
  if (mode === 'correct') {
    result = correctMemory(store, {
      id: input.memory_id,
      text,
      reason: input.reason
    }, { actor: ctx.agentSlug });
  } else {
    result = addMemory(store, {
      class: input.class || 'user',
      agent: ctx.agentSlug,
      domain: input.domain || null,
      text,
      expires_at: input.expires_at || null,
      source: 'user'
    }, { actor: ctx.agentSlug });
  }
  if (!result.ok) return deny(result.error);
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeMemoryStore(result.store),
    mode === 'correct' ? 'remember: correct layered memory' : 'remember: write layered memory',
    sha
  );
  return ok(mode === 'correct' ? 'Memory corrected' : 'Memory saved', {
    path,
    memory_id: result.item.id,
    class: result.item.class
  });
}

async function handleTrackOpenChallenge(ctx, input) {
  const title = String(input.title || '').trim();
  const goal = String(input.goal || '').trim();
  if (!title || !goal) return deny('title and goal are required');
  const start = isCalendarDate(input.start_date) ? input.start_date : ctx.today;
  const end = isCalendarDate(input.end_date) ? input.end_date : addCalendarDays(start, 14);
  const id = newId('ch');
  const path = challengePath(start, title);
  const body = {
    id,
    title,
    goal,
    metric: input.metric || null,
    start_date: start,
    end_date: end,
    notes: input.notes || '',
    status: 'open',
    owner_agent: ctx.agentSlug,
    progress: [],
    created_at: new Date().toISOString()
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Open challenge: ${title}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `new challenge ${title} (${start} → ${end})`
      }]
    })
  );
}

async function handleTrackLogProgress(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  const entry = String(input.entry || '').trim();
  if (!challengeId || !entry) return deny('challenge_id and entry are required');
  const resolved = await resolveChallengeRecord(ctx, challengeId);
  if (!resolved) return deny(`Challenge not found: ${challengeId}`);
  const { path, challenge, sha } = resolved;
  if (!challenge || challenge.status === 'closed') return deny('Challenge is closed or missing');
  if (!Array.isArray(challenge.progress)) challenge.progress = [];
  challenge.progress.push({
    at: new Date().toISOString(),
    date: isCalendarDate(input.date) ? input.date : ctx.today,
    entry,
    value: input.value ?? null,
    agent_id: ctx.agentSlug
  });
  challenge.updated_at = new Date().toISOString();
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(challenge),
    `track: progress ${challengeId}`,
    sha
  );
  return ok('Progress logged', { path, challenge_id: challengeId });
}

async function handleTrackCloseChallenge(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  const verdict = String(input.verdict || '').trim();
  const summary = String(input.summary || '').trim();
  if (!challengeId || !verdict || !summary) {
    return deny('challenge_id, verdict, and summary are required');
  }
  const resolved = await resolveChallengeRecord(ctx, challengeId);
  if (!resolved) return deny(`Challenge not found: ${challengeId}`);
  const { path, challenge } = resolved;
  if (!challenge) return deny('Challenge missing');
  const state = challenge.kind === 'sprint'
    ? computeSprintState(challenge, [], ctx.today || getSydneyDateKey())
    : null;
  const closeSummary = state?.ended_awaiting_review || challenge.kind === 'sprint'
    ? `${summary}${state?.headline?.baseline != null && state?.headline?.latest
      ? ` | headline ${state.headline.baseline} → ${state.headline.latest.value}${state.headline.unit || ''}`
      : ''}`
    : summary;
  const closed = {
    ...challenge,
    status: 'closed',
    verdict,
    close_summary: closeSummary,
    closed_at: new Date().toISOString(),
    closed_by: ctx.agentSlug,
    revised_verdict: Boolean(input.revised)
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: input.revised
        ? `Revise challenge verdict: ${challenge.title || challengeId}`
        : `Close challenge: ${challenge.title || challengeId}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'overwrite',
        content: serializeJson(closed),
        diff: `${verdict} — ${closeSummary}`
      }]
    })
  );
}

async function resolveChallengeRecord(ctx, challengeId) {
  const id = String(challengeId || '').trim();
  if (!id) return null;
  const tree = repoTreeOf(ctx);
  const pathHint = findChallengePath(tree, id);
  if (pathHint) {
    const { value, sha } = await readJson(ctx, pathHint, null);
    if (value) return { path: pathHint, challenge: value, sha };
  }
  for (const path of listChallengePaths(tree)) {
    const { value, sha } = await readJson(ctx, path, null);
    if (value?.id === id) return { path, challenge: value, sha };
  }
  return null;
}

async function countOpenSprints(ctx) {
  let n = 0;
  for (const path of listChallengePaths(repoTreeOf(ctx))) {
    const { value } = await readJson(ctx, path, null);
    if (value?.kind === 'sprint' && value.status === 'open') n += 1;
  }
  return n;
}

function normalizeSprintLanes(lanes) {
  if (!Array.isArray(lanes) || lanes.length < 1) return { ok: false, reason: 'lanes must include 1–8 entries' };
  if (lanes.length > 8) return { ok: false, reason: 'max 8 lanes' };
  const seen = new Set();
  const out = [];
  for (const raw of lanes) {
    const check = validateLaneAgent(raw?.agent);
    if (!check.ok) return check;
    if (seen.has(check.slug)) return { ok: false, reason: `Duplicate lane for ${check.slug}` };
    seen.add(check.slug);
    const lead_measures = Array.isArray(raw.lead_measures) ? raw.lead_measures : [];
    for (const m of lead_measures) {
      const source = m?.evidence?.source || 'self_report';
      const srcCheck = validateEvidenceSource(source);
      if (!srcCheck.ok) return srcCheck;
    }
    out.push({
      agent: check.slug,
      role: String(raw.role || '').trim() || SPRINT_ROSTER[check.slug],
      lead_measures: lead_measures.map(m => ({
        id: String(m.id || m.label || 'measure').trim(),
        label: String(m.label || m.id || 'measure').trim(),
        per: m.per || 'day',
        target: m.target ?? 1,
        evidence: {
          source: m?.evidence?.source || 'self_report',
          ...(m?.evidence?.min != null ? { min: m.evidence.min } : {}),
          ...(m?.evidence?.target != null ? { target: m.evidence.target } : {}),
          ...(m?.evidence?.protein_g != null ? { protein_g: m.evidence.protein_g } : {}),
          ...(m?.evidence?.calories != null ? { calories: m.evidence.calories } : {})
        }
      })),
      goal_ids: Array.isArray(raw.goal_ids) ? raw.goal_ids.map(String) : [],
      task_ids: Array.isArray(raw.task_ids) ? raw.task_ids.map(String) : [],
      status: raw.status === 'paused' ? 'paused' : 'active',
      note: String(raw.note || '')
    });
  }
  return { ok: true, lanes: out };
}

function normalizeHeadline(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const metric = raw.metric && typeof raw.metric === 'object' ? raw.metric : null;
  if (!metric?.label) return { ok: false, reason: 'headline.metric.label is required' };
  if (metric.source) {
    const src = validateEvidenceSource(metric.source);
    if (!src.ok) return src;
  }
  return {
    ok: true,
    headline: {
      label: String(raw.label || metric.label).trim(),
      metric: {
        label: String(metric.label).trim(),
        unit: metric.unit || '',
        direction: metric.direction === 'up' ? 'up' : 'down',
        source: metric.source || 'self_report',
        ...(metric.baseline != null ? { baseline: Number(metric.baseline) } : {}),
        ...(metric.target != null ? { target: Number(metric.target) } : {})
      },
      ...(Array.isArray(raw.secondary) ? { secondary: raw.secondary } : {})
    }
  };
}

function canLeadSprint(ctx, leadAgent) {
  const slug = ctx.agentSlug;
  if (slug === 'hammond' || slug === 'clare') return true;
  if (leadAgent && slug === leadAgent) return true;
  return false;
}

async function handleTrackOpenSprint(ctx, input) {
  const title = String(input.title || '').trim();
  const goal = String(input.goal || '').trim();
  if (!title || !goal) return deny('title and goal are required');
  const lanesNorm = normalizeSprintLanes(input.lanes);
  if (!lanesNorm.ok) return deny(lanesNorm.reason);
  const lead = String(input.lead_agent || 'hammond').trim().toLowerCase() || 'hammond';
  const leadCheck = validateLaneAgent(lead);
  if (!leadCheck.ok) return deny(leadCheck.reason);
  if (!canLeadSprint(ctx, lead)) {
    return deny('Only Hammond, Clare, or the lead agent may open a sprint');
  }
  const headlineNorm = input.headline != null ? normalizeHeadline(input.headline) : { ok: true, headline: null };
  if (!headlineNorm.ok) return deny(headlineNorm.reason);
  const vizNorm = normalizeSprintViz(input.viz);
  if (!vizNorm.ok) return deny(vizNorm.reason);

  const existingId = String(input.challenge_id || '').trim();
  if (existingId) {
    const resolved = await resolveChallengeRecord(ctx, existingId);
    if (!resolved) return deny(`Challenge not found: ${existingId}`);
    const { path, challenge, sha } = resolved;
    if (challenge.kind === 'sprint' && challenge.status === 'open') {
      return deny('Challenge is already a sprint');
    }
    const start = isCalendarDate(input.start_date) ? input.start_date : challenge.start_date;
    const end = isCalendarDate(input.end_date) ? input.end_date : challenge.end_date;
    const length = sprintLengthDays({ start_date: start, end_date: end });
    const cadence = { ...defaultCadenceForLength(length), ...(input.cadence || {}) };
    const upgraded = {
      ...challenge,
      title,
      goal,
      start_date: start,
      end_date: end,
      notes: input.notes != null ? String(input.notes) : challenge.notes,
      kind: 'sprint',
      lead_agent: lead,
      headline: headlineNorm.headline,
      cadence: resolveCadence({ start_date: start, end_date: end, cadence }),
      lanes: lanesNorm.lanes,
      checkins: Array.isArray(challenge.checkins) ? challenge.checkins : [],
      protocol_suggestions: Array.isArray(challenge.protocol_suggestions) ? challenge.protocol_suggestions : [],
      progress: Array.isArray(challenge.progress) ? challenge.progress : [],
      status: 'open',
      updated_at: new Date().toISOString(),
      upgraded_at: new Date().toISOString()
    };
    if (vizNorm.viz) upgraded.viz = vizNorm.viz;
    const vizBit = formatVizForConfirm(vizNorm.viz || resolveSprintViz(upgraded));
    return propose(
      buildProposal({
        agentSlug: ctx.agentSlug,
        intent: `Upgrade to sprint: ${title}`,
        surfaces: ['confirm_card', 'governance_log'],
        writes: [{
          path,
          mode: 'overwrite',
          content: serializeJson(upgraded),
          diff: `upgrade ${existingId} → sprint, ${lanesNorm.lanes.length} lanes (${start} → ${end})${vizBit ? `; ${vizBit}` : ''}`
        }]
      })
    );
  }

  const openCount = await countOpenSprints(ctx);
  if (openCount >= 3) return deny('Max 3 open sprints — close or finish one first');

  const start = isCalendarDate(input.start_date) ? input.start_date : ctx.today;
  const end = isCalendarDate(input.end_date) ? input.end_date : addCalendarDays(start, 11);
  const length = sprintLengthDays({ start_date: start, end_date: end });
  const cadence = resolveCadence({ start_date: start, end_date: end, cadence: input.cadence || {} });
  const id = newId('ch');
  const path = challengePath(start, title);
  const body = {
    id,
    title,
    goal,
    metric: headlineNorm.headline?.metric?.label || null,
    start_date: start,
    end_date: end,
    notes: input.notes || '',
    status: 'open',
    owner_agent: ctx.agentSlug,
    progress: [],
    kind: 'sprint',
    lead_agent: lead,
    headline: headlineNorm.headline,
    cadence,
    lanes: lanesNorm.lanes,
    checkins: [],
    protocol_suggestions: [],
    created_at: new Date().toISOString()
  };
  if (vizNorm.viz) body.viz = vizNorm.viz;
  const laneList = lanesNorm.lanes.map(l => `${SPRINT_ROSTER[l.agent]} (${l.role})`).join(', ');
  const vizBit = formatVizForConfirm(vizNorm.viz || resolveSprintViz(body));
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Open sprint: ${title}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `sprint ${title}: ${laneList}; ${start} → ${end}; daily_check=${cadence.daily_check}${vizBit ? `; ${vizBit}` : ''}`
      }]
    })
  );
}

async function handleTrackCheckinLane(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  const status = String(input.status || '').trim();
  if (!challengeId || !status) return deny('challenge_id and status are required');
  if (!['on_track', 'stalled', 'no_evidence'].includes(status)) {
    return deny('status must be on_track, stalled, or no_evidence');
  }
  const resolved = await resolveChallengeRecord(ctx, challengeId);
  if (!resolved) return deny(`Challenge not found: ${challengeId}`);
  const { path, challenge, sha } = resolved;
  if (challenge.status === 'closed') return deny('Sprint is closed');
  if (challenge.kind !== 'sprint') return deny('Not a sprint — open or upgrade first');
  const lane = (challenge.lanes || []).find(l => l.agent === ctx.agentSlug);
  const isLead = ctx.agentSlug === 'hammond' || ctx.agentSlug === challenge.lead_agent;
  if (!lane && !isLead) {
    return deny(`You do not own a lane on this sprint (own lane only)`);
  }
  // Hammond/lead writing without their own lane still records adam fields + optional named lane via note only
  const date = isCalendarDate(input.date) ? input.date : ctx.today;
  const kind = ['daily', 'weekly', 'final'].includes(input.kind) ? input.kind : 'daily';
  if (!Array.isArray(challenge.checkins)) challenge.checkins = [];
  let entry = challenge.checkins.find(c => c.date === date && c.kind === kind);
  if (!entry) {
    entry = { date, kind, by: ctx.agentSlug, lanes: {} };
    challenge.checkins.push(entry);
  }
  if (lane) {
    entry.lanes = entry.lanes || {};
    entry.lanes[ctx.agentSlug] = {
      status,
      note: String(input.note || '')
    };
  } else if (isLead && input.note) {
    entry.note = String(input.note);
  }
  if (isLead) {
    const adam = {};
    if (input.adam_rating != null) adam.rating = Number(input.adam_rating);
    if (input.adam_win) adam.win = String(input.adam_win);
    if (input.adam_snag) adam.snag = String(input.adam_snag);
    if (input.adam_note) adam.note = String(input.adam_note);
    if (Object.keys(adam).length) entry.adam = { ...(entry.adam || {}), ...adam };
    if (input.protocol_session_id) entry.protocol_session_id = String(input.protocol_session_id);
  }
  entry.by = ctx.agentSlug;
  challenge.updated_at = new Date().toISOString();
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(challenge),
    `track: lane check-in ${challengeId}`,
    sha
  );
  return ok('Lane check-in saved', { path, challenge_id: challengeId, date, checkin_kind: kind });
}

async function handleTrackLinkLane(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  const agent = String(input.agent || '').trim().toLowerCase();
  const goalId = input.goal_id != null ? String(input.goal_id).trim() : '';
  const taskId = input.task_id != null ? String(input.task_id).trim() : '';
  if (!challengeId || !agent) return deny('challenge_id and agent are required');
  if (!goalId && !taskId) return deny('goal_id or task_id required');
  const agentCheck = validateLaneAgent(agent);
  if (!agentCheck.ok) return deny(agentCheck.reason);
  const resolved = await resolveChallengeRecord(ctx, challengeId);
  if (!resolved) return deny(`Challenge not found: ${challengeId}`);
  const { path, challenge, sha } = resolved;
  if (challenge.kind !== 'sprint') return deny('Not a sprint');
  const lane = (challenge.lanes || []).find(l => l.agent === agent);
  if (!lane) return deny(`No lane for ${agent}`);
  const allowed = ctx.agentSlug === agent
    || ctx.agentSlug === 'hammond'
    || ctx.agentSlug === 'clare'
    || ctx.agentSlug === challenge.lead_agent;
  if (!allowed) return deny('Only the lane owner, Hammond, or Clare may link');
  if (goalId) {
    lane.goal_ids = Array.isArray(lane.goal_ids) ? lane.goal_ids : [];
    if (!lane.goal_ids.includes(goalId)) lane.goal_ids.push(goalId);
  }
  if (taskId) {
    lane.task_ids = Array.isArray(lane.task_ids) ? lane.task_ids : [];
    if (!lane.task_ids.includes(taskId)) lane.task_ids.push(taskId);
  }
  challenge.updated_at = new Date().toISOString();
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(challenge),
    `track: link lane ${challengeId}`,
    sha
  );
  return ok('Lane linked', { path, challenge_id: challengeId, agent });
}

async function handleTrackReviseSprint(ctx, input) {
  const challengeId = String(input.challenge_id || '').trim();
  if (!challengeId) return deny('challenge_id is required');
  const resolved = await resolveChallengeRecord(ctx, challengeId);
  if (!resolved) return deny(`Challenge not found: ${challengeId}`);
  const { path, challenge } = resolved;
  if (challenge.kind !== 'sprint') return deny('Not a sprint');
  if (!canLeadSprint(ctx, challenge.lead_agent)) {
    return deny('Only Hammond, Clare, or the lead agent may revise a sprint');
  }
  const next = { ...challenge };
  if (input.title) next.title = String(input.title).trim();
  if (input.goal) next.goal = String(input.goal).trim();
  if (isCalendarDate(input.start_date)) next.start_date = input.start_date;
  if (isCalendarDate(input.end_date)) next.end_date = input.end_date;
  if (input.notes != null) next.notes = String(input.notes);
  if (input.lead_agent) {
    const leadCheck = validateLaneAgent(input.lead_agent);
    if (!leadCheck.ok) return deny(leadCheck.reason);
    next.lead_agent = leadCheck.slug;
  }
  if (input.lanes) {
    const lanesNorm = normalizeSprintLanes(input.lanes);
    if (!lanesNorm.ok) return deny(lanesNorm.reason);
    next.lanes = lanesNorm.lanes;
  }
  if (input.headline != null) {
    const headlineNorm = normalizeHeadline(input.headline);
    if (!headlineNorm.ok) return deny(headlineNorm.reason);
    next.headline = headlineNorm.headline;
  }
  if (input.viz != null) {
    const vizNorm = normalizeSprintViz(input.viz);
    if (!vizNorm.ok) return deny(vizNorm.reason);
    next.viz = vizNorm.viz
      ? { ...(typeof challenge.viz === 'object' && challenge.viz ? challenge.viz : {}), ...vizNorm.viz }
      : challenge.viz;
  }
  if (input.cadence) {
    next.cadence = resolveCadence({ ...next, cadence: { ...resolveCadence(next), ...input.cadence } });
  }
  next.updated_at = new Date().toISOString();
  const vizBit = formatVizForConfirm(next.viz || resolveSprintViz(next));
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Revise sprint: ${next.title || challengeId}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'overwrite',
        content: serializeJson(next),
        diff: `revise sprint ${challengeId}${vizBit ? `; ${vizBit}` : ''}`
      }]
    })
  );
}

const CN_AGENT_NAMES = {
  brisket: 'Brisket',
  chadwick: 'Chadwick',
  hyaluronica: 'Hyaluronica',
  penelope: 'Penelope',
  sara: 'Sara',
  vera: 'Vera',
  hammond: 'Hammond',
  clare: 'Clare',
  ann: 'Ann',
  clementine: 'Clementine'
};
const CENTRAL_NODE_PATH = 'central-node.md';

function cnAgentName(slug) {
  return CN_AGENT_NAMES[slug] ?? (slug ? `${slug.charAt(0).toUpperCase()}${slug.slice(1)}` : 'Agent');
}

/** Auto lines must be signed by the agent writing them. */
function unsignedAutoLine(patch, name) {
  if (patch.op !== 'append_line') return null;
  const line = patch.payload.text.replace(/^-\s*/, '').replace(/^\*\*[^*]+\*\*\s*/, '').trim();
  if (patch.section === 'cross_agent' && !line.startsWith(`${name}\u2192`)) {
    return `Cross-Agent lines must start "${name}\u2192<Agent>: ".`;
  }
  if (patch.section === 'recent_actions' && !line.startsWith(name)) {
    return `Recent Agent Actions lines must start with "${name}".`;
  }
  return null;
}

async function currentTree(ctx) {
  if (typeof ctx.client?.resolveTree === 'function') {
    const current = await ctx.client.resolveTree();
    if (Array.isArray(current?.tree)) return current.tree;
  }
  return repoTreeOf(ctx);
}

async function readTextFile(ctx, tree, path) {
  const entry = fileFromTree(tree, path);
  if (!entry?.sha) return { text: null, sha: null };
  const raw = await ctx.readBlob(entry.sha);
  return { text: typeof raw === 'string' ? raw : null, sha: entry.sha };
}

/**
 * Central Node write for any agent. Hammond lends the write, so the path
 * allowlist is not consulted: risk decides instead. Auto-class lines land in
 * central-node.md now; Constraints and every other Confirm-class change go to
 * the pending queue, which the Central Node page shows as Confirm cards.
 */
async function handleCoordinateRequestCnWrite(ctx, input) {
  const reason = String(input.reason || '').trim();
  const summary = String(input.summary || '').trim();
  if (!reason) return deny('reason is required');
  if (!summary) return deny('summary is required');
  const payload = { summary };
  for (const key of ['text', 'field', 'match']) {
    if (typeof input[key] === 'string') payload[key] = input[key];
  }
  const patch = validateCentralNodePatchInput({ section: input.section, op: input.op, payload });
  if (!patch) {
    return deny('Invalid patch: append_line needs text; upsert_field needs field and text (Today\'s Status only); delete_lines needs match; replace_section and condense need text.');
  }
  const contentError = centralNodePatchContentError(patch);
  if (contentError) {
    return deny('This Week is weekly averages and key events only. No day-by-day logs (Writing Rule 5).');
  }
  const name = cnAgentName(ctx.agentSlug);
  // Constraints is the medical source of truth: every change waits on Adam.
  const auto = classifyCentralNodePatchRisk(patch) === 'auto' && patch.section !== 'constraints';
  if (auto) {
    const unsigned = unsignedAutoLine(patch, name);
    if (unsigned) return deny(unsigned);
  }

  const tree = await currentTree(ctx);
  const centralNode = await readTextFile(ctx, tree, CENTRAL_NODE_PATH);
  if (centralNode.text == null) return deny('Central Node is not available.');

  if (auto) {
    const next = applyCentralNodePatch(centralNode.text, patch);
    if (!next) return deny('This change could not be applied to Central Node.');
    const result = await ctx.client.writeFile({
      path: CENTRAL_NODE_PATH,
      content: next,
      sha: centralNode.sha,
      message: `chore(cn): ${name}: ${summary}`
    });
    return {
      kind: 'cn_applied',
      status: 'applied',
      message: `Central Node updated: ${summary}`,
      summary,
      section: patch.section,
      content: next,
      sha: result?.sha ?? null
    };
  }

  const queueFile = await readTextFile(ctx, tree, PENDING_CN_PATCHES_PATH);
  const queue = parsePendingCnPatches(queueFile.text ?? '');
  const duplicate = findDuplicatePendingCnPatch(queue, patch);
  if (duplicate) {
    return {
      kind: 'cn_patch_queued',
      status: 'awaiting_confirm',
      already_queued: true,
      id: duplicate.id,
      patch: duplicate.patch,
      message: 'Already waiting on Adam\'s Confirm on the Central Node page. Not applied yet.'
    };
  }
  const baseSectionText = ['replace_section', 'condense'].includes(patch.op)
    ? readCentralNodeSectionBody(centralNode.text, patch.section)
    : null;
  const entry = {
    id: createPendingCnPatchId(),
    createdAt: isCalendarDate(ctx.today) ? ctx.today : getSydneyDateKey(new Date()),
    slug: ctx.agentSlug,
    patch,
    evidence: reason,
    ...(typeof baseSectionText === 'string' ? { base_section_text: baseSectionText } : {})
  };
  const nextQueue = addPendingCnPatch(queue, entry);
  const written = await ctx.client.writeFile({
    path: PENDING_CN_PATCHES_PATH,
    content: serializePendingCnPatches(nextQueue),
    ...(queueFile.sha ? { sha: queueFile.sha } : {}),
    message: `chore(cn-patch-queue): ${name} proposes ${summary}`
  });
  return {
    kind: 'cn_patch_queued',
    status: 'awaiting_confirm',
    id: entry.id,
    patch,
    queue: nextQueue,
    queueSha: written?.sha ?? null,
    message: 'Queued for Adam\'s Confirm on the Central Node page. Not applied yet.'
  };
}

async function handleResearchSaveBrief(ctx, input) {
  const title = String(input.title || '').trim();
  const domain = String(input.domain || 'general').trim();
  const summary = String(input.summary || '').trim();
  if (!title || !summary) return deny('title and summary are required');
  const ttl = resolveResearchTtl(domain, input.ttl_days);
  const created = new Date().toISOString();
  const body = {
    id: newId('rb'),
    title,
    domain,
    summary,
    body: input.body || '',
    sources: Array.isArray(input.sources) ? input.sources.map(String) : [],
    ttl_days: ttl,
    created_at: created,
    expires_at: researchExpiresAt(domain, created, ttl),
    owner_agent: ctx.agentSlug
  };
  const path = researchPath(ctx.today, title);
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Save research: ${title}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `${domain} · TTL ${ttl}d — ${summary}`
      }]
    })
  );
}

async function handleResearchExpiringBrief(ctx, input) {
  const within = Number.isFinite(Number(input.within_days)) ? Number(input.within_days) : 7;
  const cutoff = Date.now() + within * 86400000;
  const files = repoTreeOf(ctx).filter(item =>
    item.type === 'blob'
    && typeof item.path === 'string'
    && item.path.startsWith(`${RESEARCH_DIR}/`)
    && item.path.endsWith('.json')
  );
  const expiring = [];
  for (const file of files) {
    try {
      const raw = await ctx.readBlob(file.sha);
      const brief = parseJsonBlob(raw, null);
      if (!brief?.expires_at) continue;
      if (brief.owner_agent && brief.owner_agent !== ctx.agentSlug) continue;
      const exp = Date.parse(brief.expires_at);
      if (Number.isFinite(exp) && exp <= cutoff) {
        expiring.push({
          id: brief.id,
          title: brief.title,
          domain: brief.domain,
          expires_at: brief.expires_at,
          path: file.path
        });
      }
    } catch {
      /* skip */
    }
  }
  return ok(`Found ${expiring.length} brief(s) expiring within ${within}d`, { briefs: expiring });
}

function loadWidgetTemplate(templateId) {
  const root = capabilitiesRoot();
  const path = join(root, 'widgets', 'templates', `${templateId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function handlePublishSurfaceWidget(ctx, input) {
  const templateId = String(input.template_id || '').trim();
  const title = String(input.title || '').trim();
  if (!templateId || !title) return deny('template_id and title are required');
  const template = loadWidgetTemplate(templateId);
  if (!template) return deny(`Template not found: ${templateId}`);
  if (!template.approved) {
    return deny(`Template ${templateId} is not Adam-approved yet — one at a time`);
  }
  const path = widgetPath(ctx.today, title);
  const body = {
    id: newId('wg'),
    template_id: templateId,
    title,
    props: input.props && typeof input.props === 'object' ? input.props : {},
    owner_agent: ctx.agentSlug,
    created_at: new Date().toISOString(),
    status: 'published'
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Publish widget: ${title}`,
      surfaces: ['confirm_card', 'hub_tab', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `template=${templateId}`
      }]
    })
  );
}

async function handlePlanWeekMeals(ctx, input) {
  const weekId = String(input.week_id || '').trim();
  if (!weekId || !input.meals || typeof input.meals !== 'object') {
    return deny('week_id and meals are required');
  }
  const path = `data/nutrition/meal-plans/week-${slugify(weekId)}.json`;
  const body = {
    week_id: weekId,
    meals: input.meals,
    notes: input.notes || '',
    planned_by: ctx.agentSlug,
    updated_at: new Date().toISOString()
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Week meals: ${weekId}`,
      surfaces: ['confirm_card', 'nutrition_tab', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: input.notes || 'Meal plan proposal'
      }]
    })
  );
}

async function handleDeleteMeal(ctx, input) {
  if (ctx.agentSlug !== 'brisket') {
    return deny('Only Brisket can delete nutrition meal records');
  }
  const date = String(input.date || '').trim();
  const meal = String(input.meal || '').trim();
  const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
  if (!isCalendarDate(date)) return deny('date must be YYYY-MM-DD');
  if (!isMealSlot(meal)) return deny('meal must be breakfast, lunch, dinner, snack, or dessert');

  const paths = findMealDeletePaths(repoTreeOf(ctx), date, meal, slug ? { slug } : {});
  if (paths.length === 0) {
    return deny(slug
      ? `No ${meal} record with slug ${slug} found for ${date}`
      : `No ${meal} record found for ${date}`);
  }

  const label = slug || meal;
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Delete ${label} for ${date}`,
      surfaces: ['confirm_card', 'nutrition_tab', 'central_node', 'governance_log'],
      reads: paths,
      writes: paths.map(path => ({
        path,
        mode: 'delete',
        content: '',
        diff: `Remove ${path.split('/').pop()}`
      }))
    })
  );
}

async function handleLookupFoodBrandAu(_ctx, input) {
  const brand = String(input.brand || '').trim();
  const product = String(input.product || '').trim();
  if (!brand || !product) return deny('brand and product are required');
  return ok(
    `AU lookup: search Australian sources only for ${brand} ${product} (FSANZ, brand .com.au, Coles/Woolworths, CalorieKing AU). Then cache with save_food_library_entry.`,
    {
      brand,
      product,
      region: 'AU',
      notes: input.notes || '',
      next_step: 'save_food_library_entry'
    }
  );
}

async function handleOsCapabilityScoreboard(ctx, input) {
  const registry = loadRegistry();
  const ids = capabilityIdsForAgent(ctx.agentSlug);
  const rows = ids.map(id => {
    const def = loadCapability(id);
    return {
      id,
      risk: def?.risk || 'confirm',
      one_liner: def?.prompt_one_liner || id
    };
  });
  const detail = input.detail !== false;
  const promoted = detail ? await handleOsListPromotedShortcuts(ctx, { limit: 12 }) : null;
  return ok(`Capability scoreboard for ${ctx.agentSlug}`, {
    agent_id: ctx.agentSlug,
    count: rows.length,
    capabilities: detail ? rows : rows.map(row => row.id),
    registry_version: registry.version,
    ...(detail && promoted?.kind === 'ok'
      ? { promoted_shortcuts: promoted.drafts, promoted_shortcut_count: promoted.count }
      : {})
  });
}





async function handleIntuitionEditPack(ctx, input) {
  const packId = String(input.pack_id || '').trim();
  const reason = String(input.reason || '').trim();
  if (!packId || !reason) return deny('pack_id and reason are required');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(packId)) return deny('pack_id must be a kebab-case id');
  const path = `intuition/${packId}.json`;
  const { value: existing, sha } = await readJson(ctx, path, null);
  if (!existing || typeof existing !== 'object') {
    return deny(`Intuition pack not found: ${packId}`);
  }
  const agents = Array.isArray(existing.agents) ? existing.agents : [];
  if (agents.length && !agents.includes(ctx.agentSlug) && !agents.includes('*')) {
    return deny(`Agent ${ctx.agentSlug} does not own intuition pack ${packId}`);
  }
  const patched = applyIntuitionEdit(existing, {
    id: packId,
    summary: input.summary,
    guidance: input.guidance
  });
  if (!patched) return deny('Invalid intuition edit');
  if (typeof input.guidance === 'string' && input.guidance.trim()) {
    patched.guidance = input.guidance.trim();
  }
  if (typeof input.summary === 'string' && input.summary.trim()) {
    patched.summary = input.summary.trim();
  }
  patched.updated_at = new Date().toISOString();
  patched.updated_by = ctx.agentSlug;
  patched.last_edit_reason = reason;
  await writeAllowlisted(
    ctx.client,
    ctx.agentSlug,
    path,
    serializeJson(patched),
    `intuition: edit ${packId}`,
    sha
  );
  return ok(`Updated intuition pack ${packId}`, { path, pack_id: packId, reason });
}


function promotedShortcutPath(proposedId) {
  return `${OS_DIR}/promoted-shortcuts/${slugify(proposedId)}.json`;
}

function normalizeWrite(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const path = typeof entry.path === 'string' ? entry.path.trim() : '';
  const mode = typeof entry.mode === 'string' ? entry.mode.trim() : 'create';
  const content = typeof entry.content === 'string' ? entry.content : null;
  const diff = typeof entry.diff === 'string' ? entry.diff.trim() : '';
  if (!path || content == null) return null;
  return { path, mode, content, ...(diff ? { diff } : {}) };
}

async function handleOsListPromotedShortcuts(ctx, input) {
  const limit = Number.isFinite(input?.limit) ? Math.min(Math.max(Math.floor(input.limit), 1), 50) : 20;
  const tree = repoTreeOf(ctx);
  const prefix = `${OS_DIR}/promoted-shortcuts/`;
  const paths = (Array.isArray(tree) ? tree : [])
    .filter(item => item?.type === 'blob' && typeof item.path === 'string' && item.path.startsWith(prefix) && item.path.endsWith('.json'))
    .map(item => item.path)
    .sort();
  const drafts = [];
  for (const path of paths.slice(0, limit)) {
    const { value } = await readJson(ctx, path, null);
    if (!value || typeof value !== 'object') continue;
    drafts.push({
      path,
      proposed_id: value.proposed_id || null,
      tool_name: value.tool_name || null,
      summary: value.summary || null,
      risk: value.risk || 'confirm',
      status: value.status || null,
      proposed_by: value.proposed_by || null,
      write_count: Array.isArray(value.example_writes) ? value.example_writes.length : 0
    });
  }
  return ok(`Found ${drafts.length} promoted shortcut draft(s)`, { drafts, count: drafts.length });
}

async function handleOsRunPromotedShortcut(ctx, input) {
  const proposedId = String(input.proposed_id || '').trim();
  if (!proposedId) return deny('proposed_id is required');
  if (!/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/.test(proposedId)) {
    return deny('proposed_id must look like area.name (e.g. track.morning-weigh-in)');
  }
  const path = promotedShortcutPath(proposedId);
  const { value: draft } = await readJson(ctx, path, null);
  if (!draft || typeof draft !== 'object') {
    return deny(`No promoted shortcut draft at ${path}. Promote + Confirm first.`);
  }
  const rawWrites = Array.isArray(input.writes) && input.writes.length
    ? input.writes
    : (Array.isArray(draft.example_writes) ? draft.example_writes : []);
  const writes = rawWrites.map(normalizeWrite).filter(Boolean);
  if (!writes.length) {
    return deny('Draft has no example_writes. Pass writes when calling os_run_promoted_shortcut, or re-promote with example_writes.');
  }
  const intent = String(input.intent || draft.example_intent || draft.summary || `Run promoted shortcut: ${proposedId}`).trim();
  const proposal = buildProposal({
    agentSlug: ctx.agentSlug,
    intent,
    surfaces: ['confirm_card', 'governance_log'],
    writes: writes.map(write => ({
      path: write.path,
      mode: write.mode,
      content: write.content,
      diff: write.diff || `${write.mode} ${write.path} via ${proposedId}`
    })),
    reads: [path]
  });
  const validated = validateProposeActionInput(proposal, { agentSlug: ctx.agentSlug });
  if (!validated.ok) {
    return deny(`Promoted shortcut writes failed allowlist/validation: ${validated.error}${validated.detail ? ` (${validated.detail})` : ''}`);
  }
  return propose(validated.proposal);
}

async function handleOsPromoteShortcut(ctx, input) {
  const proposedId = String(input.proposed_id || '').trim();
  const summary = String(input.summary || '').trim();
  const exampleIntent = String(input.example_intent || '').trim();
  if (!proposedId || !summary || !exampleIntent) {
    return deny('proposed_id, summary, and example_intent are required');
  }
  if (!/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/.test(proposedId)) {
    return deny('proposed_id must look like area.name (e.g. track.morning-weigh-in)');
  }
  const toolName = String(input.tool_name || proposedId.replace(/\./g, '_').replace(/-/g, '_'));
  const risk = input.risk === 'auto' ? 'auto' : 'confirm';
  const id = newId('promo');
  const path = promotedShortcutPath(proposedId);
  const body = {
    id,
    proposed_id: proposedId,
    tool_name: toolName,
    summary,
    example_intent: exampleIntent,
    example_writes: Array.isArray(input.example_writes) ? input.example_writes : [],
    risk,
    status: 'ready',
    proposed_by: ctx.agentSlug,
    created_at: new Date().toISOString(),
    note: 'Confirm materialises this draft under data/os. Run it later with os_run_promoted_shortcut (still Confirm for the concrete writes). Does not mutate capabilities/registry.'
  };
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: `Promote shortcut: ${proposedId}`,
      surfaces: ['confirm_card', 'governance_log'],
      writes: [{
        path,
        mode: 'create',
        content: serializeJson(body),
        diff: `${proposedId} (${risk}) — ${summary}`
      }]
    })
  );
}


const TASK_DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
const TASK_PRIORITIES = new Set(['urgent', 'high', 'medium', 'low']);
const TASK_STATUSES = new Set(['open', 'in_progress', 'done', 'deferred', 'dead']);

function asOptionalString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeTaskItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = asOptionalString(raw.title);
  if (!title) return null;
  const domain = TASK_DOMAINS.has(raw.domain) ? raw.domain : 'other';
  const priority = TASK_PRIORITIES.has(raw.priority) ? raw.priority : 'medium';
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [];
  const estimated = typeof raw.estimated_duration === 'number' && Number.isFinite(raw.estimated_duration)
    ? raw.estimated_duration
    : null;
  return {
    title,
    description: typeof raw.description === 'string' ? raw.description : '',
    domain,
    priority,
    due_date: asOptionalString(raw.due_date),
    due_time: asOptionalString(raw.due_time),
    start_time: asOptionalString(raw.start_time),
    end_time: asOptionalString(raw.end_time),
    block_date: asOptionalString(raw.block_date),
    parent_project_id: asOptionalString(raw.parent_project_id),
    parent_task_id: asOptionalString(raw.parent_task_id),
    estimated_duration: estimated,
    tags,
    waiting_on: asOptionalString(raw.waiting_on),
    waiting_since: asOptionalString(raw.waiting_since),
    follow_up_at: asOptionalString(raw.follow_up_at),
    waiting_status: asOptionalString(raw.waiting_status),
    target_date: asOptionalString(raw.target_date),
    review_at: asOptionalString(raw.review_at),
    contexts: Array.isArray(raw.contexts) ? raw.contexts : undefined,
    cognitive_load: asOptionalString(raw.cognitive_load),
    depth: asOptionalString(raw.depth)
  };
}

function collectCreateTaskItems(input) {
  const raw = Array.isArray(input?.items) && input.items.length
    ? input.items.map(normalizeTaskItem).filter(Boolean)
    : (() => {
        const one = normalizeTaskItem(input);
        return one ? [one] : [];
      })();
  const expanded = [];
  for (const item of raw) {
    const parts = explodeCompoundDumpTitle(item.title, {
      preferredDomain: item.domain || 'teaching'
    });
    if (!parts?.length) {
      expanded.push(item);
      continue;
    }
    for (const part of parts) {
      expanded.push({
        ...item,
        title: part.title,
        domain: part.domain || item.domain,
        priority: part.priority || item.priority,
        due_date: part.due_date || item.due_date,
        // One slot cannot hold several split-out tasks: they go on the day unblocked.
        start_time: null,
        end_time: null,
        block_date: null
      });
    }
  }
  return expanded;
}

function buildTaskRecord(item, { id, now, today }) {
  const record = {
    schema_version: 1,
    id,
    title: item.title,
    description: item.description,
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: item.domain,
    framework_used: null,
    estimated_duration: item.estimated_duration,
    actual_duration: null,
    due_date: item.due_date || today || null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: item.priority,
    parent_project_id: item.parent_project_id,
    parent_task_id: item.parent_task_id,
    depends_on: [],
    tags: item.tags,
    recurrence_rule: null,
    due_time: item.due_time,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'suggested_by_agent',
    page_blocks: []
  };
  if (item.waiting_on) record.waiting_on = item.waiting_on;
  if (item.waiting_since) record.waiting_since = item.waiting_since;
  if (item.follow_up_at) record.follow_up_at = item.follow_up_at;
  if (item.waiting_status) record.waiting_status = item.waiting_status;
  if (item.target_date) record.target_date = item.target_date;
  if (item.review_at) record.review_at = item.review_at;
  if (item.contexts) record.contexts = item.contexts;
  if (item.cognitive_load) record.cognitive_load = item.cognitive_load;
  if (item.depth) record.depth = item.depth;
  return record;
}

async function handleCreateTask(ctx, input) {
  const items = collectCreateTaskItems(input);
  if (!items.length) return deny('title or items[].title is required');
  if (items.length > CREATE_TASK_MAX_ITEMS) {
    return deny(`at most ${CREATE_TASK_MAX_ITEMS} tasks per create_task call`);
  }
  // Sara may only create health-domain tasks (Medical Overview ↔ Tasks).
  if (ctx.agentSlug === 'sara') {
    const bad = items.find(item => (item.domain || 'other') !== 'health');
    if (bad) return deny('Sara create_task is restricted to domain: health');
    for (const item of items) item.domain = 'health';
  }
  // Twins guard: the same work captured twice (a second dump, a re-run turn, re-worded
  // titles) must never land as a second open task.
  const openTasks = Array.isArray(ctx.openTasks)
    ? ctx.openTasks.filter(isOpenTask)
    : ctx.tasksStore
      ? (await listTasksJSON(ctx.tasksStore, TASK_PREFIX).catch(() => [])).filter(isOpenTask)
      : [];
  const skipped = [];
  const flagged = new Map();
  const kept = [];
  for (const item of items) {
    const twin = findTaskTwin(item.title, [...openTasks, ...kept]);
    if (twin?.match === 'same_title') {
      skipped.push({ title: item.title, existing_task_id: twin.task.id ?? null, existing_title: twin.task.title });
      continue;
    }
    if (twin?.match === 'same_person') flagged.set(item, twin.task);
    kept.push(item);
  }
  const skippedMeta = skipped.length
    ? {
        skipped_duplicates: skipped,
        note: 'Already on the board — not created again. Use get_task + update_task to change the existing task.'
      }
    : {};
  if (!kept.length) {
    return ok(
      skipped.length === 1 ? `Already on the board: ${skipped[0].existing_title}` : `All ${skipped.length} already on the board`,
      { status: 'skipped_duplicates', ...skippedMeta }
    );
  }

  const now = new Date().toISOString();
  const today = typeof ctx.today === 'string' && ctx.today.trim() ? ctx.today.trim() : null;
  const blockWrites = [];
  const taskWrites = kept.map(item => {
    const id = newTaskId();
    const twin = flagged.get(item);
    const record = buildTaskRecord(item, { id, now, today });
    const block = taskBlockWrite(record, item, now, { today });
    if (block) blockWrites.push(block);
    return {
      path: `tasks:task:${id}`,
      mode: 'create',
      content: serializeJson(record),
      diff: twin
        ? `new task: ${item.title} (possible duplicate of open task “${twin.title}”)`
        : `new task: ${item.title}`
    };
  });
  // Task rows first: results[i] lines up with taskWrites[i] below.
  const writes = [...taskWrites, ...blockWrites];
  const proposal = buildProposal({
    agentSlug: ctx.agentSlug,
    intent: kept.length === 1 ? `Create task: ${kept[0].title}` : `Create ${kept.length} tasks`,
    surfaces: ['confirm_card', 'governance_log'],
    writes
  });
  // Only a single, unflagged capture writes straight away. A dump (2+ tasks) or anything
  // that may duplicate open work waits for Adam's Confirm.
  const writeNow = kept.length === 1 && flagged.size === 0;
  if (ctx.tasksStore && writeNow) {
    const applied = await executeProposeActionWrites({}, proposal, {
      blobStores: { tasks: ctx.tasksStore }
    });
    if (!applied.ok) return deny(applied.error || 'create_failed');
    const tasks = taskWrites.map((write, index) => {
      const record = JSON.parse(write.content);
      const stamp = applied.results[index]?.updated_at;
      if (stamp) {
        record.updated_at = stamp;
        if (!record.created_at) record.created_at = stamp;
      }
      return record;
    });
    return ok(`Created ${kept[0].title}`, { status: 'applied', tasks, ids: tasks.map(task => task.id), ...skippedMeta });
  }
  return { ...propose(proposal), ...skippedMeta };
}

function buildUpdateTaskPatch(input) {
  const patch = {};
  const title = asOptionalString(input.title);
  const description = typeof input.description === 'string' ? input.description : null;
  const append = asOptionalString(input.append_description);
  if (title) patch.title = title;
  if (description != null) patch.description = description;
  if (append) patch.append_description = append;
  if (TASK_STATUSES.has(input.status)) patch.status = input.status;
  if (TASK_PRIORITIES.has(input.priority)) patch.priority = input.priority;
  if (TASK_DOMAINS.has(input.domain)) patch.domain = input.domain;
  if (asOptionalString(input.due_date)) patch.due_date = asOptionalString(input.due_date);
  if (asOptionalString(input.due_time)) patch.due_time = asOptionalString(input.due_time);
  if (asOptionalString(input.parent_project_id)) patch.parent_project_id = asOptionalString(input.parent_project_id);
  if (asOptionalString(input.parent_task_id)) patch.parent_task_id = asOptionalString(input.parent_task_id);
  if (typeof input.estimated_duration === 'number' && Number.isFinite(input.estimated_duration)) {
    patch.estimated_duration = input.estimated_duration;
  }
  if (asOptionalString(input.kind)) patch.kind = asOptionalString(input.kind);
  if (asOptionalString(input.bucket)) patch.bucket = asOptionalString(input.bucket);
  if (Array.isArray(input.tags)) patch.tags = input.tags.map(String).filter(Boolean);
  if (asOptionalString(input.waiting_on)) patch.waiting_on = asOptionalString(input.waiting_on);
  if (asOptionalString(input.waiting_since)) patch.waiting_since = asOptionalString(input.waiting_since);
  if (asOptionalString(input.follow_up_at)) patch.follow_up_at = asOptionalString(input.follow_up_at);
  if (asOptionalString(input.waiting_status)) patch.waiting_status = asOptionalString(input.waiting_status);
  if (asOptionalString(input.target_date)) patch.target_date = asOptionalString(input.target_date);
  if (asOptionalString(input.review_at)) patch.review_at = asOptionalString(input.review_at);
  if (Array.isArray(input.contexts)) patch.contexts = input.contexts;
  if (asOptionalString(input.cognitive_load)) patch.cognitive_load = asOptionalString(input.cognitive_load);
  if (asOptionalString(input.depth)) patch.depth = asOptionalString(input.depth);
  return patch;
}

/** A linked work block for update_task's start_time + end_time (the deadline is untouched). */
async function resolveKnownTask(ctx, taskId) {
  const listed = Array.isArray(ctx.openTasks) ? ctx.openTasks.find(task => task?.id === taskId) : null;
  if (listed) return listed;
  if (!ctx.tasksStore || !taskId) return null;
  try {
    const record = await getTasksJSON(ctx.tasksStore, taskKey(taskId));
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

function updateBlockWrite(ctx, taskId, item, patch, known) {
  const task = {
    id: taskId,
    title: patch.title || known?.title || 'Planned work',
    due_date: patch.due_date || known?.due_date || null,
    parent_project_id: known?.parent_project_id ?? null,
    depth: patch.depth || known?.depth || null
  };
  const today = typeof ctx.today === 'string' && ctx.today.trim() ? ctx.today.trim() : null;
  return taskBlockWrite(task, item, new Date().toISOString(), { today });
}

function updateTaskIntent(writes) {
  const taskWrites = writes.filter((write) => /^tasks:task:/.test(String(write?.path || '')));
  if (!taskWrites.length) {
    return writes.length === 1 ? 'Block time on the calendar' : `Block ${writes.length} calendar slots`;
  }
  if (taskWrites.length === 1) {
    const title = typeof taskWrites[0].title === 'string' ? taskWrites[0].title.trim() : '';
    return title ? `Update ${title}` : `Update task ${taskWrites[0].path.replace('tasks:task:', '')}`;
  }
  return `Update ${taskWrites.length} tasks`;
}

async function handleUpdateTask(ctx, input) {
  const batchItems = Array.isArray(input?.items)
    ? input.items.slice(0, CREATE_TASK_MAX_ITEMS)
    : null;
  if (batchItems?.length) {
    const writes = [];
    for (const item of batchItems) {
      const taskId = asOptionalString(item?.task_id);
      if (!taskId) continue;
      const patch = buildUpdateTaskPatch(item);
      const known = await resolveKnownTask(ctx, taskId);
      const block = updateBlockWrite(ctx, taskId, item, patch, known);
      if (!Object.keys(patch).length && !block) continue;
      if (Object.keys(patch).length) {
        writes.push({
          path: `tasks:task:${taskId}`,
          mode: 'append',
          content: serializeJson(patch),
          diff: `update ${taskId}: ${Object.keys(patch).join(', ')}`,
          ...(known?.title ? { title: known.title } : {})
        });
      }
      if (block) writes.push(block);
    }
    if (!writes.length) return deny('update_task items[] need task_id and at least one field');
    return propose(
      buildProposal({
        agentSlug: ctx.agentSlug,
        intent: updateTaskIntent(writes),
        surfaces: ['confirm_card', 'governance_log'],
        writes
      })
    );
  }
  const taskId = asOptionalString(input?.task_id);
  if (!taskId) return deny('task_id is required');
  const patch = buildUpdateTaskPatch(input);
  const known = await resolveKnownTask(ctx, taskId);
  const block = updateBlockWrite(ctx, taskId, input, patch, known);
  if (!Object.keys(patch).length && !block) return deny('update_task needs at least one field to change');
  const writes = [
    ...(Object.keys(patch).length ? [{
      path: `tasks:task:${taskId}`,
      mode: 'append',
      content: serializeJson(patch),
      diff: `update ${taskId}: ${Object.keys(patch).join(', ')}`,
      ...(known?.title ? { title: known.title } : {})
    }] : []),
    ...(block ? [block] : [])
  ];
  return propose(
    buildProposal({
      agentSlug: ctx.agentSlug,
      intent: updateTaskIntent(writes),
      surfaces: ['confirm_card', 'governance_log'],
      writes
    })
  );
}

export async function executeShortcut(toolName, input, ctx) {
  if (!shortcutSchemas()[toolName]) return deny(`Unknown shortcut: ${toolName}`);
  try {
    switch (toolName) {
      case 'remember_set_week_flag':
        return await handleRememberSetWeekFlag(ctx, input);
      case 'remember_note_context':
        return await handleRememberNoteContext(ctx, input);
      case 'remember_write_memory':
        return await handleRememberWriteMemory(ctx, input);
      case 'track_open_challenge':
        return await handleTrackOpenChallenge(ctx, input);
      case 'track_log_progress':
        return await handleTrackLogProgress(ctx, input);
      case 'track_close_challenge':
        return await handleTrackCloseChallenge(ctx, input);
      case 'track_open_sprint':
        return await handleTrackOpenSprint(ctx, input);
      case 'track_checkin_lane':
        return await handleTrackCheckinLane(ctx, input);
      case 'track_link_lane':
        return await handleTrackLinkLane(ctx, input);
      case 'track_revise_sprint':
        return await handleTrackReviseSprint(ctx, input);
      case 'coordinate_request_cn_write':
        return await handleCoordinateRequestCnWrite(ctx, input);
      case 'research_save_brief':
        return await handleResearchSaveBrief(ctx, input);
      case 'research_expiring_brief':
        return await handleResearchExpiringBrief(ctx, input);
      case 'publish_surface_widget':
        return await handlePublishSurfaceWidget(ctx, input);
      case 'plan_week_meals':
        return await handlePlanWeekMeals(ctx, input);
      case 'delete_meal':
        return await handleDeleteMeal(ctx, input);
      case 'lookup_food_brand_au':
        return await handleLookupFoodBrandAu(ctx, input);
      case 'os_capability_scoreboard':
        return await handleOsCapabilityScoreboard(ctx, input);
      case 'intuition_edit_pack':
        return await handleIntuitionEditPack(ctx, input);
      case 'os_promote_shortcut':
        return await handleOsPromoteShortcut(ctx, input);
      case 'os_list_promoted_shortcuts':
        return await handleOsListPromotedShortcuts(ctx, input);
      case 'os_run_promoted_shortcut':
        return await handleOsRunPromotedShortcut(ctx, input);
      case 'create_task':
        return await handleCreateTask(ctx, input);
      case 'update_task':
        return handleUpdateTask(ctx, input);
      default:
        return deny(`Unhandled shortcut: ${toolName}`);
    }
  } catch (err) {
    return deny(err?.message || String(err));
  }
}

export {
  CHALLENGES_DIR,
  RESEARCH_DIR,
  REMEMBER_WEEK_FLAGS_PATH,
  REMEMBER_CONTEXT_NOTES_PATH,
  REMEMBER_LAYERED_MEMORIES_PATH,
  CN_LOANS_PATH,
  WIDGETS_DIR,
  OS_DIR
};
