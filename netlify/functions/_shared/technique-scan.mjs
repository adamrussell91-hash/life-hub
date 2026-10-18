/**
 * Technique scan on rich text blocks: which Periodic Table techniques a
 * passage uses, with the quote, a confidence and a one-line reason for each.
 *
 * Ported from the Periodic Table widget's Passage Scanner (widgets repo).
 * The server prompt uses a generated names list from the same sync as the
 * teaching table. The parser checks quotes and reply shape; the page maps
 * technique names onto table ids and drops unknown names.
 */
import { TextToolError } from './text-tool-error.mjs';
import { LITERARY_TECHNIQUE_NAMES } from './literary-technique-names.mjs';

const KNOWN_TECHNIQUES = new Set(LITERARY_TECHNIQUE_NAMES.map((name) => name.toLowerCase()));

/** Same floor as the widget: anything below this is not shown at all. */
export const TECHNIQUE_CONFIDENCE_FLOOR = 20;
export const MAX_TECHNIQUE_QUOTES = 30;
export const MAX_TECHNIQUES_PER_QUOTE = 6;
/** The widget scans up to 3000 characters in one pass. */
export const MAX_TECHNIQUE_SCAN_CHARS = 6_000;

/**
 * Ask the model for a raw reply in the widget's JSON shape:
 *   [{"quote":"…","techniques":[{"technique":"Name","confidence":85,"explanation":"…"}]}]
 *
 * Uses the Periodic Table widget's Passage Scanner prompt, server-side only.
 */
export async function requestTechniqueScan({ env = {}, text, model, signal }) {
  const key = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  if (!key) throw new TextToolError('The technique scan is not configured (OPENAI_API_KEY).');
  const prompt = `You are a rigorous literary techniques analyst. Scan the passage and identify techniques used for effect, rating your own confidence honestly rather than only reporting certainties.

You MUST only use technique names from this exact list — do not invent, rename, or generalise a technique (e.g. no "Concrete Diction" or "Identity Assertion" if the closest real entry is "Diction" or "Ethos"); pick the closest matching real entry instead: ${LITERARY_TECHNIQUE_NAMES.join(', ')}

RULES:
1. A single quoted excerpt can and often does exhibit MULTIPLE techniques at once — that's normal in literature, not an error. List each technique you notice for that excerpt as its own entry with its own confidence.
2. Give every technique a confidence 0-100 reflecting how sure you are it's deliberately at work here, not just resemblance:
   - 70-100: clearly and unambiguously present
   - 40-69: a reasonable, defensible reading, but arguable or dependent on how the line is voiced/interpreted
   - 15-39: a plausible minor or conditional reading (say what condition or context would make it true) — include these, don't self-censor to only "safe" answers
3. Don't be shy about textbook-obvious devices (e.g. an actual rhetorical question, a clear metaphor, direct repetition) just because the passage is short — brevity is not evidence of absence.
4. "like" is NOT a simile unless it introduces a genuine comparison.
5. Don't flag generic word choice as diction without a distinctive pattern.
6. Don't flag repetition unless something repeats at least twice.
7. A short or plain passage may genuinely contain zero techniques even at low confidence — that's fine, don't invent something to fill the list.

Passage:
"""${text}"""

Return ONLY a valid JSON array (no markdown fences), grouped by excerpt, each technique with its own confidence and a short explanation (for lower-confidence reads, say what makes it arguable or what context would strengthen it):
[{"quote":"exact short excerpt","techniques":[{"technique":"Name","confidence":85,"explanation":"one sentence why"}]}]`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw;
    try {
      // Follow html-app-providers.mjs, while forwarding the job's abort signal.
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 1400,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal
      });
      if (!response.ok) throw new Error('OpenAI request failed');
      const body = await response.json();
      raw = body.choices?.[0]?.message?.content;
      if (typeof raw !== 'string') throw new Error('OpenAI reply missing text');
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new TextToolError('The AI service did not answer. Try again in a minute.');
    }

    // As in the widget, retry only a readable response with no usable findings.
    // Leave malformed replies to the caller's parser and return the raw text.
    let findings;
    try {
      ({ findings } = parseTechniqueResult(raw, text));
    } catch {
      return raw;
    }
    const hasKnownTechnique = findings.some(({ techniques }) =>
      techniques.some(({ technique }) => KNOWN_TECHNIQUES.has(technique.toLowerCase()))
    );
    if (hasKnownTechnique || attempt === 1) return raw;
  }
}

function clip(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function looseKey(value) {
  return String(value).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

/** The quote is in the passage, ignoring case, spacing and curly quotes. */
export function quoteAppearsIn(text, quote) {
  const q = looseKey(quote);
  return q.length > 0 && looseKey(text).includes(q);
}

function firstJson(raw) {
  const cleaned = String(raw ?? '').replace(/```(?:json)?/gi, '').trim();
  const starts = [cleaned.indexOf('['), cleaned.indexOf('{')].filter((i) => i >= 0);
  if (!starts.length) return undefined;
  const start = Math.min(...starts);
  const end = cleaned.lastIndexOf(cleaned[start] === '[' ? ']' : '}');
  if (end <= start) return undefined;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function toGroups(data) {
  let list = Array.isArray(data) ? data : null;
  if (!list && data && typeof data === 'object') {
    for (const key of ['findings', 'quotes', 'results', 'items']) {
      if (Array.isArray(data[key])) {
        list = data[key];
        break;
      }
    }
  }
  if (!list) return null;
  // The widget also accepts the older flat shape [{technique, quote, explanation}].
  if (list.length && list[0] && !Array.isArray(list[0].techniques) && list[0].technique) {
    const byQuote = new Map();
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const hits = byQuote.get(row.quote) ?? [];
      hits.push({ technique: row.technique, confidence: row.confidence ?? 70, explanation: row.explanation });
      byQuote.set(row.quote, hits);
    }
    list = [...byQuote].map(([quote, techniques]) => ({ quote, techniques }));
  }
  return list;
}

/**
 * Keep well-formed findings whose quote is in the passage and whose
 * confidence clears the floor. Highest confidence first within each quote.
 */
export function parseTechniqueResult(raw, text) {
  const data = firstJson(raw);
  const groups = data === undefined ? null : toGroups(data);
  if (!groups) throw new TextToolError('The technique scan reply could not be read. Try again.');

  const findings = [];
  const seenQuotes = new Set();
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const quote = clip(group.quote, 300);
    if (!quote || seenQuotes.has(looseKey(quote)) || !quoteAppearsIn(text, quote)) continue;
    const seen = new Set();
    const techniques = [];
    for (const hit of Array.isArray(group.techniques) ? group.techniques : []) {
      if (!hit || typeof hit !== 'object') continue;
      const technique = clip(hit.technique, 80);
      const confidence = Math.round(Math.min(100, Math.max(0, Number(hit.confidence))));
      if (!technique || !Number.isFinite(confidence) || confidence < TECHNIQUE_CONFIDENCE_FLOOR) continue;
      if (seen.has(technique.toLowerCase())) continue;
      seen.add(technique.toLowerCase());
      techniques.push({ technique, confidence, explanation: clip(hit.explanation, 300) });
    }
    if (!techniques.length) continue;
    techniques.sort((a, b) => b.confidence - a.confidence);
    seenQuotes.add(looseKey(quote));
    findings.push({ quote, techniques: techniques.slice(0, MAX_TECHNIQUES_PER_QUOTE) });
    if (findings.length >= MAX_TECHNIQUE_QUOTES) break;
  }
  return { findings };
}

/**
 * What a published lesson may carry to students: only the techniques the
 * teacher approved, with their quotes. Unreviewed hits and the model's
 * explanations stay teacher-side. A block with nothing approved loses the scan.
 */
export function studentTechniqueScan(block) {
  const scan = block?.settings?.technique_scan;
  if (!scan) return block;
  const { technique_scan: _scan, ...settings } = block.settings;
  const approved = new Set(Array.isArray(scan.approved_ids) ? scan.approved_ids.filter((id) => typeof id === 'string') : []);
  const findings = (Array.isArray(scan.findings) ? scan.findings : [])
    .map((finding) => ({
      quote: finding?.quote,
      techniques: (Array.isArray(finding?.techniques) ? finding.techniques : [])
        .filter((hit) => approved.has(hit?.id))
        .map((hit) => ({ id: hit.id, confidence: hit.confidence }))
    }))
    .filter((finding) => typeof finding.quote === 'string' && finding.techniques.length);
  if (!findings.length) return { ...block, settings };
  return {
    ...block,
    settings: {
      ...settings,
      technique_scan: { findings, approved_ids: [...approved], scanned_at: scan.scanned_at, approved_at: scan.approved_at }
    }
  };
}
