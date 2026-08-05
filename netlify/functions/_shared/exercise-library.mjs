export const EXERCISE_LIBRARY_PATH = 'data/exercise-library.json';

const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const MAX_HIGHLIGHTS = 20;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;

export function parseExerciseLibrary(content) {
  if (typeof content !== 'string') return [];
  let parsed;
  try { parsed = JSON.parse(content); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.name === 'string');
}

export function validateExerciseLibraryEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.name !== 'string' || input.name.trim() === '') return null;
  if (typeof input.target_area !== 'string' || input.target_area.trim() === '') return null;

  const entry = {
    name: input.name.trim(),
    target_area: input.target_area.trim()
  };

  const equipment = normalizeStringList(input.equipment);
  if (equipment) entry.equipment = equipment;
  const focus = normalizeStringList(input.focus_areas);
  if (focus) entry.focus_areas = focus;

  if (typeof input.setup_cues === 'string' && input.setup_cues.trim()) entry.setup_cues = input.setup_cues.trim();
  if (typeof input.attachment === 'string' && input.attachment.trim()) entry.attachment = input.attachment.trim();
  if (typeof input.movement_pattern === 'string' && input.movement_pattern.trim()) {
    entry.movement_pattern = input.movement_pattern.trim();
  }
  if (typeof input.demo_link === 'string' && input.demo_link.trim()) entry.demo_link = input.demo_link.trim();

  if (input.in_rotation != null) {
    if (typeof input.in_rotation !== 'boolean') return null;
    entry.in_rotation = input.in_rotation;
  }

  for (const field of ['default_sets', 'default_reps', 'working_weight_kg', 'best_weight_kg', 'default_bench_angle_deg']) {
    if (input[field] == null) continue;
    if (typeof input[field] !== 'number' || !Number.isFinite(input[field])) return null;
    entry[field] = input[field];
  }

  if (input.default_cable_type != null) {
    if (!CABLE_TYPES.includes(input.default_cable_type)) return null;
    entry.default_cable_type = input.default_cable_type;
  }

  if (input.last_performed != null) {
    if (typeof input.last_performed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.last_performed)) return null;
    entry.last_performed = input.last_performed;
  }

  return entry;
}

export function upsertExerciseLibraryEntry(entries, entry, updatedAt) {
  const list = Array.isArray(entries)
    ? entries.filter(existing => libraryKey(existing) !== libraryKey(entry))
    : [];
  list.push({ ...entry, updated_at: updatedAt });
  return list;
}

export function selectExerciseHighlights(entries, limit = MAX_HIGHLIGHTS) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const rotating = entries.filter(e => e.in_rotation === true);
  const rest = entries
    .filter(e => e.in_rotation !== true)
    .slice()
    .sort((a, b) => compareLastPerformedDesc(a, b));
  const seen = new Set(rotating.map(libraryKey));
  const out = [...rotating];
  for (const entry of rest) {
    if (out.length >= limit) break;
    const key = libraryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.slice(0, limit);
}

export function searchExerciseLibrary(entries, {
  query,
  target_area,
  in_rotation,
  limit = DEFAULT_SEARCH_LIMIT
} = {}) {
  if (!Array.isArray(entries) || typeof query !== 'string' || query.trim() === '') return [];
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const capped = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);

  return entries.filter(entry => {
    if (target_area != null && String(entry.target_area).toLowerCase() !== String(target_area).toLowerCase()) {
      return false;
    }
    if (in_rotation != null && Boolean(entry.in_rotation) !== Boolean(in_rotation)) return false;
    const haystack = [
      entry.name,
      entry.target_area,
      ...(entry.equipment ?? []),
      ...(entry.focus_areas ?? []),
      entry.setup_cues ?? ''
    ].join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  }).slice(0, capped);
}

export function formatExerciseLibraryForPrompt(entries) {
  const highlights = selectExerciseHighlights(entries);
  if (highlights.length === 0) return '';
  return highlights.map(entry => {
    const equipment = Array.isArray(entry.equipment) ? entry.equipment.join(', ') : '';
    const weight = typeof entry.working_weight_kg === 'number' ? `${entry.working_weight_kg} kg` : '';
    const rotation = entry.in_rotation ? 'in rotation' : '';
    const bits = [entry.target_area, equipment, weight, rotation].filter(Boolean).join(' · ');
    return `- ${entry.name} — ${bits}`;
  }).join('\n');
}

export function exerciseLibraryEntryFromCsvRow(row) {
  if (!row || typeof row !== 'object') return null;
  const get = (...keys) => {
    for (const key of keys) {
      if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
      const bom = `\ufeff${key}`;
      if (row[bom] != null && String(row[bom]).trim() !== '') return String(row[bom]).trim();
    }
    return '';
  };

  const name = get('Exercise');
  const target = get('Target area');
  if (!name || !target) return null;

  const input = {
    name,
    target_area: target,
    equipment: get('Equipment') || undefined,
    focus_areas: get('Focus areas') || undefined,
    setup_cues: get('Setup & cues') || undefined,
    in_rotation: /^yes$/i.test(get('In rotation')),
    movement_pattern: get('Movement pattern') || undefined,
    demo_link: get('Demo link') || undefined
  };

  const best = Number(get('Best weight kg'));
  if (Number.isFinite(best) && get('Best weight kg') !== '') input.best_weight_kg = best;
  const working = Number(get('Current working weight kg'));
  if (Number.isFinite(working) && get('Current working weight kg') !== '') input.working_weight_kg = working;
  const reps = Number(get('Default reps'));
  if (Number.isFinite(reps) && get('Default reps') !== '') input.default_reps = reps;
  const sets = Number(get('Default sets'));
  if (Number.isFinite(sets) && get('Default sets') !== '') input.default_sets = sets;

  const last = parseNotionDate(get('Last performed'));
  if (last) input.last_performed = last;

  return validateExerciseLibraryEntry(input);
}

export function searchExerciseLibrarySchema() {
  return {
    name: 'search_exercise_library',
    description: 'Search Adam\'s Exercise Library by name, target area, equipment, focus muscles, or setup cues. Use before inventing a move or guessing attachment/cable/bench defaults.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; tokens are ANDed' },
        target_area: { type: 'string' },
        in_rotation: { type: 'boolean' },
        limit: { type: 'number', description: 'Max results (default 10, max 25)' }
      },
      required: ['query']
    }
  };
}

export function saveExerciseLibraryEntrySchema() {
  return {
    name: 'save_exercise_library_entry',
    description: 'Create or update an Exercise Library entry (cues, defaults, rotation, weights). Call after refining a move or adding a new one.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target_area: { type: 'string' },
        equipment: { type: 'array', items: { type: 'string' } },
        focus_areas: { type: 'array', items: { type: 'string' } },
        setup_cues: { type: 'string' },
        in_rotation: { type: 'boolean' },
        default_sets: { type: 'number' },
        default_reps: { type: 'number' },
        working_weight_kg: { type: 'number' },
        best_weight_kg: { type: 'number' },
        attachment: { type: 'string' },
        default_cable_type: { type: 'string', enum: CABLE_TYPES },
        default_bench_angle_deg: { type: 'number' },
        movement_pattern: { type: 'string' },
        demo_link: { type: 'string' },
        last_performed: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['name', 'target_area']
    }
  };
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    const list = value.map(v => String(v).trim()).filter(Boolean);
    return list.length ? list : null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(part => part.trim()).filter(Boolean);
  }
  return null;
}

function libraryKey(entry) {
  return String(entry?.name ?? '').trim().toLowerCase();
}

function compareLastPerformedDesc(a, b) {
  const left = a.last_performed || '';
  const right = b.last_performed || '';
  if (left === right) return libraryKey(a).localeCompare(libraryKey(b));
  if (!left) return 1;
  if (!right) return -1;
  return right.localeCompare(left);
}

function parseNotionDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value);
  if (!match) return null;
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const month = months[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
}
