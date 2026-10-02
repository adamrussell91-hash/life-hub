// Professional Hub read + edit tools for Clare, Hammond, Ann.
// search_professional finds existing Meetings / Events / Communications (ids).
// propose_meeting_update / propose_event_update fill in, reschedule, add
// attendees, or change state. propose_communication creates or edits a
// Communication record. Every write waits on Adam's Confirm card.

import { wallLocalToUtcIso } from './wall-time.mjs';
import { createMeetingRepository } from './meeting-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { createCommunicationRepository } from './communication-repository.mjs';
import { MEETING_STATES } from './meeting-schema.mjs';
import { EVENT_OCCURRENCE_STATES, ATTENDANCE_STATES } from './event-schema.mjs';
import { COMMUNICATION_CHANNELS } from './communication-schema.mjs';
import { createAccessContext, createLinkRepoDeps } from './professional-entity-links.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { clean, makeProposal, parseWriteBody, writeError } from './agent-propose-helpers.mjs';

const DEFAULT_TZ = 'Australia/Sydney';
const MEETING_ID_RE = /^meeting_[0-9a-f-]{36}$/;
const EVENT_ID_RE = /^event_[0-9a-f-]{36}$/;
const COMMUNICATION_ID_RE = /^communication_[0-9a-f-]{36}$/;
const NEW_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i;
const MAX_SEARCH = 25;

/** "2026-10-02T12:30" (wall time) or full ISO → UTC ISO. Null when unparseable. */
function toIso(raw, timeZone) {
  const value = clean(raw, 40);
  if (!value) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!m) return null;
  try {
    return wallLocalToUtcIso(`${m[1]}T${m[2]}`, timeZone || DEFAULT_TZ);
  } catch {
    return null;
  }
}

function longText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : undefined;
}

function refs(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(ref => clean(ref, 120)).filter(Boolean))].slice(0, 20);
}

// ---------------------------------------------------------------------------
// search_professional

export function searchProfessionalSchema() {
  return {
    name: 'search_professional',
    description:
      'Find existing Professional Hub Meetings, Events (PD) and Communications by text and/or date range. Returns ids to pass to propose_meeting_update, propose_event_update or propose_communication. Call before editing so you never create a duplicate.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words in the title/subject. Optional.' },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: ['meeting', 'event', 'communication'] },
          description: 'Defaults to all three.'
        },
        from: { type: 'string', description: 'YYYY-MM-DD, optional.' },
        to: { type: 'string', description: 'YYYY-MM-DD, optional (inclusive).' },
        limit: { type: 'number' }
      },
      additionalProperties: false
    }
  };
}

function matches(query, ...texts) {
  if (!query) return true;
  const hay = texts.filter(t => typeof t === 'string').join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => hay.includes(word));
}

function inRange(iso, from, to) {
  if (!from && !to) return true;
  if (typeof iso !== 'string') return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export async function runSearchProfessional(input, { store, env } = {}) {
  if (!store) return { ok: false, error: 'professional_store_unavailable' };
  const query = clean(input?.query, 200);
  const kinds = Array.isArray(input?.kinds) && input.kinds.length
    ? new Set(input.kinds)
    : new Set(['meeting', 'event', 'communication']);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input?.from ?? '') ? input.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input?.to ?? '') ? input.to : null;
  const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), MAX_SEARCH);
  const results = [];

  if (kinds.has('meeting')) {
    const meetings = await createMeetingRepository({ store, env }).listMeetings();
    for (const m of meetings) {
      if (!matches(query, m.title, m.location_text, m.agenda, m.notes, m.purpose)) continue;
      if (!inRange(m.scheduled_start, from, to)) continue;
      results.push({
        kind: 'meeting', id: m.id, title: m.title, start: m.scheduled_start, end: m.scheduled_end,
        state: m.state, location_text: m.location_text, has_agenda: !!m.agenda, has_notes: !!m.notes,
        decisions: (m.decisions ?? []).length
      });
    }
  }
  if (kinds.has('event')) {
    const events = await createEventRepository({ store, env }).listEvents();
    for (const e of events) {
      if (!matches(query, e.title, e.location_text, e.accreditation_category, e.priority_area)) continue;
      if (!inRange(e.start, from, to)) continue;
      results.push({
        kind: 'event', id: e.id, title: e.title, start: e.start, end: e.end, event_type: e.event_type,
        state: e.occurrence_state, attendance_state: e.attendance_state ?? null, hours: e.hours ?? null,
        certificate: e.certificate ? true : false
      });
    }
  }
  if (kinds.has('communication')) {
    const comms = await createCommunicationRepository({ store, env }).listCommunications();
    for (const c of comms) {
      if (!matches(query, c.subject, c.summary, c.purpose_tag)) continue;
      if (!inRange(c.scheduled_start ?? c.occurred_at, from, to)) continue;
      results.push({
        kind: 'communication', id: c.id, subject: c.subject, channel: c.channel, direction: c.direction,
        occurred_at: c.occurred_at, scheduled_start: c.scheduled_start ?? null, purpose_tag: c.purpose_tag ?? null
      });
    }
  }
  results.sort((a, b) => String(b.start ?? b.scheduled_start ?? b.occurred_at ?? '')
    .localeCompare(String(a.start ?? a.scheduled_start ?? a.occurred_at ?? '')));
  return { ok: true, count: Math.min(results.length, limit), total: results.length, results: results.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// propose_meeting_update

export function proposeMeetingUpdateSchema() {
  return {
    name: 'propose_meeting_update',
    description:
      'Edit an existing Professional Hub meeting: fill in agenda / notes / purpose / decisions, rename, move location, reschedule, add attendees, or mark it completed / cancelled / no_show. Get meeting_id from search_professional. Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card.' },
        meeting_id: { type: 'string', description: 'meeting_… id from search_professional.' },
        title: { type: 'string' },
        location_text: { type: 'string' },
        agenda: { type: 'string', description: 'Replaces the agenda text.' },
        notes: { type: 'string', description: 'Replaces the notes text.' },
        purpose: { type: 'string' },
        add_decisions: { type: 'array', items: { type: 'string' }, description: 'Decisions to append.' },
        scheduled_start: { type: 'string', description: 'Reschedule: ISO or YYYY-MM-DDTHH:MM local.' },
        scheduled_end: { type: 'string' },
        time_zone: { type: 'string' },
        reschedule_reason: { type: 'string' },
        state: { type: 'string', enum: ['completed', 'cancelled', 'no_show', 'scheduled'] },
        add_attendee_refs: { type: 'array', items: { type: 'string' }, description: 'shared:person:… refs from search_people.' }
      },
      required: ['summary', 'meeting_id'],
      additionalProperties: false
    }
  };
}

export function buildMeetingUpdateProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const id = clean(input.meeting_id, 80);
  if (!MEETING_ID_RE.test(id)) return { ok: false, error: 'invalid_meeting_id', detail: 'Use search_professional for the meeting_… id.' };

  const body = {};
  const bits = [];
  const fields = {};
  const title = clean(input.title, 500);
  if (title) { fields.title = title; bits.push(`title → ${title}`); }
  if (typeof input.location_text === 'string') { fields.location_text = clean(input.location_text, 500); bits.push('location'); }
  const agenda = longText(input.agenda, 8000);
  if (agenda !== undefined) { fields.agenda = agenda; bits.push('agenda'); }
  const notes = longText(input.notes, 16000);
  if (notes !== undefined) { fields.notes = notes; bits.push('notes'); }
  const purpose = longText(input.purpose, 1000);
  if (purpose !== undefined) { fields.purpose = purpose; bits.push('purpose'); }
  if (Object.keys(fields).length) body.fields = fields;

  const decisions = Array.isArray(input.add_decisions)
    ? input.add_decisions.map(d => clean(d, 500)).filter(Boolean).slice(0, 20)
    : [];
  if (decisions.length) { body.add_decisions = decisions; bits.push(`${decisions.length} decision${decisions.length === 1 ? '' : 's'}`); }

  if (input.scheduled_start !== undefined || input.scheduled_end !== undefined) {
    const timeZone = clean(input.time_zone, 80) || DEFAULT_TZ;
    const start = toIso(input.scheduled_start, timeZone);
    const end = toIso(input.scheduled_end, timeZone);
    if (!start || !end) return { ok: false, error: 'invalid_schedule', detail: 'Reschedule needs scheduled_start and scheduled_end.' };
    if (Date.parse(end) < Date.parse(start)) return { ok: false, error: 'invalid_time_range' };
    body.reschedule = {
      scheduled_start: start,
      scheduled_end: end,
      time_zone: timeZone,
      ...(clean(input.reschedule_reason, 500) ? { reason: clean(input.reschedule_reason, 500) } : {})
    };
    bits.push(`reschedule → ${clean(input.scheduled_start, 40)}`);
  }

  if (input.state !== undefined) {
    if (!MEETING_STATES.has(input.state) || input.state === 'rescheduled') return { ok: false, error: 'invalid_state' };
    if (body.reschedule && input.state !== 'scheduled') return { ok: false, error: 'reschedule_and_state', detail: 'Reschedule and close a meeting in separate cards.' };
    body.state = input.state;
    bits.push(`mark ${input.state.replace('_', ' ')}`);
  }

  const attendees = refs(input.add_attendee_refs);
  if (attendees.length) { body.add_attendee_refs = attendees; bits.push(`+${attendees.length} attendee${attendees.length === 1 ? '' : 's'}`); }

  if (!bits.length) return { ok: false, error: 'no_changes' };
  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: `professional:meeting:${id}`,
      mode: 'overwrite',
      content: JSON.stringify(body),
      diff: `Edit meeting: ${bits.join('; ')}`
    }])
  };
}

// ---------------------------------------------------------------------------
// propose_event_update

export function proposeEventUpdateSchema() {
  return {
    name: 'propose_event_update',
    description:
      'Edit an existing Professional Hub event (PD or general): fill in hours, attendance, certificate, accreditation category, priority area, location, title; reschedule; add attendees; or mark it completed / cancelled. Get event_id from search_professional. Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        event_id: { type: 'string', description: 'event_… id from search_professional.' },
        title: { type: 'string' },
        location_text: { type: 'string' },
        event_type: { type: 'string', enum: ['professional_development', 'general'] },
        hours: { type: 'number' },
        attendance_state: { type: 'string', enum: [...ATTENDANCE_STATES] },
        accreditation_category: { type: 'string' },
        priority_area: { type: 'string' },
        certificate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            issued_at: { type: 'string', description: 'YYYY-MM-DD or ISO' },
            reference: { type: 'string' }
          },
          additionalProperties: false
        },
        start: { type: 'string', description: 'Reschedule: ISO or YYYY-MM-DDTHH:MM local.' },
        end: { type: 'string' },
        time_zone: { type: 'string' },
        all_day: { type: 'boolean' },
        state: { type: 'string', enum: ['completed', 'cancelled', 'scheduled'] },
        add_attendee_refs: { type: 'array', items: { type: 'string' } }
      },
      required: ['summary', 'event_id'],
      additionalProperties: false
    }
  };
}

export function buildEventUpdateProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const id = clean(input.event_id, 80);
  if (!EVENT_ID_RE.test(id)) return { ok: false, error: 'invalid_event_id', detail: 'Use search_professional for the event_… id.' };

  const body = {};
  const fields = {};
  const bits = [];
  const title = clean(input.title, 500);
  if (title) { fields.title = title; bits.push(`title → ${title}`); }
  if (typeof input.location_text === 'string') { fields.location_text = clean(input.location_text, 500); bits.push('location'); }
  if (input.event_type === 'professional_development' || input.event_type === 'general') {
    fields.event_type = input.event_type;
    bits.push(input.event_type === 'general' ? 'general event' : 'PD event');
  }
  if (typeof input.hours === 'number' && Number.isFinite(input.hours) && input.hours >= 0) {
    fields.hours = input.hours;
    bits.push(`${input.hours} h`);
  }
  if (input.attendance_state !== undefined) {
    if (!ATTENDANCE_STATES.has(input.attendance_state)) return { ok: false, error: 'invalid_attendance_state' };
    fields.attendance_state = input.attendance_state;
    bits.push(input.attendance_state);
  }
  if (typeof input.accreditation_category === 'string') {
    fields.accreditation_category = clean(input.accreditation_category, 120);
    bits.push('accreditation');
  }
  if (typeof input.priority_area === 'string') {
    fields.priority_area = clean(input.priority_area, 120);
    bits.push('priority area');
  }
  if (input.certificate && typeof input.certificate === 'object') {
    const cert = {};
    if (clean(input.certificate.name, 200)) cert.name = clean(input.certificate.name, 200);
    if (clean(input.certificate.reference, 200)) cert.reference = clean(input.certificate.reference, 200);
    if (input.certificate.issued_at) {
      const raw = clean(input.certificate.issued_at, 40);
      const issued = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? toIso(`${raw}T12:00`, DEFAULT_TZ) : toIso(raw, DEFAULT_TZ);
      if (!issued) return { ok: false, error: 'invalid_certificate_issued_at' };
      cert.issued_at = issued;
    }
    if (Object.keys(cert).length) { fields.certificate = cert; bits.push('certificate'); }
  }
  if (Object.keys(fields).length) body.fields = fields;

  if (input.start !== undefined || input.end !== undefined) {
    const timeZone = clean(input.time_zone, 80) || DEFAULT_TZ;
    const start = toIso(input.start, timeZone);
    const end = toIso(input.end, timeZone);
    if (!start || !end) return { ok: false, error: 'invalid_schedule', detail: 'Reschedule needs start and end.' };
    if (Date.parse(end) < Date.parse(start)) return { ok: false, error: 'invalid_time_range' };
    body.reschedule = { start, end, time_zone: timeZone, all_day: input.all_day === true };
    bits.push(`reschedule → ${clean(input.start, 40)}`);
  }

  if (input.state !== undefined) {
    if (!EVENT_OCCURRENCE_STATES.has(input.state) || input.state === 'rescheduled') return { ok: false, error: 'invalid_state' };
    if (body.reschedule && input.state !== 'scheduled') return { ok: false, error: 'reschedule_and_state', detail: 'Reschedule and close an event in separate cards.' };
    body.state = input.state;
    bits.push(`mark ${input.state}`);
  }

  const attendees = refs(input.add_attendee_refs);
  if (attendees.length) { body.add_attendee_refs = attendees; bits.push(`+${attendees.length} attendee${attendees.length === 1 ? '' : 's'}`); }

  if (!bits.length) return { ok: false, error: 'no_changes' };
  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: `professional:event:${id}`,
      mode: 'overwrite',
      content: JSON.stringify(body),
      diff: `Edit event: ${bits.join('; ')}`
    }])
  };
}

// ---------------------------------------------------------------------------
// propose_communication

export function proposeCommunicationSchema() {
  return {
    name: 'propose_communication',
    description:
      'Create or edit a Professional Hub Communication record (email, call, message, in person, video). Create: give direction, channel, when (occurred_at for something that happened, or scheduled_start/scheduled_end for a booked call), subject, summary, person_refs. Edit: give communication_id from search_professional plus the fields to change. Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary_line: { type: 'string', description: 'One line for the Confirm card.' },
        communication_id: { type: 'string', description: 'Edit only: communication_… id.' },
        direction: { type: 'string', enum: ['outbound', 'inbound'] },
        channel: { type: 'string', enum: [...COMMUNICATION_CHANNELS] },
        occurred_at: { type: 'string', description: 'ISO or YYYY-MM-DDTHH:MM local.' },
        scheduled_start: { type: 'string', description: 'ISO or YYYY-MM-DDTHH:MM local.' },
        scheduled_end: { type: 'string' },
        time_zone: { type: 'string' },
        subject: { type: 'string' },
        summary: { type: 'string', description: 'The body / notes of the communication.' },
        purpose_tag: { type: 'string' },
        person_refs: { type: 'array', items: { type: 'string' }, description: 'Create only: shared:person:… refs (recipients / sender).' },
        key: { type: 'string' }
      },
      required: ['summary_line'],
      additionalProperties: false
    }
  };
}

export function buildCommunicationProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const cardLine = clean(input.summary_line, 160);
  if (!cardLine) return { ok: false, error: 'summary_required' };
  const timeZone = clean(input.time_zone, 80) || DEFAULT_TZ;
  const scheduledStart = input.scheduled_start !== undefined ? toIso(input.scheduled_start, timeZone) : null;
  const scheduledEnd = input.scheduled_end !== undefined ? toIso(input.scheduled_end, timeZone) : null;
  if (input.scheduled_start !== undefined && !scheduledStart) return { ok: false, error: 'invalid_scheduled_start' };
  if (input.scheduled_end !== undefined && !scheduledEnd) return { ok: false, error: 'invalid_scheduled_end' };
  if (scheduledEnd && !scheduledStart) return { ok: false, error: 'invalid_scheduled_window', detail: 'scheduled_end needs scheduled_start.' };
  if (scheduledStart && scheduledEnd && Date.parse(scheduledEnd) < Date.parse(scheduledStart)) return { ok: false, error: 'invalid_time_range' };

  if (input.communication_id !== undefined) {
    const id = clean(input.communication_id, 80);
    if (!COMMUNICATION_ID_RE.test(id)) return { ok: false, error: 'invalid_communication_id' };
    const patch = {};
    const bits = [];
    if (typeof input.subject === 'string') { patch.subject = clean(input.subject, 500); bits.push('subject'); }
    if (typeof input.summary === 'string') { patch.summary = input.summary.trim().slice(0, 8000); bits.push('summary'); }
    if (typeof input.purpose_tag === 'string') { patch.purpose_tag = clean(input.purpose_tag, 60); bits.push('purpose'); }
    if (scheduledStart) {
      patch.scheduled_start = scheduledStart;
      patch.scheduled_end = scheduledEnd;
      patch.time_zone = timeZone;
      bits.push('time');
    }
    if (!bits.length) return { ok: false, error: 'no_changes' };
    return {
      ok: true,
      proposal: makeProposal(cardLine, [{
        path: `professional:communication:${id}`,
        mode: 'overwrite',
        content: JSON.stringify(patch),
        diff: `Edit communication: ${bits.join(', ')}`
      }])
    };
  }

  const direction = input.direction === 'inbound' ? 'inbound' : 'outbound';
  if (!COMMUNICATION_CHANNELS.has(input.channel)) return { ok: false, error: 'invalid_channel' };
  const occurred = input.occurred_at !== undefined ? toIso(input.occurred_at, timeZone) : scheduledStart;
  if (!occurred) return { ok: false, error: 'when_required', detail: 'Give occurred_at, or scheduled_start for a booked call.' };
  const key = clean(input.key, 31) || `c${Date.now().toString(36)}`;
  if (!NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_key' };
  const subject = clean(input.subject, 500);
  const body = {
    direction,
    channel: input.channel,
    occurred_at: occurred,
    subject,
    summary: typeof input.summary === 'string' ? input.summary.trim().slice(0, 8000) : '',
    links: refs(input.person_refs).map(target_ref => ({ relationship_type: 'recipient', target_ref })),
    ...(scheduledStart ? { scheduled_start: scheduledStart, scheduled_end: scheduledEnd, time_zone: timeZone } : {}),
    ...(clean(input.purpose_tag, 60) ? { purpose_tag: clean(input.purpose_tag, 60) } : {})
  };
  return {
    ok: true,
    proposal: makeProposal(cardLine, [{
      path: `professional:communication:new-${key.toLowerCase()}`,
      mode: 'create',
      content: JSON.stringify(body),
      diff: `Add ${input.channel.replace('_', ' ')} ${direction}: ${subject || '(no subject)'} (${clean(input.occurred_at ?? input.scheduled_start, 40)})`
    }])
  };
}

// ---------------------------------------------------------------------------
// Confirm-time executor

/**
 * Applies overwrite writes on professional:meeting/event:<id> and
 * create/overwrite writes on professional:communication:*.
 */
export function createProfessionalEditWriteExecutor({ store, env, now, resolveEntity, getUniversalLinkStore, createUniversalLinkRepository } = {}) {
  if (!store) throw new Error('createProfessionalEditWriteExecutor requires a professional store.');
  const meetingRepo = createMeetingRepository({ store, env, ...(now ? { now } : {}) });
  const eventRepo = createEventRepository({ store, env, ...(now ? { now } : {}) });
  const commRepo = createCommunicationRepository({ store, env, ...(now ? { now } : {}) });
  const linkDeps = createLinkRepoDeps({
    resolveEntity: resolveEntity ?? defaultResolveEntity,
    getUniversalLinkStore,
    createUniversalLinkRepository,
    ...(now ? { now } : {})
  });

  async function addAttendees(sourceRef, targets) {
    if (!targets?.length) return;
    const linkStore = await linkDeps.getUniversalLinkStore(env);
    const links = linkDeps.createUniversalLinkRepository({ store: linkStore, resolveEntity: linkDeps.resolveEntity, now: linkDeps.now });
    const access = createAccessContext({ workflow: 'life' });
    for (const target_ref of targets) {
      try {
        await links.createLink({ source_ref: sourceRef, target_ref, relationship_type: 'attendee' }, access);
      } catch (error) {
        // Already an attendee is fine; anything else surfaces.
        if (!/duplicate|already|exists/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`)) throw error;
      }
    }
  }

  async function applyMeeting(id, body) {
    if (body.fields || body.add_decisions) {
      const patch = { ...(body.fields ?? {}) };
      if (body.add_decisions?.length) {
        const existing = await meetingRepo.getMeeting(id);
        const current = existing?.meeting?.decisions ?? existing?.decisions ?? [];
        patch.decisions = [
          ...current,
          ...body.add_decisions.map((text, index) => ({ id: `d_${current.length + index + 1}`, text }))
        ];
      }
      await meetingRepo.updateMeeting(id, patch);
    }
    if (body.reschedule) await meetingRepo.rescheduleMeeting(id, body.reschedule);
    if (body.state) await meetingRepo.transitionState(id, body.state);
    await addAttendees(`professional:meeting:${id}`, body.add_attendee_refs);
    const read = await meetingRepo.getMeeting(id);
    return read?.meeting ?? read;
  }

  async function applyEvent(id, body) {
    if (body.fields) await eventRepo.updateEvent(id, body.fields);
    if (body.reschedule) await eventRepo.rescheduleEvent(id, body.reschedule);
    if (body.state) await eventRepo.transitionState(id, body.state);
    await addAttendees(`professional:event:${id}`, body.add_attendee_refs);
    const read = await eventRepo.getEvent(id);
    return read?.event ?? read;
  }

  async function apply(write, target) {
    const body = parseWriteBody(write);
    if (!body) return writeError('invalid_professional_write', write.path);
    try {
      if (target.kind === 'meeting' && write.mode === 'overwrite' && MEETING_ID_RE.test(target.id)) {
        const meeting = await applyMeeting(target.id, body);
        return { ok: true, result: { path: write.path, mode: 'overwrite', id: target.id, title: meeting?.title ?? null } };
      }
      if (target.kind === 'event' && write.mode === 'overwrite' && EVENT_ID_RE.test(target.id)) {
        const event = await applyEvent(target.id, body);
        return { ok: true, result: { path: write.path, mode: 'overwrite', id: target.id, title: event?.title ?? null } };
      }
      if (target.kind === 'communication' && write.mode === 'create') {
        const { communication } = await commRepo.createCommunication(body);
        return { ok: true, result: { path: write.path, mode: 'create', id: communication.id, title: communication.subject } };
      }
      if (target.kind === 'communication' && write.mode === 'overwrite' && COMMUNICATION_ID_RE.test(target.id)) {
        const updated = await commRepo.updateCommunication(target.id, body);
        return { ok: true, result: { path: write.path, mode: 'overwrite', id: target.id, title: updated?.subject ?? null } };
      }
      return writeError('unknown_write_target', write.path);
    } catch (error) {
      return writeError(typeof error?.code === 'string' ? error.code : 'professional_write_failed', error?.message);
    }
  }

  return { apply };
}
