import { randomBytes, randomUUID } from 'node:crypto';
import { mergeMedicalFields, resolveMedicalLogCandidate, parseMedicalEventTolerant } from '../../apps/life/js/app/medical-normalize.js';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';
import {
  chatJobOwnerKey,
  defaultGetChatJobStore
} from './_shared/chat-job-store.mjs';
import { defaultInvokeChatBackground } from './_shared/chat-job-run.mjs';
import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { selectManifestEntries } from './_shared/repo-policy.mjs';
import { routeAgent, findAgent, ROUTER_SLUG } from './_shared/agent-directory.mjs';
import { buildSystemPrompt } from './_shared/persona.mjs';
import { CENTRAL_NODE_UNAVAILABLE_MARKER } from '../../apps/life/js/core/context-integrity.js';
import { loadHubAgentContext } from './_shared/hub-agent-context.mjs';
import { normalizeProtocolId, protocolSteerBlock } from '../../apps/life/js/app/agent-protocols.js';
import { loadChadwickProtocol } from './_shared/load-chadwick-protocol.mjs';
import { loadHyaluronicaProtocol } from './_shared/load-hyaluronica-protocol.mjs';
import { loadPenelopeProtocol } from './_shared/load-penelope-protocol.mjs';
import { loadVeraProtocol, VERA_INTAKE_PATH } from './_shared/load-vera-protocol.mjs';
import { loadBrisketProtocol } from './_shared/load-brisket-protocol.mjs';
import { loadSaraProtocol } from './_shared/load-sara-protocol.mjs';
import { loadHammondProtocol } from './_shared/load-hammond-protocol.mjs';
import {
  normalizeAuditSession,
  buildHammondAuditContract,
  startAuditSessionFromMessage,
  nextAuditPhase,
  SKIP_INTAKE_RE as AUDIT_SKIP_INTAKE_RE
} from './_shared/hammond-audit.mjs';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractThisWeek,
  extractTodaysStatus
} from '../../apps/life/js/core/constraints.js';
import {
  NUTRITION_CHALLENGES_PATH,
  emptyNutritionChallenges,
  parseNutritionChallenges,
  serializeNutritionChallenges,
  upsertNutritionChallengeSchema,
  markNutritionChallengeDaySchema,
  listNutritionChallengesSchema,
  validateUpsertNutritionChallengeInput,
  validateMarkNutritionChallengeDayInput,
  upsertNutritionChallenge,
  markNutritionChallengeDay,
  formatNutritionChallengesForPrompt,
  tallyChallenge
} from '../../apps/life/js/core/nutrition-challenges.js';
import { syncChallengeToCentralNode } from '../../apps/life/js/core/nutrition-challenge-cn.js';
import { summarizeRecentHistory } from './_shared/digest.mjs';
import { TARGETS_CONFIG } from './_shared/targets-config.mjs';
import { validateLogEntry, buildCanonicalPath, buildRecordSlug, logEntryRejectionPayload } from './_shared/chat-schema.mjs';
import { persistLogEntry, describeRecordForLog } from './_shared/persist-log.mjs';
import {
  FOOD_LIBRARY_PATH,
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
  searchExerciseLibrary,
  upsertExerciseLibraryEntry,
  validateExerciseLibraryEntry
} from './_shared/exercise-library.mjs';
import {
  attachWorkoutNotes,
  combineSessionAdherenceDays,
  daysSinceLastCompletedWorkout,
  formatRecentWorkoutsForPrompt,
  getLastWorkout,
  searchWorkoutRecords,
  selectRecentWorkoutEntries
} from './_shared/workout-history.mjs';
import {
  applySaveSkincareLibraryEntry,
  applySetSkincareRoutineMembership,
  executeListSkincareRoutines,
  executeSearchSkincareLibrary,
  formatSkincareRoutinesForPrompt
} from './_shared/skincare-library-tools.mjs';
import {
  validateCentralNodePatchInput,
  validateGovernanceLogAppendInput,
  classifyCentralNodePatchRisk,
  applyCentralNodePatch,
  assertAgentMayApplyCentralNodePatch
} from './_shared/hammond-tools.mjs';
import {
  PENDING_CN_PATCHES_PATH,
  createPendingCnPatchId,
  parsePendingCnPatches,
  serializePendingCnPatches,
  addPendingCnPatch,
  purgeStalePendingCnPatches,
  formatPendingCnPatchesForPrompt
} from './_shared/cn-patch-queue.mjs';
import { buildAgentTools } from './_shared/capabilities/registry.mjs';
import {
  buildPromotedShortcutToolSchemas,
  findPromotedDraftByToolName,
  isPromotedShortcutToolName,
  loadPromotedShortcutDrafts
} from './_shared/capabilities/promoted-shortcut-tools.mjs';
import {
  PENDING_ACTIONS_PATH,
  createPendingActionId,
  parsePendingActions,
  serializePendingActions,
  addPendingAction,
  validateProposeActionInput
} from './_shared/capabilities/propose-action.mjs';
import { isShortcutTool, executeShortcut } from './_shared/capabilities/shortcuts.mjs';
import { loadIntuitionFor, formatIntuitionForPrompt } from './_shared/capabilities/intuition.mjs';
import {
  GOVERNANCE_LOG_PATH,
  appendGovernanceEntry,
  emptyGovernanceLog,
  recentGovernanceTail
} from '../../apps/life/js/core/governance-log.js';
import { rollStaleSections, purgeStaleRecentActions } from '../../apps/life/js/core/central-node-write.js';
import {
  SKINCARE_PRODUCT_LIBRARY_PATH,
  emptyProductLibrary,
  migrateProductLibraryFromCatalog,
  parseProductLibrary,
  seedProductLibraryFromDefaults,
  upgradeOtherProductCategories
} from '../../apps/life/js/app/skincare-product-library.js';
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  emptyMembership,
  migrateMembershipFromCatalog,
  parseMembership,
  seedMembershipFromDefaults
} from '../../apps/life/js/app/skincare-routine-membership.js';
import { SKINCARE_CATALOG_PATH, parseCatalog } from '../../apps/life/js/app/skincare-catalog.js';
import { SKINCARE_ROUTINES } from '../../apps/life/js/app/skincare-routines-data.js';
import {
  formatTemplatesForPrompt,
  isTemplatePath,
  MAX_PROMPT_TEMPLATES,
  summarizeTemplatesFromContents
} from './_shared/workout-templates.mjs';
import { selectLatestBodyEntries, formatBodyStateForPrompt } from './_shared/body-state.mjs';
import {
  selectRecentSkincareEntries,
  selectRecentNutritionEntries,
  formatTreatmentStateForPrompt,
  formatNutritionSkinWeekForPrompt,
  isProcedureBody
} from './_shared/treatment-state.mjs';
import {
  constraintsNeedClinicalContext,
  formatSaraClinicalContextForPrompt
} from './_shared/sara-clinical-context.mjs';
import { selectHammondFitnessEntries, selectHammondEventEntries, summarizeHammondDigest, formatCentralNodeModelForPrompt, getWindowStart, getCnModelWindowStart } from './_shared/hammond-digest.mjs';
import {
  getMindDigestWindowStart,
  selectMindEntries,
  selectOnThisDayEntries,
  summarizeDiaryForPrompt,
  summarizeMindSessionsForPrompt,
  summarizeTodaysMindSession,
  simultaneousSilenceFlag,
  divergenceLine,
  excerptOnThisDay,
  hammondDiaryDigestForTurn,
  recentSystemNoteTail
} from './_shared/mind-digest.mjs';
import {
  getMindSession,
  searchMindRecords
} from './_shared/mind-session-read.mjs';
import {
  selectMedicalEntries,
  selectBloodsEntries,
  searchMedicalRecords,
  briefMedicalAppointmentWithFallback
} from './_shared/medical-overview-read.mjs';
import { promptOneLinersForAgent } from './_shared/capabilities/registry.mjs';
import { buildCentralNodeModel } from '../../apps/life/js/app/central-node-model.js';
import { lintWorkoutProposal } from './_shared/workout-lint.mjs';
import { loadPhysiqueTarget } from './_shared/load-physique-target.mjs';
import { createAnthropicClient, AnthropicClientError } from './_shared/anthropic-client.mjs';
import { resolveForcedChadwickPlan } from './_shared/chadwick-plan-force.mjs';
import { coerceChatWorkoutProposal } from '../../apps/life/js/core/workout-plan-detect.js';
import { streamWithAgentLogForce } from './_shared/agent-log-force.mjs';
import {
  forceStatusFor,
  isLogFinalize,
  isThinMindTurn,
  isVeraFlushMessage,
  shouldStripWebSearch
} from '../../apps/life/js/core/log-finalize-detect.js';
import { keepNewestHistory } from '../../apps/life/js/core/chat-history.js';
import { getSydneyDateKey, getSydneyTimestamp, addCalendarDays, daysBetween } from '../../apps/life/js/core/time.js';
import { parseEventDocument } from '../../apps/life/js/core/records.js';
import { load as loadYaml } from 'js-yaml';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 24 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const BODY_TOO_LARGE = Symbol('body_too_large');

export const config = { path: '/api/chat' };

export function createChatHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  createAnthropicClient: createAnthropic = createAnthropicClient,
  now = Date.now,
  loadHubAgentContext: loadHubContext = loadHubAgentContext
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
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
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
    // The browser client owns its own audit-session state machine and always
    // supplies auditSession once one is active. A caller with no client-side
    // state to carry across turns (a headless/scheduled trigger) gets one
    // bootstrapped here from the message text alone -- purely additive, so the
    // existing browser flow (which always sends its own auditSession) is
    // unaffected.
    const effectiveAuditSession = slug === 'hammond'
      ? (parsed.auditSession ?? startAuditSessionFromMessage(parsed.message))
      : null;
    const hammondAuditContract = effectiveAuditSession
      ? buildHammondAuditContract(effectiveAuditSession)
      : '';
    const today = getSydneyDateKey(new Date(now()));
    // Chat only needs a thin digest (today + yesterday). A full week of blob
    // reads routinely ate the Netlify budget before Anthropic produced a reply.
    const from = addCalendarDays(today, -1);
    const allowedTypes = agent?.recordTypes.length ? agent.recordTypes : undefined;
    const needsFoodLibrary = Boolean(allowedTypes?.includes('meal'));
    const needsWorkoutTemplates = slug === 'chadwick' || Boolean(allowedTypes?.includes('workout'));
    const needsExerciseLibrary = slug === 'chadwick';
    const needsSaraClinicalContext = slug === 'sara';
    const needsWorkoutHistory = slug === 'chadwick' || needsSaraClinicalContext;
    const needsSkincareLibrary = slug === 'hyaluronica';
    const needsTreatmentContext = slug === 'hyaluronica';
    const needsHammondTools = slug === 'hammond';
    const hubContextPromise = needsHammondTools
      ? loadHubContext({ env, now: new Date(now()) })
      : Promise.resolve('');
    const needsNutritionChallenges = slug === 'brisket';
    // Brisket writes challenge scoreboards onto Central Node; keep markdown mutable.
    const needsCentralNodeWrite = needsHammondTools
      || needsNutritionChallenges
      || slug === 'clare'
      || slug === 'ann';
    const needsBodyState = slug === 'chadwick' || slug === 'brisket' || slug === 'sara';
    const needsSaraMedical = slug === 'sara';
    const needsMindDigest = slug === 'vera' || slug === 'penelope';
    // Finalize / Vera flush must not burn the Netlify budget on mind blob
    // bodies or web_search before log_entry can fire — that was the empty-turn
    // "reply got cut off" loop across agents.
    const logFinalize = Boolean(allowedTypes?.length) && isLogFinalize(parsed.message);
    const veraFlush = slug === 'vera' && isVeraFlushMessage(parsed.message);
    const thinMindLoad = isThinMindTurn({ slug, message: parsed.message });
    const stripWebSearch = shouldStripWebSearch({ slug, message: parsed.message });
    const mindFrom = needsMindDigest ? getMindDigestWindowStart(today) : null;
    // Hammond alone gets a wider, path-only window for the 90-day longitudinal
    // digest -- deliberately separate from `from`/`manifest`/`dataEntries` above,
    // which stay a thin today+yesterday scan for every other agent. Widening
    // those would blow the "no unbounded blob read" budget for everyone, not
    // just Hammond. Derived from hammond-digest.mjs's own WINDOW_DAYS (via
    // getWindowStart) rather than a re-derived literal, so the two windows can't
    // silently drift apart if that constant ever changes.
    const hammondFrom = needsHammondTools ? getWindowStart(today) : null;
    const hammondCnFrom = needsHammondTools ? getCnModelWindowStart(today) : null;

    let anthropic;
    try {
      anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, fetchImpl });
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }

    const nowInstant = new Date(now());
    // Base tools are built after repo tree load so promoted-shortcut drafts can
    // become per-draft named tools without mutating capabilities/registry.json.
    let tools = [];
    let promotedShortcutDrafts = [];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = event => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            /* Client disconnected or the stream already closed. */
          }
        };
        send({ type: 'agent', slug });
        if (hammondAuditContract && effectiveAuditSession) {
          send({
            type: 'audit_phase',
            phase: effectiveAuditSession.phase,
            intakeCount: effectiveAuditSession.intakeCount
          });
        }

        // Lock-in from an already-parsed plan in history: emit Confirm immediately.
        // Skip Anthropic + GitHub so "lock it onto Fitness" stays instant. Cue-less
        // cards are acceptable here — Adam already agreed the list in chat; the late
        // force path still runs when lock-in needs a model pass for a fresh plan.
        const forcedPlan = resolveForcedChadwickPlan({
          slug,
          userMessage: parsed.message,
          today,
          messages: [...parsed.history, { role: 'user', content: parsed.message }]
        });
        if (forcedPlan) {
          send({ type: 'status', text: 'Locking the plan onto Fitness…' });
          send({ type: 'text', delta: 'On Fitness — confirm to save the plan.' });
          const validation = validateLogEntry(forcedPlan, {
            id: `${forcedPlan.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
            now: getSydneyTimestamp(nowInstant)
          });
          if (validation.valid) {
            await persistOrProposeLogEntry({
              client, slug, today, validation, send, userMessage: parsed.message
            });
          } else {
            send({ type: 'record_rejected', errors: validation.errors });
          }
          send({ type: 'done' });
          controller.close();
          return;
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
        let pendingCnPatches = [];
        let pendingCnPatchesSha;
        let pendingActions = [];
        let pendingActionsSha;
        let hammondDigest = '';
        let hammondCnSummary = '';
        let foodLibraryEntries = [];
        let foodLibrary = '';
        let foodLibrarySha;
        let nutritionChallenges = emptyNutritionChallenges();
        let nutritionChallengesText = '';
        let nutritionChallengesSha;
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
        let lastWorkouts = '';
        let workoutRecords = [];
        let bodyState = '';
        let treatmentState = '';
        let nutritionSkinWeek = '';
        let saraClinicalContext = '';
        let sessionAdherenceDays = null;
        let mindDiaryDigest = '';
        let hammondDiaryDigest = '';
        let hammondMindAmbient = '';
        let mindSessionDigest = '';
        let mindTodaySession = '';
        let mindSilence = '';
        let mindDivergence = '';
        let onThisDay = '';
        let daysSinceLastEntry = null;
        let daysSinceLastMindSession = null;
        let veraIntake = '';
        let mindEvents = [];
        let medicalEvents = [];
        let repoTree = [];
        try {
          const current = await client.resolveTree();
          repoTree = current.tree ?? [];
          const manifest = selectManifestEntries(current.tree, { from, to: today });
          const dataEntries = manifest.filter(entry => entry.path.startsWith('data/'));
          const centralNodeEntry = current.tree.find(entry => entry.path === 'central-node.md' && entry.type === 'blob');
          centralNodeSha = centralNodeEntry?.sha;
          const governanceLogEntry = needsHammondTools
            ? current.tree.find(entry => entry.path === GOVERNANCE_LOG_PATH && entry.type === 'blob')
            : null;
          governanceLogSha = governanceLogEntry?.sha;
          const pendingCnPatchesEntry = needsHammondTools
            ? current.tree.find(entry => entry.path === PENDING_CN_PATCHES_PATH && entry.type === 'blob')
            : null;
          pendingCnPatchesSha = pendingCnPatchesEntry?.sha;
          const pendingActionsEntry = current.tree.find(
            entry => entry.path === PENDING_ACTIONS_PATH && entry.type === 'blob'
          );
          pendingActionsSha = pendingActionsEntry?.sha;
          const foodLibraryEntry = needsFoodLibrary
            ? current.tree.find(entry => entry.path === FOOD_LIBRARY_PATH && entry.type === 'blob')
            : null;
          foodLibrarySha = foodLibraryEntry?.sha;
          const nutritionChallengesEntry = needsNutritionChallenges
            ? current.tree.find(entry => entry.path === NUTRITION_CHALLENGES_PATH && entry.type === 'blob')
            : null;
          nutritionChallengesSha = nutritionChallengesEntry?.sha;
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
          const chadwickWorkoutEntries = needsWorkoutHistory
            ? selectRecentWorkoutEntries(current.tree)
            : [];
          // Chadwick's eyes on Adam's body: a bounded read (latest 1-2 per type from the
          // already-fetched tree, never a history scan) -- see body-state.mjs.
          const bodyEntries = needsBodyState
            ? selectLatestBodyEntries(current.tree, { limit: 2 })
            : { composition: [], measurements: [] };
          const skincareLookbackEntries = needsTreatmentContext
            ? selectRecentSkincareEntries(current.tree, { today })
            : [];
          const nutritionWeekEntries = (needsTreatmentContext || needsSaraClinicalContext)
            ? selectRecentNutritionEntries(current.tree, { today })
            : [];
          // Hammond's 90-day fitness reads: bounded to the wider hammondFrom window,
          // never a full-history scan -- see hammond-digest.mjs.
          const hammondFitnessEntries = needsHammondTools
            ? selectHammondFitnessEntries(current.tree, { from: hammondFrom, to: today })
            : [];
          // Hammond CN-model reuse: bounded 30-day read across all 5 domains so
          // buildCentralNodeModel's heatmaps/series have real record content.
          const hammondCnEntries = needsHammondTools
            ? selectHammondEventEntries(current.tree, { from: hammondCnFrom, to: today })
            : [];
          // Vera/Penelope get a gated 30-day mind window from the already-fetched
          // tree — do not widen the shared today+yesterday `from` used for dataEntries.
          // Hammond silence is path-dates only (no extra diary-body fetch).
          const mindEntries = needsMindDigest
            ? selectMindEntries(current.tree, { from: mindFrom, to: today })
            : [];
          const onThisDayEntries = slug === 'penelope' && !thinMindLoad
            ? selectOnThisDayEntries(current.tree, today)
            : [];
          const veraIntakeEntry = slug === 'vera'
            ? current.tree.find(entry => entry.path === VERA_INTAKE_PATH && entry.type === 'blob')
            : null;

          const [
            dataBlobs,
            centralNodeBlob,
            governanceLogBlob,
            pendingCnPatchesBlob,
            pendingActionsBlob,
            foodLibraryBlob,
            nutritionChallengesBlob,
            exerciseLibraryBlob,
            skincareLibraryBlob,
            skincareMembershipBlob,
            skincareCatalogBlob,
            templateBlobs,
            chadwickWorkoutBlobs,
            compositionBlobs,
            measurementBlobs,
            skincareLookbackBlobs,
            nutritionWeekBlobs,
            hammondFitnessBlobs,
            hammondCnBlobs,
            mindBlobs,
            onThisDayBlobs,
            veraIntakeBlob
          ] = await Promise.all([
            Promise.all(dataEntries.map(entry => client.readBlob(entry.sha))),
            centralNodeEntry ? client.readBlob(centralNodeEntry.sha) : null,
            governanceLogEntry ? client.readBlob(governanceLogEntry.sha) : null,
            pendingCnPatchesEntry ? client.readBlob(pendingCnPatchesEntry.sha) : null,
            pendingActionsEntry ? client.readBlob(pendingActionsEntry.sha) : null,
            foodLibraryEntry ? client.readBlob(foodLibraryEntry.sha) : null,
            nutritionChallengesEntry ? client.readBlob(nutritionChallengesEntry.sha) : null,
            exerciseLibraryEntry ? client.readBlob(exerciseLibraryEntry.sha) : null,
            skincareLibraryEntry ? client.readBlob(skincareLibraryEntry.sha) : null,
            skincareMembershipEntry ? client.readBlob(skincareMembershipEntry.sha) : null,
            skincareCatalogEntry ? client.readBlob(skincareCatalogEntry.sha) : null,
            Promise.all(templateEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(chadwickWorkoutEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(bodyEntries.composition.map(entry => client.readBlob(entry.sha))),
            Promise.all(bodyEntries.measurements.map(entry => client.readBlob(entry.sha))),
            Promise.all(skincareLookbackEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(nutritionWeekEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(hammondFitnessEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(hammondCnEntries.map(entry => client.readBlob(entry.sha))),
            // Thin mind turns: keep path list for days-since; skip body reads.
            Promise.all(thinMindLoad ? [] : mindEntries.map(entry => client.readBlob(entry.sha))),
            Promise.all(onThisDayEntries.map(entry => client.readBlob(entry.sha))),
            veraIntakeEntry ? client.readBlob(veraIntakeEntry.sha) : null
          ]);

          const files = dataEntries
            .map((entry, index) => ({ path: entry.path, content: decodeBlob(dataBlobs[index]) }))
            .filter(file => file.content !== null);
          digest = summarizeRecentHistory(files, TARGETS_CONFIG, today);

          const decodedCentralNode = centralNodeBlob ? decodeBlob(centralNodeBlob) : null;
          if (decodedCentralNode !== null) {
            const centralNodeForTurn = needsHammondTools
              ? purgeStaleRecentActions(rollStaleSections(decodedCentralNode, today), today)
              : decodedCentralNode;
            constraints = extractConstraints(centralNodeForTurn);
            // Chadwick needs This Week so the EP day-before rule can see Veronica.
            const needsThisWeek = needsNutritionChallenges || slug === 'chadwick';
            centralNodeLog = [
              extractTodaysStatus(centralNodeForTurn),
              needsThisWeek ? extractThisWeek(centralNodeForTurn) : '',
              extractCrossAgentCoordination(centralNodeForTurn),
              extractRecentAgentActions(centralNodeForTurn)
            ].filter(Boolean).join('\n\n');
            if (needsCentralNodeWrite) {
              centralNodeMarkdown = centralNodeForTurn;
            }
            if (needsHammondTools) {
              centralNodeFull = centralNodeForTurn;
            }
          }

          if (needsNutritionChallenges) {
            const decodedChallenges = nutritionChallengesBlob
              ? decodeBlob(nutritionChallengesBlob)
              : null;
            nutritionChallenges = decodedChallenges !== null
              ? parseNutritionChallenges(decodedChallenges)
              : emptyNutritionChallenges();
            nutritionChallengesText = formatNutritionChallengesForPrompt(nutritionChallenges, { today });
          }
          if (needsHammondTools) {
            const decodedGovernanceLog = governanceLogBlob ? decodeBlob(governanceLogBlob) : null;
            if (decodedGovernanceLog !== null) {
              governanceLog = decodedGovernanceLog;
            } else {
              governanceLog = emptyGovernanceLog();
            }
            governanceLogTail = recentGovernanceTail(governanceLog);

            const decodedPendingCnPatches = pendingCnPatchesBlob ? decodeBlob(pendingCnPatchesBlob) : null;
            pendingCnPatches = purgeStalePendingCnPatches(parsePendingCnPatches(decodedPendingCnPatches), today);
          }

          const decodedPendingActions = pendingActionsBlob ? decodeBlob(pendingActionsBlob) : null;
          pendingActions = parsePendingActions(decodedPendingActions);

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

          if (needsWorkoutHistory) {
            workoutRecords = parseHammondFitnessRecords(chadwickWorkoutEntries, chadwickWorkoutBlobs);
            lastWorkouts = formatRecentWorkoutsForPrompt(workoutRecords);
            sessionAdherenceDays = combineSessionAdherenceDays(
              daysSinceLastCompletedWorkout(workoutRecords, today),
              sessionAdherenceDays
            );
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

          if (needsTreatmentContext) {
            const skincareEvents = [];
            for (let index = 0; index < skincareLookbackEntries.length; index += 1) {
              const content = decodeBlob(skincareLookbackBlobs[index]);
              if (content === null) continue;
              try {
                const parsed = parseEventDocument(content, skincareLookbackEntries[index].path, loadYaml);
                skincareEvents.push({ ...parsed, path: skincareLookbackEntries[index].path });
              } catch {
                // Skip unreadable skincare logs rather than breaking the turn.
              }
            }
            const procedureEvents = skincareEvents.filter(event => isProcedureBody(event.body));
            treatmentState = formatTreatmentStateForPrompt({
              procedureEvents,
              constraintsText: constraints,
              today
            });

            const mealRecords = [];
            for (let index = 0; index < nutritionWeekEntries.length; index += 1) {
              const content = decodeBlob(nutritionWeekBlobs[index]);
              if (content === null) continue;
              try {
                const { record } = parseEventDocument(content, nutritionWeekEntries[index].path, loadYaml);
                if (record) mealRecords.push(record);
              } catch {
                // Skip unreadable meal logs rather than breaking the turn.
              }
            }
            nutritionSkinWeek = formatNutritionSkinWeekForPrompt({ mealRecords, today });
          }

          if (needsSaraClinicalContext) {
            const mealRecords = [];
            for (let index = 0; index < nutritionWeekEntries.length; index += 1) {
              const content = decodeBlob(nutritionWeekBlobs[index]);
              if (content === null) continue;
              try {
                const { record } = parseEventDocument(content, nutritionWeekEntries[index].path, loadYaml);
                if (record) mealRecords.push(record);
              } catch {
                // Skip unreadable meal logs rather than breaking the turn.
              }
            }
            saraClinicalContext = formatSaraClinicalContextForPrompt({
              constraintsText: constraints,
              mealRecords,
              workoutRecords,
              today
            });
          }

          if (needsHammondTools) {
            const fitnessRecords = parseHammondFitnessRecords(hammondFitnessEntries, hammondFitnessBlobs);
            hammondDigest = summarizeHammondDigest({ tree: current.tree, fitnessRecords, today });
            const cnEvents = parseHammondEventDocuments(hammondCnEntries, hammondCnBlobs);
            hammondCnSummary = formatCentralNodeModelForPrompt(buildCentralNodeModel({
              events: cnEvents,
              targetsConfig: TARGETS_CONFIG,
              centralNodeMarkdown,
              date: today
            }));
            hammondDiaryDigest = hammondDiaryDigestForTurn({
              slug,
              message: parsed.message,
              events: cnEvents,
              today
            });
            hammondMindAmbient = recentSystemNoteTail(cnEvents, today);
          }

          if (slug === 'vera' || slug === 'penelope' || slug === 'hammond') {
            mindSilence = simultaneousSilenceFlag({ tree: current.tree, today });
          }
          if (needsMindDigest) {
            if (thinMindLoad) {
              const diaryDates = mindEntries
                .map(entry => {
                  const match = /\/(\d{4}-\d{2}-\d{2})-diary(?:-|\.md)/.exec(entry.path ?? '');
                  return match?.[1] ?? null;
                })
                .filter(Boolean)
                .sort();
              const lastDiary = diaryDates.at(-1);
              if (lastDiary) daysSinceLastEntry = daysBetween(lastDiary, today);
              if (slug === 'vera') {
                const sessionDates = mindEntries
                  .map(entry => {
                    const match = /\/(\d{4}-\d{2}-\d{2})-session(?:-|\.md)/.exec(entry.path ?? '');
                    return match?.[1] ?? null;
                  })
                  .filter(Boolean)
                  .sort();
                const lastSession = sessionDates.at(-1);
                if (lastSession) daysSinceLastMindSession = daysBetween(lastSession, today);
              }
            } else {
              const mindFiles = mindEntries
                .map((entry, index) => ({ path: entry.path, content: decodeBlob(mindBlobs[index]) }))
                .filter(file => file.content !== null);
              mindEvents = [];
              for (const file of mindFiles) {
                try { mindEvents.push(parseEventDocument(file.content, file.path, loadYaml)); }
                catch { /* skip */ }
              }
              mindDiaryDigest = summarizeDiaryForPrompt(mindEvents, today);
              mindSessionDigest = summarizeMindSessionsForPrompt(mindEvents, today);
              mindTodaySession = slug === 'vera' ? summarizeTodaysMindSession(mindEvents, today) : '';
              mindDivergence = slug === 'vera' ? divergenceLine(mindEvents, today) : '';
              const lastDiary = mindEvents.filter(e => e.record.type === 'diary').map(e => e.record.date).sort().at(-1);
              const lastSession = mindEvents.filter(e => e.record.type === 'mind_session').map(e => e.record.date).sort().at(-1);
              if (lastDiary) daysSinceLastEntry = daysBetween(lastDiary, today);
              if (lastSession) daysSinceLastMindSession = daysBetween(lastSession, today);
            }
          }
          if (slug === 'penelope' && onThisDayBlobs?.length) {
            const file = onThisDayEntries
              .map((entry, i) => ({ path: entry.path, content: decodeBlob(onThisDayBlobs[i]) }))
              .find(f => f.content);
            if (file) {
              try {
                const parsed = parseEventDocument(file.content, file.path, loadYaml);
                onThisDay = excerptOnThisDay({
                  date: parsed.record.date,
                  mood: parsed.record.mood,
                  moods: parsed.record.moods,
                  tags: parsed.record.tags,
                  highlights: parsed.record.highlights,
                  challenges: parsed.record.challenges,
                  notes: parsed.body
                });
              } catch { /* skip */ }
            }
          }
          if (needsSaraMedical) {
            const medicalEntries = selectMedicalEntries(current.tree);
            const bloodsEntries = selectBloodsEntries(current.tree);
            const medicalBlobs = await Promise.all([
              ...medicalEntries.map(entry => client.readBlob(entry.sha)),
              ...bloodsEntries.map(entry => client.readBlob(entry.sha))
            ]);
            const medicalFiles = [...medicalEntries, ...bloodsEntries]
              .map((entry, index) => ({ path: entry.path, content: decodeBlob(medicalBlobs[index]) }))
              .filter(file => file.content !== null);
            medicalEvents = [];
            for (const file of medicalFiles) {
              try { medicalEvents.push(parseEventDocument(file.content, file.path, loadYaml)); }
              catch { /* skip unreadable medical/bloods blobs */ }
            }
          }
          if (veraIntakeBlob) {
            veraIntake = decodeBlob(veraIntakeBlob) || '';
          }
        } catch {
          // Fail-visible: do not continue as if Central Node were empty-by-design.
          digest = '';
          constraints = '';
          centralNodeLog = CENTRAL_NODE_UNAVAILABLE_MARKER;
          centralNodeFull = '';
          centralNodeMarkdown = '';
          centralNodeSha = undefined;
          governanceLog = needsHammondTools ? emptyGovernanceLog() : '';
          governanceLogSha = undefined;
          governanceLogTail = '';
          pendingCnPatches = [];
          pendingCnPatchesSha = undefined;
          hammondDigest = '';
          hammondCnSummary = '';
          hammondMindAmbient = '';
          foodLibraryEntries = [];
          foodLibrary = '';
          foodLibrarySha = undefined;
          nutritionChallenges = emptyNutritionChallenges();
          nutritionChallengesText = '';
          nutritionChallengesSha = undefined;
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
          lastWorkouts = '';
          workoutRecords = [];
          bodyState = '';
          treatmentState = '';
          nutritionSkinWeek = '';
          saraClinicalContext = '';
          sessionAdherenceDays = null;
          mindDiaryDigest = '';
          mindSessionDigest = '';
          mindTodaySession = '';
          mindSilence = '';
          mindDivergence = '';
          onThisDay = '';
          daysSinceLastEntry = null;
          daysSinceLastMindSession = null;
          veraIntake = '';
          mindEvents = [];
          medicalEvents = [];
          repoTree = [];
        }

        try {
          promotedShortcutDrafts = await loadPromotedShortcutDrafts(
            repoTree,
            async sha => decodeBlob(await client.readBlob(sha)),
            { limit: 12 }
          );
        } catch {
          promotedShortcutDrafts = [];
        }
        tools = [
          ...buildAgentTools({
            slug,
            allowedTypes,
            stripWebSearch,
            needsFoodLibrary,
            needsExerciseLibrary,
            needsSkincareLibrary,
            needsHammondTools,
            needsVeraMindTools: slug === 'vera',
            needsSaraMedicalTools: needsSaraMedical,
            message: parsed.message
          }),
          ...(needsNutritionChallenges
            ? [
                listNutritionChallengesSchema(),
                upsertNutritionChallengeSchema(),
                markNutritionChallengeDaySchema()
              ]
            : []),
          ...buildPromotedShortcutToolSchemas(promotedShortcutDrafts)
        ];

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
        const intuitionPacks = loadIntuitionFor({ agentSlug: slug });
        const intuitionPrompt = formatIntuitionForPrompt(intuitionPacks);
        const capacityOneLiners = promptOneLinersForAgent(slug);
        const hubContext = needsHammondTools ? await hubContextPromise : '';
        const system = buildSystemPrompt({
          slug,
          digest,
          constraints,
          centralNodeLog,
          centralNodeFull,
          governanceLogTail,
          governanceLogIsEmpty: needsHammondTools && governanceLog === emptyGovernanceLog(),
          hammondDigest,
          hammondCnSummary,
          pendingCnPatches: needsHammondTools ? formatPendingCnPatchesForPrompt(pendingCnPatches) : '',
          foodLibrary,
          nutritionChallenges: nutritionChallengesText,
          chadwickProtocol,
          hyaluronicaProtocol,
          penelopeProtocol,
          veraProtocol,
          veraIntake,
          brisketProtocol,
          saraProtocol,
          hammondProtocol,
          hammondAuditContract,
          workoutTemplates,
          lastWorkouts,
          exerciseLibrary,
          skincareRoutines,
          treatmentState,
          nutritionSkinWeek,
          saraClinicalContext,
          bodyState,
          daysSinceLastSession: sessionAdherenceDays,
          mindDiaryDigest,
          hammondDiaryDigest,
          hammondMindAmbient,
          mindSessionDigest,
          mindTodaySession,
          mindSilence,
          mindDivergence,
          onThisDay,
          daysSinceLastEntry,
          daysSinceLastMindSession,
          protocolSteer: protocolSteerBlock(slug, parsed.protocolId),
          intuition: intuitionPrompt,
          capacities: capacityOneLiners,
          hubContext
        });

        let pendingLogRejection = null;
        let governanceLogAppendedThisTurn = false;
        let turnErrored = false;
        // Persists a Confirm-class Central Node patch to the durable pending queue
        // before emitting its Confirm card, so it survives past this one response
        // instead of living only in the SSE stream + DOM (see cn-patch-queue.mjs).
        // Best-effort: a queue write failure still lets the same-turn Confirm work,
        // it just won't be resurfaceable in a later turn if this one gets dropped.
        const proposeCentralNodePatch = async patch => {
          let persistedId = null;
          try {
            const entry = { id: createPendingCnPatchId(), createdAt: today, slug, patch };
            const nextQueue = addPendingCnPatch(pendingCnPatches, entry);
            const result = await client.writeFile({
              path: PENDING_CN_PATCHES_PATH,
              content: serializePendingCnPatches(nextQueue),
              ...(pendingCnPatchesSha ? { sha: pendingCnPatchesSha } : {}),
              message: `chore(cn-patch-queue): propose ${patch.payload.summary}`
            });
            pendingCnPatches = nextQueue;
            pendingCnPatchesSha = result.sha;
            persistedId = entry.id;
          } catch {
            // Swallowed — see comment above.
          }
          send({ type: 'cn_patch_proposal', patch, id: persistedId });
          return persistedId;
        };

        // os.propose-action: validate allowlist, persist pending queue, emit Confirm card with diffs.
        const proposeOsAction = async proposal => {
          let persistedId = null;
          try {
            const entry = { id: createPendingActionId(), createdAt: today, slug, proposal };
            const nextQueue = addPendingAction(pendingActions, entry);
            const result = await client.writeFile({
              path: PENDING_ACTIONS_PATH,
              content: serializePendingActions(nextQueue),
              ...(pendingActionsSha ? { sha: pendingActionsSha } : {}),
              message: `chore(propose-action): queue ${proposal.intent}`.slice(0, 200)
            });
            pendingActions = nextQueue;
            pendingActionsSha = result.sha;
            persistedId = entry.id;
          } catch {
            // Same-turn Confirm still works if the queue write fails.
          }
          send({ type: 'action_proposal', proposal, id: persistedId });
          return persistedId;
        };
        try {
          const emit = event => {
            if (event.type === 'record_proposal' || event.type === 'record_saved') {
              pendingLogRejection = null;
            }
            send(event);
          };

          send({
            type: 'status',
            text: (logFinalize || veraFlush) ? forceStatusFor(slug) : 'Thinking…'
          });
          const streamOpts = {
            slug,
            userMessage: parsed.message,
            today,
            system,
            messages: [...parsed.history, { role: 'user', content: parsed.message }],
            tools,
            signal: request.signal,
            executeTools: async event => {
              if (event.name === 'get_mind_session') {
                send({ type: 'status', text: 'Checking Life Hub records…' });
                const date = typeof event.input?.date === 'string' ? event.input.date.trim() : '';
                const result = await getMindSession({
                  date,
                  events: mindEvents,
                  tree: repoTree,
                  readBlob: async sha => decodeBlob(await client.readBlob(sha)),
                  parseDocument: (content, path) => parseEventDocument(content, path, loadYaml)
                });
                return JSON.stringify(result);
              }
              if (event.name === 'search_mind_records') {
                send({ type: 'status', text: 'Searching mind records…' });
                return JSON.stringify(searchMindRecords(mindEvents, event.input ?? {}));
              }
              if (event.name === 'search_medical_records') {
                send({ type: 'status', text: 'Searching Medical Overview…' });
                return JSON.stringify(searchMedicalRecords(medicalEvents, event.input ?? {}));
              }
              if (event.name === 'brief_medical_appointment') {
                send({ type: 'status', text: 'Reading Medical Overview…' });
                const date = typeof event.input?.date === 'string' ? event.input.date.trim() : '';
                const result = await briefMedicalAppointmentWithFallback({
                  date,
                  events: medicalEvents,
                  tree: repoTree,
                  readBlob: async sha => decodeBlob(await client.readBlob(sha)),
                  parseDocument: (content, path) => parseEventDocument(content, path, loadYaml)
                });
                return JSON.stringify(result);
              }
              if (event.name === 'get_last_workout') {
                send({ type: 'status', text: 'Checking last workout…' });
                return JSON.stringify(getLastWorkout(workoutRecords));
              }
              if (event.name === 'search_workout_records') {
                send({ type: 'status', text: 'Searching workout history…' });
                return JSON.stringify(searchWorkoutRecords(workoutRecords, event.input ?? {}));
              }
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
              if (event.name === 'list_nutrition_challenges') {
                const includeCompleted = event.input?.include_completed === true;
                const text = formatNutritionChallengesForPrompt(nutritionChallenges, {
                  today,
                  includeCompleted
                });
                return JSON.stringify({
                  ok: true,
                  challenges: text || 'No nutrition challenges on file.',
                  count: nutritionChallenges.challenges?.length ?? 0
                });
              }
              if (event.name === 'upsert_nutrition_challenge') {
                const draft = validateUpsertNutritionChallengeInput(event.input, { today });
                if (!draft) {
                  return JSON.stringify({ ok: false, error: 'invalid_challenge' });
                }
                try {
                  const outcome = upsertNutritionChallenge(nutritionChallenges, draft);
                  const serialized = serializeNutritionChallenges({ challenges: outcome.challenges });
                  const fileResult = await client.writeFile({
                    path: NUTRITION_CHALLENGES_PATH,
                    content: serialized,
                    ...(nutritionChallengesSha ? { sha: nutritionChallengesSha } : {}),
                    message: `chore(nutrition-challenge): ${outcome.created ? 'open' : 'update'} ${outcome.challenge.id}`
                  });
                  nutritionChallenges = { challenges: outcome.challenges };
                  nutritionChallengesSha = fileResult.sha;
                  nutritionChallengesText = formatNutritionChallengesForPrompt(nutritionChallenges, { today });

                  let cnSynced = false;
                  if (centralNodeMarkdown) {
                    const nextCn = syncChallengeToCentralNode(centralNodeMarkdown, outcome.challenge, {
                      actionLine: outcome.created
                        ? `- Brisket: opened nutrition challenge tracker — ${outcome.challenge.title} (${outcome.challenge.start}→${outcome.challenge.end}).`
                        : `- Brisket: updated nutrition challenge tracker — ${outcome.challenge.title}.`
                    });
                    if (nextCn && nextCn !== centralNodeMarkdown) {
                      const cnResult = await client.writeFile({
                        path: 'central-node.md',
                        content: nextCn,
                        ...(centralNodeSha ? { sha: centralNodeSha } : {}),
                        message: `chore(cn): nutrition challenge ${outcome.challenge.title}`
                      });
                      centralNodeMarkdown = nextCn;
                      centralNodeSha = cnResult.sha;
                      cnSynced = true;
                      send({
                        type: 'central_node_patched',
                        summary: `Nutrition challenge: ${outcome.challenge.title}`,
                        risk: 'auto'
                      });
                    }
                  }

                  const tally = tallyChallenge(outcome.challenge);
                  send({
                    type: 'nutrition_challenge_upserted',
                    id: outcome.challenge.id,
                    title: outcome.challenge.title,
                    created: outcome.created
                  });
                  return JSON.stringify({
                    ok: true,
                    status: outcome.created ? 'created' : 'updated',
                    id: outcome.challenge.id,
                    title: outcome.challenge.title,
                    start: outcome.challenge.start,
                    end: outcome.challenge.end,
                    tally,
                    central_node_synced: cnSynced,
                    path: NUTRITION_CHALLENGES_PATH
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'mark_nutrition_challenge_day') {
                const mark = validateMarkNutritionChallengeDayInput(event.input);
                if (!mark) {
                  return JSON.stringify({ ok: false, error: 'invalid_mark' });
                }
                try {
                  const outcome = markNutritionChallengeDay(nutritionChallenges, mark);
                  if (!outcome) {
                    return JSON.stringify({ ok: false, error: 'challenge_or_date_not_found' });
                  }
                  const serialized = serializeNutritionChallenges({ challenges: outcome.challenges });
                  const fileResult = await client.writeFile({
                    path: NUTRITION_CHALLENGES_PATH,
                    content: serialized,
                    ...(nutritionChallengesSha ? { sha: nutritionChallengesSha } : {}),
                    message: `chore(nutrition-challenge): mark ${mark.date} ${mark.result}`
                  });
                  nutritionChallenges = { challenges: outcome.challenges };
                  nutritionChallengesSha = fileResult.sha;
                  nutritionChallengesText = formatNutritionChallengesForPrompt(nutritionChallenges, { today });

                  let cnSynced = false;
                  if (centralNodeMarkdown) {
                    const nextCn = syncChallengeToCentralNode(centralNodeMarkdown, outcome.challenge, {
                      actionLine: `- Brisket: challenge day ${mark.date} → ${mark.result}${mark.note ? ` (${mark.note})` : ''}.`,
                      updateFlags: mark.result !== 'pending'
                    });
                    if (nextCn && nextCn !== centralNodeMarkdown) {
                      const cnResult = await client.writeFile({
                        path: 'central-node.md',
                        content: nextCn,
                        ...(centralNodeSha ? { sha: centralNodeSha } : {}),
                        message: `chore(cn): challenge day ${mark.date} ${mark.result}`
                      });
                      centralNodeMarkdown = nextCn;
                      centralNodeSha = cnResult.sha;
                      cnSynced = true;
                      send({
                        type: 'central_node_patched',
                        summary: `Challenge ${mark.date}: ${mark.result}`,
                        risk: 'auto'
                      });
                    }
                  }

                  const tally = tallyChallenge(outcome.challenge);
                  send({
                    type: 'nutrition_challenge_marked',
                    id: outcome.challenge.id,
                    date: mark.date,
                    result: mark.result
                  });
                  return JSON.stringify({
                    ok: true,
                    id: outcome.challenge.id,
                    date: mark.date,
                    result: mark.result,
                    tally,
                    central_node_synced: cnSynced
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
                if (event.input?.type === 'mind_session') {
                  send({ type: 'status', text: 'Saving your session…' });
                }
                let medicalInput = event.input;
                if (event.input?.type === 'medical') {
                  try {
                    medicalInput = await resolveMedicalLogCandidate(client, event.input, {
                      today,
                      loadYaml,
                      decodeBlob
                    });
                  } catch {
                    // GitHub blips must not kill the SSE turn — fall back to the raw payload.
                    medicalInput = event.input;
                  }
                }
                const validation = validateLogEntry(medicalInput, {
                  id: `${medicalInput?.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
                  now: getSydneyTimestamp(nowInstant)
                });
                if (!validation.valid) {
                  pendingLogRejection = { errors: validation.errors };
                  return JSON.stringify(logEntryRejectionPayload(medicalInput, validation.errors));
                }
                try {
                  const outcome = await persistOrProposeLogEntry({
                    client, slug, today, validation, send: emit, userMessage: parsed.message
                  });
                  if (outcome.status === 'written') {
                    return JSON.stringify({ ok: true, status: 'written', path: outcome.path });
                  }
                  if (outcome.error === 'write_failed') {
                    return JSON.stringify({ ok: false, error: 'write_failed' });
                  }
                  return JSON.stringify({ ok: true, status: 'awaiting_confirm' });
                } catch {
                  const errors = ['Could not prepare that record. Retry with a simpler payload.'];
                  pendingLogRejection = { errors };
                  return JSON.stringify(logEntryRejectionPayload(medicalInput, errors));
                }
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
                  governanceLogAppendedThisTurn = true;
                  send({ type: 'governance_log_appended', entryType: dated.entryType });
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
                if (!assertAgentMayApplyCentralNodePatch(slug, patch)) {
                  return JSON.stringify({ ok: false, error: 'patch_not_allowed' });
                }
                const risk = classifyCentralNodePatchRisk(patch);
                if (risk === 'confirm') {
                  // Anthropic client swallows tool_call when executeTools returns
                  // non-null — emit Confirm SSE here (same as central_node_patched).
                  const pendingId = await proposeCentralNodePatch(patch);
                  return JSON.stringify({
                    ok: true,
                    status: 'awaiting_confirm',
                    summary: patch.payload.summary,
                    ...(pendingId ? { pendingId } : {})
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
              
              if (isShortcutTool(event.name) || isPromotedShortcutToolName(event.name, promotedShortcutDrafts)) {
                const promotedDraft = findPromotedDraftByToolName(event.name, promotedShortcutDrafts);
                const shortcutName = promotedDraft ? 'os_run_promoted_shortcut' : event.name;
                const shortcutInput = promotedDraft
                  ? { proposed_id: promotedDraft.proposed_id, ...(event.input ?? {}) }
                  : (event.input ?? {});
                const shortcutResult = await executeShortcut(shortcutName, shortcutInput, {
                  client,
                  agentSlug: slug,
                  today,
                  repoTree,
                  readBlob: async sha => decodeBlob(await client.readBlob(sha))
                });
                if (shortcutResult.kind === 'propose' || shortcutResult.kind === 'loan_confirm') {
                  const proposalInput = shortcutResult.proposal;
                  const validated = validateProposeActionInput(proposalInput, { agentSlug: slug });
                  if (!validated.ok) {
                    return JSON.stringify({
                      ok: false,
                      error: validated.error,
                      ...(validated.detail ? { detail: validated.detail } : {})
                    });
                  }
                  const pendingId = await proposeOsAction(validated.proposal);
                  return JSON.stringify({
                    ok: true,
                    status: 'awaiting_confirm',
                    intent: validated.proposal.intent,
                    writes: validated.proposal.writes.map(write => ({
                      path: write.path,
                      mode: write.mode,
                      diff: write.diff
                    })),
                    ...(pendingId ? { pendingId } : {}),
                    ...(shortcutResult.loan ? { loan: shortcutResult.loan } : {})
                  });
                }
                return JSON.stringify(shortcutResult);
              }
              if (event.name === 'os_propose_action') {
                const validated = validateProposeActionInput(event.input, { agentSlug: slug });
                if (!validated.ok) {
                  return JSON.stringify({
                    ok: false,
                    error: validated.error,
                    ...(validated.detail ? { detail: validated.detail } : {})
                  });
                }
                const pendingId = await proposeOsAction(validated.proposal);
                return JSON.stringify({
                  ok: true,
                  status: 'awaiting_confirm',
                  intent: validated.proposal.intent,
                  writes: validated.proposal.writes.map(write => ({
                    path: write.path,
                    mode: write.mode,
                    diff: write.diff
                  })),
                  ...(pendingId ? { pendingId } : {})
                });
              }
              return null;
            }
          };
          for await (const event of streamWithAgentLogForce(anthropic, streamOpts)) {
            if (event.type === 'tool_call' && event.name === 'log_entry') {
              let medicalInput = event.input;
              if (event.input?.type === 'medical') {
                try {
                  medicalInput = await resolveMedicalLogCandidate(client, event.input, {
                    today,
                    loadYaml,
                    decodeBlob
                  });
                } catch {
                  medicalInput = event.input;
                }
              }
              const validation = validateLogEntry(medicalInput, {
                id: `${medicalInput?.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
                now: getSydneyTimestamp(nowInstant)
              });
              if (validation.valid) {
                try {
                  await persistOrProposeLogEntry({
                    client, slug, today, validation, send: emit, userMessage: parsed.message
                  });
                } catch {
                  pendingLogRejection = {
                    errors: ['Could not prepare that record. Retry with a simpler payload.']
                  };
                }
              } else {
                pendingLogRejection = { errors: validation.errors };
              }
            } else if (event.type === 'tool_call' && event.name === 'propose_central_node_patch') {
              const patch = validateCentralNodePatchInput(event.input);
              if (patch && assertAgentMayApplyCentralNodePatch(slug, patch) && classifyCentralNodePatchRisk(patch) === 'confirm') {
                await proposeCentralNodePatch(patch);
              } else {
                send(event);
              }
            } else if (
              event.type === 'tool_call'
              && (isShortcutTool(event.name) || isPromotedShortcutToolName(event.name, promotedShortcutDrafts))
            ) {
              const promotedDraft = findPromotedDraftByToolName(event.name, promotedShortcutDrafts);
              const shortcutName = promotedDraft ? 'os_run_promoted_shortcut' : event.name;
              const shortcutInput = promotedDraft
                ? { proposed_id: promotedDraft.proposed_id, ...(event.input ?? {}) }
                : (event.input ?? {});
              const shortcutResult = await executeShortcut(shortcutName, shortcutInput, {
                client,
                agentSlug: slug,
                today,
                repoTree,
                readBlob: async sha => decodeBlob(await client.readBlob(sha))
              });
              if (shortcutResult.kind === 'propose' || shortcutResult.kind === 'loan_confirm') {
                const validated = validateProposeActionInput(shortcutResult.proposal, { agentSlug: slug });
                if (validated.ok) await proposeOsAction(validated.proposal);
                else send({ type: 'action_rejected', error: validated.error, ...(validated.detail ? { detail: validated.detail } : {}) });
              } else {
                send(event);
              }
            } else if (event.type === 'tool_call' && event.name === 'os_propose_action') {
              const validated = validateProposeActionInput(event.input, { agentSlug: slug });
              if (validated.ok) {
                await proposeOsAction(validated.proposal);
              } else {
                send({
                  type: 'action_rejected',
                  error: validated.error,
                  ...(validated.detail ? { detail: validated.detail } : {})
                });
              }
            } else {
              send(event);
            }
          }
        } catch (error) {
          turnErrored = true;
          send({ type: 'error', code: error instanceof AnthropicClientError ? error.code : 'anthropic_unavailable' });
        } finally {
          if (pendingLogRejection) {
            send({ type: 'record_rejected', errors: pendingLogRejection.errors });
          }
          // Server-side phase advancement for a headless/scheduled caller with no
          // client-side audit state machine of its own (see effectiveAuditSession
          // above) -- gives it a simple contract: read the next session off this
          // event, resend it as auditSession next turn, stop once it's null.
          // Skipped on a turn error (nothing meaningful happened to advance from),
          // and mirrors chat-controller.js's advanceAuditSession: lock cannot
          // advance without append_governance_log having actually fired this turn.
          if (effectiveAuditSession && !turnErrored) {
            const phase = effectiveAuditSession.phase;
            const nextSession = phase === 'lock' && !governanceLogAppendedThisTurn
              ? effectiveAuditSession
              : nextAuditPhase(effectiveAuditSession, (phase === 'triage' || phase === 'intake')
                ? {
                    askedIntakeQuestion: true,
                    skipRemainingIntake: AUDIT_SKIP_INTAKE_RE.test(parsed.message),
                    intakeComplete: AUDIT_SKIP_INTAKE_RE.test(parsed.message)
                  }
                : {});
            send({ type: 'audit_next_session', session: nextSession });
          }
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

async function persistOrProposeLogEntry({ client, slug, today, validation, send, userMessage }) {
  let proposal = validation;
  if (slug === 'chadwick' && proposal.record?.type === 'workout') {
    proposal = coerceChatWorkoutProposal(proposal, { userMessage });
  }
  const path = buildCanonicalPath({
    type: proposal.record.type,
    date: proposal.record.date,
    slug: buildRecordSlug(proposal.record)
  });

  let existingSha = null;

  if (validation.record.type === 'medical') {
    try {
      const current = await client.resolveTree();
      const existingEntry = current.tree.find(entry => entry.path === path && entry.type === 'blob');
      if (existingEntry?.sha) {
        existingSha = existingEntry.sha;
        const text = decodeBlob(await client.readBlob(existingEntry.sha));
        if (text) {
          const existing = parseMedicalEventTolerant(text, path, loadYaml);
          if (existing) {
            const merged = mergeMedicalFields(existing.record, validation.record, {
              notes: validation.notes,
              existingNotes: existing.body
            });
            const remerged = validateLogEntry({
              type: 'medical',
              date: validation.record.date,
              time: validation.record.time,
              notes: merged.notes,
              fields: merged.fields
            }, {
              id: existing.record.id,
              now: validation.record.updated_at,
              source: existing.record.source ?? 'chat'
            });
            if (remerged.valid) {
              proposal = {
                ...remerged,
                record: {
                  ...remerged.record,
                  created_at: existing.record.created_at ?? remerged.record.created_at
                }
              };
            }
          }
        }
      }
    } catch {
      // Best-effort append — fall back to the original proposal.
    }
  }

  const autoWriteMindSession = slug === 'vera' && proposal.record.type === 'mind_session';
  const autoWriteMedicalAppend = slug === 'sara' && proposal.record.type === 'medical' && existingSha != null;
  if (autoWriteMindSession || autoWriteMedicalAppend) {
    try {
      const current = await client.resolveTree();
      const sha = existingSha ?? current.tree.find(e => e.path === path && e.type === 'blob')?.sha;
      const persisted = await persistLogEntry(client, {
        record: proposal.record,
        notes: proposal.notes,
        path,
        existingSha: sha,
        nowDateKey: today
      });
      send({
        type: 'record_saved',
        record: proposal.record,
        notes: proposal.notes,
        path,
        summary: describeRecordForLog(proposal.record, proposal.notes, {
          medicalAppend: autoWriteMedicalAppend
        }),
        centralNodeUpdated: persisted.centralNodeUpdated
      });
      return { ok: true, status: 'written', path };
    } catch {
      send({
        type: 'record_proposal',
        record: proposal.record,
        notes: proposal.notes,
        path,
        warnings: [],
        autoWriteFailed: true
      });
      return { ok: false, error: 'write_failed' };
    }
  }
  send({
    type: 'record_proposal',
    record: proposal.record,
    notes: proposal.notes,
    path,
    // Phase 6a: deterministic protocol lint, non-blocking -- Adam can always
    // Confirm anyway. No-op (empty array) for anything but a workout proposal.
    warnings: lintWorkoutProposal(proposal.record)
  });
  return { ok: true, status: 'awaiting_confirm' };
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
    auditSession: normalizeAuditSession(body.auditSession),
    protocolId: normalizeProtocolId(body.protocolId)
  };
}

function sanitizeHistory(value) {
  return keepNewestHistory(value);
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

// Mirrors parseBodyRecords: turns hammondFitnessEntries (bounded, see
// hammond-digest.mjs) into records for the 90-day digest's streak/completed-count
// classification. Skips anything unreadable or invalid rather than breaking the
// chat turn.
function parseHammondFitnessRecords(entries, blobs) {
  const records = [];
  for (let index = 0; index < entries.length; index += 1) {
    const content = decodeBlob(blobs[index]);
    if (content === null) continue;
    try {
      const { record, body } = parseEventDocument(content, entries[index].path, loadYaml);
      // Notes are the markdown body (not YAML). Without this, Chadwick's recent-session
      // prompt and get_last_workout/search tools never see session verdicts Adam wrote.
      if (record) records.push(attachWorkoutNotes(record, body));
    } catch {
      // Skip an unreadable/invalid fitness record rather than breaking the chat turn.
    }
  }
  return records;
}

// Same try/catch-skip shape as parseHammondFitnessRecords, but returns the
// {record}-shaped events buildCentralNodeModel expects (digest.mjs loop shape).
function parseHammondEventDocuments(entries, blobs) {
  const events = [];
  for (let index = 0; index < entries.length; index += 1) {
    const content = decodeBlob(blobs[index]);
    if (content === null) continue;
    try {
      events.push(parseEventDocument(content, entries[index].path, loadYaml));
    } catch {
      // Skip an unreadable/invalid event rather than breaking the chat turn.
    }
  }
  return events;
}

function repositoryError() {
  return errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export function createChatStartHandler({
  env = process.env,
  getStore = defaultGetChatJobStore,
  invokeBackground = defaultInvokeChatBackground,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  now = Date.now,
  ...handlerDeps
} = {}) {
  return async function chatStartHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await start(request), request, env);
  };

  async function start(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
    const originError = guardRequestOrigin(request, env);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env) || typeof env.ANTHROPIC_API_KEY !== 'string' || env.ANTHROPIC_API_KEY.length === 0) {
      return withPrivateCache(misconfiguredResponse());
    }

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
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

    const jobBody = JSON.stringify({
      message: parsed.message,
      ...(parsed.history?.length ? { history: parsed.history } : {}),
      ...(parsed.priorAgentSlug ? { priorAgentSlug: parsed.priorAgentSlug } : {}),
      ...(parsed.auditSession ? { auditSession: parsed.auditSession } : {}),
      ...(parsed.protocolId ? { protocolId: parsed.protocolId } : {})
    });

    let kicked = false;
    try {
      const jobId = randomUUID();
      const store = await getStore();
      await store.create(jobId, {
        owner: chatJobOwnerKey(request.headers.get('cookie') ?? ''),
        body: jobBody,
        url: request.url,
        cookie: request.headers.get('cookie') ?? '',
        origin: request.headers.get('origin') ?? ''
      });
      kicked = await invokeBackground(request, jobId, env, fetchImpl);
      if (kicked) return withPrivateCache(okResponse(202, { jobId }));
    } catch {
      kicked = false;
    }

    // Background job did not start — stream this turn live so chat still works.
    return createChatHandler({
      env,
      fetchImpl,
      verifySessionToken: verify,
      serializeExpiredSessionCookie: clearCookie,
      now,
      ...handlerDeps
    })(new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: jobBody
    }));
  }
}

export default createChatStartHandler();
