/**
 * Stage 2 — Claude classification + validator (TIE-INFERENCE-BRIEF).
 */

import { createAnthropicClient } from '../anthropic-client.mjs';
import {
  TIE_ALLOWED_ROLES,
  TIE_EXCERPT_CHARS,
  TIE_MAX_EXCERPTS
} from './constants.mjs';
import { excerptAroundNames } from './name-match.mjs';

const ROLE_SET = new Set(TIE_ALLOWED_ROLES);

/**
 * Pick up to 10 excerpts: at least one per source, then most recent.
 */
export function selectExcerpts(candidate, rosterByRef, max = TIE_MAX_EXCERPTS) {
  const texts = [...(candidate.texts ?? [])].filter((t) => t.text && t.text.trim());
  const bySource = new Map();
  for (const t of texts) {
    const src = t.how || 'other';
    if (!bySource.has(src)) bySource.set(src, t);
  }
  const picked = [...bySource.values()];
  const rest = texts
    .filter((t) => !picked.includes(t))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  for (const t of rest) {
    if (picked.length >= max) break;
    picked.push(t);
  }
  const people = (candidate.pair ?? []).map((r) => rosterByRef.get(r)).filter(Boolean);
  return picked.slice(0, max).map((t) => ({
    record_ref: t.ref,
    how: t.how,
    date: t.date ?? null,
    text: excerptAroundNames(t.text, people, TIE_EXCERPT_CHARS)
  }));
}

export function summarizeEvidence(candidate) {
  const counts = {};
  for (const r of candidate.records ?? []) {
    counts[r.how] = (counts[r.how] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([how, n]) => `${n} ${how}`);
  if (candidate.shared_org_refs?.length) parts.push('same organisation');
  return parts.join(', ') || 'no evidence summary';
}

export function buildClassifyPrompt({ personA, personB, candidate, excerpts }) {
  const roles = TIE_ALLOWED_ROLES.join(', ');
  const excerptBlock = excerpts
    .map(
      (e, i) =>
        `[${i + 1}] ${e.record_ref} (${e.how}${e.date ? `, ${e.date}` : ''}):\n${e.text}`
    )
    .join('\n\n');

  return `You classify whether two people in Adam's professional network likely know each other.

People:
- A: ${personA.display_name}${personA.role_line ? ` — ${personA.role_line}` : ''}${
    personA.org_names?.length ? ` @ ${personA.org_names.join(', ')}` : ''
  } (ref ${personA.ref})
- B: ${personB.display_name}${personB.role_line ? ` — ${personB.role_line}` : ''}${
    personB.org_names?.length ? ` @ ${personB.org_names.join(', ')}` : ''
  } (ref ${personB.ref})

Evidence summary: ${summarizeEvidence(candidate)}

Excerpts (quotes you return MUST be exact substrings of these):
${excerptBlock}

Allowed roles: ${roles}

Return ONLY strict JSON:
{
  "tie": true|false,
  "role": "<one of allowed roles>",
  "direction": null|"A_mentor"|"B_mentor",
  "confidence": "high"|"medium"|"low",
  "valid_from": null|"YYYY-MM-DD",
  "reason": "≤120 chars, reads like a human sentence; no ids; no confidence words",
  "quotes": [{ "record_ref": "...", "text": "exact substring from that excerpt" }]
}

Rules:
- tie:false when the only evidence is being on the same recipient/attendee list with nothing showing they dealt with each other.
- role must be from the allowed list. If unsure: colleague when they share a current organisation, otherwise other.
- direction only for mentor/mentee: which person is the mentor (A_mentor or B_mentor).
- valid_from only if a quote states when they started working together; otherwise null. Never invent today's date or the first record date.
- Every quote text must be an exact substring of the cited excerpt.
- reason ≤ 120 characters.`;
}

/**
 * Validate model JSON against excerpts and allowed roles.
 * @returns {{ ok: true, value } | { ok: false, reason: string }}
 */
export function validateClassification(raw, excerpts, { shareOrg = false } = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not_object' };

  const tie = raw.tie === true;
  if (raw.tie !== true && raw.tie !== false) return { ok: false, reason: 'bad_tie' };

  let role = typeof raw.role === 'string' ? raw.role.trim() : '';
  if (!ROLE_SET.has(role)) {
    role = shareOrg ? 'colleague' : 'other';
  }

  let direction = raw.direction ?? null;
  if (role !== 'mentor' && role !== 'mentee') direction = null;
  if (direction !== null && direction !== 'A_mentor' && direction !== 'B_mentor') {
    direction = null;
  }

  let valid_from = raw.valid_from ?? null;
  if (valid_from !== null) {
    if (typeof valid_from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valid_from)) {
      valid_from = null;
    } else {
      // Must appear in some quote text
      const quotesProbe = Array.isArray(raw.quotes) ? raw.quotes : [];
      const stated = quotesProbe.some(
        (q) => typeof q?.text === 'string' && q.text.includes(valid_from)
      );
      if (!stated) valid_from = null;
    }
  }

  let reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (!reason) return { ok: false, reason: 'empty_reason' };
  if (reason.length > 120) reason = reason.slice(0, 120).trim();
  if (/\bconfidence\b/i.test(reason) || /shared:person:|person_[0-9a-f-]/i.test(reason)) {
    return { ok: false, reason: 'ugly_reason' };
  }

  const excerptByRef = new Map((excerpts ?? []).map((e) => [e.record_ref, e.text]));
  const quotes = [];
  for (const q of Array.isArray(raw.quotes) ? raw.quotes : []) {
    if (!q || typeof q.text !== 'string') continue;
    const text = q.text.trim();
    if (!text) continue;
    const ref = typeof q.record_ref === 'string' ? q.record_ref : null;
    const excerpt = ref ? excerptByRef.get(ref) : null;
    // Allow match against any excerpt if ref missing but text is substring
    let ok = false;
    if (excerpt && excerpt.includes(text)) ok = true;
    else {
      for (const e of excerpts ?? []) {
        if (e.text.includes(text)) {
          ok = true;
          break;
        }
      }
    }
    if (ok) quotes.push({ record_ref: ref, text });
  }

  if (tie && quotes.length === 0) return { ok: false, reason: 'no_valid_quotes' };

  return {
    ok: true,
    value: {
      tie,
      role,
      direction,
      confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'medium',
      valid_from,
      reason,
      quotes
    }
  };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Classify one candidate. `deps.complete` may stub Claude:
 *   async ({ system, user }) => string
 */
export async function classifyCandidate(candidate, { personA, personB, deps = {} } = {}) {
  const rosterByRef = new Map([
    [personA.ref, personA],
    [personB.ref, personB]
  ]);
  const excerpts = selectExcerpts(candidate, rosterByRef);
  const shareOrg = (candidate.shared_org_refs ?? []).length > 0;
  const user = buildClassifyPrompt({ personA, personB, candidate, excerpts });
  const system =
    'You are a careful professional-network analyst. Reply with JSON only. Never invent dates or quote text that is not in the excerpts.';

  let text;
  if (typeof deps.complete === 'function') {
    text = await deps.complete({ system, user, candidate, excerpts });
  } else {
    const apiKey = deps.apiKey ?? deps.env?.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, reason: 'missing_anthropic_key', excerpts };
    }
    const client = createAnthropicClient({
      apiKey,
      fetchImpl: deps.fetchImpl ?? fetch
    });
    let out = '';
    for await (const event of client.streamMessage({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 1024
    })) {
      if (event.type === 'text') out += event.delta ?? '';
    }
    text = out;
  }

  const parsed = extractJsonObject(text);
  const validated = validateClassification(parsed, excerpts, { shareOrg });
  if (!validated.ok) return { ok: false, reason: validated.reason, excerpts, raw: parsed };
  return { ok: true, value: validated.value, excerpts };
}
