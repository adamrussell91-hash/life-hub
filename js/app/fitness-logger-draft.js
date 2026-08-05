export const CABLE_TYPES = [
  'constant_force',
  'concentric',
  'eccentric',
  'elastic',
  'rowing',
  'none'
];

export const AUTOSAVE_IDLE_MS = 45_000;

export function slugifyWorkoutTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workout';
}

export function slugFromWorkoutPath(path) {
  if (typeof path !== 'string' || !path) return null;
  const file = path.split('/').at(-1)?.replace(/\.md$/, '') ?? '';
  const parts = file.split('-');
  if (parts.length < 4) return null;
  return parts.slice(3).join('-') || null;
}

export function finishLabel(sessionKind) {
  return sessionKind === 'strength' ? 'Pump finished' : 'Session finished';
}

export function cloneLoggerDraft(session) {
  const source = session ?? {};
  return {
    type: 'workout',
    date: source.date,
    time: source.time,
    title: source.title ?? 'Session',
    session_kind: source.session_kind ?? 'strength',
    day_type: source.day_type ?? 'workout_30',
    status: 'planned',
    duration_min: source.duration_min ?? null,
    avg_hr: source.avg_hr ?? null,
    calories_kcal: source.calories_kcal ?? null,
    distance_km: source.distance_km ?? null,
    focus: Array.isArray(source.focus) ? [...source.focus] : [],
    recovery_flag_next_day: Boolean(source.recovery_flag_next_day),
    pain_flags: Array.isArray(source.pain_flags)
      ? source.pain_flags.map(flag => (typeof flag === 'object' ? { ...flag } : flag))
      : [],
    exercises: (source.exercises ?? []).map(exercise => ({
      name: exercise.name,
      ...(exercise.equipment != null ? { equipment: exercise.equipment } : {}),
      ...(exercise.bench_angle_deg != null ? { bench_angle_deg: exercise.bench_angle_deg } : {}),
      ...(exercise.intensification != null ? { intensification: exercise.intensification } : {}),
      sets: (exercise.sets ?? []).map(set => ({
        reps: Number(set.reps) || 0,
        weight_kg: Number(set.weight_kg) || 0,
        cable_type: CABLE_TYPES.includes(set.cable_type) ? set.cable_type : 'none'
      }))
    })),
    notes: typeof source.notes === 'string' ? source.notes : '',
    path: source.path ?? null
  };
}

export function draftStorageKey(date, path) {
  return `life-hub:fitness-logger:${date}:${path || 'untitled'}`;
}

export function loadDraft(storage, date, path) {
  try {
    const raw = storage?.getItem?.(draftStorageKey(date, path));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? cloneLoggerDraft(parsed) : null;
  } catch {
    return null;
  }
}

export function saveDraft(storage, draft) {
  if (!storage?.setItem || !draft?.date) return;
  storage.setItem(draftStorageKey(draft.date, draft.path), JSON.stringify(draft));
}

export function clearDraft(storage, date, path) {
  storage?.removeItem?.(draftStorageKey(date, path));
}

export function resolveDraft(session, storage) {
  if (!session || session.status !== 'planned') return null;
  const base = cloneLoggerDraft(session);
  const stored = loadDraft(storage, base.date, base.path);
  if (!stored || stored.date !== base.date) return base;
  if (stored.path && base.path && stored.path !== base.path) return base;
  return { ...stored, path: base.path ?? stored.path };
}

export function toConfirmPayload(draft, { status = 'planned' } = {}) {
  const working = cloneLoggerDraft(draft);
  working.status = status;
  const slug = slugFromWorkoutPath(working.path) || slugifyWorkoutTitle(working.title);
  const notes = working.notes ?? '';
  const candidate = {
    type: 'workout',
    date: working.date,
    ...(working.time ? { time: working.time } : {}),
    ...(notes ? { notes } : {}),
    fields: {
      title: working.title,
      session_kind: working.session_kind,
      day_type: working.day_type,
      status: working.status,
      focus: working.focus,
      recovery_flag_next_day: working.recovery_flag_next_day,
      exercises: working.exercises,
      pain_flags: working.pain_flags,
      ...(working.duration_min != null ? { duration_min: working.duration_min } : {}),
      ...(working.avg_hr != null ? { avg_hr: working.avg_hr } : {}),
      ...(working.calories_kcal != null ? { calories_kcal: working.calories_kcal } : {}),
      ...(working.distance_km != null ? { distance_km: working.distance_km } : {})
    }
  };
  return { candidate, slug, overwrite: true };
}

export function draftFingerprint(draft) {
  const { path: _path, ...rest } = cloneLoggerDraft(draft);
  return JSON.stringify(rest);
}

export function appendSet(exercise) {
  const last = exercise.sets?.at(-1);
  const next = {
    reps: last?.reps ?? 10,
    weight_kg: last?.weight_kg ?? 0,
    cable_type: last?.cable_type && CABLE_TYPES.includes(last.cable_type) ? last.cable_type : 'none'
  };
  return {
    ...exercise,
    sets: [...(exercise.sets ?? []), next]
  };
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
