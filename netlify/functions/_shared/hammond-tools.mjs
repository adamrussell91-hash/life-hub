import {
  CENTRAL_NODE_SECTIONS,
  classifyCentralNodePatchRisk,
  applyCentralNodePatch,
  centralNodePatchContentError
} from '../../../apps/life/js/core/central-node-patch.js';
import { GOVERNANCE_ENTRY_TYPES } from '../../../apps/life/js/core/governance-log.js';
import { formatHubRef, parseHubRef } from './hub-ref.mjs';

export { classifyCentralNodePatchRisk, applyCentralNodePatch, centralNodePatchContentError };

const CENTRAL_NODE_OPS = [
  'upsert_field',
  'append_line',
  'replace_section',
  'delete_lines',
  'condense'
];

export function proposeCentralNodePatchSchema() {
  return {
    name: 'propose_central_node_patch',
    description:
      'Propose a structured Central Node edit. Server classifies risk: compact low-risk writes auto-apply; high-risk edits queue a Confirm card. Always include a short human-readable payload.summary.',
    input_schema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: [...CENTRAL_NODE_SECTIONS],
          description: 'Central Node section to mutate'
        },
        op: {
          type: 'string',
          enum: [...CENTRAL_NODE_OPS],
          description: 'Mutation kind'
        },
        payload: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'One-liner for Confirm card / toast'
            },
            field: {
              type: 'string',
              description: 'Status field name for upsert_field (e.g. Flags)'
            },
            text: {
              type: 'string',
              description: 'Line or section body text for upsert/append/replace/condense'
            },
            match: {
              type: 'string',
              description: 'Substring matching lines to remove for delete_lines'
            }
          },
          required: ['summary']
        }
      },
      required: ['section', 'op', 'payload']
    }
  };
}

export function appendGovernanceLogSchema() {
  return {
    name: 'append_governance_log',
    description:
      "Append a dated Governance Log entry (Coach's Notes, Drift Detection, Weekly Review, etc.). Always auto-applies. Put durable reasoning here; keep Central Node compact.",
    input_schema: {
      type: 'object',
      properties: {
        entry_type: {
          type: 'string',
          enum: [...GOVERNANCE_ENTRY_TYPES],
          description: 'Protocol entry type'
        },
        body: {
          type: 'string',
          description: 'Entry body markdown'
        },
        title: {
          type: 'string',
          description: 'Optional short title'
        },
        status: {
          type: 'string',
          description: 'Optional status (e.g. Still Active, Resolved)'
        },
        dateKey: {
          type: 'string',
          description: 'Optional YYYY-MM-DD; server may default when omitted'
        },
        chosen: {
          type: 'string',
          description: 'Option taken. Use the same Title on later entries to trace how it changed.'
        },
        reasoning: {
          type: 'string',
          description: 'Why this option won. A second agent can append another entry with the same Title.'
        },
        revisit: {
          type: 'string',
          description: 'Optional YYYY-MM-DD to look at this decision again'
        },
        decision_id: {
          type: 'string',
          description: 'Stable id for this thread. Knowledge cites it as life:decision:{id}.'
        },
        about: {
          type: 'array',
          items: { type: 'string' },
          description: 'Hub refs this decision is about (teaching:unit:…, tasks:project:…, page ids).'
        }
      },
      required: ['entry_type', 'body']
    }
  };
}

const CALENDAR_GHOST_KIND_ENUM = [
  'skip_workout',
  'bedtime',
  'protect_block',
  'move_task',
  'create_task',
  'outing',
  'meal_block',
  'schedule_workout',
  'reschedule_block',
  'cancel_block',
  'log_comm',
  'draft_message',
  'split_task',
  'goal_rest_weeks',
  'book_comm'
];

export function proposeCalendarGhostSchema() {
  return {
    name: 'propose_calendar_ghost',
    description:
      'Propose something on Adam’s calendar (outing, meal time, workout time, protect, bedtime, tasks, reschedule/cancel, or log a communication). Queues a dashed ghost and a chat Confirm card — nothing is written until he Confirms in chat or Accepts on the calendar.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [...CALENDAR_GHOST_KIND_ENUM],
          description: 'Ghost kind. Prefer outing for named plans (breakfast/dinner/errand); meal_block for meal times; schedule_workout for training; log_comm to log an email/call; reschedule_block / cancel_block for existing Life calendar_block paths.'
        },
        date: { type: 'string', description: 'YYYY-MM-DD for dated kinds' },
        reason: { type: 'string', description: 'Short why, shown on the chip' },
        time: { type: 'string', description: 'bedtime / log_comm time HH:MM (log_comm defaults to 12:00)' },
        start: { type: 'string', description: 'protect_block / outing / meal_block / schedule_workout / reschedule start HH:MM' },
        end: { type: 'string', description: 'protect_block / outing / meal_block / schedule_workout / reschedule end HH:MM' },
        title: { type: 'string', description: 'Block / task / communication title or subject' },
        subject: { type: 'string', description: 'log_comm subject (alias of title)' },
        with: { type: 'string', description: 'companion (e.g. corey) for outing / protect_block' },
        place: { type: 'string', description: 'optional place for outing (stored in notes)' },
        notes: { type: 'string', description: 'create_task notes or outing/meal notes' },
        path: { type: 'string', description: 'Life record path for reschedule_block / cancel_block' },
        workoutPath: { type: 'string', description: 'skip_workout Life record path' },
        overItem: { type: 'string', description: 'skip_workout chip id to decorate' },
        taskId: { type: 'string', description: 'move_task id' },
        from: { type: 'string', description: 'move_task from date' },
        to: { type: 'string', description: 'move_task to date' },
        due: { type: 'string', description: 'create_task due date' },
        direction: { type: 'string', enum: ['outbound', 'inbound'], description: 'log_comm direction' },
        channel: {
          type: 'string',
          enum: ['email', 'phone', 'message', 'in_person', 'video', 'other'],
          description: 'log_comm / book_comm channel'
        },
        summary: { type: 'string', description: 'log_comm summary body' },
        person_refs: {
          type: 'array',
          items: { type: 'string' },
          description: 'log_comm / book_comm people refs (e.g. shared:person:…)'
        },
        time_zone: { type: 'string', description: 'IANA tz for log_comm / book_comm (default Australia/Sydney)' },
        duration_min: { type: 'integer', description: 'book_comm duration minutes' }
      },
      required: ['kind']
    }
  };
}

const SPECIALIST_CN_SENDERS = {
  clare: 'Clare',
  ann: 'Ann'
};

export const PROTOCOL_CN_SENDERS = {
  fates: 'The Three Fates',
  horizon: 'Horizon Council',
  refinery: 'The Refinery',
  cartographers: 'The Cartographers',
  mirror: 'The Mirror Council',
  consilium: 'The Consilium',
  witness: 'The Witness',
  tribunal: 'The Tribunal'
};

export function assertAgentMayApplyCentralNodePatch(slug, patch) {
  if (slug === 'hammond') return true;
  const specialist = SPECIALIST_CN_SENDERS[slug];
  if (specialist) {
    if (!patch || typeof patch !== 'object') return false;
    if (patch.section !== 'cross_agent' || patch.op !== 'append_line') return false;
    const text = typeof patch.payload?.text === 'string' ? patch.payload.text.trim() : '';
    const line = text.replace(/^-\s*/, '');
    return line.startsWith(`${specialist}\u2192`);
  }
  const protocolId = typeof slug === 'string' && slug.startsWith('protocol:') ? slug.slice('protocol:'.length) : '';
  const sender = PROTOCOL_CN_SENDERS[protocolId] || (patch && PROTOCOL_CN_SENDERS[patch.protocolId]);
  const named = patch?.sender && Object.values(PROTOCOL_CN_SENDERS).includes(patch.sender) ? patch.sender : sender;
  if (!named || !patch || typeof patch !== 'object') return false;
  if (!['recent_actions', 'cross_agent'].includes(patch.section) || patch.op !== 'append_line') return false;
  const text = typeof patch.payload?.text === 'string' ? patch.payload.text.trim() : '';
  const line = text.replace(/^-\s*/, '');
  if (patch.section === 'recent_actions') return line.startsWith(`${named}:`);
  return line.startsWith(`${named}\u2192`);
}

export function validateCentralNodePatchInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { section, op, payload } = input;
  if (!CENTRAL_NODE_SECTIONS.includes(section)) return null;
  if (!CENTRAL_NODE_OPS.includes(op)) return null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.summary !== 'string' || !payload.summary.trim()) return null;

  const normalized = {
    section,
    op,
    payload: { summary: payload.summary.trim() }
  };

  if (op === 'upsert_field') {
    if (typeof payload.field !== 'string' || !payload.field.trim()) return null;
    if (typeof payload.text !== 'string') return null;
    normalized.payload.field = payload.field.trim();
    normalized.payload.text = payload.text;
    return normalized;
  }

  if (op === 'append_line') {
    if (typeof payload.text !== 'string' || !payload.text.trim()) return null;
    normalized.payload.text = payload.text.trim();
    return normalized;
  }

  if (op === 'delete_lines') {
    if (typeof payload.match !== 'string' || payload.match === '') return null;
    normalized.payload.match = payload.match;
    return normalized;
  }

  if (op === 'replace_section' || op === 'condense') {
    if (typeof payload.text !== 'string') return null;
    normalized.payload.text = payload.text;
    return normalized;
  }

  return null;
}

export function validateGovernanceLogAppendInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entryType = input.entry_type;
  if (!GOVERNANCE_ENTRY_TYPES.includes(entryType)) return null;
  if (typeof input.body !== 'string' || !input.body.trim()) return null;

  const entry = {
    entryType,
    body: input.body.trim()
  };

  if (typeof input.title === 'string' && input.title.trim()) {
    entry.title = input.title.trim();
  }
  if (typeof input.status === 'string' && input.status.trim()) {
    entry.status = input.status.trim();
  }
  if (typeof input.dateKey === 'string' && input.dateKey.trim()) {
    entry.dateKey = input.dateKey.trim();
  }
  if (typeof input.chosen === 'string' && input.chosen.trim()) {
    entry.chosen = input.chosen.trim();
  }
  if (typeof input.reasoning === 'string' && input.reasoning.trim()) {
    entry.reasoning = input.reasoning.trim();
  }
  if (typeof input.revisit === 'string' && input.revisit.trim()) {
    entry.revisit = input.revisit.trim();
  }
  if (typeof input.decision_id === 'string' && input.decision_id.trim()) {
    entry.decisionId = input.decision_id.trim();
  }
  if (Array.isArray(input.about)) {
    const about = [];
    const seen = new Set();
    for (const item of input.about) {
      const parsed = parseHubRef(item);
      if (!parsed) continue;
      const stored = formatHubRef(parsed);
      if (seen.has(stored)) continue;
      seen.add(stored);
      about.push(stored);
    }
    if (about.length) entry.about = about;
  }

  return entry;
}
