import { randomBytes } from 'node:crypto';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readCookie,
  withCors
} from './_shared/http.mjs';
import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { selectManifestEntries } from './_shared/repo-policy.mjs';
import { routeAgent, findAgent, ROUTER_SLUG } from './_shared/agent-directory.mjs';
import { buildSystemPrompt } from './_shared/persona.mjs';
import { loadChadwickProtocol } from './_shared/load-chadwick-protocol.mjs';
import { loadHyaluronicaProtocol } from './_shared/load-hyaluronica-protocol.mjs';
import { loadPenelopeProtocol } from './_shared/load-penelope-protocol.mjs';
import { loadVeraProtocol } from './_shared/load-vera-protocol.mjs';
import { loadBrisketProtocol } from './_shared/load-brisket-protocol.mjs';
import { loadSaraProtocol } from './_shared/load-sara-protocol.mjs';
import { loadHammondProtocol } from './_shared/load-hammond-protocol.mjs';
import { normalizeAuditSession, buildHammondAuditContract } from './_shared/hammond-audit.mjs';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractTodaysStatus
} from '../../js/core/constraints.js';
import { summarizeRecentHistory } from './_shared/digest.mjs';
import { TARGETS_CONFIG } from './_shared/targets-config.mjs';
import { logEntryToolSchema, validateLogEntry, buildCanonicalPath, buildRecordSlug } from './_shared/chat-schema.mjs';
import {
  FOOD_LIBRARY_PATH,
  foodLibraryEntrySchema,
  formatFoodLibraryForPrompt,
  parseFoodLibrary,
  upsertFoodLibraryEntry,
  validateFoodLibraryEntry
} from './_shared/food-library.mjs';
import {
  daysSinceLastSession,
  EXERCISE_LIBRARY_PATH,
  formatExerciseLibraryForPrompt,
  parseExerciseLibrary,
  saveExerciseLibraryEntrySchema,
  searchExerciseLibrary,
  searchExerciseLibrarySchema,
  upsertExerciseLibraryEntry,
  validateExerciseLibraryEntry
} from './_shared/exercise-library.mjs';
import {
  applySaveSkincareLibraryEntry,
  applySetSkincareRoutineMembership,
  executeListSkincareRoutines,
  executeSearchSkincareLibrary,
  formatSkincareRoutinesForPrompt,
  listSkincareRoutinesSchema,
  saveSkincareLibraryEntrySchema,
  searchSkincareLibrarySchema,
  setSkincareRoutineMembershipSchema
} from './_shared/skincare-library-tools.mjs';
import {
  proposeCentralNodePatchSchema,
  appendGovernanceLogSchema,
  validateCentralNodePatchInput,
  validateGovernanceLogAppendInput,
  classifyCentralNodePatchRisk,
  applyCentralNodePatch
} from './_shared/hammond-tools.mjs';
import {
  GOVERNANCE_LOG_PATH,
  appendGovernanceEntry,
  emptyGovernanceLog,
  recentGovernanceTail
} from '../../js/core/governance-log.js';
import {
  SKINCARE_PRODUCT_LIBRARY_PATH,
  emptyProductLibrary,
  migrateProductLibraryFromCatalog,
  parseProductLibrary,
  seedProductLibraryFromDefaults,
  upgradeOtherProductCategories
} from '../../js/app/skincare-product-library.js';
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  emptyMembership,
  migrateMembershipFromCatalog,
  parseMembership,
  seedMembershipFromDefaults
} from '../../js/app/skincare-routine-membership.js';
import { SKINCARE_CATALOG_PATH, parseCatalog } from '../../js/app/skincare-catalog.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';
import {
  formatTemplatesForPrompt,
  isTemplatePath,
  MAX_PROMPT_TEMPLATES,
  summarizeTemplatesFromContents
} from './_shared/workout-templates.mjs';
import { selectLatestBodyEntries, formatBodyStateForPrompt } from './_shared/body-state.mjs';
import { lintWorkoutProposal } from './_shared/workout-lint.mjs';
import { loadPhysiqueTarget } from './_shared/load-physique-target.mjs';
import { createAnthropicClient, AnthropicClientError } from './_shared/anthropic-client.mjs';
import { getSydneyDateKey, getSydneyTimestamp, addCalendarDays } from '../../js/core/time.js';
import { parseEventDocument } from '../../js/core/records.js';
import { load as loadYaml } from 'js-yaml';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 24 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_ENTRY_CHARS = 1500;
const MAX_HISTORY_TOTAL_CHARS = 6000;
const BODY_TOO_LARGE = Symbol('body_too_large');

export const config = { path: '/api/chat' };

export function createChatHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  createAnthropicClient: createAnthropic = createAnthropicClient,
  now = Date.now
} = {}) {
  return async function chatHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
    const originError = guardRequestOrigin(request, env);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env) || typeof env.ANTHROPIC_API_KEY !== 'string' || env.ANTHROPIC_API_KEY.length === 0) {
      return withPrivateCache(misconfiguredResponse());
    }

    let session;
    try {
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now());
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    const parsed = await parseRequest(request);
    if (parsed.error) return parsed.error;

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return repositoryError();
    }

    const slug = routeAgent(parsed.message, parsed.priorAgentSlug);
    const agent = slug === ROUTER_SLUG ? null : findAgent(slug);
    const hammondAuditContract = slug === 'hammond' && parsed.auditSession
      ? buildHammondAuditContract(parsed.auditSession)
      : '';
    const today = getSydneyDateKey(new Date(now()));
    // Chat only needs a thin digest (today + yesterday). A full week of blob
    // reads routinely ate the Netlify budget before Anthropic produced a reply.
    const from = addCalendarDays(today, -1);
    const allowedTypes = agent?.recordTypes.length ? agent.recordTypes : undefined;
    const needsFoodLibrary = Boolean(allowedTypes?.includes('meal'));
    const needsWorkoutTemplates = slug === 'chadwick' || Boolean(allowedTypes?.includes('workout'));
    const needsExerciseLibrary = slug === 'chadwick';
    const needsSkincareLibrary = slug === 'hyaluronica';
    const needsHammondTools = slug === 'hammond';
    const needsBodyState = slug === 'chadwick' || slug === 'brisket';

    let anthropic;
    try {
      anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, fetchImpl });
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }

    const nowInstant = new Date(now());
    const tools = [
      // Chadwick's protocol asks him to research evidence-based physique programming
      // (see "Using evidence and external sources"); the default budget of 2 is one
      // lookup, not a research pass, so he alone gets a raised cap.
      { type: 'web_search_20250305', name: 'web_search', max_uses: slug === 'chadwick' ? 5 : 2 },
      ...(allowedTypes ? [logEntryToolSchema(allowedTypes)] : []),
      ...(needsFoodLibrary ? [foodLibraryEntrySchema()] : []),
      ...(needsExerciseLibrary ? [searchExerciseLibrarySchema(), saveExerciseLibraryEntrySchema()] : []),
      ...(needsSkincareLibrary
        ? [
            listSkincareRoutinesSchema(),
            searchSkincareLibrarySchema(),
            saveSkincareLibraryEntrySchema(),
            setSkincareRoutineMembershipSchema()
          ]
        : []),
      ...(needsHammondTools
        ? [proposeCentralNodePatchSchema(), appendGovernanceLogSchema()]
        : [])
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = event => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: 'agent', slug });
        if (hammondAuditContract && parsed.auditSession) {
          send({
            type: 'audit_phase',
            phase: parsed.auditSession.phase,
            intakeCount: parsed.auditSession.intakeCount
          });
        }
        send({ type: 'status', text: 'Loading your logs…' });

        let digest = '';
        let constraints = '';
        let centralNodeLog = '';
        let centralNodeFull = '';
        let centralNodeMarkdown = '';
        let centralNodeSha;
        let governanceLog = needsHammondTools ? emptyGovernanceLog() : '';
        let governanceLogSha;
        let governanceLogTail = '';
        let foodLibraryEntries = [];
        let foodLibrary = '';
        let foodLibrarySha;
        let exerciseLibraryEntries = [];
        let exerciseLibrary = '';
        let exerciseLibrarySha;
        // Cold-start: seed in memory (defaults, or legacy catalog migrate below)
        // so the first Hyaluronica write merges onto a full shelf instead of
        // persisting a sparse 1-item library that would block HTTP seed-on-missing.
        let skincareLibrary = needsSkincareLibrary
          ? seedProductLibraryFromDefaults(SKINCARE_ROUTINES)
          : emptyProductLibrary();
        let skincareLibrarySha;
        let skincareMembership = needsSkincareLibrary
          ? seedMembershipFromDefaults(SKINCARE_ROUTINES, skincareLibrary)
          : emptyMembership();
        let skincareMembershipSha;
        let workoutTemplates = '';
        let bodyState = '';
        let sessionAdherenceDays = null;
        try {
          const current = await client.resolveTree();
          const manifest = selectManifestEntries(current.tree, { from, to: today });
          const dataEntries = manifest.filter(entry => entry.path.startsWith('data/'));
          const centralNodeEntry = current.tree.find(entry => entry.path === 'central-node.md' && entry.type === 'blob');
          centralNodeSha = centralNodeEntry?.sha;
          const governanceLogEntry = needsHammondTools
            ? current.tree.find(entry => entry.path === GOVERNANCE_LOG_PATH && entry.type === 'blob')
            : null;
          governanceLogSha = governanceLogEntry?.sha;
          const foodLibraryEntry = needsFoodLibrary
            ? current.tree.find(entry => entry.path === FOOD_LIBRARY_PATH && entry.type === 'blob')
            : null;
          foodLibrarySha = foodLibraryEntry?.sha;
          const exerciseLibraryEntry = needsExerciseLibrary
            ? current.tree.find(entry => entry.path === EXERCISE_LIBRARY_PATH && entry.type === 'blob')
            : null;
          exerciseLibrarySha = exerciseLibraryEntry?.sha;
          const skincareLibraryEntry = needsSkincareLibrary
            ? current.tree.find(entry => entry.path === SKINCARE_PRODUCT_LIBRARY_PATH && entry.type === 'blob')
            : null;
          skincareLibrarySha = skincareLibraryEntry?.sha;
          const skincareMembershipEntry = needsSkincareLibrary
            ? current.tree.find(entry => entry.path === SKINCARE_ROUTINE_MEMBERSHIP_PATH && entry.type === 'blob')
            : null;
          skincareMembershipSha = skincareMembershipEntry?.sha;
          // Mirror HTTP store: when shelf blobs are missing, fall back to legacy catalog.
          const needsCatalogFallback = needsSkincareLibrary
            && (!skincareLibraryEntry || !skincareMembershipEntry);
          const skincareCatalogEntry = needsCatalogFallback
            ? current.tree.find(entry => entry.path === SKINCARE_CATALOG_PATH && entry.type === 'blob')
            : null;
          const templateEntries = needsWorkoutTemplates
            ? current.tree.filter(entry => entry.type === 'blob' && isTemplatePath(entry.path)).slice(0, MAX_PROMPT_TEMPLATES)
            : [];
          // Chadwick's eyes on Adam's body: a bounded read (latest 1-2 per type from the
          // already-fetched tree, never a history scan) -- see body-state.mjs.
          const bodyEntries = needsBodyState
            ? selectLatestBodyEntries(current.tree, { limit: 2 })
            : { composition: [], measurements: [] };

          const [
            dataBlobs,
            centralNodeBlob,
            governanceLogBlob,
            foodLibraryBlob,
            exerciseLibraryBlob,
            skincareLibraryBlob,
            skincareMembershipBlob,
            skincareCatalogBlob,
            templateBlobs,
            compositionBlobs,
            measurementBlobs
          ] = await Promise.all([
            Promise.all(dataEntries.map(entry => client.readBlob(entry.sha))),
            centralNodeEntry ? client.readBlob(centralNodeEntry.sha) : null,
            governanceLogEntry ? client.readBlob(governanceLogEntry.sha) : null,
            foodLibraryEntry ? client.readBlob(foodLibraryEntry.sha) : null,
            exerciseLibraryEntry ? client.readBlob(exerciseLibraryEntry.sha) : null,
            skincareLibraryEntry ? client.readBlob(skincareLibraryEntry.sha) : null,
            skincareMembershipEntry ? client.readBlob(skincareMembershipEntry.sha) : null,
            skincareCatalogEntry ? client.readBlob(skincareCatalogEntry.sha) : null,
            Promise.all(templateEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(bodyEntries.composition.map(entry => client.readBlob(entry.sha))),
            Promise.all(bodyEntries.measurements.map(entry => client.readBlob(entry.sha)))
          ]);

          const files = dataEntries
            .map((entry, index) => ({ path: entry.path, content: decodeBlob(dataBlobs[index]) }))
            .filter(file => file.content !== null);
          digest = summarizeRecentHistory(files, TARGETS_CONFIG, today);

          const decodedCentralNode = centralNodeBlob ? decodeBlob(centralNodeBlob) : null;
          if (decodedCentralNode !== null) {
            constraints = extractConstraints(decodedCentralNode);
            centralNodeLog = [
              extractTodaysStatus(decodedCentralNode),
              extractCrossAgentCoordination(decodedCentralNode),
              extractRecentAgentActions(decodedCentralNode)
            ].filter(Boolean).join('\n\n');
            if (needsHammondTools) {
              centralNodeFull = decodedCentralNode;
              centralNodeMarkdown = decodedCentralNode;
            }
          }

          if (needsHammondTools) {
            const decodedGovernanceLog = governanceLogBlob ? decodeBlob(governanceLogBlob) : null;
            if (decodedGovernanceLog !== null) {
              governanceLog = decodedGovernanceLog;
            } else {
              governanceLog = emptyGovernanceLog();
            }
            governanceLogTail = recentGovernanceTail(governanceLog);
          }

          const decodedFoodLibrary = foodLibraryBlob ? decodeBlob(foodLibraryBlob) : null;
          if (decodedFoodLibrary !== null) {
            foodLibraryEntries = parseFoodLibrary(decodedFoodLibrary);
            foodLibrary = formatFoodLibraryForPrompt(foodLibraryEntries);
          }

          const decodedExerciseLibrary = exerciseLibraryBlob ? decodeBlob(exerciseLibraryBlob) : null;
          if (decodedExerciseLibrary !== null) {
            exerciseLibraryEntries = parseExerciseLibrary(decodedExerciseLibrary);
            exerciseLibrary = formatExerciseLibraryForPrompt(exerciseLibraryEntries);
            sessionAdherenceDays = daysSinceLastSession(exerciseLibraryEntries, today);
          }

          const decodedCatalog = skincareCatalogBlob ? decodeBlob(skincareCatalogBlob) : null;
          const legacyCatalog = decodedCatalog !== null ? parseCatalog(decodedCatalog) : null;

          let libraryLoaded = false;
          const decodedSkincareLibrary = skincareLibraryBlob ? decodeBlob(skincareLibraryBlob) : null;
          if (decodedSkincareLibrary !== null) {
            const parsed = parseProductLibrary(decodedSkincareLibrary);
            if (parsed) {
              skincareLibrary = upgradeOtherProductCategories(parsed).library;
              libraryLoaded = true;
            }
          }
          // Prefer legacy catalog migrate over defaults when the shelf blob is absent.
          if (!libraryLoaded && needsSkincareLibrary) {
            skincareLibrary = legacyCatalog
              ? migrateProductLibraryFromCatalog(legacyCatalog)
              : seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
          }

          let membershipLoaded = false;
          const decodedSkincareMembership = skincareMembershipBlob ? decodeBlob(skincareMembershipBlob) : null;
          if (decodedSkincareMembership !== null) {
            const parsed = parseMembership(decodedSkincareMembership);
            if (parsed) {
              skincareMembership = parsed;
              membershipLoaded = true;
            }
          }
          // Mirror HTTP store: migrate membership from catalog when blob is absent/corrupt,
          // else seed against the shelf we actually have.
          if (!membershipLoaded && needsSkincareLibrary) {
            skincareMembership = legacyCatalog
              ? migrateMembershipFromCatalog(legacyCatalog, skincareLibrary)
              : seedMembershipFromDefaults(SKINCARE_ROUTINES, skincareLibrary);
          }

          const templateContents = templateEntries
            .map((entry, index) => ({ path: entry.path, content: decodeBlob(templateBlobs[index]) }))
            .filter(file => file.content !== null);
          workoutTemplates = formatTemplatesForPrompt(summarizeTemplatesFromContents(templateContents));

          if (needsBodyState) {
            const compositionRecords = parseBodyRecords(bodyEntries.composition, compositionBlobs);
            const measurementRecords = parseBodyRecords(bodyEntries.measurements, measurementBlobs);
            const targetRatio = loadPhysiqueTarget().shoulder_waist_ratio;
            bodyState = formatBodyStateForPrompt({ compositionRecords, measurementRecords, targetRatio });
          }
        } catch {
          digest = '';
          constraints = '';
          centralNodeLog = '';
          centralNodeFull = '';
          centralNodeMarkdown = '';
          centralNodeSha = undefined;
          governanceLog = needsHammondTools ? emptyGovernanceLog() : '';
          governanceLogSha = undefined;
          governanceLogTail = '';
          foodLibraryEntries = [];
          foodLibrary = '';
          foodLibrarySha = undefined;
          exerciseLibraryEntries = [];
          exerciseLibrary = '';
          exerciseLibrarySha = undefined;
          skincareLibrary = needsSkincareLibrary
            ? seedProductLibraryFromDefaults(SKINCARE_ROUTINES)
            : emptyProductLibrary();
          skincareLibrarySha = undefined;
          skincareMembership = needsSkincareLibrary
            ? seedMembershipFromDefaults(SKINCARE_ROUTINES, skincareLibrary)
            : emptyMembership();
          skincareMembershipSha = undefined;
          workoutTemplates = '';
          bodyState = '';
          sessionAdherenceDays = null;
        }

        const chadwickProtocol = slug === 'chadwick' ? loadChadwickProtocol() : '';
        const hyaluronicaProtocol = slug === 'hyaluronica' ? loadHyaluronicaProtocol() : '';
        const penelopeProtocol = slug === 'penelope' ? loadPenelopeProtocol() : '';
        const veraProtocol = slug === 'vera' ? loadVeraProtocol() : '';
        const brisketProtocol = slug === 'brisket' ? loadBrisketProtocol() : '';
        const saraProtocol = slug === 'sara' ? loadSaraProtocol() : '';
        const hammondProtocol = slug === 'hammond' ? loadHammondProtocol() : '';
        const skincareRoutines = needsSkincareLibrary
          ? formatSkincareRoutinesForPrompt(skincareMembership, skincareLibrary)
          : '';
        const system = buildSystemPrompt({
          slug,
          digest,
          constraints,
          centralNodeLog,
          centralNodeFull,
          governanceLogTail,
          foodLibrary,
          chadwickProtocol,
          hyaluronicaProtocol,
          penelopeProtocol,
          veraProtocol,
          brisketProtocol,
          saraProtocol,
          hammondProtocol,
          hammondAuditContract,
          workoutTemplates,
          exerciseLibrary,
          skincareRoutines,
          bodyState,
          daysSinceLastSession: sessionAdherenceDays
        });

        try {
          send({ type: 'status', text: 'Thinking…' });
          for await (const event of anthropic.streamMessage({
            system,
            messages: [...parsed.history, { role: 'user', content: parsed.message }],
            tools,
            signal: request.signal,
            executeTools: async event => {
              if (event.name === 'search_exercise_library') {
                return searchExerciseLibrary(exerciseLibraryEntries, event.input ?? {});
              }
              if (event.name === 'save_exercise_library_entry') {
                const entry = validateExerciseLibraryEntry(event.input);
                if (!entry) {
                  return JSON.stringify({ ok: false, error: 'invalid_entry' });
                }
                try {
                  exerciseLibraryEntries = upsertExerciseLibraryEntry(
                    exerciseLibraryEntries,
                    entry,
                    getSydneyTimestamp(nowInstant)
                  );
                  const result = await client.writeFile({
                    path: EXERCISE_LIBRARY_PATH,
                    content: JSON.stringify(exerciseLibraryEntries, null, 2),
                    ...(exerciseLibrarySha ? { sha: exerciseLibrarySha } : {}),
                    message: `chore(exercise-library): upsert ${entry.name}`
                  });
                  exerciseLibrarySha = result.sha;
                  send({ type: 'exercise_library_saved', name: entry.name });
                  return JSON.stringify({
                    ok: true,
                    name: entry.name,
                    target_area: entry.target_area
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'save_food_library_entry') {
                const entry = validateFoodLibraryEntry(event.input);
                if (!entry) {
                  return JSON.stringify({ ok: false, error: 'invalid_entry' });
                }
                try {
                  foodLibraryEntries = upsertFoodLibraryEntry(foodLibraryEntries, entry, today);
                  const result = await client.writeFile({
                    path: FOOD_LIBRARY_PATH,
                    content: JSON.stringify(foodLibraryEntries, null, 2),
                    ...(foodLibrarySha ? { sha: foodLibrarySha } : {}),
                    message: `chore(food-library): cache ${entry.name}`
                  });
                  foodLibrarySha = result.sha;
                  send({ type: 'food_library_saved', name: entry.name });
                  return JSON.stringify({
                    ok: true,
                    name: entry.name,
                    calories: entry.calories,
                    protein_g: entry.protein_g,
                    fat_g: entry.fat_g
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'search_skincare_library') {
                return executeSearchSkincareLibrary(skincareLibrary, event.input ?? {});
              }
              if (event.name === 'list_skincare_routines') {
                return executeListSkincareRoutines(
                  skincareMembership,
                  skincareLibrary,
                  event.input ?? {}
                );
              }
              if (event.name === 'save_skincare_library_entry') {
                const applied = applySaveSkincareLibraryEntry(skincareLibrary, event.input);
                if (!applied.ok) {
                  return JSON.stringify({ ok: false, error: applied.error });
                }
                try {
                  const result = await client.writeFile({
                    path: SKINCARE_PRODUCT_LIBRARY_PATH,
                    content: JSON.stringify(applied.library, null, 2),
                    ...(skincareLibrarySha ? { sha: skincareLibrarySha } : {}),
                    message: `chore(skincare): upsert ${applied.name}`
                  });
                  skincareLibrary = applied.library;
                  skincareLibrarySha = result.sha;
                  return JSON.stringify({ ok: true, id: applied.id, name: applied.name });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'set_skincare_routine_membership') {
                const applied = applySetSkincareRoutineMembership(
                  skincareLibrary,
                  skincareMembership,
                  event.input
                );
                if (!applied.ok) {
                  return JSON.stringify({ ok: false, error: applied.error });
                }
                try {
                  const result = await client.writeFile({
                    path: SKINCARE_ROUTINE_MEMBERSHIP_PATH,
                    content: JSON.stringify(applied.membership, null, 2),
                    ...(skincareMembershipSha ? { sha: skincareMembershipSha } : {}),
                    message: `chore(skincare): ${event.input?.op} ${event.input?.product_id} on ${applied.routine}`
                  });
                  skincareMembership = applied.membership;
                  skincareMembershipSha = result.sha;
                  return JSON.stringify({
                    ok: true,
                    routine: applied.routine,
                    product_ids: applied.product_ids
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'log_entry') {
                const validation = validateLogEntry(event.input, {
                  id: `${event.input?.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
                  now: getSydneyTimestamp(nowInstant)
                });
                if (!validation.valid) {
                  send({ type: 'record_rejected', errors: validation.errors });
                  return JSON.stringify({ ok: false, errors: validation.errors });
                }
                send({
                  type: 'record_proposal',
                  record: validation.record,
                  notes: validation.notes,
                  path: buildCanonicalPath({
                    type: validation.record.type,
                    date: validation.record.date,
                    slug: buildRecordSlug(validation.record)
                  }),
                  // Phase 6a: deterministic protocol lint, non-blocking -- Adam can always
                  // Confirm anyway. No-op (empty array) for anything but a workout proposal.
                  warnings: lintWorkoutProposal(validation.record)
                });
                return JSON.stringify({ ok: true, status: 'awaiting_confirm' });
              }
              if (event.name === 'append_governance_log') {
                const entry = validateGovernanceLogAppendInput(event.input);
                if (!entry) {
                  return JSON.stringify({ ok: false, error: 'invalid_entry' });
                }
                const dated = { ...entry, dateKey: entry.dateKey ?? today };
                try {
                  const next = appendGovernanceEntry(governanceLog, dated);
                  const result = await client.writeFile({
                    path: GOVERNANCE_LOG_PATH,
                    content: next,
                    ...(governanceLogSha ? { sha: governanceLogSha } : {}),
                    message: `chore(governance): ${dated.entryType}`
                  });
                  governanceLog = next;
                  governanceLogSha = result.sha;
                  return JSON.stringify({ ok: true, path: GOVERNANCE_LOG_PATH });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'propose_central_node_patch') {
                const patch = validateCentralNodePatchInput(event.input);
                if (!patch) {
                  return JSON.stringify({ ok: false, error: 'invalid_patch' });
                }
                const risk = classifyCentralNodePatchRisk(patch);
                if (risk === 'confirm') {
                  // Anthropic client swallows tool_call when executeTools returns
                  // non-null — emit Confirm SSE here (same as central_node_patched).
                  send({ type: 'cn_patch_proposal', patch });
                  return JSON.stringify({
                    ok: true,
                    status: 'awaiting_confirm',
                    summary: patch.payload.summary
                  });
                }
                if (!centralNodeMarkdown) {
                  return JSON.stringify({ ok: false, error: 'central_node_missing' });
                }
                const next = applyCentralNodePatch(centralNodeMarkdown, patch);
                if (!next) {
                  return JSON.stringify({ ok: false, error: 'apply_failed' });
                }
                try {
                  const result = await client.writeFile({
                    path: 'central-node.md',
                    content: next,
                    ...(centralNodeSha ? { sha: centralNodeSha } : {}),
                    message: `chore(cn): ${patch.payload.summary}`
                  });
                  centralNodeMarkdown = next;
                  centralNodeSha = result.sha;
                  send({
                    type: 'central_node_patched',
                    summary: patch.payload.summary,
                    risk: 'auto'
                  });
                  return JSON.stringify({
                    ok: true,
                    status: 'applied',
                    summary: patch.payload.summary
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              return null;
            }
          })) {
            if (event.type === 'tool_call' && event.name === 'log_entry') {
              const validation = validateLogEntry(event.input, {
                id: `${event.input?.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
                now: getSydneyTimestamp(nowInstant)
              });
              if (validation.valid) {
                send({
                  type: 'record_proposal',
                  record: validation.record,
                  notes: validation.notes,
                  path: buildCanonicalPath({
                    type: validation.record.type,
                    date: validation.record.date,
                    slug: buildRecordSlug(validation.record)
                  }),
                  // Phase 6a: deterministic protocol lint, non-blocking -- Adam can always
                  // Confirm anyway. No-op (empty array) for anything but a workout proposal.
                  warnings: lintWorkoutProposal(validation.record)
                });
              } else {
                send({ type: 'record_rejected', errors: validation.errors });
              }
            } else if (event.type === 'tool_call' && event.name === 'propose_central_node_patch') {
              const patch = validateCentralNodePatchInput(event.input);
              if (patch && classifyCentralNodePatchRisk(patch) === 'confirm') {
                send({ type: 'cn_patch_proposal', patch });
              } else {
                send(event);
              }
            } else {
              send(event);
            }
          }
        } catch (error) {
          send({ type: 'error', code: error instanceof AnthropicClientError ? error.code : 'anthropic_unavailable' });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', ...PRIVATE_CACHE, connection: 'keep-alive' }
    });
  };
}

async function parseRequest(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { error: errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false, PRIVATE_CACHE) };
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    void request.body?.cancel().catch(() => undefined);
    return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
  }

  let bytes;
  try {
    bytes = await readAtMost(request.body, MAX_BODY_BYTES);
  } catch (error) {
    if (error === BODY_TOO_LARGE) {
      return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
    }
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH) {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  return {
    message: body.message,
    history: sanitizeHistory(body.history),
    priorAgentSlug: typeof body.priorAgentSlug === 'string' ? body.priorAgentSlug : undefined,
    auditSession: normalizeAuditSession(body.auditSession)
  };
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  let totalChars = 0;
  const sanitized = [];
  for (const entry of value.slice(-MAX_HISTORY_MESSAGES)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;
    if (typeof entry.content !== 'string' || entry.content.trim() === '') continue;
    const content = entry.content.length > MAX_HISTORY_ENTRY_CHARS
      ? entry.content.slice(0, MAX_HISTORY_ENTRY_CHARS)
      : entry.content;
    totalChars += content.length;
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) break;
    sanitized.push({ role: entry.role, content });
  }
  return sanitized;
}

async function readAtMost(stream, limit) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => undefined);
        throw BODY_TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error === BODY_TOO_LARGE) throw error;
    throw new Error('request_read_failed');
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Decode+parse a bounded set of composition/measurements blobs (already selected by
// selectLatestBodyEntries) into records, most-recent-first. Skips anything unreadable or
// invalid rather than failing the whole chat turn over one bad body record.
function parseBodyRecords(entries, blobs) {
  const records = [];
  for (let index = 0; index < entries.length; index += 1) {
    const content = decodeBlob(blobs[index]);
    if (content === null) continue;
    try {
      const { record } = parseEventDocument(content, entries[index].path, loadYaml);
      if (record) records.push(record);
    } catch {
      // Skip an unreadable/invalid body record rather than breaking the chat turn.
    }
  }
  return records;
}

function repositoryError() {
  return errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatHandler();
