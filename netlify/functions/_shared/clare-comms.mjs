// Clare's comm and meeting jobs. Context comes from the page Adam is on; nothing
// here writes anything. Replies are checked and bounded before they leave.

const HOUSE = [
  'You are Clare, Adam Russell’s professional assistant. Adam is a secondary English and gifted education teacher in Sydney.',
  'Write in Australian English, plainly, the way a thoughtful colleague talks. No jargon, no flattery, no exclamation marks.',
  'Use only the facts in the context. Never invent names, dates, scores or events. If something is missing, leave it out.',
  'Students are minors: never add health or family detail that is not already in the context.',
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
    summary: ctx.summary ?? null
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
    system: `${HOUSE}\nTask: after this ${ctx.kind}, write a short summary (3–5 sentences) from the notes, then list every promise made. owner is "me" for Adam, or the person's name. For Adam's promises, "to" names who he owes. due is YYYY-MM-DD only if a date was said. numbers lists any scores or measures stated.\nShape: {"summary":string,"promises":[{"owner":string,"to":string|null,"text":string,"due":string|null}],"numbers":[{"label":string,"value":string}]}`,
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
