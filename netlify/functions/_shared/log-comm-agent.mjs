// First-class tool for logging a past/present communication. Builds a
// calendar ghost input (kind log_comm) so Confirm + dashed chip share one path
// with propose_calendar_ghost.

const DIRECTIONS = new Set(['outbound', 'inbound']);
const CHANNELS = new Set(['email', 'phone', 'message', 'in_person', 'video', 'other']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

function clean(value, max = 400) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function proposeLogCommunicationSchema() {
  return {
    name: 'propose_log_communication',
    description:
      'Propose logging a past or present email, call, message, video chat, or in-person note about someone Adam already knows. Call search_people first and pass their shared:person:… refs. Nothing is saved until Adam taps Confirm — also queues a dashed calendar ghost on the occurred date. Do not refuse when Adam says he emailed or called someone; propose this instead. Cannot send email or silently edit an existing communication.',
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['outbound', 'inbound'],
          description: 'outbound = Adam sent/made it; inbound = they contacted Adam'
        },
        channel: {
          type: 'string',
          enum: ['email', 'phone', 'message', 'in_person', 'video', 'other']
        },
        date: { type: 'string', description: 'Occurred date YYYY-MM-DD' },
        time: { type: 'string', description: 'Optional HH:MM (defaults to 12:00 on the calendar chip)' },
        subject: { type: 'string', description: 'Subject / title for the communication' },
        title: { type: 'string', description: 'Alias of subject' },
        summary: { type: 'string', description: 'Short body / what was said' },
        person_refs: {
          type: 'array',
          items: { type: 'string' },
          description: 'shared:person:… refs from search_people'
        },
        reason: { type: 'string', description: 'Optional why shown on the chip' },
        time_zone: { type: 'string', description: 'IANA tz (default Australia/Sydney)' }
      },
      required: ['direction', 'channel', 'date'],
      additionalProperties: false
    }
  };
}

/**
 * Map propose_log_communication input → calendarGhostFromToolInput shape
 * with kind: 'log_comm'. Throws TypeError on invalid required fields.
 */
export function buildLogCommGhostInput(input, { agent } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('log communication input must be an object');
  }
  const direction = clean(input.direction, 20);
  if (!DIRECTIONS.has(direction)) throw new TypeError('direction must be outbound or inbound');
  const channel = clean(input.channel, 20);
  if (!CHANNELS.has(channel)) throw new TypeError('channel must be a valid communication channel');
  const date = clean(input.date, 10);
  if (!DATE_RE.test(date)) throw new TypeError('date must be YYYY-MM-DD');

  const title = clean(input.title, 200) || clean(input.subject, 200);
  const subject = clean(input.subject, 200) || title;
  if (!title && !subject) throw new TypeError('subject or title is required');

  const time = clean(input.time, 5);
  if (time && !HHMM_RE.test(time)) throw new TypeError('time must be HH:MM');

  const personRefs = Array.isArray(input.person_refs)
    ? input.person_refs.map(ref => clean(ref, 120)).filter(Boolean)
    : [];

  const out = {
    kind: 'log_comm',
    direction,
    channel,
    date,
    title,
    subject,
    ...(time ? { time } : {}),
    ...(personRefs.length ? { person_refs: personRefs } : {}),
    ...(clean(input.summary, 2000) ? { summary: clean(input.summary, 2000) } : {}),
    ...(clean(input.reason, 200) ? { reason: clean(input.reason, 200) } : {}),
    ...(clean(input.time_zone, 80) ? { time_zone: clean(input.time_zone, 80) } : {})
  };
  if (agent) out.agent = agent;
  return out;
}
