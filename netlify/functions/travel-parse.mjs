import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { checkRateLimit } from './_shared/travel-rate-limit.mjs';
import { validateItemDraft } from './_shared/travel-schema.mjs';
import { createAnthropicClient } from './_shared/anthropic-client.mjs';

export const config = { path: '/api/travel-parse' };

const SYSTEM = `You extract a travel itinerary ItemDraft from a confirmation email.
Return ONLY JSON with shape:
{"draft":{"kind":"stay"|"flight"|"train"|"do"|"food","title":"","date":"YYYY-MM-DD","time":"HH:MM"|null,"city_id":"","note":"","status":"booked","booking_ref":"","carrier":"","number":"","from_code":"","to_code":"","depart_time":"HH:MM","arrive_time":"HH:MM","arrive_date":"YYYY-MM-DD","nights":1,"check_out_date":"YYYY-MM-DD","check_in_time":"HH:MM","cancel_until":"YYYY-MM-DD","home_base":true,"cost":{"amount":0,"currency":"AUD"},"place":{"name":"","lat":0,"lon":0,"address":""}},"missing":["field",...]}
Use only kinds stay/flight/train/do/food. Omit unknown fields. Never invent booking references.
Emails are often pasted as plain text with labels and values split across lines,
e.g. "Check-in" / "Check-out" / "Sun, 20 Dec" / "Tue, 22 Dec": pair them in order.
Dates without a year: use the trip's dates if one fits, otherwise the next occurrence on or after today.
Times are 24-hour ("2:00 pm" -> "14:00").
Stays (hotels, apartments, hostels): title is the property name, date is the check-in date,
time and check_in_time are the check-in time, nights and check_out_date from the stay,
booking_ref is the itinerary / confirmation / booking number, place.name and place.address
from the property, put the check-out time and room type in note, and cost is the total price
with an ISO currency (AU$ / A$ -> AUD). cancel_until only when free cancellation has a date.
city_id is one of the trip's city ids when the place fits one, else omit it.
Ignore marketing, fee and policy boilerplate.`;

export function createTravelParseHandler(deps = {}) {
  const anthropic = deps.anthropic ?? null;

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST.', false, PRIVATE_CACHE);
    }
    const sessionKey = ctx.session?.token || ctx.session?.id || 'anon';
    checkRateLimit(`parse:${sessionKey}`, { now: ctx.now() });

    const body = await readJson(request);
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text || text.length > 20_000) {
      return errorResponse(
        400,
        'validation_error',
        'text is required (max 20,000 chars).',
        false,
        PRIVATE_CACHE
      );
    }

    const prompt = buildParsePrompt(text, {
      today: new Date(ctx.now()).toISOString().slice(0, 10),
      cities: body?.cities
    });

    try {
      let result;
      if (anthropic) {
        result = await callAnthropicFallback(anthropic, prompt);
      } else {
        const apiKey = typeof ctx.env?.ANTHROPIC_API_KEY === 'string' ? ctx.env.ANTHROPIC_API_KEY : '';
        if (!apiKey) {
          return errorResponse(503, 'upstream_unavailable', 'Could not parse that email right now.', true, PRIVATE_CACHE);
        }
        const client = createAnthropicClient({ apiKey, fetchImpl: deps.fetchImpl ?? fetch });
        result = await callAnthropicFallback(client, prompt);
      }

      const parsed = typeof result === 'string' ? JSON.parse(extractJson(result)) : result;
      const draft = parsed.draft || parsed;
      const missing = Array.isArray(parsed.missing) ? parsed.missing : [];
      try {
        validateItemDraft({
          ...draft,
          city_id: draft.city_id || 'lis',
          note: draft.note || '',
          status: draft.status || 'booked',
          time: draft.time ?? null,
          date: draft.date || '2027-01-01',
          title: draft.title || 'Parsed item'
        });
      } catch (err) {
        if (err.path && !missing.includes(err.path.replace(/^item\./, ''))) {
          missing.push(err.path.replace(/^item\./, ''));
        }
      }
      const confidence = missing.length ? 'low' : 'high';
      return okResponse(200, { draft, confidence, missing }, PRIVATE_CACHE);
    } catch (error) {
      return errorResponse(
        503,
        'upstream_unavailable',
        'Could not parse that email right now.',
        true,
        PRIVATE_CACHE
      );
    }
  }, deps);
}

/** The user turn: today's date and the trip's cities, so year-less dates
 * ("Sun, 20 Dec") and city ids resolve, then the pasted email. */
export function buildParsePrompt(text, { today, cities } = {}) {
  const lines = [`Today is ${today}.`];
  const list = Array.isArray(cities) ? cities.slice(0, 30) : [];
  const described = list
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => `${c.id}: ${String(c.name ?? '').slice(0, 60)} (${c.start_date ?? '?'} to ${c.end_date ?? '?'})`);
  if (described.length) lines.push(`Trip cities:\n${described.join('\n')}`);
  lines.push('', 'Email:', text);
  return lines.join('\n');
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no json');
  return text.slice(start, end + 1);
}

async function callAnthropicFallback(client, text) {
  if (typeof client.complete === 'function') {
    return client.complete({ system: SYSTEM, messages: [{ role: 'user', content: text }], max_tokens: 1200 });
  }
  if (typeof client.streamMessage === 'function') {
    let out = '';
    for await (const event of client.streamMessage({
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
      maxTokens: 1200
    })) {
      // The shared stream client yields { type: 'text', delta }. Reading only
      // `.text` left `out` empty, so every paste failed as "could not read".
      if (event?.type !== 'text' && event?.type !== 'text_delta') continue;
      if (typeof event.delta === 'string') out += event.delta;
      else if (typeof event.text === 'string') out += event.text;
    }
    return out;
  }
  if (typeof client.messages?.create === 'function') {
    const res = await client.messages.create({
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }]
    });
    return res.content?.[0]?.text || '';
  }
  throw new Error('no anthropic client');
}

export default createTravelParseHandler();
