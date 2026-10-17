/**
 * Technique scan on rich text blocks: which Periodic Table techniques a
 * passage uses, with the quote, a confidence and a one-line reason for each.
 *
 * The scan call is being ported from the Periodic Table widget's Passage
 * Scanner (widgets repo). Until it lands, `requestTechniqueScan` reports that
 * the scan is not connected, and the rest of the pipe (job, poll, parse, save
 * on the block, teacher approval, spinner list) already runs.
 * Port checklist: docs/future-build-ideas/classroom-tools/technique-scan-todo.md
 *
 * The server does not know the technique table. It checks the reply's shape
 * and that every quote is really in the passage; the page maps technique
 * names onto table ids and drops any name the table does not have.
 */
import { TextToolError } from './text-tool-error.mjs';

/** Same floor as the widget: anything below this is not shown at all. */
export const TECHNIQUE_CONFIDENCE_FLOOR = 20;
export const MAX_TECHNIQUE_QUOTES = 30;
export const MAX_TECHNIQUES_PER_QUOTE = 6;
/** The widget scans up to 3000 characters in one pass. */
export const MAX_TECHNIQUE_SCAN_CHARS = 6_000;

export const TECHNIQUE_SCAN_NOT_CONNECTED = 'The technique scan is not connected yet.';

/**
 * Ask the model for a raw reply in the widget's JSON shape:
 *   [{"quote":"…","techniques":[{"technique":"Name","confidence":85,"explanation":"…"}]}]
 *
 * TODO(technique-scan port): replace this body with the Passage Scanner call.
 */
export async function requestTechniqueScan({ env, text, model, signal }) {
  throw new TextToolError(TECHNIQUE_SCAN_NOT_CONNECTED);
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
