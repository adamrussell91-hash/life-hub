// Meeting recording: the speaker check and the write-up. Pure prompt builders and
// reply parsers, no Netlify or npm imports: the Mac worker imports this file by
// relative path for private meetings run on a local model.
//
// ctx (both prompts): {
//   title, kind: 'meeting' | 'event', when,
//   attendees: [{ who: 'shared:person:…', name, role, about }], room: boolean,
//   taps: [{ who, at_ms }]
// }
// Prompt builders return { system, content: [{ type: 'text', text }], user: text, maxTokens, model, effort },
// ready to spread into completeJson; a local chat model takes `system` and `user`.
// Parsers take the reply as an object or as raw model text.
// Replies are never trusted: every who, line index and string is checked here.

export const MEETING_AI_MODEL = 'claude-opus-5-5';
export const MEETING_AI_EFFORT = 'low';
export const SPEAKER_CHECK_MAX_TOKENS = 4000;
export const WRITEUP_MAX_TOKENS = 16000;
export const CHUNK_LINES = 120;
export const CONTEXT_LINES = 12;

const PERSON_REF_RE = /^shared:person:[A-Za-z0-9_-]{1,120}$/;
const LIMITS = { flow: 12, built: 30, picks: 15, points: 5, flowWho: 4 };

const ROLES = [
  'Each person may have an about: how they relate to Adam (for example "Adam\u2019s student", or where they work). Use it to decide who would say a thing and who will do a task.',
  'Work belongs to the person whose role it is. When the other person is Adam\u2019s student, Adam is the one teaching: planning or designing lessons, setting or marking work, giving feedback, sending resources and chasing things up are Adam\u2019s; doing the work, asking for help and reporting how they went are the student\u2019s. Apply the same thinking to any other pair of roles.',
  'Voice matching often puts a whole stretch, both sides of a back-and-forth, on one voice. When the meaning plainly fits the other person, trust the meaning over the label.'
].join('\n');

const HOUSE = [
  'You are Clare, Adam’s professional assistant. Adam recorded this meeting and is always "me"; he is never among the attendees.',
  'Write in Australian English, plainly, the way a thoughtful colleague talks. No jargon, no flattery, no exclamation marks.',
  'Use only what was said in the transcript and what is in Adam’s notes. Never invent names, dates, numbers or events. If something is missing, leave it out.',
  'Reply with one JSON object only, no prose around it.'
].join('\n');

/** Trim, collapse whitespace and cap a string; anything else becomes ''. */
export function line(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function isPersonRef(value) {
  return typeof value === 'string' && PERSON_REF_RE.test(value);
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIndex(value, length) {
  return Number.isInteger(value) && value >= 0 && value < length;
}

/** A reply as an object, or as raw model text (a local model's string, maybe fenced). */
export function replyObject(reply) {
  if (reply && typeof reply === 'object' && !Array.isArray(reply)) return reply;
  if (typeof reply !== 'string') return {};
  const trimmed = reply.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = fenced ? fenced[1] : trimmed.slice(Math.max(0, trimmed.indexOf('{')), trimmed.lastIndexOf('}') + 1);
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toIndex(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d{1,6}$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

/** "12:04", or "1:02:09" past the hour. */
export function clock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function attendeesOf(ctx) {
  return (Array.isArray(ctx?.attendees) ? ctx.attendees : []).filter((a) => isPersonRef(a?.who));
}

/** Every who value a reply may use: 'me', each attendee ref, and 'room' when the room chip is on. */
export function allowedWho(ctx) {
  const set = new Set(['me', ...attendeesOf(ctx).map((a) => a.who)]);
  if (ctx?.room) set.add('room');
  return set;
}

/**
 * A who from a reply → a checked who, or null. Accepts the exact value, or an attendee's
 * full name / unique first name (models sometimes answer with names).
 */
export function checkWho(ctx, raw, { allowMe = true, allowRoom = true } = {}) {
  if (raw == null) return null;
  const allowed = allowedWho(ctx);
  const value = typeof raw === 'string' ? raw.trim() : '';
  let who = null;
  if (allowed.has(value)) who = value;
  else if (value) {
    const lower = value.toLowerCase();
    if (lower === 'me' || lower === 'adam' || lower === 'you') who = 'me';
    else {
      const people = attendeesOf(ctx);
      const full = people.filter((a) => line(a.name, 120).toLowerCase() === lower);
      const first = people.filter((a) => line(a.name, 120).toLowerCase().split(' ')[0] === lower.split(' ')[0]);
      if (full.length === 1) who = full[0].who;
      else if (first.length === 1) who = first[0].who;
    }
  }
  if (who === 'me' && !allowMe) return null;
  if (who === 'room' && !allowRoom) return null;
  return who;
}

/** Who said a transcript line: Adam's or the check's fix, else the voice's name, else null. */
export function lineWho(transcript, index) {
  const row = transcript?.lines?.[index];
  if (!row) return null;
  if (row.who_override) return row.who_override;
  const voice = (transcript.voices ?? []).find((v) => v.key === row.speaker);
  return voice?.who ?? null;
}

function nameFor(ctx, who, speaker) {
  if (who === 'me') return 'Adam (me)';
  if (who === 'room') return 'Someone in the room';
  const person = attendeesOf(ctx).find((a) => a.who === who);
  if (person) return line(person.name, 120) || 'Attendee';
  return `Unnamed voice ${speaker ?? ''}`.trim();
}

function peopleList(ctx) {
  const people = [{ who: 'me', name: 'Adam (me)', role: null, about: 'recorded this meeting' }];
  for (const a of attendeesOf(ctx)) people.push({ who: a.who, name: line(a.name, 120), role: a.role ?? null, about: line(a.about, 80) || null });
  if (ctx?.room) people.push({ who: 'room', name: 'Someone in the audience', role: null });
  return people;
}

// ── Speaker check ──────────────────────────────────────────────────────────

/**
 * The transcript in chunks of about 120 lines, each with the 12 lines before it as context.
 * Lines carry their current who, so rebuild the chunks after applying each chunk's changes
 * to give the next chunk checked context.
 * → [{ from, to, context: [row], lines: [row] }], row = { id, start_ms, voice, who, fixed, text }.
 */
export function sentenceChunks(transcript) {
  const lines = Array.isArray(transcript?.lines) ? transcript.lines : [];
  const row = (index) => {
    const l = lines[index];
    return {
      id: index,
      start_ms: Number(l?.start_ms) || 0,
      voice: l?.speaker ?? null,
      who: lineWho(transcript, index),
      fixed: Boolean(l?.who_override) && !l?.moved,
      text: typeof l?.text === 'string' ? l.text : ''
    };
  };
  const chunks = [];
  for (let from = 0; from < lines.length; from += CHUNK_LINES) {
    const to = Math.min(lines.length, from + CHUNK_LINES);
    const context = [];
    for (let i = Math.max(0, from - CONTEXT_LINES); i < from; i += 1) context.push(row(i));
    const rows = [];
    for (let i = from; i < to; i += 1) rows.push(row(i));
    chunks.push({ from, to, context, lines: rows });
  }
  return chunks;
}

export function speakerCheckPrompt(ctx, chunk) {
  const voices = {};
  for (const r of [...chunk.context, ...chunk.lines]) if (r.voice && !(r.voice in voices)) voices[r.voice] = null;
  const show = (r) => ({ id: r.id, t: clock(r.start_ms), voice: r.voice, who: r.who, ...(r.fixed ? { fixed: true } : {}), text: r.text });
  const startMs = chunk.lines[0]?.start_ms ?? 0;
  const endMs = chunk.lines[chunk.lines.length - 1]?.start_ms ?? startMs;
  const taps = (Array.isArray(ctx?.taps) ? ctx.taps : [])
    .filter((tap) => tap.at_ms >= startMs - 60_000 && tap.at_ms <= endMs + 60_000)
    .map((tap) => ({ who: tap.who, t: clock(tap.at_ms) }));
  const system = [
    HOUSE,
    'Task: check who said each line of this transcript. The voice labels came from voice matching, which often puts quick exchanges on the wrong person. Each line starts with the who its voice was given (from Adam tapping a name as someone started talking, or null when unnamed).',
    'Decide who said each line from meaning: a question and its answer come from different people; people answer what they were just asked; follow the turn-taking; think about who, given their role, would say it; use the taps (times Adam marked someone starting to talk).',
    ROLES,
    'Read whole sentences; a sentence belongs to one person.',
    'List only lines whose who should change. Never list a line that is already right.',
    'who must be exactly one of the who values in people.',
    'Lines marked fixed were set by Adam: never change them. Lines under context were checked already: use them to follow the conversation, never list them.',
    'unsure: ids of meaningful lines (a decision, a promise, an opinion, a question that matters) where you cannot tell who spoke. Never list fillers, greetings or one-word replies.',
    'Shape: {"changes":[{"line":number,"who":string}],"unsure":[number]}'
  ].join('\n');
  const text = JSON.stringify({
    meeting: { title: line(ctx?.title, 200), kind: ctx?.kind === 'event' ? 'event' : 'meeting' },
    people: peopleList(ctx),
    taps,
    context: chunk.context.map(show),
    lines: chunk.lines.map(show)
  });
  return { system, content: [{ type: 'text', text }], user: text, maxTokens: SPEAKER_CHECK_MAX_TOKENS, model: MEETING_AI_MODEL, effort: MEETING_AI_EFFORT };
}

/**
 * → { changes: [{ line, who }], unsure: [line] }. Only lines inside the chunk, never a
 * fixed line, never a who outside the people list (ctx given) or of the wrong shape (no ctx),
 * never a change to the who the line already has.
 */
export function parseSpeakerCheck(rawReply, chunk, ctx = null) {
  const reply = replyObject(rawReply);
  const inChunk = new Map(chunk.lines.map((r) => [r.id, r]));
  const validWho = (raw) => {
    if (ctx) return checkWho(ctx, raw);
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value === 'me' || value === 'room' || isPersonRef(value) ? value : null;
  };
  const changes = [];
  const seen = new Set();
  for (const raw of Array.isArray(reply?.changes) ? reply.changes : []) {
    if (changes.length >= chunk.lines.length) break;
    const id = toIndex(raw?.line ?? raw?.id);
    const row = inChunk.get(id);
    if (!row || row.fixed || seen.has(id)) continue;
    const who = validWho(raw?.who);
    if (!who || who === row.who) continue;
    seen.add(id);
    changes.push({ line: id, who });
  }
  const unsure = [];
  for (const raw of Array.isArray(reply?.unsure) ? reply.unsure : []) {
    if (unsure.length >= chunk.lines.length) break;
    const id = toIndex(raw);
    if (inChunk.has(id) && !unsure.includes(id)) unsure.push(id);
  }
  return { changes, unsure };
}

/** Clear marks a previous check left (Adam's own fixes stay). Mutates and returns the transcript. */
export function resetSpeakerCheck(transcript) {
  for (const row of transcript.lines ?? []) {
    if (row.moved) row.who_override = null;
    row.moved = false;
    row.unsure = false;
  }
  transcript.speakers_checked = false;
  return transcript;
}

/** Apply one parsed chunk: moved lines get who_override and `moved`, unsure ones `unsure`. */
export function applySpeakerCheck(transcript, result) {
  for (const change of result.changes ?? []) {
    const row = transcript.lines?.[change.line];
    if (!row) continue;
    row.who_override = change.who;
    row.moved = true;
  }
  for (const id of result.unsure ?? []) {
    const row = transcript.lines?.[id];
    if (row) row.unsure = true;
  }
  return transcript;
}

// ── Write-up ───────────────────────────────────────────────────────────────

export function writeupPrompt(ctx, transcript, notes, flags) {
  const lines = Array.isArray(transcript?.lines) ? transcript.lines : [];
  const noteRows = (Array.isArray(notes) ? notes : []).map((text, index) => ({ index, text: line(text, 300) }));
  const flagRows = (Array.isArray(flags) ? flags : []).map((flag) => ({
    kind: flag.kind === 'poi' ? 'remember_this' : 'to_do',
    t: clock(flag.at_ms),
    near_line: nearestLine(lines, flag.at_ms)
  }));
  const said = lines
    .map((row, index) => `[${index}] ${clock(row.start_ms)} ${nameFor(ctx, lineWho(transcript, index), row.speaker)}: ${typeof row.text === 'string' ? row.text.replace(/\s+/g, ' ').trim() : ''}`)
    .join('\n');
  const kind = ctx?.kind === 'event' ? 'event' : 'meeting';
  const system = [
    HOUSE,
    `Task: write up this ${kind} for Adam from its transcript, his own notes and the moments he flagged. Address Adam as "you" ("You agreed to…"). Every line id is the number in square brackets before a transcript line; give the id of the line where each thing was said.`,
    'who is always one of the who values in people, or null when nobody in people said it (an unnamed voice).',
    ROLES,
    'The names on transcript lines can still be wrong. Before putting a task in picks.mine or picks.others, ask who will actually do it, from what was said and their role; a task only Adam would do goes in picks.mine even if its line carries someone else\u2019s name, and the same for built and persons.',
    'overview: 3 to 5 sentences on the whole meeting. Plain text; you may wrap a few key words in <b></b>, no other markup.',
    'flow: the meeting split by topic, in order, at most 12. Each: the line id where the topic starts, mins it ran, a short title, one line on what was covered, and who led it.',
    `built: add to Adam's own note lines (notes, by index). For a note, add short lines on what was decided, what was said for and against, and who will do what, each with who said it and the line id. Use note_index null for things worth having that Adam did not note. At most 30.`,
    'picks.mine: every time Adam said he will do something. due is YYYY-MM-DD only when a date can be worked out from what was said and the meeting date; due_label is the words used ("End of Week 2"), else null. quote is the words, short.',
    'picks.others: every time someone else said they will do something, with who.',
    'picks.poi: opportunities and things worth remembering: a program looking for people, a role, a call for applications, a contact, a resource, a strong idea.',
    'Flags mark moments Adam tapped: to_do means a task was said near there, remember_this means something worth keeping. Look hardest around them.',
    'persons: for each attendee who spoke (and "me" if useful, "room" for audience questions), 1 to 5 short points on what they said; star true on the single contribution most worth remembering; quote their most telling words and give its line id.',
    'Never invent. Only what was said.',
    'Shape: {"overview":string,"flow":[{"line":number,"mins":number,"title":string,"text":string,"who":[string]}],"built":[{"note_index":number|null,"text":string,"who":string|null,"line":number}],"picks":{"mine":[{"text":string,"due":string|null,"due_label":string|null,"quote":string,"line":number}],"others":[{"who":string,"text":string,"due":string|null,"quote":string,"line":number}],"poi":[{"who":string|null,"text":string,"quote":string,"line":number}]},"persons":[{"who":string,"points":[{"text":string,"star":boolean}],"quote":string,"line":number}]}'
  ].join('\n');
  const text = [
    JSON.stringify({
      meeting: { title: line(ctx?.title, 200), kind, when: line(ctx?.when, 80) },
      people: peopleList(ctx),
      notes: noteRows,
      flags: flagRows
    }),
    'Transcript:',
    said
  ].join('\n');
  return { system, content: [{ type: 'text', text }], user: text, maxTokens: WRITEUP_MAX_TOKENS, model: MEETING_AI_MODEL, effort: MEETING_AI_EFFORT };
}

function nearestLine(lines, atMs) {
  let best = null;
  for (let i = 0; i < lines.length; i += 1) {
    if ((Number(lines[i].start_ms) || 0) <= atMs) best = i;
    else break;
  }
  return best ?? (lines.length ? 0 : null);
}

/** Text only, with <b> and </b> kept: everything else escaped so the page can render it. */
export function safeOverview(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 1500) : '';
  const escape = (part) => part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let open = 0;
  const out = text.split(/(<\/?b>)/i).map((part) => {
    if (/^<b>$/i.test(part)) { open += 1; return '<b>'; }
    if (/^<\/b>$/i.test(part)) { if (!open) return ''; open -= 1; return '</b>'; }
    return escape(part.replace(/<[^>]*>/g, ''));
  }).join('');
  return out + '</b>'.repeat(open);
}

/**
 * A model reply (or a write-up from the Mac) → the stored write-up shape. Bad who → null
 * (or the item dropped where a who is required), bad line index → null, strings trimmed and
 * capped, lists capped. status is 'done' when the transcript's speakers were checked, else
 * 'unchecked'.
 */
export function parseWriteup(rawReply, ctx, transcript, notes, { nowIso = () => new Date().toISOString() } = {}) {
  const reply = replyObject(rawReply);
  const lines = Array.isArray(transcript?.lines) ? transcript.lines : [];
  const noteCount = Array.isArray(notes) ? notes.length : 0;
  const duration = Number(transcript?.duration_ms) || 0;
  const at = (raw) => {
    const index = toIndex(raw?.line);
    if (isIndex(index, lines.length)) return { line: index, start_ms: Number(lines[index].start_ms) || 0 };
    return { line: null, start_ms: null };
  };
  const list = (value) => (Array.isArray(value) ? value : []);

  const flow = [];
  for (const raw of list(reply?.flow)) {
    if (flow.length >= LIMITS.flow) break;
    const title = line(raw?.title, 80);
    if (!title) continue;
    let { line: index, start_ms: startMs } = at(raw);
    if (index === null) {
      const given = Number(raw?.start_ms);
      if (!Number.isFinite(given) || given < 0 || (duration && given > duration)) continue;
      startMs = Math.round(given);
    }
    const mins = Number(raw?.mins);
    const who = [];
    for (const w of list(raw?.who)) {
      const checked = checkWho(ctx, w);
      if (checked && !who.includes(checked) && who.length < LIMITS.flowWho) who.push(checked);
    }
    flow.push({
      start_ms: startMs,
      mins: Number.isFinite(mins) && mins > 0 ? Math.min(600, Math.round(mins)) : 0,
      title,
      text: line(raw?.text, 300),
      who,
      line: index
    });
  }
  flow.sort((a, b) => a.start_ms - b.start_ms);

  const built = [];
  for (const raw of list(reply?.built)) {
    if (built.length >= LIMITS.built) break;
    const text = line(raw?.text, 300);
    if (!text) continue;
    const noteIndex = toIndex(raw?.note_index);
    built.push({
      note_index: isIndex(noteIndex, noteCount) ? noteIndex : null,
      text,
      who: checkWho(ctx, raw?.who),
      ...at(raw)
    });
  }

  const picks = { mine: [], others: [], poi: [] };
  for (const raw of list(reply?.picks?.mine)) {
    if (picks.mine.length >= LIMITS.picks) break;
    const text = line(raw?.text, 300);
    if (!text) continue;
    picks.mine.push({
      text,
      due: isDateKey(raw?.due) ? raw.due : null,
      due_label: line(raw?.due_label, 60) || null,
      quote: line(raw?.quote, 300),
      ...at(raw)
    });
  }
  for (const raw of list(reply?.picks?.others)) {
    if (picks.others.length >= LIMITS.picks) break;
    const text = line(raw?.text, 300);
    if (!text) continue;
    picks.others.push({
      who: checkWho(ctx, raw?.who, { allowMe: false, allowRoom: false }),
      text,
      due: isDateKey(raw?.due) ? raw.due : null,
      quote: line(raw?.quote, 300),
      ...at(raw)
    });
  }
  for (const raw of list(reply?.picks?.poi)) {
    if (picks.poi.length >= LIMITS.picks) break;
    const text = line(raw?.text, 300);
    if (!text) continue;
    picks.poi.push({ who: checkWho(ctx, raw?.who, { allowMe: false }), text, quote: line(raw?.quote, 300), ...at(raw) });
  }

  const personCap = attendeesOf(ctx).length + 2;
  const persons = [];
  for (const raw of list(reply?.persons)) {
    const who = checkWho(ctx, raw?.who);
    if (!who) continue;
    let person = persons.find((p) => p.who === who);
    if (!person) {
      if (persons.length >= personCap) continue;
      const { line: index } = at(raw);
      person = { who, points: [], quote: line(raw?.quote, 300) || null, line: index };
      persons.push(person);
    }
    for (const point of list(raw?.points)) {
      if (person.points.length >= LIMITS.points) break;
      const text = line(point?.text, 300);
      if (text) person.points.push({ text, star: point?.star === true });
    }
  }
  for (const person of persons) {
    let starred = false;
    for (const point of person.points) {
      if (point.star && starred) point.star = false;
      if (point.star) starred = true;
    }
  }
  const keptPersons = persons.filter((p) => p.points.length);

  const overview = safeOverview(reply?.overview);
  const checked = transcript?.speakers_checked === true;
  return {
    status: checked ? 'done' : 'unchecked',
    speakers_checked: checked,
    overview,
    flow,
    built,
    picks,
    persons: keptPersons,
    review: { built: {}, picks: {} },
    error: null,
    created_at: nowIso()
  };
}
