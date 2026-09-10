const MAX_KEYS = 4;

/** Coarse workout focus → default asset key */
const COARSE_FOCUS = {
  chest: 'chest-whole',
  back: 'back-full',
  legs: 'thighs-front',
  arms: 'arm-bicep',
  shoulders: 'shoulders',
  core: 'abs-full',
  abs: 'abs-full',
  glutes: 'glutes',
  calves: 'calves'
};

/** Normalized library / free-text tokens → asset key */
const TOKEN_TO_KEY = {
  ...COARSE_FOCUS,
  'upper chest': 'chest-upper',
  'lower chest': 'chest-lower',
  'inner chest': 'chest-inner',
  midchest: 'chest-whole',
  'mid chest': 'chest-whole',
  traps: 'chest-traps',
  trapezius: 'chest-traps',
  'upper back': 'back-upper',
  'lower back': 'back-lower',
  'full back': 'back-full',
  lats: 'back-full',
  triceps: 'back-triceps',
  'upper abs': 'abs-upper',
  'lower abs': 'abs-lower',
  obliques: 'abs-obliques',
  'abs full': 'abs-full',
  biceps: 'arm-bicep',
  bicep: 'arm-bicep',
  forearm: 'arm-forearm',
  forearms: 'arm-forearm',
  shoulder: 'shoulders',
  delts: 'shoulders',
  deltoids: 'shoulders',
  thighs: 'thighs-front',
  quads: 'thighs-front',
  quadriceps: 'thighs-front',
  hamstrings: 'thighs-back',
  'gluteus maximus': 'glutes',
  glute: 'glutes',
  calf: 'calves'
};

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function keyForToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  return TOKEN_TO_KEY[normalized] ?? COARSE_FOCUS[normalized] ?? null;
}

function libraryNameKey(name) {
  return normalizeToken(name);
}

function lookupLibraryEntry(library, name) {
  if (!library || name == null) return null;
  const raw = String(name);
  if (library.has(raw)) return library.get(raw);
  const norm = libraryNameKey(raw);
  if (library.has(norm)) return library.get(norm);
  for (const [key, entry] of library.entries()) {
    if (libraryNameKey(key) === norm || libraryNameKey(entry?.name) === norm) return entry;
  }
  return null;
}

/**
 * Resolve ordered muscle asset keys for a session or template.
 * Prefers exercise-library focus_areas / target_area; falls back to coarse focus[].
 */
export function resolveMuscleMapKeys({
  focus = [],
  exercises = [],
  libraryByName = null,
  limit = MAX_KEYS
} = {}) {
  const keys = [];
  const seen = new Set();

  const push = key => {
    if (!key || seen.has(key) || keys.length >= limit) return;
    seen.add(key);
    keys.push(key);
  };

  const library = libraryByName instanceof Map
    ? libraryByName
    : libraryByName && typeof libraryByName === 'object'
      ? new Map(Object.entries(libraryByName))
      : null;

  if (library && Array.isArray(exercises)) {
    for (const exercise of exercises) {
      if (keys.length >= limit) break;
      const entry = lookupLibraryEntry(library, exercise?.name);
      if (!entry) continue;
      const before = keys.length;
      for (const area of entry.focus_areas ?? []) push(keyForToken(area));
      if (keys.length === before) push(keyForToken(entry.target_area));
    }
  }

  if (keys.length === 0 && Array.isArray(focus)) {
    for (const tag of focus) push(keyForToken(tag));
  }

  return keys;
}

const NAME_HINTS = [
  [/press|fly|pec|bench/i, 'chest-whole'],
  [/row|pulldown|pull-?up|deadlift|lat/i, 'back-full'],
  [/squat|lunge|split|leg /i, 'thighs-front'],
  [/hip thrust|glute|kickback/i, 'glutes'],
  [/curl|bicep/i, 'arm-bicep'],
  [/tricep|dip/i, 'back-triceps'],
  [/crunch|twist|plank|ab |core/i, 'abs-full'],
  [/shoulder|delt|raise/i, 'shoulders']
];

export function resolveExerciseThumbKey(exercise, libraryByName) {
  const fromLibrary = resolveMuscleMapKeys({
    exercises: [exercise],
    libraryByName,
    limit: 1
  })[0];
  if (fromLibrary) return fromLibrary;
  const name = exercise?.name ?? '';
  for (const [pattern, key] of NAME_HINTS) {
    if (pattern.test(name)) return key;
  }
  return 'chest-whole';
}

export function muscleAssetPath(key) {
  return `assets/fitness/muscles/${key}.png`;
}

export function buildLibraryByName(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) return map;
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string') continue;
    map.set(libraryNameKey(entry.name), entry);
    map.set(entry.name, entry);
  }
  return map;
}
