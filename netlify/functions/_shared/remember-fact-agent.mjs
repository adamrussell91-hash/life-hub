// Propose a Remember fact on a Person (Confirm only). Chat author is Adam.

import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { REMEMBER_TEXT_MAX } from './remember-schema.mjs';

function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function proposeRememberFactSchema() {
  return {
    name: 'propose_remember_fact',
    description:
      'Propose a short Remember fact about a Person (≤120 chars). Call search_people first for person_ref. Saved only after Adam taps Confirm; authored as Adam. Do not invent facts Adam did not state.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card.' },
        person_ref: { type: 'string', description: 'shared:person:… from search_people' },
        text: { type: 'string', description: `Fact line (≤${REMEMBER_TEXT_MAX} chars).` },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              ref: { type: 'string' },
              excerpt: { type: 'string' }
            },
            additionalProperties: false
          }
        }
      },
      required: ['summary', 'person_ref', 'text'],
      additionalProperties: false
    }
  };
}

export async function buildRememberFactProposal(input, { nameForRef } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const person = parseEntityRef(typeof input.person_ref === 'string' ? input.person_ref.trim() : '');
  if (!person || person.namespace !== 'shared' || person.kind !== 'person') {
    return { ok: false, error: 'invalid_person_ref' };
  }
  const personRef = formatEntityRef(person);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return { ok: false, error: 'text_required' };
  if (text.length > REMEMBER_TEXT_MAX) return { ok: false, error: 'text_too_long' };

  let name = personRef;
  if (typeof nameForRef === 'function') {
    try {
      name = (await nameForRef(personRef)) || personRef;
    } catch {
      name = personRef;
    }
  }

  const body = {
    person_ref: personRef,
    text,
    author: 'adam'
  };
  if (Array.isArray(input.sources) && input.sources.length) {
    body.sources = input.sources
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        ...(typeof item.kind === 'string' ? { kind: item.kind } : {}),
        ...(typeof item.ref === 'string' ? { ref: item.ref } : {}),
        ...(typeof item.excerpt === 'string' ? { excerpt: item.excerpt } : {})
      }))
      .slice(0, 6);
  }

  return {
    ok: true,
    proposal: {
      intent: summary,
      reads: [],
      writes: [{
        path: 'people:remember:new-1',
        mode: 'create',
        content: JSON.stringify(body),
        diff: `Remember about ${name}: ${text}`
      }],
      surfaces: ['confirm_card', 'governance_log']
    }
  };
}
