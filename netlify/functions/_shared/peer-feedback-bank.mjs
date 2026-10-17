/**
 * The feedback buttons for peer annotation: one bank, set by the teacher,
 * shared by every annotate-mode peer feedback block in every lesson.
 *
 *   peer_feedback_bank   { codes: [{ id, label, colour, ask?, resource? }], updated_at }
 *
 * A button can ask the reviewer for a short answer ("Should be: ___") and can
 * carry a resource only the teacher sets: a link, a video (with a start time),
 * or the technique card matching the reviewer's answer. Resources are looked
 * up when the writer reads the feedback, so fixing a link fixes it everywhere.
 */

export const BANK_KEY = 'peer_feedback_bank';
export const BANK_COLOURS = ['blue', 'sage', 'peach', 'gold', 'lilac'];
export const MAX_CODES = 12;
const MAX_LABEL = 40;
const MAX_ASK = 60;
const MAX_TITLE = 120;

export const DEFAULT_CODES = [
  { id: 'wrong-technique', label: 'Wrong technique', colour: 'peach', ask: 'Should be:', resource: { kind: 'technique' } },
  { id: 'needs-evidence', label: 'Needs evidence', colour: 'blue' },
  { id: 'explain-effect', label: 'Explain the effect', colour: 'lilac' },
  { id: 'great-quote', label: 'Great quote', colour: 'sage' },
  { id: 'unclear', label: 'Unclear', colour: 'gold', ask: 'What confused you?' }
];

export class BankError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function cleanUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function cleanResource(raw, label) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'technique') return { kind: 'technique' };
  if (raw.kind !== 'link' && raw.kind !== 'video') return null;
  const url = cleanUrl(raw.url);
  if (!url) throw new BankError(`“${label}” needs a full web address starting with https://.`);
  const resource = { kind: raw.kind, url, title: text(raw.title, MAX_TITLE) };
  if (raw.kind === 'video') {
    const start = Math.floor(Number(raw.start));
    if (Number.isFinite(start) && start > 0) resource.start = Math.min(start, 24 * 3600);
  }
  return resource;
}

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'button';
}

/** Validates a bank sent by the teacher. Keeps ids stable so old notes still find their button. */
export function cleanBank(input) {
  const raw = Array.isArray(input?.codes) ? input.codes : null;
  if (!raw) throw new BankError('Send a list of buttons.');
  if (raw.length === 0) throw new BankError('Keep at least one button.');
  if (raw.length > MAX_CODES) throw new BankError(`Keep it to ${MAX_CODES} buttons.`);
  const used = new Set();
  return raw.map((row) => {
    const label = text(row?.label, MAX_LABEL);
    if (!label) throw new BankError('Every button needs a label.');
    let id = typeof row.id === 'string' && /^[a-z0-9-]{1,40}$/.test(row.id) ? row.id : slug(label);
    for (let n = 2; used.has(id); n++) id = `${slug(label)}-${n}`;
    used.add(id);
    const code = { id, label, colour: BANK_COLOURS.includes(row.colour) ? row.colour : 'blue' };
    const ask = text(row.ask, MAX_ASK);
    if (ask) code.ask = ask;
    const resource = cleanResource(row.resource, label);
    if (resource) code.resource = resource;
    return code;
  });
}

export async function readBank(store) {
  const saved = await store.get(BANK_KEY, { type: 'json', consistency: 'strong' });
  return Array.isArray(saved?.codes) && saved.codes.length ? saved.codes : DEFAULT_CODES;
}

export async function writeBank(store, input) {
  const codes = cleanBank(input);
  await store.setJSON(BANK_KEY, { codes, updated_at: new Date().toISOString() });
  return codes;
}
