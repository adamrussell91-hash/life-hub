// Propose a Professional Hub Observation (Confirm only).

import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';

function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

const SOURCES = new Set(['meeting', 'communication', 'manual', 'imported']);

export function proposeObservationSchema() {
  return {
    name: 'propose_observation',
    description:
      'Propose a free-text observation note about a Person or Organisation (e.g. something Adam mentioned in conversation). Call search_people first for about_ref. Nothing is saved until Adam taps Confirm. Default source is manual.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card.' },
        about_ref: {
          type: 'string',
          description: 'shared:person:… or shared:organisation:… from search_people'
        },
        text: { type: 'string', description: 'Observation body (required).' },
        occurred_at: { type: 'string', description: 'ISO timestamp; defaults to now.' },
        source: {
          type: 'string',
          enum: ['meeting', 'communication', 'manual', 'imported'],
          description: 'Defaults to manual for chat proposals.'
        },
        linked_ref: { type: 'string', description: 'Optional related entity ref.' }
      },
      required: ['summary', 'about_ref', 'text'],
      additionalProperties: false
    }
  };
}

export async function buildObservationProposal(input, { nameForRef, nowIso } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const aboutRaw = clean(input.about_ref, 120);
  const about = parseEntityRef(aboutRaw);
  if (!about || about.namespace !== 'shared' || (about.kind !== 'person' && about.kind !== 'organisation')) {
    return { ok: false, error: 'invalid_about_ref' };
  }
  const aboutRef = formatEntityRef(about);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return { ok: false, error: 'text_required' };
  if (text.length > 8000) return { ok: false, error: 'text_too_long' };

  let name = aboutRef;
  if (typeof nameForRef === 'function') {
    try {
      name = (await nameForRef(aboutRef)) || aboutRef;
    } catch {
      name = aboutRef;
    }
  }

  const source = SOURCES.has(input.source) ? input.source : 'manual';
  let occurredAt = typeof input.occurred_at === 'string' ? input.occurred_at.trim() : '';
  if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
    occurredAt = typeof nowIso === 'string' && Number.isFinite(Date.parse(nowIso))
      ? nowIso
      : new Date().toISOString();
  }

  const body = {
    about_ref: aboutRef,
    text,
    occurred_at: occurredAt,
    source
  };
  if (typeof input.linked_ref === 'string' && input.linked_ref.trim()) {
    body.linked_ref = input.linked_ref.trim();
  }

  const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  return {
    ok: true,
    proposal: {
      intent: summary,
      reads: [],
      writes: [{
        path: 'people:observation:new-1',
        mode: 'create',
        content: JSON.stringify(body),
        diff: `Observation about ${name}: ${preview}`
      }],
      surfaces: ['confirm_card', 'governance_log']
    }
  };
}
