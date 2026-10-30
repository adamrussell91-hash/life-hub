/**
 * Neutral routine template (labels, extras, note chips). No products: the live
 * shelf and AM/PM rotation come from the private data repo through the
 * authenticated skincare APIs (product library + routine membership), and the
 * server's cold-start seed reads the private config/skincare-routines.yml.
 */

export const SKINCARE_ROUTINES = {
  am: {
    label: 'Morning routine',
    duration_hint: '~20 min',
    choices: {},
    products: []
  },
  pm: {
    label: 'Evening routine',
    duration_hint: '~20 min',
    choices: {},
    products: []
  },
  extras: ['Sheet mask'],
  note_chips: [
    'Redness',
    'Tightness',
    'Dryness',
    'Congestion',
    'Looking good',
    'Irritated',
    'Sensitive'
  ]
};

/** Merge a parsed routines document (same shape as config/skincare-routines.yml) over the template. */
export function mergeSkincareRoutines(parsed, base = SKINCARE_ROUTINES) {
  if (!parsed || typeof parsed !== 'object') return base;
  const routine = key => {
    const source = parsed[key] && typeof parsed[key] === 'object' ? parsed[key] : {};
    const products = Array.isArray(source.products)
      ? source.products.map(name => String(name ?? '').trim()).filter(Boolean)
      : base[key].products;
    return {
      ...base[key],
      ...(typeof source.label === 'string' ? { label: source.label } : {}),
      ...(typeof source.duration_hint === 'string' ? { duration_hint: source.duration_hint } : {}),
      choices: source.choices && typeof source.choices === 'object' ? source.choices : base[key].choices,
      products
    };
  };
  const list = (value, fallback) => (Array.isArray(value) ? value.map(String).filter(Boolean) : fallback);
  return {
    am: routine('am'),
    pm: routine('pm'),
    extras: list(parsed.extras, base.extras),
    note_chips: list(parsed.note_chips, base.note_chips)
  };
}

export function currentRoutineKey(date = new Date(), timeZone = 'Australia/Sydney') {
  const hour = Number(new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    hour12: false,
    timeZone
  }).format(date));
  return hour < 12 ? 'am' : 'pm';
}

export function buildProductList(routineKey, {
  choiceSelections = {},
  enabledProducts = null,
  extras = [],
  activeProducts = null,
  oneOffs = []
} = {}) {
  const routine = SKINCARE_ROUTINES[routineKey];
  if (!routine) return [];
  const selected = [];
  for (const choice of Object.values(routine.choices ?? {})) {
    const value = choiceSelections[choice.id] ?? choice.default;
    if (value) selected.push(value);
  }
  const pool = [...(activeProducts ?? routine.products ?? []), ...(oneOffs ?? [])];
  const uniquePool = [...new Set(pool)];
  const enabled = enabledProducts == null
    ? uniquePool
    : uniquePool.filter(name => enabledProducts.includes(name));
  return [...selected, ...enabled, ...extras.filter(Boolean)];
}

export function appendNoteChip(notes, chip) {
  const text = String(chip ?? '').trim();
  if (!text) return notes ?? '';
  const current = String(notes ?? '').trim();
  if (!current) return text;
  const parts = current.split(/,\s*/);
  if (parts.map(part => part.toLowerCase()).includes(text.toLowerCase())) return current;
  return `${current}, ${text}`;
}

export function slugifySkincareTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'procedure';
}

export function toSkincareConfirmPayload({
  date,
  routine,
  products,
  notes = '',
  skinNote = null,
  slug,
  procedureTitle = null
}) {
  const bodyNotes = procedureTitle
    ? [`Procedure: ${procedureTitle}.`, notes].filter(Boolean).join(' ').trim()
    : notes;
  return {
    candidate: {
      type: 'skincare',
      date,
      ...(bodyNotes ? { notes: bodyNotes } : {}),
      fields: {
        routine,
        completed: true,
        products: [...products],
        ...(skinNote ? { skin_note: skinNote } : {})
      }
    },
    slug: slug
      || (procedureTitle ? slugifySkincareTitle(procedureTitle) : null)
      || (routine === 'am' || routine === 'pm' ? routine : slugifySkincareTitle(procedureTitle)),
    overwrite: true
  };
}
