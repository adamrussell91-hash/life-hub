import { runLinkInferencePass } from './link-proposal-service.mjs';
import { createLedgerItemRepository } from './ledger-repository.mjs';
import { extractLedgerCandidatesFromText } from './person-ledger.mjs';
import { createObservationRepository } from './observation-repository.mjs';
import { warmthFor, touchpointsFromOverview } from './warmth-score.mjs';
import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { defaultGetTasksStore, listJSON as listTasksJSON, TASK_PREFIX } from './tasks-blobs.mjs';
import { runRememberScheduledPass } from './remember-service.mjs';

/**
 * Phase 8 — Clare's People sweep step: deterministic link pass + ledger refresh
 * for people touched since last sweep. Proposals use proposer: 'clare' for the
 * LLM-miss path; rules still write proposer: 'rules'.
 */
export async function runClarePeopleSweep(deps = {}) {
  const env = deps.env ?? process.env;
  const nowIso = (deps.now?.() ?? new Date()).toISOString?.()
    ? (deps.now?.() ?? new Date()).toISOString()
    : String(deps.now?.() ?? new Date().toISOString());

  const inference = await runLinkInferencePass({ ...deps, env });

  // Clare-authored proposals for name hits the rules may have skipped as duplicate —
  // additionally scan observation text for "works with" / "colleague at" patterns.
  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));
  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));
  const tasksStore = deps.tasksStore ?? (await (deps.getTasksStore ?? defaultGetTasksStore)(env).catch(() => null));

  const peopleWithRelationships =
    deps.peopleWithRelationships ??
    (await loadAllPeopleWithRelationships({
      store: universalStore,
      now: new Date(nowIso),
      env,
      resolveEntity: deps.resolveEntity,
      createRepository: deps.createRepository,
      fetchImpl: deps.fetchImpl
    }));

  const ledgerRepo =
    deps.ledgerRepo ?? createLedgerItemRepository({ store: professionalStore, now: () => nowIso });
  const observationRepo =
    deps.observationRepo ?? createObservationRepository({ store: professionalStore, now: () => nowIso });

  const allTasks = tasksStore ? await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => []) : [];
  let ledgerCreated = 0;
  const touched = [];

  for (const { person } of peopleWithRelationships) {
    if (!person || person.is_self) continue;
    const personRef = person.ref ?? (person.id ? `shared:person:${person.id}` : null);
    if (!personRef) continue;

    const observations = await observationRepo.listObservationsForAboutRef(personRef).catch(() => []);
    const nameNeedle = (person.display_name || '').toLowerCase();
    const relatedTasks = allTasks.filter((t) => {
      const hay = `${t.title ?? ''} ${t.notes ?? ''}`.toLowerCase();
      return nameNeedle && hay.includes(nameNeedle);
    });
    const texts = [
      ...observations.map((o) => ({
        text: o.text,
        ref: `professional:observation:${o.id}`,
        kind: 'observation'
      })),
      ...relatedTasks.map((t) => ({
        text: `${t.title ?? ''}. ${t.notes ?? ''}`,
        ref: t.ref ?? `tasks:task:${t.id}`,
        kind: 'task'
      }))
    ];
    const candidates = extractLedgerCandidatesFromText({ person_ref: personRef, texts });
    let createdHere = 0;
    for (const c of candidates) {
      const result = await ledgerRepo.createItem({ ...c, author: 'clare' });
      if (result.created) {
        createdHere += 1;
        ledgerCreated += 1;
      }
    }
    if (createdHere > 0) touched.push(personRef);
  }

  return {
    inference,
    ledger_items_created: ledgerCreated,
    people_touched: touched,
    at: nowIso
  };
}

/**
 * Hammond cooling flags — only Inner tier or linked to an active goal/project.
 * Flags when warmth is cooling or cold (not warm): worth a touch before / as they go cold.
 */
export function hammondCoolingFlags(peopleWithRelationships, options = {}) {
  const nowIso = options.now ?? new Date().toISOString();
  const activeProjectPersonRefs = new Set(options.activeProjectPersonRefs ?? []);
  const flags = [];

  for (const { person, relationships } of peopleWithRelationships ?? []) {
    if (!person || person.is_self) continue;
    const personRef = person.ref ?? (person.id ? `shared:person:${person.id}` : null);
    if (!personRef) continue;

    const touchpoints = touchpointsFromOverview({ relationships: relationships ?? [] });
    const warmth = warmthFor({
      touchpoints,
      relationships: relationships ?? [],
      personCreatedAt: person.created_at,
      now: nowIso
    });

    if (warmth.band === 'warm') continue;

    const isInner = warmth.tier === 'inner';
    const onActiveProject = activeProjectPersonRefs.has(personRef);
    if (!isInner && !onActiveProject) continue;

    const bandWord = warmth.band === 'cold' ? 'cold' : 'cooling';
    flags.push({
      person_ref: personRef,
      display_name: person.display_name,
      tier: warmth.tier,
      warmth: warmth.warmth,
      band: warmth.band,
      cross_agent_line: `Hammond→Clare: ${person.display_name} is ${bandWord} (${warmth.tier}) — worth a touch before they go cold.`,
      ann_line:
        warmth.tier === 'inner'
          ? `Hammond→Ann: ${person.display_name} (inner) is ${bandWord} — relationship meaning may need a Remember pass.`
          : null
    });
  }
  return flags;
}

/**
 * Combined Phase 8 coordination pass (Clare people sweep + optional Remember force + Hammond flags).
 */
export async function runPeopleCoordinationPass(deps = {}) {
  const clare = await runClarePeopleSweep(deps);
  const remember = deps.skipRemember
    ? { skipped: true }
    : await runRememberScheduledPass({ ...deps, force: Boolean(deps.forceRemember) });

  const env = deps.env ?? process.env;
  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));
  const peopleWithRelationships =
    deps.peopleWithRelationships ??
    (await loadAllPeopleWithRelationships({
      store: universalStore,
      now: new Date(),
      env,
      resolveEntity: deps.resolveEntity,
      createRepository: deps.createRepository,
      fetchImpl: deps.fetchImpl
    }));

  const cooling = hammondCoolingFlags(peopleWithRelationships, {
    now: new Date().toISOString(),
    activeProjectPersonRefs: deps.activeProjectPersonRefs ?? []
  });

  return {
    clare,
    remember,
    hammond_cooling_flags: cooling,
    // Adam confirms links; ledger/remember write directly but stay editable.
    links_require_confirm: true
  };
}
