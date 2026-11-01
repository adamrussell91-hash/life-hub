// Clare's comm and meeting jobs. Context comes from the page Adam is on; nothing
// here writes anything. Replies are checked and bounded before they leave.

const HOUSE = [
  'You are Clare, Adam Russell’s professional assistant. Adam is a secondary English and gifted education teacher in Sydney.',
  'Write in Australian English, plainly, the way a thoughtful colleague talks. No jargon, no flattery, no exclamation marks.',
  'Adam is always in the room, so he is never among the people listed. Write anything for Adam to read in his own voice: I, me, my. Never write his name (a draft email may still sign off with it).',
  'Use only the facts in the context. Never invent names, dates, scores or events. If something is missing, leave it out.',
  'Students are minors: never add health or family detail that is not already in the context.',
  'Guides (context.guides) are Adam’s own structured read of someone in the room. Use their moves as suggested next steps for that context, in can-do wording. Never name a motivation type or profile, never describe a student as a type, and never mention scores.',
  'Reply with one JSON object only, no prose around it.'
].join('\n');

function clareFailed(detail) {
  return Object.assign(new Error(`Clare could not finish: ${detail}`), { status: 502, code: 'clare_failed', retryable: true });
}

function line(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function contextText(ctx) {
  return JSON.stringify({
    title: ctx.title, kind: ctx.kind, when: ctx.when, purpose: ctx.purpose ?? null,
    people: (ctx.people ?? []).map((person) => ({ name: person.name, role: person.role })),
    previous: ctx.previous ?? [], open_promises: ctx.open_promises ?? [],
    notes: typeof ctx.notes === 'string' ? ctx.notes.slice(0, 20000) : '',
    summary: ctx.summary ?? null,
    guides: (Array.isArray(ctx.guides) ? ctx.guides : []).slice(0, 5).map((g) => ({
      about: line(g?.about, 120), guide: line(g?.guide, 60), context: line(g?.context, 120),
      moves: (Array.isArray(g?.moves) ? g.moves : []).slice(0, 5).map((m) => line(m, 300)).filter(Boolean)
    }))
  });
}

function personByName(ctx, name) {
  const wanted = line(name, 120).toLowerCase();
  if (!wanted) return null;
  return (ctx.people ?? []).find((person) => {
    const full = person.name.toLowerCase();
    return full === wanted || full.split(/\s+/)[0] === wanted.split(/\s+/)[0];
  }) ?? null;
}

function initialsOf(name) {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').toUpperCase();
}

/** A name, first name or initials as minutes write them → an attendee, or null. */
export function whoToPerson(ctx, who) {
  const byName = personByName(ctx, who);
  if (byName) return byName;
  const letters = line(who, 20).replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length < 2) return null;
  const hits = (ctx.people ?? []).filter((person) => initialsOf(person.name) === letters);
  return hits.length === 1 ? hits[0] : null;
}

export async function generateBrief(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: a brief Adam reads in the minute before this ${ctx.kind}. Give at most 3 points, most useful first, each with the source it came from. Add owed_line only if Adam owes someone here something.\nShape: {"points":[{"text":string,"source":string}],"owed_line":string|null}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 600
  });
  const points = (Array.isArray(reply.points) ? reply.points : [])
    .map((point) => ({ text: line(point?.text, 300), source: line(point?.source, 60) }))
    .filter((point) => point.text)
    .slice(0, 3);
  return { points, owed_line: line(reply.owed_line, 200) || null };
}

export async function generateSummary(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: after this ${ctx.kind}, write a short summary (3–5 sentences) from the notes in Adam's first person ("I agreed to…", never his name), then list every promise made. owner is "me" for Adam, or the person's name. For Adam's promises, "to" names who he owes. due is YYYY-MM-DD only if a date was said. numbers lists any scores or measures stated.\nShape: {"summary":string,"promises":[{"owner":string,"to":string|null,"text":string,"due":string|null}],"numbers":[{"label":string,"value":string}]}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 1200
  });
  const summary = line(reply.summary, 2000);
  if (!summary) throw clareFailed('no summary');
  const promises = [];
  for (const raw of Array.isArray(reply.promises) ? reply.promises.slice(0, 20) : []) {
    const text = line(raw?.text, 300);
    if (!text) continue;
    const due = isDateKey(raw?.due) ? raw.due : null;
    if (line(raw?.owner, 20).toLowerCase() === 'me') {
      const to = personByName(ctx, raw?.to) ?? (ctx.people ?? []).find((person) => person.role === 'with') ?? null;
      if (to) promises.push({ direction: 'you_owe', person_ref: to.ref, text, due });
      continue;
    }
    const owner = personByName(ctx, raw?.owner);
    if (owner) promises.push({ direction: 'they_owe', person_ref: owner.ref, text, due });
  }
  const numbers = (Array.isArray(reply.numbers) ? reply.numbers : [])
    .map((item) => ({ label: line(item?.label, 80), value: line(item?.value, 40) }))
    .filter((item) => item.label && item.value)
    .slice(0, 10);
  return { summary, promises, numbers };
}

export async function generateDrafts(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: draft short follow-up emails from Adam (signing "Mr Russell" to students and parents, "Adam" to colleagues) to the people on this page who should hear about it. Warm, specific, one clear ask at most. Adam edits and sends them himself.\nShape: {"drafts":[{"to":string,"subject":string,"body":string}]}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 1500
  });
  const drafts = [];
  for (const raw of Array.isArray(reply.drafts) ? reply.drafts.slice(0, 3) : []) {
    const person = personByName(ctx, raw?.to);
    const body = typeof raw?.body === 'string' ? raw.body.trim().slice(0, 4000) : '';
    if (!person || !body) continue;
    drafts.push({ person_ref: person.ref, to: person.name, subject: line(raw?.subject, 150), body });
  }
  return { drafts };
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function readHandwriting(image, { complete }) {
  if (!image || !IMAGE_TYPES.has(image.media_type) || typeof image.data !== 'string' || !image.data || image.data.length > 7_000_000) {
    throw Object.assign(new Error('Send a JPEG, PNG or WebP photo under 5 MB.'), { status: 400, code: 'invalid_image' });
  }
  const reply = await complete({
    system: `${HOUSE}\nTask: transcribe the handwriting in this photo exactly, keeping line breaks and arrows (→). Do not tidy or add words. If a word is unreadable write [?].\nShape: {"text":string}`,
    content: [{ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } }],
    maxTokens: 1500
  });
  const text = typeof reply.text === 'string' ? reply.text.trim().slice(0, 8000) : '';
  if (!text) throw clareFailed('no text found');
  return { text };
}

export async function checkPurpose(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: Adam set a purpose before this meeting. From the notes, say whether it was met, in one short sentence.\nShape: {"met":boolean,"note":string}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 200
  });
  if (typeof reply.met !== 'boolean') throw clareFailed('no verdict');
  return { met: reply.met, note: line(reply.note, 300) };
}

export async function suggestTaskTitle(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: suggest one task title (under 80 characters, starting with a verb) for applying what Adam learned at this PD to his teaching.\nShape: {"title":string}`,
    content: [{ type: 'text', text: JSON.stringify({ title: ctx.title, notes: typeof ctx.notes === 'string' ? ctx.notes.slice(0, 4000) : '' }) }],
    maxTokens: 100
  });
  const title = line(reply.title, 80);
  if (!title) throw clareFailed('no title');
  return { title };
}

export async function suggestNextSession(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: suggest the next session in this thread. Keep the usual rhythm and time of day unless the notes say otherwise. Times are ${ctx.time_zone ?? 'Australia/Sydney'} wall time.\nShape: {"date":"YYYY-MM-DD","time":"HH:MM","duration_min":number,"reason":string}`,
    content: [{ type: 'text', text: JSON.stringify({ ...JSON.parse(contextText(ctx)), cadence_days: ctx.cadence_days ?? null, last_start: ctx.last_start ?? null }) }],
    maxTokens: 200
  });
  const duration = Number(reply.duration_min);
  if (!isDateKey(reply.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reply.time ?? '') || !Number.isFinite(duration) || duration < 5 || duration > 240) {
    throw clareFailed('next session was not a usable slot');
  }
  return { date: reply.date, time: reply.time, duration_min: Math.round(duration), reason: line(reply.reason, 200) };
}

const MINUTES_PDF_MAX_CHARS = 5_400_000; // 4 MB of PDF once base64'd
const MINUTES_TEXT_MAX = 60_000;

function invalidMinutes(message) {
  return Object.assign(new Error(message), { status: 400, code: 'invalid_minutes' });
}

/**
 * Read official minutes (a PDF or pasted text) for the meeting in ctx. Writes nothing:
 * Adam ticks what to keep on the page. Actions for Adam come back as `mine`; actions
 * for an attendee as `others`; anyone Clare cannot place as `unmatched`.
 */
export async function readMinutes(ctx, minutes, { complete }) {
  const pdf = minutes?.pdf;
  const text = typeof minutes?.text === 'string' ? minutes.text.trim() : '';
  let source;
  if (pdf) {
    if (pdf.media_type !== 'application/pdf' || typeof pdf.data !== 'string' || !pdf.data || pdf.data.length > MINUTES_PDF_MAX_CHARS) {
      throw invalidMinutes('Send a PDF under 4 MB, or paste the minutes as text.');
    }
    source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.data } };
  } else if (text) {
    source = { type: 'text', text: `Minutes:\n${text.slice(0, MINUTES_TEXT_MAX)}` };
  } else {
    throw invalidMinutes('Add a PDF or paste the minutes.');
  }
  const context = JSON.stringify({
    ...JSON.parse(contextText(ctx)),
    agenda_headings: (Array.isArray(ctx.agenda_headings) ? ctx.agenda_headings : []).slice(0, 40).map((h) => line(h, 200))
  });
  const reply = await complete({
    system: `${HOUSE}\nTask: these are the official minutes of this meeting, written by someone else. Adam may appear in them as Adam, Mr Russell or AR.\nsections: the minutes split by agenda item, in order, each a heading and its text. Tidy layout only; keep every fact and never change meaning.\nactions: every action item. who is "me" for Adam, otherwise the name or initials exactly as written. due is YYYY-MM-DD only if a date is given; the meeting is ${line(ctx.when, 80)}.\ndecisions: every decision or resolution, with the agenda heading it sits under, using the wording in context.agenda_headings when one matches.\ndifferences: at most 10 places where the minutes and Adam's notes (context.notes) disagree, or where the minutes give Adam an action his notes do not have. One sentence each, in Adam's voice ("My notes say…"). Empty when there are no notes.\nShape: {"sections":[{"heading":string,"text":string}],"actions":[{"who":string,"text":string,"due":string|null}],"decisions":[{"text":string,"agenda_heading":string|null}],"differences":[{"text":string}]}`,
    content: [source, { type: 'text', text: context }],
    maxTokens: 4000
  });

  const sections = (Array.isArray(reply.sections) ? reply.sections : [])
    .map((section) => ({ heading: line(section?.heading, 200), text: typeof section?.text === 'string' ? section.text.trim().slice(0, 6000) : '' }))
    .filter((section) => section.text)
    .slice(0, 40);
  if (!sections.length) throw clareFailed('no minutes text found');

  const mine = [];
  const others = [];
  const unmatched = [];
  for (const raw of Array.isArray(reply.actions) ? reply.actions.slice(0, 60) : []) {
    const actionText = line(raw?.text, 300);
    if (!actionText) continue;
    const due = isDateKey(raw?.due) ? raw.due : null;
    const who = line(raw?.who, 120);
    if (who.toLowerCase() === 'me') {
      if (mine.length < 30) mine.push({ text: actionText, due });
      continue;
    }
    const person = whoToPerson(ctx, who);
    if (person) {
      if (others.length < 30) others.push({ text: actionText, person_ref: person.ref, person_name: person.name, due });
    } else if (unmatched.length < 30) {
      unmatched.push({ text: actionText, who_text: who, due });
    }
  }
  const decisions = (Array.isArray(reply.decisions) ? reply.decisions : [])
    .map((decision) => ({ text: line(decision?.text, 500), agenda_heading: line(decision?.agenda_heading, 200) || null }))
    .filter((decision) => decision.text)
    .slice(0, 50);
  const differences = (Array.isArray(reply.differences) ? reply.differences : [])
    .map((difference) => ({ text: line(difference?.text, 300) }))
    .filter((difference) => difference.text)
    .slice(0, 10);
  return { sections, mine, others, unmatched, decisions, differences };
}
