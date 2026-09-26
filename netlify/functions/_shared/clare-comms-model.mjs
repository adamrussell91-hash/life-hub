// One Claude call for Clare's comm jobs. Same shape as person-brief-generation.mjs:
// raw fetch to the Messages API, JSON-only replies, never trusted blindly.
export const CLARE_COMMS_MODEL = 'claude-sonnet-5';

function clareFailed(detail) {
  return Object.assign(new Error(`Clare could not finish: ${detail}`), { status: 502, code: 'clare_failed', retryable: true });
}

export function extractJsonText(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * @param {{ system: string, content: unknown[], apiKey: string, fetchImpl?: typeof fetch, maxTokens?: number }} input
 * @returns {Promise<any>} the parsed JSON object
 */
export async function completeJson({ system, content, apiKey, fetchImpl = fetch, maxTokens = 1200 }) {
  let response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLARE_COMMS_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
    });
  } catch {
    throw clareFailed('network');
  }
  if (!response.ok) throw clareFailed(`HTTP ${response.status}`);
  const payload = await response.json().catch(() => null);
  const text = payload?.content?.find((block) => block.type === 'text')?.text ?? '';
  try {
    const parsed = JSON.parse(extractJsonText(text));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw clareFailed('reply was not a JSON object');
  }
}
