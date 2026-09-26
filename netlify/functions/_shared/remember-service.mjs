import { parseEntityRef } from './entity-ref.mjs';
import { extractRememberCandidates } from './remember-schema.mjs';
import { createRememberFactRepository } from './remember-repository.mjs';
import { createObservationRepository } from './observation-repository.mjs';
import { defaultGetProfessionalStore, getJSON, setJSON, REMEMBER_RUN_STATE_KEY } from './professional-blobs.mjs';
import { defaultGetTasksStore, listJSON as listTasksJSON, PROJECT_PREFIX, TASK_PREFIX } from './tasks-blobs.mjs';
import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';

/**
 * Run Ann's Remember pass for one person (or all people with new material).
 */
export async function runRememberScanForPerson(personRef, deps = {}) {
  const env = deps.env ?? process.env;
  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));
  const tasksStore = deps.tasksStore ?? (await (deps.getTasksStore ?? defaultGetTasksStore)(env).catch(() => null));

  const rememberRepo =
    deps.rememberRepo ??
    createRememberFactRepository({ store: professionalStore, now: deps.now, generateId: deps.generateId });

  const observationRepo =
    deps.observationRepo ?? createObservationRepository({ store: professionalStore, now: deps.now });

  const observations = await observationRepo.listObservationsForAboutRef(personRef).catch(() => []);
  const allTasks = tasksStore ? await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => []) : [];
  const allProjects = tasksStore ? await listTasksJSON(tasksStore, PROJECT_PREFIX).catch(() => []) : [];

  const displayName = deps.displayName ?? '';
  const nameNeedle = displayName.toLowerCase();

  const relatedTasks = allTasks.filter((t) => {
    if (!nameNeedle) return false;
    const hay = `${t.title ?? ''} ${t.notes ?? ''} ${t.body ?? ''}`.toLowerCase();
    return hay.includes(nameNeedle);
  });
  const relatedProjects = allProjects.filter((p) => {
    if (!nameNeedle) return false;
    const hay = `${p.title ?? ''} ${p.notes ?? ''} ${p.body ?? ''}`.toLowerCase();
    return hay.includes(nameNeedle);
  });

  const texts = [
    ...observations.map((o) => ({
      text: o.text,
      ref: `professional:observation:${o.id}`,
      kind: 'note',
      at: o.occurred_at ?? o.created_at
    })),
    ...relatedTasks.map((t) => ({
      text: `${t.title ?? ''}. ${t.notes ?? t.body ?? ''}`,
      ref: t.ref ?? `tasks:task:${t.id}`,
      kind: 'task',
      at: t.updated_at ?? t.created_at
    })),
    ...relatedProjects.map((p) => ({
      text: `${p.title ?? ''}. ${p.notes ?? p.body ?? ''}`,
      ref: p.ref ?? `tasks:project:${p.id}`,
      kind: 'project',
      at: p.updated_at ?? p.created_at
    }))
  ];

  const candidates = extractRememberCandidates({ person_ref: personRef, texts });
  const created = [];
  for (const candidate of candidates) {
    const result = await rememberRepo.createFact(candidate);
    if (result.created) created.push(result.fact);
  }
  return { created, count: created.length, candidates: candidates.length };
}

/**
 * Scheduled Remember: only people with new observations/tasks/projects since last run.
 * Sydney 07:00 / 16:00 — caller schedules hourly and gates with `shouldRunRememberNow`.
 */
export function sydneyHourParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

export function shouldRunRememberNow(now = new Date(), state = {}) {
  const { hour, dayKey } = sydneyHourParts(now);
  if (hour !== 7 && hour !== 16) return { run: false, slot: null, dayKey };
  const slot = hour === 7 ? 'morning' : 'afternoon';
  const last = state?.last_slots?.[`${dayKey}:${slot}`];
  if (last) return { run: false, slot, dayKey };
  return { run: true, slot, dayKey };
}

export async function runRememberScheduledPass(deps = {}) {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const nowValue = now();
  const nowIso = nowValue instanceof Date ? nowValue.toISOString() : String(nowValue);

  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));
  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));

  const state = (await getJSON(professionalStore, REMEMBER_RUN_STATE_KEY)) ?? { last_slots: {} };
  const gate = shouldRunRememberNow(nowValue instanceof Date ? nowValue : new Date(nowIso), state);
  if (!gate.run && !deps.force) {
    return { skipped: true, reason: 'outside_sydney_slots_or_already_ran', ...gate };
  }

  const since = state.last_run_at ?? null;
  const peopleWithRelationships =
    deps.peopleWithRelationships ??
    (await loadAllPeopleWithRelationships({
      store: universalStore,
      now: nowValue,
      env,
      resolveEntity: deps.resolveEntity,
      createRepository: deps.createRepository,
      fetchImpl: deps.fetchImpl
    }));

  const results = [];
  for (const { person } of peopleWithRelationships) {
    if (!person || person.is_self) continue;
    if (person.lifecycle_status === 'deleted' || person.lifecycle_status === 'deidentified') continue;
    const personRef =
      person.ref ??
      (person.id ? `shared:person:${person.id}` : null);
    if (!personRef || !parseEntityRef(personRef)) continue;

    // Cheap freshness: if we have a since marker and person.updated_at is older, skip
    // unless force. Full material check happens inside scan via observations/tasks.
    if (since && !deps.force && person.updated_at && Date.parse(person.updated_at) < Date.parse(since)) {
      continue;
    }

    const result = await runRememberScanForPerson(personRef, {
      ...deps,
      professionalStore,
      displayName: person.display_name
    });
    if (result.count > 0) results.push({ person_ref: personRef, ...result });
  }

  const nextState = {
    last_run_at: nowIso,
    last_slots: {
      ...(state.last_slots ?? {}),
      ...(gate.slot && gate.dayKey ? { [`${gate.dayKey}:${gate.slot}`]: nowIso } : {})
    }
  };
  await setJSON(professionalStore, REMEMBER_RUN_STATE_KEY, nextState);

  return {
    skipped: false,
    slot: gate.slot,
    people_touched: results.length,
    facts_created: results.reduce((n, r) => n + r.count, 0),
    results
  };
}
