/**
 * Property statement reader. Sends one agent statement, loan statement, bill or
 * receipt (PDF or photo) to Claude and turns the reply into entries the Property
 * engine accepts. Nothing is saved here: the page shows the entries for review and
 * saves the ones Adam keeps. The file itself is never stored.
 */
import { completeMessage } from './anthropic-client.mjs';
import { EXPENSE_CATEGORIES, normalizeEntry } from '../../../apps/life/js/app/property-model.js';

export const READER_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// Netlify caps a request body at 6MB; base64 adds a third, so 4MB of file fits.
export const READER_MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 40;
const READ_TIMEOUT_MS = 24_000;

export class PropertyReaderError extends Error {
  constructor(code, message, status = 400, retryable = false) {
    super(message);
    this.name = 'PropertyReaderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** Check the uploaded file. Returns { name, type, data } or throws a PropertyReaderError. */
export function validateReaderFile(file) {
  if (!file || typeof file !== 'object') throw new PropertyReaderError('invalid_file', 'Pick a statement to read.');
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  if (!READER_MEDIA_TYPES.includes(type)) throw new PropertyReaderError('unsupported_file', 'That file type cannot be read. Use a PDF or a photo.');
  const data = typeof file.data === 'string' ? file.data.replace(/^data:[^,]*,/, '') : '';
  if (!data || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw new PropertyReaderError('invalid_file', 'That file could not be read. Try choosing it again.');
  if (Math.floor((data.length * 3) / 4) > READER_MAX_BYTES) throw new PropertyReaderError('file_too_large', 'That file is over 4MB. Save a smaller copy and try again.', 413);
  const name = typeof file.name === 'string' ? file.name.trim().slice(0, 120) : '';
  return { name, type, data };
}

export function readerSystemPrompt(record, today) {
  const property = record?.property ?? {};
  const tenancy = record?.tenancy ?? {};
  const loan = record?.loan ?? {};
  const context = [
    property.address && `Property address: ${property.address}`,
    tenancy.agent && `Managing agent: ${tenancy.agent}`,
    loan.lender && `Lender: ${loan.lender}`,
    loan.reference && `Loan account reference: ${loan.reference}`
  ].filter(Boolean);
  return `You read documents for one Australian investment property and turn them into ledger entries. Today is ${today}. Money is AUD.
${context.length ? `\n${context.join('\n')}\n` : ''}
Reply with JSON only, no prose, in this shape:
{"document":"agent statement|loan statement|bill|receipt|other","summary":"one short sentence","entries":[...]}

Entry shapes (dates are YYYY-MM-DD, amounts are plain numbers with no $ or commas):
- {"kind":"statement","date","gross","deductions","periodFrom","periodTo","number","note"}: a rental agent statement. gross is total rent received. deductions is everything the agent kept or paid out (fees plus bills paid on your behalf). number is the statement number if printed.
- {"kind":"expense","date","amount","category","note","inStatement","renews"}: a cost. category is one of ${Object.keys(EXPENSE_CATEGORIES).join(', ')}. On an agent statement, add one expense with "inStatement":true for each bill the agent paid (repairs, council, water, strata, insurance), but not for the agent's own management or letting fees. "renews":"yearly" only for a yearly policy or charge.
- {"kind":"interest","date","amount","balanceAfter","note"}: one per interest charge on a loan statement, dated the day it was charged. amount is the interest debited to the loan (the Debit column). Some lenders print a line like "DEBIT INTEREST AFTER OFFSET SAVING OF $166.84" with the debit in its own column: the figure after "SAVING OF" is the interest the offset saved, never the amount.
- {"kind":"balance","date","balance","note"}: the closing loan balance on a loan statement, dated the statement end. Record a loan balance as a positive number.
- {"kind":"rate","date","rate","note"}: only when the document shows the interest rate changing; rate is a percentage like 5.44.

Rules:
- Only include entries for this property. Skip transactions that are not about it.
- Do not record rent deposits from a bank statement; rent comes from agent statements.
- Use figures exactly as printed. If you cannot read a figure, leave that entry out.
- note is a few plain words (what the bill was for, the statement period). Never copy account numbers into a note.
- If the document is not about the property, return an empty entries list and say so in summary.`;
}

function contentBlock(file) {
  if (file.type === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: file.type, data: file.data } };
}

/** Pull the JSON object out of the model's reply (it may wrap it in a code fence). */
export function parseReaderReply(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Keep only entries the engine accepts. Returns { document, summary, entries, skipped }. */
export function proposalsFromReply(reply) {
  const raw = Array.isArray(reply?.entries) ? reply.entries.slice(0, MAX_ENTRIES) : [];
  const entries = [];
  let skipped = 0;
  for (const item of raw) {
    const result = normalizeEntry(item);
    if (result.error) skipped += 1;
    else entries.push(result.entry);
  }
  const text = value => (typeof value === 'string' ? value.trim().slice(0, 200) : '');
  return { document: text(reply?.document) || 'other', summary: text(reply?.summary), entries, skipped };
}

export async function readPropertyDocument({ file, record, today, apiKey, fetchImpl = fetch, model }) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new PropertyReaderError('reader_unconfigured', 'Reading statements is not set up yet.', 503);
  }
  const checked = validateReaderFile(file);
  const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
  let text;
  try {
    text = await completeMessage({
      apiKey,
      fetchImpl,
      ...(model ? { model } : {}),
      maxTokens: 4096,
      system: readerSystemPrompt(record, today),
      messages: [{ role: 'user', content: [contentBlock(checked), { type: 'text', text: 'Read this document and reply with the JSON.' }] }],
      signal
    });
  } catch {
    throw new PropertyReaderError('reader_unavailable', 'That statement could not be read just now. Try again.', 503, true);
  }
  const reply = parseReaderReply(text);
  if (!reply) throw new PropertyReaderError('reader_unreadable', 'Nothing could be read from that file. Record it by hand instead.', 422);
  return proposalsFromReply(reply);
}
