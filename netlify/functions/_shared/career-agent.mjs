// Career application / future propose tools for Clare, Hammond, Ann.
// Confirm-only via professional:application:* / professional:future:* paths.

import { createApplicationRepository } from './application-repository.mjs';
import { createCareerRepository } from './career-repository.mjs';

export const CAREER_AGENT_SLUGS = new Set(['clare', 'hammond', 'ann']);

const NEW_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function proposeApplicationSchema() {
  return {
    name: 'propose_application',
    description:
      'Propose adding a Career application (position + advertisement). Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        position_title: { type: 'string' },
        advertisement: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            source: { type: 'string' },
            summary: { type: 'string' }
          },
          additionalProperties: false
        },
        closing_date: { type: 'string', description: 'YYYY-MM-DD' },
        organisation_ref: { type: 'string', description: 'shared:organisation:… → applies_to link' },
        key: { type: 'string' }
      },
      required: ['summary', 'position_title', 'advertisement'],
      additionalProperties: false
    }
  };
}

export function proposeFutureSchema() {
  return {
    name: 'propose_future',
    description:
      'Propose adding a Career future (role aspiration). Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        title: { type: 'string' },
        where: { type: 'string' },
        target_date: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string' },
        key: { type: 'string' }
      },
      required: ['summary', 'title'],
      additionalProperties: false
    }
  };
}

export function buildApplicationProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const position_title = clean(input.position_title, 300);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!position_title) return { ok: false, error: 'position_title_required' };
  if (!input.advertisement || typeof input.advertisement !== 'object' || Array.isArray(input.advertisement)) {
    return { ok: false, error: 'advertisement_required' };
  }

  const ad = {};
  for (const field of ['title', 'url', 'source', 'summary']) {
    const value = clean(input.advertisement[field], field === 'summary' ? 2000 : 500);
    if (value) ad[field] = value;
  }
  if (!Object.keys(ad).length) return { ok: false, error: 'advertisement_empty' };

  const key = clean(input.key, 31) || `a${Date.now().toString(36)}`;
  if (!NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_key' };
  const path = `professional:application:new-${key.toLowerCase()}`;

  const body = {
    position_title,
    advertisement: ad,
    ...(DATE_RE.test(input.closing_date ?? '') ? { closing_date: input.closing_date } : {}),
    links: []
  };
  const org = clean(input.organisation_ref, 120);
  if (org) body.links.push({ relationship_type: 'applies_to', target_ref: org });

  return {
    ok: true,
    proposal: {
      intent: summary,
      reads: [],
      writes: [{
        path,
        mode: 'create',
        content: JSON.stringify(body),
        diff: `Add application: ${position_title}`
      }],
      surfaces: ['confirm_card', 'governance_log']
    }
  };
}

export function buildFutureProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 300);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!title) return { ok: false, error: 'title_required' };

  const key = clean(input.key, 31) || `f${Date.now().toString(36)}`;
  if (!NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_key' };
  const path = `professional:future:new-${key.toLowerCase()}`;
  const body = {
    title,
    ...(clean(input.where, 200) ? { where: clean(input.where, 200) } : {}),
    ...(DATE_RE.test(input.target_date ?? '') ? { target_date: input.target_date } : {}),
    ...(clean(input.status, 40) ? { status: clean(input.status, 40) } : {})
  };

  return {
    ok: true,
    proposal: {
      intent: summary,
      reads: [],
      writes: [{
        path,
        mode: 'create',
        content: JSON.stringify(body),
        diff: `Add future: ${title}`
      }],
      surfaces: ['confirm_card', 'governance_log']
    }
  };
}

function parseBody(write) {
  try {
    const parsed = JSON.parse(write.content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function proError(code, detail) {
  return { ok: false, error: code, ...(detail ? { detail } : {}) };
}

export function createCareerWriteExecutor({ store, env, now } = {}) {
  if (!store) throw new Error('createCareerWriteExecutor requires a professional store.');
  const appRepo = createApplicationRepository({ store, env, ...(now ? { now } : {}) });
  const careerRepo = createCareerRepository({ store, ...(now ? { now } : {}) });

  async function apply(write, target) {
    const body = parseBody(write);
    if (!body) return proError('invalid_professional_write', write.path);
    try {
      if (target.kind === 'application' && write.mode === 'create') {
        const { application } = await appRepo.createApplication(body);
        return {
          ok: true,
          result: { path: write.path, mode: 'create', id: application.id, title: application.position_title }
        };
      }
      if (target.kind === 'future' && write.mode === 'create') {
        const future = await careerRepo.createFuture(body);
        return { ok: true, result: { path: write.path, mode: 'create', id: future.id, title: future.title } };
      }
      return proError('unknown_write_target', write.path);
    } catch (error) {
      return proError(typeof error?.code === 'string' ? error.code : 'professional_write_failed', error?.message);
    }
  }

  return { apply };
}
