import {
  CENTRAL_NODE_SECTIONS,
  classifyCentralNodePatchRisk,
  applyCentralNodePatch
} from '../../../apps/life/js/core/central-node-patch.js';
import { GOVERNANCE_ENTRY_TYPES } from '../../../apps/life/js/core/governance-log.js';

export { classifyCentralNodePatchRisk, applyCentralNodePatch };

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
        }
      },
      required: ['entry_type', 'body']
    }
  };
}

const SPECIALIST_CN_SENDERS = {
  clare: 'Clare',
  ann: 'Ann'
};

export function assertAgentMayApplyCentralNodePatch(slug, patch) {
  if (slug === 'hammond') return true;
  const sender = SPECIALIST_CN_SENDERS[slug];
  if (!sender || !patch || typeof patch !== 'object') return false;
  if (patch.section !== 'cross_agent' || patch.op !== 'append_line') return false;
  const text = typeof patch.payload?.text === 'string' ? patch.payload.text.trim() : '';
  const line = text.replace(/^-\s*/, '');
  return line.startsWith(`${sender}\u2192`);
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

  return entry;
}
