/** Client-side routines (mirrors config/skincare-routines.yml). */

export const SKINCARE_ROUTINES = {
  am: {
    label: 'Morning routine',
    duration_hint: '~20 min',
    choices: {
      toner: {
        id: 'toner',
        label: 'Toner',
        options: [
          'Anua Rice 70 + Ceramide Glow Milky Toner',
          'Dr Ceuracle Vegan Kombucha Tea Essence'
        ],
        default: 'Anua Rice 70 + Ceramide Glow Milky Toner'
      }
    },
    products: [
      'Azclear Azelaic Acid 20%',
      'Korres Greek Yoghurt Probiotic Gel Cream',
      'La Roche Posay Anthelios SPF 50+',
      'Dr Jart+ Cicapair Colour Corrector',
      'Maybelline Green and Peach Correctors with BareMinerals Concealer',
      'Kosas Cloud Set Translucent Loose Setting and Blurring Powder'
    ]
  },
  pm: {
    label: 'Evening routine',
    duration_hint: '~20 min',
    choices: {
      seal: {
        id: 'seal',
        label: 'Seal',
        options: [
          'La Roche Posay Cicaplast B5+',
          'Avene Cicalfate+'
        ],
        default: 'La Roche Posay Cicaplast B5+'
      }
    },
    products: [
      'Dr.G Green Deep Pore Cleansing Balm',
      'Korres Greek Yoghurt Foaming Cream Cleanser',
      'Toner',
      'Retrieve Tretinoin 0.05% (sandwich method)'
    ]
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
