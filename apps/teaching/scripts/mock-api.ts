import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MockStore, type SeedData } from './mock-store';
import {
  draftLessonKey,
  publishedLessonKey,
  yearKey,
  subjectKey,
  unitKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  scopeSequenceKey,
  mediaKey,
  outcomeKey,
  mediaFileKey,
  compositionKey,
  lessonTemplateKey,
  unitTemplateKey,
  aiJobKey,
  aiJobsInboxKey,
  aiTranscriptKey
} from '../src/storage/keys';
import { DEFAULT_ANTHROPIC_MODEL } from '../src/ai/models';
import type { SearchPack } from '../src/ai/search-pack';
import {
  ALLOWED_MEDIA_MIME,
  MAX_MEDIA_BYTES,
  mediaTypeFromMime
} from '../src/media/upload-rules';
import {
  BlockSchema,
  ClassHomepageSchema,
  ClassSchema,
  CompositionTemplateSchema,
  CoverPatchSchema,
  CurriculumOutcomeSchema,
  DEFAULT_PEDAGOGICAL_MODE,
  isPedagogicalMode,
  LessonSchema,
  LessonTemplateSchema,
  PublishableLessonSchema,
  PublishedLessonSchema,
  ScheduledLessonSchema,
  ScopeSequenceSchema,
  SectionBlockSchema,
  SubjectSchema,
  MediaSchema,
  MediaSharingSchema,
  MediaTypeSchema,
  StatusSchema,
  TimelineItemSchema,
  UnitSchema,
  UnitTemplateSchema,
  YearSchema,
  toPublishedLesson,
  type Block,
  type Class,
  type ClassHomepage,
  type CompositionSummary,
  type CompositionTemplate,
  type Cover,
  type CurriculumOutcome,
  type Lesson,
  type LessonTemplate,
  type LessonTemplateSummary,
  type PedagogicalMode,
  type ScheduledLesson,
  type ScopeSequence,
  type Media,
  type TimelineItem,
  type Unit,
  type UnitTemplate,
  type UnitTemplateSummary
} from '../src/schemas';
import { orderLessonsByUnitIds } from '../src/schemas/published-unit';
import { toPublicOutcome } from '../src/curriculum/outcome-catalog';
import { attachedOutcomeIds } from '../src/curriculum/outcome-ids';
import { filterBlocksForStudent } from '../src/blocks/visibility';
import { sanitizeBlocksDeep } from '../src/blocks/sanitize-blocks';
import { isLinkedSection } from '../src/blocks/composition-link';
import {
  LinkedResolveError,
  resolveLinkedSectionsForPublish
} from '../src/blocks/resolve-linked-sections';
import { runContentSearch } from '../src/search/run-content-search';
import { applyScheduleUnit } from '../src/schedule/schedule-unit';
import { defaultScopeTerms } from '../src/scope/timeline-dates';
import { reorderScheduledLesson } from '../src/schedule/reorder';
import { buildPublishedClass } from '../src/schedule/build-published-class';
import { unitContentChanged } from '../src/recovery/versions';
import type { VersionKind, VersionReason } from '../src/schemas';
import {
  CHECKPOINT_AFTER_SAVE_WARNING,
  getVersion,
  listVersionIndex,
  restoreVersion,
  tryWriteCheckpoint,
  VersionStoreError,
  writeCheckpoint,
  type JsonStore
} from '../netlify/functions/_shared/versions.mts';
import {
  applyStatusTransition,
  collectionToType,
  LifecycleError,
  listTrash,
  permanentDelete,
  restoreEntityFromTrash,
  scanDependencies,
  type LifecycleEntityType
} from '../netlify/functions/_shared/lifecycle.mts';
import { parseStatusPatch } from '../netlify/functions/_shared/lifecycle-routes.mts';
import {
  appendTranscriptTurns,
  AiJobCreateSchema,
  fixtureReplaceLessonProposal,
  staleWorkingJobError,
  type AiJob,
  type AiTranscriptTurn
} from '../src/ai/jobs';
import {
  applyJobResolution,
  syncInboxForJob,
  unresolvedJobForLesson,
  type AiJobInbox
} from '../src/ai/jobs-inbox';
import { toCurriculumLessonSummary } from '../src/curriculum/lesson-summary';
import {
  buildArchiveExport,
  buildLessonExport,
  buildUnitExport
} from '../src/export/portable';
import { GITHUB_BACKUP_PATH } from '../src/export/github-backup';
import {
  applyLessonLibraryPatch,
  parseLessonLibraryPatch
} from '../src/lessons/library-patch';

export const SESSION_COOKIE_NAME = 'teaching_hub_session';

export const MOCK_SEARCH_PACK: SearchPack = {
  query: 'build a 10 point mind map on cheese types',
  searched_at: '2026-08-16T10:00:00.000Z',
  available: true,
  sources: [
    {
      title: 'Cheese',
      url: 'https://www.britannica.com/topic/cheese',
      snippet: 'Cheese varieties differ by milk, production, texture, and ageing.',
      domain: 'www.britannica.com',
      education_score: 80
    }
  ],
  images: [
    {
      image_url: 'https://images.example/cheese.jpg',
      source_page_url: 'https://www.britannica.com/topic/cheese',
      title: 'Cheese wheel',
      width: 1200,
      height: 800
    }
  ],
  videos: [
    {
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'How cheese is made'
    }
  ]
};

const DEFAULT_PASSPHRASE = 'teaching-hub-local';
const DEFAULT_SESSION_SECRET = 'local-dev-secret';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface CreateMockApiOptions {
  seed: SeedData;
  passphrase?: string;
  sessionSecret?: string;
}

export interface MockApiRequestOptions {
  cookie?: string | null;
  body?: unknown;
}

/**
 * A minimal Response-like object. We deliberately avoid the WHATWG
 * `Response`/`Headers` globals here: browsers (and happy-dom, which backs
 * our Vitest environment) hide the `set-cookie` header from JS reads on
 * `Response.headers` for security, which makes it impossible for tests to
 * assert on the session cookie the same way a real client never could.
 * This mock is a server-side test harness, so we expose it directly.
 */
export interface MockResponse {
  status: number;
  headers: {
    get(name: string): string | null;
    forEach(callback: (value: string, name: string) => void): void;
  };
  json(): Promise<any>;
  text(): Promise<string>;
  /** Present for binary file responses (used by the Node HTTP adapter). */
  bodyBytes?: Uint8Array;
}

export interface MockApi {
  request(
    method: string,
    path: string,
    options?: MockApiRequestOptions
  ): Promise<MockResponse>;
  handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export function loadSeedFile(filePath: string): SeedData {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as SeedData;
}

// `sanitizeRichTextHtml` relies on the browser `DOMParser`/`Node` globals.
// Vitest's happy-dom environment already provides them; the plain Node
// process running the Vite dev server does not, so polyfill lazily there.
let domPolyfillPromise: Promise<void> | null = null;
function ensureDomPolyfill(): Promise<void> {
  if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== 'undefined') {
    return Promise.resolve();
  }
  if (!domPolyfillPromise) {
    domPolyfillPromise = import('happy-dom').then(({ Window }) => {
      const window = new Window();
      (globalThis as Record<string, unknown>).DOMParser = window.DOMParser;
      (globalThis as Record<string, unknown>).Node = window.Node;
    });
  }
  return domPolyfillPromise;
}

class MockHeaders {
  private readonly entries = new Map<string, string>();

  set(name: string, value: string): void {
    this.entries.set(name.toLowerCase(), value);
  }

  get(name: string): string | null {
    return this.entries.get(name.toLowerCase()) ?? null;
  }

  forEach(callback: (value: string, name: string) => void): void {
    this.entries.forEach((value, name) => callback(value, name));
  }
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): MockResponse {
  const headers = new MockHeaders();
  headers.set('content-type', 'application/json');
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) {
      headers.set(name, value);
    }
  }
  const text = JSON.stringify(body);
  return {
    status,
    headers,
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    }
  };
}

function okResponse(
  status: number,
  data: unknown,
  extraHeaders?: Record<string, string>,
  extras?: { warning?: string }
): MockResponse {
  if (extras?.warning) {
    return jsonResponse(status, { ok: true, data, warning: extras.warning }, extraHeaders);
  }
  return jsonResponse(status, { ok: true, data }, extraHeaders);
}

function createMockJsonStore(store: MockStore): JsonStore {
  return {
    async getJSON<T>(key: string): Promise<T | null> {
      const value = store.getJSON<T>(key);
      return value === undefined ? null : value;
    },
    async setJSON(key: string, value: unknown): Promise<void> {
      store.setJSON(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async listKeys(prefix: string): Promise<string[]> {
      return store.listKeys(prefix);
    }
  };
}

function mapVersionStoreError(err: unknown): MockResponse {
  if (err instanceof VersionStoreError) {
    const status = err.code === 'not_found' ? 404 : 400;
    return errorResponse(status, err.code, err.message, err.details);
  }
  throw err;
}

function mapLifecycleError(err: unknown): MockResponse {
  if (err instanceof LifecycleError) {
    if (err.code === 'not_found') return errorResponse(404, 'not_found', err.message);
    if (err.code === 'has_dependencies') {
      return errorResponse(409, 'conflict', err.message, {
        dependencies: err.dependencies ?? []
      });
    }
    return errorResponse(400, err.code, err.message);
  }
  throw err;
}

function liveKeyForKind(kind: VersionKind, parentId: string): string {
  if (kind === 'lesson') return draftLessonKey(parentId);
  if (kind === 'unit') return unitKey(parentId);
  return classKey(parentId);
}

function parentNotFoundMessage(kind: VersionKind): string {
  if (kind === 'lesson') return 'Lesson not found';
  if (kind === 'unit') return 'Unit not found';
  return 'Class not found';
}

function liveSnapshotForKind(kind: VersionKind, live: unknown): unknown {
  if (kind === 'class_homepage') {
    const homepage =
      live && typeof live === 'object' && 'homepage' in live
        ? (live as { homepage?: unknown }).homepage
        : undefined;
    return { homepage };
  }
  return live;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown
): MockResponse {
  return jsonResponse(status, {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details }
  });
}

function unauthorizedResponse(): MockResponse {
  return errorResponse(401, 'unauthorized', 'Authentication required');
}

function notFoundResponse(message: string): MockResponse {
  return errorResponse(404, 'not_found', message);
}

function binaryResponse(
  status: number,
  bytes: Uint8Array,
  contentType: string,
  extraHeaders?: Record<string, string>
): MockResponse {
  const headers = new MockHeaders();
  headers.set('content-type', contentType);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  }
  return {
    status,
    headers,
    async json() {
      throw new Error('binary response');
    },
    async text() {
      return Buffer.from(bytes).toString('utf8');
    },
    bodyBytes: bytes
  };
}

function sseResponse(events: unknown[]): MockResponse {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return binaryResponse(200, new TextEncoder().encode(body), 'text/event-stream', {
    'cache-control': 'no-store'
  });
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'item'
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mockCheeseMindMap(): Block {
  const nodes = [
    { id: 'cheese-types', label: 'Cheese types' },
    ...['Fresh', 'Soft', 'Semi-soft', 'Hard', 'Blue', 'Washed-rind', 'Goat', 'Sheep', 'Processed'].map(
      (label, index) => ({ id: `cheese-type-${index + 1}`, label })
    )
  ];
  return {
    id: 'mock-cheese-mind-map',
    type: 'block',
    block_type: 'mind_map',
    variant: 'medium',
    visibility: 'student_teacher',
    content: {
      title: 'Cheese types',
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        id: `cheese-edge-${index + 1}`,
        from: 'cheese-types',
        to: node.id
      }))
    },
    layout: {},
    print: {},
    settings: {},
    created_at: MOCK_SEARCH_PACK.searched_at,
    updated_at: MOCK_SEARCH_PACK.searched_at,
    schema_version: 1
  };
}

interface SessionTokenPayload {
  expiresAt: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function extractSessionToken(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(SESSION_COOKIE_NAME.length + 1);
    }
  }
  return undefined;
}

function buildSessionCookie(token: string): string {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function buildClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

export function createMockApi(options: CreateMockApiOptions): MockApi {
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  const sessionSecret = options.sessionSecret ?? DEFAULT_SESSION_SECRET;

  const store = new MockStore();
  store.loadSeed(options.seed);

  const seedIds = {
    years: options.seed.years.map((y) => (y as { id: string }).id),
    subjects: options.seed.subjects.map((s) => (s as { id: string }).id),
    units: options.seed.units.map((u) => (u as { id: string }).id),
    lessons: options.seed.lessons.map((l) => (l as { id: string }).id),
    classes: options.seed.classes.map((c) => (c as { id: string }).id),
    scheduled_lessons: options.seed.scheduled_lessons.map((s) => (s as { id: string }).id),
    scope_sequences: (options.seed.scope_sequences ?? []).map((s) => (s as { id: string }).id),
    media: (options.seed.media ?? []).map((m) => (m as { id: string }).id)
  };

  function sign(payload: string): string {
    return createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  }

  function createSessionToken(): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const payload = base64UrlEncode(JSON.stringify({ expiresAt } satisfies SessionTokenPayload));
    const signature = sign(payload);
    return { token: `${payload}.${signature}`, expiresAt };
  }

  function verifySessionToken(token: string | undefined): { authenticated: boolean; expiresAt?: number } {
    if (!token) return { authenticated: false };
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return { authenticated: false };

    const expectedSignature = sign(payload);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return { authenticated: false };
    }

    let parsed: SessionTokenPayload;
    try {
      parsed = JSON.parse(base64UrlDecode(payload)) as SessionTokenPayload;
    } catch {
      return { authenticated: false };
    }

    if (typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) {
      return { authenticated: false };
    }

    return { authenticated: true, expiresAt: parsed.expiresAt };
  }

  function getSession(cookieHeader: string | null | undefined) {
    return verifySessionToken(extractSessionToken(cookieHeader));
  }

  function buildCurriculum() {
    const years = seedIds.years
      .map((id) => store.getJSON(yearKey(id)))
      .filter((y): y is Record<string, unknown> => Boolean(y));
    const subjects = seedIds.subjects
      .map((id) => store.getJSON(subjectKey(id)))
      .filter((s): s is Record<string, unknown> => Boolean(s));
    const units = seedIds.units
      .map((id) => store.getJSON(unitKey(id)))
      .filter((u): u is Record<string, unknown> => Boolean(u));
    const lessons = seedIds.lessons
      .map((id) => store.getJSON<Lesson>(draftLessonKey(id)))
      .filter((lesson): lesson is Lesson => Boolean(lesson))
      .map((lesson) =>
        toCurriculumLessonSummary(lesson, store.get(publishedLessonKey(lesson.id)) !== undefined)
      );

    const classes = seedIds.classes
      .map((id) => store.getJSON<Class>(classKey(id)))
      .filter((cls): cls is Class => Boolean(cls));
    const scheduled_lessons = seedIds.scheduled_lessons
      .map((id) => store.getJSON<ScheduledLesson>(scheduledLessonKey(id)))
      .filter((entry): entry is ScheduledLesson => Boolean(entry));
    const scope_sequences = seedIds.scope_sequences
      .map((id) => {
        const raw = store.getJSON(scopeSequenceKey(id));
        if (!raw) return null;
        const parsed = ScopeSequenceSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      })
      .filter((entry): entry is ScopeSequence => entry !== null);

    const media = seedIds.media
      .map((id) => {
        const raw = store.getJSON(mediaKey(id));
        if (!raw) return null;
        const parsed = MediaSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      })
      .filter((entry): entry is Media => entry !== null && entry.status === 'active');

    const anchor = store.getJSON<{ date: string }>(scheduleAnchorKey());

    const outcomes = store
      .listKeys('outcomes/')
      .map((key) => {
        const parsed = CurriculumOutcomeSchema.safeParse(store.getJSON(key));
        return parsed.success ? parsed.data : null;
      })
      .filter((row): row is CurriculumOutcome => row !== null);

    return {
      years,
      subjects,
      units,
      lessons,
      classes,
      scheduled_lessons,
      scope_sequences,
      media,
      outcomes,
      schedule_anchor_date: anchor?.date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
    };
  }

  function handleAuth(body: unknown): MockResponse {
    const candidate = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const providedPassphrase = candidate.passphrase;

    if (typeof providedPassphrase !== 'string' || providedPassphrase !== passphrase) {
      return errorResponse(401, 'invalid_credentials', 'Invalid passphrase');
    }

    const { token, expiresAt } = createSessionToken();
    return okResponse(
      200,
      { authenticated: true, expiresAt },
      { 'set-cookie': buildSessionCookie(token) }
    );
  }

  function handleSession(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) {
      return okResponse(200, { authenticated: false });
    }
    return okResponse(200, { authenticated: true, expiresAt: session.expiresAt });
  }

  function handleLogout(): MockResponse {
    return okResponse(
      200,
      { loggedOut: true },
      { 'set-cookie': buildClearedSessionCookie() }
    );
  }

  function handleGetCurriculum(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, buildCurriculum());
  }

  function listStored<T>(prefix: string): T[] {
    return store
      .listKeys(prefix)
      .map((key) => store.getJSON<T>(key))
      .filter((row): row is T => Boolean(row));
  }

  function handleGetExport(
    cookie: string | null | undefined,
    query: URLSearchParams
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const kind = query.get('kind');
    const id = query.get('id');
    const createdAt = nowIso();

    if (kind === 'lesson') {
      if (!id) return errorResponse(400, 'validation_error', 'id is required');
      const row = store.getJSON<Lesson>(draftLessonKey(id));
      if (!row) return notFoundResponse('Lesson not found');
      return okResponse(200, buildLessonExport(row, createdAt));
    }

    if (kind === 'unit') {
      if (!id) return errorResponse(400, 'validation_error', 'id is required');
      const row = store.getJSON<Unit>(unitKey(id));
      if (!row) return notFoundResponse('Unit not found');
      const lessons = row.lesson_ids
        .map((lessonId) => store.getJSON<Lesson>(draftLessonKey(lessonId)))
        .filter((entry): entry is Lesson => Boolean(entry));
      return okResponse(200, buildUnitExport(row, lessons, createdAt));
    }

    if (kind === 'archive') {
      return okResponse(
        200,
        buildArchiveExport(
          {
            years: listStored('years/'),
            subjects: listStored('subjects/'),
            units: listStored('units/'),
            lessons: listStored<Lesson>('lessons/'),
            classes: listStored('classes/'),
            scheduled_lessons: listStored('scheduled_lessons/'),
            scope_sequences: listStored('scope_sequences/'),
            media: listStored('media/').filter((entry) => {
              const parsed = MediaSchema.safeParse(entry);
              return parsed.success;
            }),
            outcomes: listStored('outcomes/'),
            compositions: listStored('templates/compositions/'),
            lesson_templates: listStored('templates/lessons/'),
            unit_templates: listStored('templates/units/'),
            schedule_anchor_date:
              store.getJSON<{ date: string }>(scheduleAnchorKey())?.date ??
              DEFAULT_SCHEDULE_ANCHOR_DATE
          },
          createdAt
        )
      );
    }

    return errorResponse(400, 'validation_error', 'kind must be lesson, unit, or archive');
  }

  function handlePostGithubBackup(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, {
      path: GITHUB_BACKUP_PATH,
      sha: 'mock-sha',
      commit_url: 'https://github.com/example/teaching-hub-content/commit/mock',
      html_url: 'https://github.com/example/teaching-hub-content/blob/main/content_backup/teaching-hub-archive.json'
    });
  }

  function handleGetDraftLesson(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const lesson = store.getJSON<Lesson>(draftLessonKey(id));
    if (!lesson) return notFoundResponse('Lesson not found');
    return okResponse(200, lesson);
  }

  function handlePatchLessonStatus(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const statusFields = parseStatusPatch(body);
    if (!statusFields.ok) {
      return errorResponse(400, statusFields.code, statusFields.message);
    }
    const libraryFields = parseLessonLibraryPatch(body);
    if (!libraryFields.ok) {
      return errorResponse(400, 'validation_error', libraryFields.message);
    }
    if (!statusFields.hasStatus && !libraryFields.hasPatch) {
      return errorResponse(400, 'validation_error', 'Provide status or library fields');
    }

    const existing = store.getJSON<Lesson>(draftLessonKey(id));
    if (!existing) return notFoundResponse('Lesson not found');
    const existingParsed = LessonSchema.safeParse(existing);
    if (!existingParsed.success) {
      return errorResponse(500, 'invalid_data', 'Stored lesson is invalid');
    }

    const timestamp = nowIso();
    try {
      let next = existingParsed.data;
      if (statusFields.hasStatus && statusFields.status) {
        next = applyStatusTransition(
          next,
          statusFields.status,
          timestamp,
          statusFields.trash_reason
        );
      }
      if (libraryFields.hasPatch) {
        const fromUnitId = next.unit_id;
        next = applyLessonLibraryPatch(next, libraryFields.patch);
        if (libraryFields.patch.unit_id && libraryFields.patch.unit_id !== fromUnitId) {
          const moved = moveLessonUnit(fromUnitId, libraryFields.patch.unit_id, id, timestamp);
          if (!moved.ok) return errorResponse(400, 'validation_error', moved.message);
        }
      }
      const validated = LessonSchema.safeParse({ ...next, updated_at: timestamp });
      if (!validated.success) {
        return errorResponse(400, 'validation_error', 'Lesson data is invalid', validated.error.flatten());
      }
      store.setJSON(draftLessonKey(id), validated.data);
      return okResponse(200, validated.data);
    } catch (err) {
      return mapLifecycleError(err);
    }
  }

  function moveLessonUnit(
    fromUnitId: string,
    toUnitId: string,
    lessonId: string,
    timestamp: string
  ): { ok: true } | { ok: false; message: string } {
    const fromRaw = store.getJSON(unitKey(fromUnitId));
    const toRaw = store.getJSON(unitKey(toUnitId));
    const fromParsed = UnitSchema.safeParse(fromRaw);
    const toParsed = UnitSchema.safeParse(toRaw);
    if (!fromParsed.success || !toParsed.success) {
      return { ok: false, message: 'Unit not found' };
    }
    store.setJSON(unitKey(fromUnitId), {
      ...fromParsed.data,
      lesson_ids: fromParsed.data.lesson_ids.filter((entry) => entry !== lessonId),
      updated_at: timestamp
    });
    if (!toParsed.data.lesson_ids.includes(lessonId)) {
      store.setJSON(unitKey(toUnitId), {
        ...toParsed.data,
        lesson_ids: [...toParsed.data.lesson_ids, lessonId],
        updated_at: timestamp
      });
    }
    return { ok: true };
  }

  async function handleGetTrash(cookie: string | null | undefined): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const summaries = await listTrash(createMockJsonStore(store));
    return okResponse(200, summaries);
  }

  async function handleRestoreFromTrashRoute(
    cookie: string | null | undefined,
    type: LifecycleEntityType,
    id: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    try {
      const updated = await restoreEntityFromTrash(createMockJsonStore(store), type, id);
      return okResponse(200, updated);
    } catch (err) {
      return mapLifecycleError(err);
    }
  }

  async function handleDependenciesRoute(
    cookie: string | null | undefined,
    type: LifecycleEntityType,
    id: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const jsonStore = createMockJsonStore(store);
    const key =
      type === 'lesson'
        ? draftLessonKey(id)
        : type === 'unit'
          ? unitKey(id)
          : type === 'class'
            ? classKey(id)
            : type === 'media'
              ? mediaKey(id)
              : type === 'lesson_template'
                ? lessonTemplateKey(id)
                : type === 'unit_template'
                  ? unitTemplateKey(id)
                  : compositionKey(id);
    if (!(await jsonStore.getJSON(key))) {
      const msg =
        type === 'lesson'
          ? 'Lesson not found'
          : type === 'unit'
            ? 'Unit not found'
            : type === 'class'
              ? 'Class not found'
              : type === 'media'
                ? 'Media not found'
                : type === 'lesson_template'
                  ? 'Lesson template not found'
                  : type === 'unit_template'
                    ? 'Unit template not found'
                    : 'Composition not found';
      return notFoundResponse(msg);
    }
    const dependencies = await scanDependencies(jsonStore, type, id);
    return okResponse(200, { dependencies });
  }

  async function handlePermanentDeleteRoute(
    cookie: string | null | undefined,
    type: LifecycleEntityType,
    id: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    try {
      await permanentDelete(createMockJsonStore(store), type, id);
      return okResponse(200, { deleted: true });
    } catch (err) {
      return mapLifecycleError(err);
    }
  }

  async function handlePutDraftLesson(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const existing = store.getJSON<Lesson>(draftLessonKey(id));
    const bodyRecord = body as Record<string, unknown>;
    const checkpointReasonRaw = bodyRecord.checkpoint_reason;
    const { checkpoint_reason: _checkpointReason, ...bodyWithoutCheckpoint } = bodyRecord;
    void _checkpointReason;

    const candidate = {
      ...bodyWithoutCheckpoint,
      id,
      updated_at: new Date().toISOString(),
      // Preserve publish timestamp unless the client explicitly sends one.
      published_at:
        bodyWithoutCheckpoint.published_at !== undefined
          ? bodyWithoutCheckpoint.published_at
          : existing?.published_at
    };

    const parsed = LessonSchema.safeParse(candidate);
    if (!parsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'Draft failed validation',
        parsed.error.issues
      );
    }

    store.setJSON(draftLessonKey(id), parsed.data);

    let warning: string | undefined;
    if (checkpointReasonRaw === 'ai_accepted' || checkpointReasonRaw === 'manual_checkpoint') {
      const checkpointed = await tryWriteCheckpoint(createMockJsonStore(store), {
        kind: 'lesson',
        parentId: id,
        snapshot: parsed.data,
        reason: checkpointReasonRaw as VersionReason
      });
      if (!checkpointed.ok) warning = CHECKPOINT_AFTER_SAVE_WARNING;
    }

    return okResponse(200, parsed.data, undefined, warning ? { warning } : undefined);
  }

  async function handlePublishLesson(
    cookie: string | null | undefined,
    id: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const draft = store.getJSON<Lesson>(draftLessonKey(id));
    if (!draft) return notFoundResponse('Lesson not found');

    const parsed = PublishableLessonSchema.safeParse(draft);
    if (!parsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'Lesson is not publishable',
        parsed.error.issues
      );
    }

    const compositionMap = new Map<string, CompositionTemplate>();
    for (const block of parsed.data.blocks) {
      if (!isLinkedSection(block)) continue;
      const sourceId = block.content.link.source_composition_id;
      if (compositionMap.has(sourceId)) continue;
      const raw = store.getJSON(compositionKey(sourceId));
      const composition = CompositionTemplateSchema.safeParse(raw);
      if (composition.success) {
        compositionMap.set(sourceId, composition.data);
      }
    }

    let n = 0;
    let resolvedBlocks: Block[];
    try {
      resolvedBlocks = resolveLinkedSectionsForPublish(
        parsed.data.blocks,
        (sourceId) => compositionMap.get(sourceId) ?? null,
        () => `block_pub_${id}_${++n}`
      );
    } catch (err) {
      if (err instanceof LinkedResolveError) {
        return errorResponse(400, 'validation_error', err.message);
      }
      throw err;
    }

    await ensureDomPolyfill();

    const publishedAt = new Date().toISOString();
    const lessonForPublish = { ...parsed.data, blocks: resolvedBlocks };
    const fullSnapshot = toPublishedLesson(lessonForPublish, publishedAt);
    const studentBlocks = sanitizeBlocksDeep(filterBlocksForStudent(fullSnapshot.blocks));

    const studentSnapshot = PublishedLessonSchema.parse({
      ...fullSnapshot,
      blocks: studentBlocks
    });

    try {
      await writeCheckpoint(createMockJsonStore(store), {
        kind: 'lesson',
        parentId: id,
        snapshot: parsed.data,
        reason: 'publish',
        now: publishedAt
      });
    } catch (err) {
      console.error('publish writeCheckpoint failed', err);
      return errorResponse(
        500,
        'checkpoint_failed',
        'Publish aborted: version history checkpoint failed before writing the published snapshot.'
      );
    }

    store.setJSON(publishedLessonKey(id), studentSnapshot);
    // Persist publish timestamp on the draft so reload shows Published / Unpublished changes.
    // Draft keeps linked stubs; only the published snapshot expands them.
    store.setJSON(draftLessonKey(id), {
      ...parsed.data,
      published_at: publishedAt,
      updated_at: publishedAt
    });
    return okResponse(200, { student_path: `/s/lessons/${id}` });
  }

  function handleGetPublishedLesson(id: string): MockResponse {
    const snapshot = store.getJSON<Record<string, unknown>>(publishedLessonKey(id));
    if (!snapshot) return notFoundResponse('Lesson is not published');
    const ids = attachedOutcomeIds({
      outcome_ids: Array.isArray(snapshot.outcome_ids)
        ? snapshot.outcome_ids.filter((row): row is string => typeof row === 'string')
        : undefined
    });
    const outcomes = ids
      .map((outcomeId) => CurriculumOutcomeSchema.safeParse(store.getJSON(outcomeKey(outcomeId))))
      .filter((parsed) => parsed.success)
      .map((parsed) => toPublicOutcome(parsed.data));
    return okResponse(200, { ...snapshot, outcome_ids: ids, outcomes });
  }

  function handleGetPublishedClass(classId: string): MockResponse {
    const rawClass = store.getJSON(classKey(classId));
    if (!rawClass) return notFoundResponse('Class not found');

    const classParsed = ClassSchema.safeParse(rawClass);
    if (!classParsed.success || classParsed.data.status !== 'active') {
      return notFoundResponse('Class not found');
    }

    const cls = classParsed.data;

    const scheduled = store
      .listKeys('scheduled_lessons/')
      .map((key) => store.getJSON<ScheduledLesson>(key))
      .filter((row): row is ScheduledLesson => row != null && row.class_id === classId);

    const unitIds = new Set<string>(cls.active_unit_ids);
    for (const row of scheduled) {
      unitIds.add(row.unit_id);
    }
    if (cls.current_unit_id) {
      unitIds.add(cls.current_unit_id);
    }

    const units = [...unitIds]
      .map((unitId) => UnitSchema.safeParse(store.getJSON(unitKey(unitId))))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data);

    const lessonIds = new Set(scheduled.map((row) => row.lesson_id));
    if (cls.current_unit_id) {
      const currentUnit = units.find((unit) => unit.id === cls.current_unit_id);
      if (currentUnit) {
        for (const lessonId of currentUnit.lesson_ids) {
          lessonIds.add(lessonId);
        }
      }
    }
    const lessons: Array<{ id: string; title: string }> = [];
    for (const lessonId of lessonIds) {
      const draft = store.getJSON<{ title?: string }>(draftLessonKey(lessonId));
      if (draft && typeof draft.title === 'string' && draft.title) {
        lessons.push({ id: lessonId, title: draft.title });
      }
    }

    const publishedLessonIds = new Set(
      store
        .listKeys('published/lessons/')
        .map((key) => key.slice('published/lessons/'.length))
        .filter(Boolean)
    );

    const dto = buildPublishedClass({
      cls,
      units,
      lessons,
      scheduled,
      publishedLessonIds
    });
    return okResponse(200, dto);
  }

  function handleGetPublishedUnit(id: string): MockResponse {
    const unit = store.getJSON<{
      title?: string;
      lesson_ids?: string[];
      cover?: unknown;
      blocks?: unknown;
      outcome_ids?: string[];
    }>(unitKey(id));
    if (!unit || typeof unit.title !== 'string' || !unit.title) {
      return notFoundResponse('Unit not found');
    }

    const matching: { lesson_id: string; title: string }[] = [];
    for (const key of store.listKeys('published/lessons/')) {
      const snapshot = store.getJSON<{
        lesson_id?: string;
        title?: string;
        unit_id?: string;
      }>(key);
      if (
        snapshot &&
        snapshot.unit_id === id &&
        typeof snapshot.lesson_id === 'string' &&
        snapshot.lesson_id &&
        typeof snapshot.title === 'string' &&
        snapshot.title
      ) {
        matching.push({
          lesson_id: snapshot.lesson_id,
          title: snapshot.title
        });
      }
    }

    const lessons = orderLessonsByUnitIds(
      Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [],
      matching
    );

    const unitParsed = UnitSchema.safeParse({
      id,
      type: 'unit',
      title: unit.title,
      slug: 'published',
      year_id: 'year',
      subject_id: 'subject',
      lesson_ids: Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [],
      blocks: unit.blocks ?? [],
      cover: unit.cover,
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });

    const studentBlocks = sanitizeBlocksDeep(
      filterBlocksForStudent(unitParsed.success ? (unitParsed.data.blocks ?? []) : [])
    );

    const ids = attachedOutcomeIds({ outcome_ids: unit.outcome_ids });
    const outcomes = ids
      .map((outcomeId) => CurriculumOutcomeSchema.safeParse(store.getJSON(outcomeKey(outcomeId))))
      .filter((parsed) => parsed.success)
      .map((parsed) => toPublicOutcome(parsed.data));

    return okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons,
      ...(unitParsed.success && unitParsed.data.cover
        ? { cover: unitParsed.data.cover }
        : {}),
      blocks: studentBlocks,
      outcome_ids: ids,
      outcomes
    });
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function handleScheduleUnit(
    cookie: string | null | undefined,
    classId: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const unit_id = record.unit_id;
    const start_date = record.start_date;

    if (typeof unit_id !== 'string' || !unit_id) {
      return errorResponse(400, 'validation_error', 'unit_id is required');
    }
    if (typeof start_date !== 'string' || !DATE_RE.test(start_date)) {
      return errorResponse(400, 'validation_error', 'start_date must be YYYY-MM-DD');
    }

    let meeting_days: number[] | undefined;
    if (record.meeting_days !== undefined) {
      if (!Array.isArray(record.meeting_days) || record.meeting_days.length === 0) {
        return errorResponse(
          400,
          'validation_error',
          'meeting_days must be a non-empty array when provided'
        );
      }
      meeting_days = [];
      for (const day of record.meeting_days) {
        if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
          return errorResponse(
            400,
            'validation_error',
            'meeting_days must contain integers from 1 to 7'
          );
        }
        meeting_days.push(day);
      }
    }

    const rawClass = store.getJSON(classKey(classId));
    if (!rawClass) return notFoundResponse('Class not found');
    const classParsed = ClassSchema.safeParse(rawClass);
    if (!classParsed.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid');
    }

    const rawUnit = store.getJSON(unitKey(unit_id));
    if (!rawUnit) return notFoundResponse('Unit not found');
    const unitParsed = UnitSchema.safeParse(rawUnit);
    if (!unitParsed.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    if (unitParsed.data.subject_id !== classParsed.data.subject_id) {
      return errorResponse(400, 'subject_mismatch', 'Unit subject does not match class subject');
    }

    if (unitParsed.data.lesson_ids.length === 0) {
      return errorResponse(400, 'no_lessons', 'Unit has no lessons');
    }

    const meetingDays = meeting_days ?? classParsed.data.meeting_days ?? [1, 2, 3, 4, 5];

    const existing = store
      .listKeys('scheduled_lessons/')
      .map((key) => store.getJSON<ScheduledLesson>(key))
      .filter((entry): entry is ScheduledLesson => entry != null && entry.class_id === classId);

    const nowIso = new Date().toISOString();
    const idFactory = (lessonId: string) => `scheduled_${classId}_${lessonId}`;

    const result = applyScheduleUnit({
      cls: classParsed.data,
      unit: unitParsed.data,
      existing,
      startDate: start_date,
      meetingDays,
      nowIso,
      idFactory
    });

    if (!result.ok) {
      return errorResponse(400, result.code, result.message);
    }

    for (const created of result.created) {
      if (store.get(scheduledLessonKey(created.id)) !== undefined) {
        return errorResponse(
          409,
          'conflict',
          `Scheduled lesson id already exists: ${created.id}`
        );
      }
    }

    store.setJSON(classKey(classId), result.class);
    for (const created of result.created) {
      store.setJSON(scheduledLessonKey(created.id), created);
      seedIds.scheduled_lessons.push(created.id);
    }

    return okResponse(200, {
      class: result.class,
      scheduled_lessons: result.created
    });
  }

  function handlePatchScheduledLesson(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasDate = record.date !== undefined;
    const hasDirection = record.direction !== undefined;

    if (!hasDate && !hasDirection) {
      return errorResponse(400, 'validation_error', 'Provide date and/or direction');
    }

    let date: string | undefined;
    if (hasDate) {
      if (typeof record.date !== 'string' || !DATE_RE.test(record.date)) {
        return errorResponse(400, 'validation_error', 'date must be YYYY-MM-DD');
      }
      date = record.date;
    }

    let direction: 'up' | 'down' | undefined;
    if (hasDirection) {
      if (record.direction !== 'up' && record.direction !== 'down') {
        return errorResponse(400, 'validation_error', "direction must be 'up' or 'down'");
      }
      direction = record.direction;
    }

    const existing = store.getJSON<ScheduledLesson>(scheduledLessonKey(id));
    if (!existing) return notFoundResponse('Scheduled lesson not found');

    const nowIso = new Date().toISOString();
    let result: ScheduledLesson = { ...existing };
    const toPersist = new Map<string, ScheduledLesson>();

    if (date !== undefined) {
      result = { ...result, date, updated_at: nowIso };
      toPersist.set(id, result);
    }

    if (direction !== undefined) {
      const classRows = store
        .listKeys('scheduled_lessons/')
        .map((key) => store.getJSON<ScheduledLesson>(key))
        .filter((entry): entry is ScheduledLesson => entry != null && entry.class_id === existing.class_id)
        .sort((a, b) => a.schedule_order - b.schedule_order);

      const withTarget = classRows.map((row) => (row.id === id ? result : row));
      const reordered = reorderScheduledLesson(withTarget, id, direction);

      for (const row of reordered) {
        const before = withTarget.find((r) => r.id === row.id);
        if (!before || before.schedule_order === row.schedule_order) continue;
        const updated = { ...row, updated_at: nowIso };
        toPersist.set(updated.id, updated);
        if (updated.id === id) result = updated;
      }
    }

    const validated = ScheduledLessonSchema.safeParse(result);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Scheduled lesson data is invalid');
    }

    toPersist.set(id, validated.data);

    for (const row of toPersist.values()) {
      const rowValidated = ScheduledLessonSchema.safeParse(row);
      if (!rowValidated.success) {
        return errorResponse(400, 'validation_error', 'Scheduled lesson data is invalid');
      }
      store.setJSON(scheduledLessonKey(rowValidated.data.id), rowValidated.data);
    }

    return okResponse(200, validated.data);
  }

  async function handlePatchClass(
    cookie: string | null | undefined,
    classId: string,
    body: unknown
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasMeetingDays = record.meeting_days !== undefined;
    const hasCurrent = record.current_scheduled_lesson_id !== undefined;
    const hasHomepage = record.homepage !== undefined;
    const hasCover = record.cover !== undefined;
    const statusFields = parseStatusPatch(body);
    if (!statusFields.ok) {
      return errorResponse(400, statusFields.code, statusFields.message);
    }
    const hasStatus = statusFields.hasStatus;

    if (!hasMeetingDays && !hasCurrent && !hasHomepage && !hasCover && !hasStatus) {
      return errorResponse(
        400,
        'validation_error',
        'Provide meeting_days, current_scheduled_lesson_id, homepage, cover, and/or status'
      );
    }

    let meeting_days: number[] | undefined;
    if (hasMeetingDays) {
      if (!Array.isArray(record.meeting_days) || record.meeting_days.length === 0) {
        return errorResponse(
          400,
          'validation_error',
          'meeting_days must be a non-empty array when provided'
        );
      }
      meeting_days = [];
      for (const day of record.meeting_days) {
        if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
          return errorResponse(
            400,
            'validation_error',
            'meeting_days must contain integers from 1 to 7'
          );
        }
        meeting_days.push(day);
      }
    }

    let current_scheduled_lesson_id: string | null | undefined;
    if (hasCurrent) {
      const value = record.current_scheduled_lesson_id;
      if (value === null) {
        current_scheduled_lesson_id = null;
      } else if (typeof value === 'string' && value) {
        current_scheduled_lesson_id = value;
      } else {
        return errorResponse(
          400,
          'validation_error',
          'current_scheduled_lesson_id must be a non-empty string or null'
        );
      }
    }

    let homepage: ClassHomepage | undefined;
    if (hasHomepage) {
      const homepageParsed = ClassHomepageSchema.safeParse(record.homepage);
      if (!homepageParsed.success) {
        return errorResponse(400, 'validation_error', 'homepage is invalid');
      }
      homepage = homepageParsed.data;
    }

    let cover: Cover | null | undefined;
    if (hasCover) {
      const coverParsed = CoverPatchSchema.safeParse(record.cover);
      if (!coverParsed.success) {
        return errorResponse(400, 'validation_error', 'cover is invalid');
      }
      cover = coverParsed.data;
    }

    const rawClass = store.getJSON(classKey(classId));
    if (!rawClass) return notFoundResponse('Class not found');
    const classParsed = ClassSchema.safeParse(rawClass);
    if (!classParsed.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid');
    }

    if (current_scheduled_lesson_id) {
      const scheduled = store.getJSON<ScheduledLesson>(
        scheduledLessonKey(current_scheduled_lesson_id)
      );
      if (!scheduled || scheduled.class_id !== classId) {
        return notFoundResponse('Scheduled lesson not found');
      }
    }

    const nowIso = new Date().toISOString();
    let merged: Record<string, unknown> = {
      ...classParsed.data,
      updated_at: nowIso
    };

    if (meeting_days !== undefined) {
      merged.meeting_days = meeting_days;
    }

    if (current_scheduled_lesson_id !== undefined) {
      if (current_scheduled_lesson_id === null) {
        delete merged.current_scheduled_lesson_id;
      } else {
        merged.current_scheduled_lesson_id = current_scheduled_lesson_id;
      }
    }

    if (homepage !== undefined) {
      merged.homepage = homepage;
    }

    if (cover !== undefined) {
      if (cover === null) {
        delete merged.cover;
      } else {
        merged.cover = cover;
      }
    }

    if (hasStatus) {
      try {
        merged = applyStatusTransition(
          merged as Class,
          statusFields.status!,
          nowIso,
          statusFields.trash_reason
        ) as Record<string, unknown>;
        merged.updated_at = nowIso;
      } catch (err) {
        return mapLifecycleError(err);
      }
    }

    const validated = ClassSchema.safeParse(merged);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid');
    }

    store.setJSON(classKey(classId), validated.data);

    let warning: string | undefined;
    if (homepage !== undefined) {
      const checkpointed = await tryWriteCheckpoint(createMockJsonStore(store), {
        kind: 'class_homepage',
        parentId: classId,
        snapshot: { homepage: validated.data.homepage },
        reason: 'save',
        now: nowIso
      });
      if (!checkpointed.ok) warning = CHECKPOINT_AFTER_SAVE_WARNING;
    }

    return okResponse(200, validated.data, undefined, warning ? { warning } : undefined);
  }

  async function handlePatchUnit(
    cookie: string | null | undefined,
    unitId: string,
    body: unknown
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasTitle = record.title !== undefined;
    const hasDescription = record.description !== undefined;
    const hasBlocks = record.blocks !== undefined;
    const hasLessonIds = record.lesson_ids !== undefined;
    const hasCover = record.cover !== undefined;
    const hasOutcomeIds = record.outcome_ids !== undefined;
    const statusFields = parseStatusPatch(body);
    if (!statusFields.ok) {
      return errorResponse(400, statusFields.code, statusFields.message);
    }
    const hasStatus = statusFields.hasStatus;

    if (!hasTitle && !hasDescription && !hasBlocks && !hasLessonIds && !hasCover && !hasStatus && !hasOutcomeIds) {
      return errorResponse(
        400,
        'validation_error',
        'Provide title, description, blocks, lesson_ids, cover, outcome_ids, and/or status'
      );
    }

    let title: string | undefined;
    if (hasTitle) {
      if (typeof record.title !== 'string' || !record.title.trim()) {
        return errorResponse(400, 'validation_error', 'title must be a non-empty string');
      }
      title = record.title.trim();
    }

    let description: string | undefined;
    if (hasDescription) {
      if (typeof record.description !== 'string') {
        return errorResponse(400, 'validation_error', 'description must be a string');
      }
      description = record.description;
    }

    let blocks: Block[] | undefined;
    if (hasBlocks) {
      if (!Array.isArray(record.blocks)) {
        return errorResponse(400, 'validation_error', 'blocks are invalid');
      }
      const parsedBlocks: Block[] = [];
      for (const block of record.blocks) {
        const parsed = BlockSchema.safeParse(block);
        if (!parsed.success) {
          return errorResponse(400, 'validation_error', 'blocks are invalid');
        }
        parsedBlocks.push(parsed.data);
      }
      blocks = parsedBlocks;
    }

    let lesson_ids: string[] | undefined;
    if (hasLessonIds) {
      if (!Array.isArray(record.lesson_ids) || record.lesson_ids.some((id) => typeof id !== 'string' || !id)) {
        return errorResponse(400, 'validation_error', 'lesson_ids are invalid');
      }
      lesson_ids = record.lesson_ids as string[];
    }

    let cover: Cover | null | undefined;
    if (hasCover) {
      const coverParsed = CoverPatchSchema.safeParse(record.cover);
      if (!coverParsed.success) {
        return errorResponse(400, 'validation_error', 'cover is invalid');
      }
      cover = coverParsed.data;
    }

    let outcome_ids: string[] | undefined;
    if (hasOutcomeIds) {
      if (
        !Array.isArray(record.outcome_ids) ||
        record.outcome_ids.some((id) => typeof id !== 'string' || !id) ||
        record.outcome_ids.length > 24
      ) {
        return errorResponse(400, 'validation_error', 'outcome_ids are invalid');
      }
      outcome_ids = record.outcome_ids as string[];
    }

    const rawUnit = store.getJSON(unitKey(unitId));
    if (!rawUnit) return notFoundResponse('Unit not found');
    const unitParsed = UnitSchema.safeParse(rawUnit);
    if (!unitParsed.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    const nowIso = new Date().toISOString();
    let merged: Record<string, unknown> = {
      ...unitParsed.data,
      updated_at: nowIso
    };
    if (title !== undefined) merged.title = title;
    if (description !== undefined) merged.description = description;
    if (blocks !== undefined) merged.blocks = blocks;
    if (lesson_ids !== undefined) merged.lesson_ids = lesson_ids;
    if (cover !== undefined) {
      if (cover === null) {
        delete merged.cover;
      } else {
        merged.cover = cover;
      }
    }
    if (outcome_ids !== undefined) merged.outcome_ids = outcome_ids;

    if (hasStatus) {
      try {
        merged = applyStatusTransition(
          merged as Unit,
          statusFields.status!,
          nowIso,
          statusFields.trash_reason
        ) as Record<string, unknown>;
        merged.updated_at = nowIso;
      } catch (err) {
        return mapLifecycleError(err);
      }
    }

    const validated = UnitSchema.safeParse(merged);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    store.setJSON(unitKey(unitId), validated.data);

    let warning: string | undefined;
    if (unitContentChanged(unitParsed.data, validated.data)) {
      const checkpointed = await tryWriteCheckpoint(createMockJsonStore(store), {
        kind: 'unit',
        parentId: unitId,
        snapshot: validated.data,
        reason: 'save',
        now: nowIso
      });
      if (!checkpointed.ok) warning = CHECKPOINT_AFTER_SAVE_WARNING;
    }

    return okResponse(200, validated.data, undefined, warning ? { warning } : undefined);
  }

  function parseRevisionParam(raw: string | undefined): number | null {
    if (!raw) return null;
    const revision = Number(raw);
    if (!Number.isInteger(revision) || revision < 1) return null;
    return revision;
  }

  async function handleVersionCollection(
    cookie: string | null | undefined,
    kind: VersionKind,
    parentId: string,
    method: string,
    body: unknown
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    if (method !== 'GET' && method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Method not allowed');
    }

    const jsonStore = createMockJsonStore(store);

    if (method === 'GET') {
      const index = await listVersionIndex(jsonStore, kind, parentId);
      return okResponse(200, index);
    }

    let label: string | undefined;
    if (body && typeof body === 'object' && typeof (body as { label?: unknown }).label === 'string') {
      const trimmed = (body as { label: string }).label.trim();
      if (trimmed) label = trimmed;
    }

    const live = store.getJSON(liveKeyForKind(kind, parentId));
    if (!live) return notFoundResponse(parentNotFoundMessage(kind));

    try {
      const record = await writeCheckpoint(jsonStore, {
        kind,
        parentId,
        snapshot: liveSnapshotForKind(kind, live),
        reason: 'manual_checkpoint',
        label
      });
      return okResponse(200, record);
    } catch (err) {
      console.error('manual writeCheckpoint failed', err);
      return errorResponse(
        500,
        'checkpoint_failed',
        'Version history checkpoint failed. The live document was not modified.'
      );
    }
  }

  async function handleVersionItem(
    cookie: string | null | undefined,
    kind: VersionKind,
    parentId: string,
    revisionRaw: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const revision = parseRevisionParam(revisionRaw);
    if (revision === null) return notFoundResponse('Version not found');

    const record = await getVersion(createMockJsonStore(store), kind, parentId, revision);
    if (!record) return notFoundResponse('Version not found');
    return okResponse(200, record);
  }

  async function handleVersionRestore(
    cookie: string | null | undefined,
    kind: VersionKind,
    parentId: string,
    revisionRaw: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const revision = parseRevisionParam(revisionRaw);
    if (revision === null) return notFoundResponse('Version not found');

    try {
      const live = await restoreVersion(createMockJsonStore(store), {
        kind,
        parentId,
        revision
      });
      return okResponse(200, live);
    } catch (err) {
      return mapVersionStoreError(err);
    }
  }

  function handlePatchScopeSequence(
    cookie: string | null | undefined,
    scopeId: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasTimeline = record.timeline_items !== undefined;
    const hasOutcomes = record.outcome_ids !== undefined;
    if (!hasTimeline && !hasOutcomes) {
      return errorResponse(400, 'validation_error', 'Provide timeline_items and/or outcome_ids');
    }

    const rawScope = store.getJSON(scopeSequenceKey(scopeId));
    if (!rawScope) return notFoundResponse('Scope sequence not found');
    const scopeParsed = ScopeSequenceSchema.safeParse(rawScope);
    if (!scopeParsed.success) {
      return errorResponse(400, 'validation_error', 'Scope sequence data is invalid');
    }

    let timeline_items = scopeParsed.data.timeline_items;
    if (hasTimeline) {
    if (!Array.isArray(record.timeline_items)) {
      return errorResponse(400, 'validation_error', 'timeline_items must be an array');
    }

    const weekCount = scopeParsed.data.week_count;
    timeline_items = [];
    const seenUnitIds = new Set<string>();

    for (const raw of record.timeline_items) {
      const itemParsed = TimelineItemSchema.safeParse(raw);
      if (!itemParsed.success) {
        return errorResponse(400, 'validation_error', 'timeline_items contains an invalid item');
      }

      const item = itemParsed.data;
      if (item.start_week < 1 || item.end_week > weekCount) {
        return errorResponse(
          400,
          'validation_error',
          `timeline item weeks must be between 1 and ${weekCount}`
        );
      }

      if (item.kind === 'unit') {
        if (seenUnitIds.has(item.unit_id)) {
          return errorResponse(
            400,
            'validation_error',
            'unit_id must be unique among unit timeline items'
          );
        }
        const rawUnit = store.getJSON(unitKey(item.unit_id));
        const unitParsed = UnitSchema.safeParse(rawUnit);
        if (!unitParsed.success) {
          return errorResponse(
            400,
            'validation_error',
            `Unknown unit_id: ${item.unit_id}`
          );
        }
        if (unitParsed.data.subject_id !== scopeParsed.data.subject_id) {
          return errorResponse(
            400,
            'validation_error',
            'unit_id must belong to the scope subject'
          );
        }
        seenUnitIds.add(item.unit_id);
      }

      timeline_items.push(item);
    }
    }

    let outcome_ids = scopeParsed.data.outcome_ids;
    if (hasOutcomes) {
      if (
        !Array.isArray(record.outcome_ids) ||
        record.outcome_ids.some((id) => typeof id !== 'string' || !id) ||
        record.outcome_ids.length > 24
      ) {
        return errorResponse(400, 'validation_error', 'outcome_ids are invalid');
      }
      outcome_ids = record.outcome_ids as string[];
    }

    const nowIso = new Date().toISOString();
    const merged = {
      ...scopeParsed.data,
      timeline_items,
      ...(outcome_ids !== undefined ? { outcome_ids } : {}),
      updated_at: nowIso
    };

    const validated = ScopeSequenceSchema.safeParse(merged);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Scope sequence data is invalid');
    }

    store.setJSON(scopeSequenceKey(scopeId), validated.data);
    return okResponse(200, validated.data);
  }

  function handlePostOutcome(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    const subjectId = typeof record.subject_id === 'string' ? record.subject_id.trim() : '';
    const code = typeof record.code === 'string' ? record.code.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    const group =
      typeof record.group === 'string' && record.group.trim() ? record.group.trim() : 'Custom';
    if (!subjectId || !code || !title || !description) {
      return errorResponse(
        400,
        'validation_error',
        'subject_id, code, title, and description are required'
      );
    }
    const rawSubject = store.getJSON(subjectKey(subjectId));
    const subjectParsed = SubjectSchema.safeParse(rawSubject);
    if (!subjectParsed.success) return notFoundResponse('Subject not found');
    const duplicate = store.listKeys('outcomes/').some((key) => {
      const parsed = CurriculumOutcomeSchema.safeParse(store.getJSON(key));
      return (
        parsed.success &&
        parsed.data.subject_id === subjectId &&
        parsed.data.code.toLowerCase() === code.toLowerCase()
      );
    });
    if (duplicate) {
      return errorResponse(409, 'conflict', 'An outcome with this code already exists for the subject');
    }
    const now = new Date().toISOString();
    const candidate = {
      id: newId('outcome'),
      type: 'curriculum_outcome' as const,
      source: 'custom' as const,
      title,
      slug: slugify(code),
      status: 'active' as const,
      created_at: now,
      updated_at: now,
      schema_version: 1 as const,
      code,
      description,
      group,
      subject_id: subjectId
    };
    const validated = CurriculumOutcomeSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Outcome data is invalid');
    }
    const subject = {
      ...subjectParsed.data,
      outcome_ids: [...subjectParsed.data.outcome_ids, validated.data.id],
      updated_at: now
    };
    const subjectOut = SubjectSchema.safeParse(subject);
    if (!subjectOut.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }
    store.setJSON(outcomeKey(validated.data.id), validated.data);
    store.setJSON(subjectKey(subjectId), subjectOut.data);
    return okResponse(201, validated.data);
  }

  function handlePostClass(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const code = typeof record.code === 'string' ? record.code.trim() : '';
    const year_id = typeof record.year_id === 'string' ? record.year_id : '';
    const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
    const academic_year =
      typeof record.academic_year === 'number' && Number.isInteger(record.academic_year)
        ? record.academic_year
        : NaN;

    if (!title || !code || !year_id || !subject_id || !Number.isFinite(academic_year)) {
      return errorResponse(
        400,
        'validation_error',
        'title, code, academic_year, year_id, and subject_id are required'
      );
    }

    if (!store.getJSON(yearKey(year_id))) {
      return notFoundResponse('Year not found');
    }
    if (!store.getJSON(subjectKey(subject_id))) {
      return notFoundResponse('Subject not found');
    }

    const timestamp = nowIso();
    const id = newId('class');
    const candidate: Class = {
      id,
      type: 'class',
      title,
      slug: slugify(title),
      code,
      academic_year,
      year_id,
      subject_id,
      active_unit_ids: [],
      homepage: { announcements: [], resources: [], custom: [] },
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = ClassSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid', validated.error.flatten());
    }

    const rawSubject = store.getJSON(subjectKey(subject_id));
    const subjectParsed = rawSubject ? SubjectSchema.safeParse(rawSubject) : null;
    if (subjectParsed?.success) {
      const classIds = subjectParsed.data.class_ids.includes(id)
        ? subjectParsed.data.class_ids
        : [...subjectParsed.data.class_ids, id];
      const updatedSubject = SubjectSchema.safeParse({
        ...subjectParsed.data,
        class_ids: classIds,
        updated_at: timestamp
      });
      if (updatedSubject.success) {
        store.setJSON(subjectKey(subject_id), updatedSubject.data);
      }
    }

    const rawYear = store.getJSON(yearKey(year_id));
    const yearParsed = rawYear ? YearSchema.safeParse(rawYear) : null;
    if (yearParsed?.success && !yearParsed.data.subject_ids.includes(subject_id)) {
      const updatedYear = YearSchema.safeParse({
        ...yearParsed.data,
        subject_ids: [...yearParsed.data.subject_ids, subject_id],
        updated_at: timestamp
      });
      if (updatedYear.success) {
        store.setJSON(yearKey(year_id), updatedYear.data);
      }
    }

    store.setJSON(classKey(id), validated.data);
    seedIds.classes.push(id);
    return okResponse(201, validated.data);
  }

  function handlePostUnit(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const year_id = typeof record.year_id === 'string' ? record.year_id : '';
    const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';

    if (!title || !year_id || !subject_id) {
      return errorResponse(400, 'validation_error', 'title, year_id, and subject_id are required');
    }

    if (!store.getJSON(yearKey(year_id))) {
      return notFoundResponse('Year not found');
    }

    const rawSubject = store.getJSON(subjectKey(subject_id));
    if (!rawSubject) return notFoundResponse('Subject not found');

    const timestamp = nowIso();
    const id = newId('unit');
    const candidate: Unit = {
      id,
      type: 'unit',
      title,
      slug: slugify(title),
      year_id,
      subject_id,
      lesson_ids: [],
      description: typeof record.description === 'string' ? record.description : undefined,
      blocks: Array.isArray(record.blocks) ? (record.blocks as Unit['blocks']) : [],
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = UnitSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid', validated.error.flatten());
    }

    const subjectParsed = SubjectSchema.safeParse(rawSubject);
    if (!subjectParsed.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    const updatedSubject = SubjectSchema.safeParse({
      ...subjectParsed.data,
      unit_ids: [...subjectParsed.data.unit_ids, id],
      updated_at: timestamp
    });
    if (!updatedSubject.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    store.setJSON(unitKey(id), validated.data);
    store.setJSON(subjectKey(subject_id), updatedSubject.data);
    seedIds.units.push(id);
    return okResponse(201, validated.data);
  }

  function handlePostLesson(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const unit_id = typeof record.unit_id === 'string' ? record.unit_id : '';
    let pedagogical_mode: PedagogicalMode = DEFAULT_PEDAGOGICAL_MODE;
    if (record.pedagogical_mode !== undefined) {
      if (!isPedagogicalMode(record.pedagogical_mode)) {
        return errorResponse(400, 'validation_error', 'pedagogical_mode is invalid');
      }
      pedagogical_mode = record.pedagogical_mode;
    }

    if (!title || !unit_id) {
      return errorResponse(400, 'validation_error', 'title and unit_id are required');
    }

    const rawUnit = store.getJSON(unitKey(unit_id));
    if (!rawUnit) return notFoundResponse('Unit not found');
    const unitParsed = UnitSchema.safeParse(rawUnit);
    if (!unitParsed.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    let maxSequence = 0;
    for (const lessonId of unitParsed.data.lesson_ids) {
      const lesson = store.getJSON<Lesson>(draftLessonKey(lessonId));
      if (lesson && typeof lesson.sequence === 'number' && lesson.sequence > maxSequence) {
        maxSequence = lesson.sequence;
      }
    }

    const timestamp = nowIso();
    const id = newId('lesson');
    const candidate: Lesson = {
      id,
      type: 'lesson',
      title,
      slug: slugify(title),
      unit_id,
      sequence: maxSequence + 1,
      blocks: [],
      pedagogical_mode,
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = LessonSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Lesson data is invalid', validated.error.flatten());
    }

    const updatedUnit = UnitSchema.safeParse({
      ...unitParsed.data,
      lesson_ids: [...unitParsed.data.lesson_ids, id],
      updated_at: timestamp
    });
    if (!updatedUnit.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    store.setJSON(draftLessonKey(id), validated.data);
    store.setJSON(unitKey(unit_id), updatedUnit.data);
    seedIds.lessons.push(id);
    return okResponse(201, validated.data);
  }

  function handlePostSubject(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) {
      return errorResponse(400, 'validation_error', 'title is required');
    }

    const duplicate = seedIds.subjects.some((existingId) => {
      const existing = store.getJSON(subjectKey(existingId)) as { title?: string } | null;
      return existing?.title?.toLowerCase() === title.toLowerCase();
    });
    if (duplicate) {
      return errorResponse(409, 'conflict', 'A subject with this title already exists');
    }

    const timestamp = nowIso();
    const candidate = {
      id: newId('subject'),
      type: 'subject' as const,
      title,
      display_title: title,
      slug: slugify(title),
      unit_ids: [] as string[],
      outcome_ids: [] as string[],
      class_ids: [] as string[],
      status: 'active' as const,
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1 as const
    };

    const validated = SubjectSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid', validated.error.flatten());
    }

    store.setJSON(subjectKey(validated.data.id), validated.data);
    seedIds.subjects.push(validated.data.id);
    return okResponse(201, validated.data);
  }

  function handlePostScopeSequence(
    cookie: string | null | undefined,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
    const academic_year =
      typeof record.academic_year === 'number' && Number.isInteger(record.academic_year)
        ? record.academic_year
        : NaN;

    if (!title || !subject_id || !Number.isFinite(academic_year)) {
      return errorResponse(
        400,
        'validation_error',
        'title, subject_id, and academic_year are required'
      );
    }

    const rawSubject = store.getJSON(subjectKey(subject_id));
    if (!rawSubject) return notFoundResponse('Subject not found');
    const subjectParsed = SubjectSchema.safeParse(rawSubject);
    if (!subjectParsed.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    const week_count = 40;
    const timestamp = nowIso();
    const id = newId('scope');
    const candidate: ScopeSequence = {
      id,
      type: 'scope_sequence',
      title,
      slug: slugify(title),
      subject_id,
      academic_year,
      week_count,
      terms: defaultScopeTerms(week_count, academic_year),
      timeline_items: [],
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = ScopeSequenceSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Scope sequence data is invalid',
        validated.error.flatten()
      );
    }

    const updatedSubject = SubjectSchema.safeParse({
      ...subjectParsed.data,
      scope_id: id,
      updated_at: timestamp
    });
    if (!updatedSubject.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    store.setJSON(scopeSequenceKey(id), validated.data);
    store.setJSON(subjectKey(subject_id), updatedSubject.data);
    seedIds.scope_sequences.push(id);
    return okResponse(201, validated.data);
  }

  function listCompositionSummaries(): CompositionSummary[] {
    return store
      .listKeys('templates/compositions/')
      .map((key) => store.getJSON<CompositionTemplate>(key))
      .filter((entry): entry is CompositionTemplate => {
        if (!entry) return false;
        const parsed = CompositionTemplateSchema.safeParse(entry);
        return parsed.success && parsed.data.status === 'active';
      })
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        updated_at: entry.updated_at
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function handleGetCompositions(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, { compositions: listCompositionSummaries() });
  }

  function handleGetSearch(cookie: string | null | undefined, q: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const lessons = store
      .listKeys('lessons/')
      .map((key) => store.getJSON<Lesson>(key))
      .filter((entry): entry is Lesson => entry !== null)
      .map((lesson) => ({ id: lesson.id, blocks: lesson.blocks ?? [] }));

    const units = store
      .listKeys('units/')
      .map((key) => store.getJSON<Unit & { blocks?: Block[] }>(key))
      .filter((entry): entry is Unit & { blocks?: Block[] } => entry !== null)
      .map((unit) => ({ id: unit.id, blocks: unit.blocks ?? [] }));

    const compositions = store
      .listKeys('templates/compositions/')
      .map((key) => store.getJSON<CompositionTemplate>(key))
      .filter((entry): entry is CompositionTemplate => {
        if (!entry) return false;
        const parsed = CompositionTemplateSchema.safeParse(entry);
        return parsed.success && parsed.data.status === 'active';
      })
      .map((composition) => ({ id: composition.id, blocks: [composition.root] }));

    return okResponse(200, {
      hits: runContentSearch(q, { lessons, units, compositions })
    });
  }

  function handlePostComposition(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) {
      return errorResponse(400, 'validation_error', 'title is required');
    }

    const rootParsed = SectionBlockSchema.safeParse(record.root);
    if (!rootParsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'root must be a section block',
        rootParsed.error.flatten()
      );
    }

    const timestamp = nowIso();
    const id = newId('composition');
    const candidate: CompositionTemplate = {
      id,
      type: 'composition_template',
      title,
      slug: slugify(title),
      status: 'active',
      root: structuredClone(rootParsed.data),
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = CompositionTemplateSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Composition data is invalid',
        validated.error.flatten()
      );
    }

    store.setJSON(compositionKey(id), validated.data);
    return okResponse(201, validated.data);
  }

  function handleGetComposition(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const raw = store.getJSON<CompositionTemplate>(compositionKey(id));
    if (!raw) return notFoundResponse('Composition not found');

    const parsed = CompositionTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(500, 'invalid_data', 'Stored composition is invalid');
    }

    return okResponse(200, parsed.data);
  }

  function handlePatchComposition(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const raw = store.getJSON<CompositionTemplate>(compositionKey(id));
    if (!raw) return notFoundResponse('Composition not found');

    const existing = CompositionTemplateSchema.safeParse(raw);
    if (!existing.success) {
      return errorResponse(500, 'invalid_data', 'Stored composition is invalid');
    }

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasTitle = typeof record.title === 'string';
    const hasRoot = record.root !== undefined;
    const statusFields = parseStatusPatch(body);
    if (!statusFields.ok) return errorResponse(400, statusFields.code, statusFields.message);
    const hasStatus = statusFields.hasStatus;
    if (!hasTitle && !hasRoot && !hasStatus) {
      return errorResponse(400, 'validation_error', 'At least one of title, root, or status is required');
    }

    const timestamp = nowIso();
    let next = { ...existing.data };

    if (hasTitle) {
      const title = (record.title as string).trim();
      if (!title) return errorResponse(400, 'validation_error', 'title must not be empty');
      next.title = title;
      next.slug = slugify(title);
    }

    if (hasRoot) {
      const rootParsed = SectionBlockSchema.safeParse(record.root);
      if (!rootParsed.success) {
        return errorResponse(
          400,
          'validation_error',
          'root must be a section block',
          rootParsed.error.flatten()
        );
      }
      if (rootParsed.data.content.link) {
        return errorResponse(
          400,
          'validation_error',
          'Composition root must not be a linked section'
        );
      }
      next.root = structuredClone(rootParsed.data);
    }

    if (hasStatus) {
      try {
        next = applyStatusTransition(next, statusFields.status!, timestamp, statusFields.trash_reason);
      } catch (err) {
        return mapLifecycleError(err);
      }
    }

    next.updated_at = timestamp;

    const validated = CompositionTemplateSchema.safeParse(next);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Composition data is invalid',
        validated.error.flatten()
      );
    }

    store.setJSON(compositionKey(id), validated.data);
    return okResponse(200, validated.data);
  }

  function listLessonTemplateSummaries(): LessonTemplateSummary[] {
    return store
      .listKeys('templates/lessons/')
      .map((key) => store.getJSON<LessonTemplate>(key))
      .filter((entry): entry is LessonTemplate => {
        if (!entry) return false;
        const parsed = LessonTemplateSchema.safeParse(entry);
        return parsed.success && parsed.data.status === 'active';
      })
      .map((entry) => ({ id: entry.id, title: entry.title, updated_at: entry.updated_at }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function listUnitTemplateSummaries(): UnitTemplateSummary[] {
    return store
      .listKeys('templates/units/')
      .map((key) => store.getJSON<UnitTemplate>(key))
      .filter((entry): entry is UnitTemplate => {
        if (!entry) return false;
        const parsed = UnitTemplateSchema.safeParse(entry);
        return parsed.success && parsed.data.status === 'active';
      })
      .map((entry) => ({ id: entry.id, title: entry.title, updated_at: entry.updated_at }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function handleGetLessonTemplates(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, { templates: listLessonTemplateSummaries() });
  }

  function handlePostLessonTemplate(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const blocksParsed = BlockSchema.array().safeParse(record.blocks ?? []);
    if (!title || !blocksParsed.success) {
      return errorResponse(400, 'validation_error', 'title and blocks[] are required');
    }
    const timestamp = nowIso();
    const id = newId('lesson_template');
    const candidate: LessonTemplate = {
      id,
      type: 'lesson_template',
      title,
      slug: slugify(title),
      status: 'active',
      blocks: blocksParsed.data,
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };
    const validated = LessonTemplateSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Lesson template is invalid', validated.error.flatten());
    }
    store.setJSON(lessonTemplateKey(id), validated.data);
    return okResponse(201, validated.data);
  }

  function handleGetLessonTemplate(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const raw = store.getJSON<LessonTemplate>(lessonTemplateKey(id));
    if (!raw) return notFoundResponse('Lesson template not found');
    const parsed = LessonTemplateSchema.safeParse(raw);
    if (!parsed.success) return errorResponse(500, 'invalid_data', 'Stored lesson template is invalid');
    return okResponse(200, parsed.data);
  }

  function handlePatchLessonTemplate(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const raw = store.getJSON<LessonTemplate>(lessonTemplateKey(id));
    if (!raw) return notFoundResponse('Lesson template not found');
    const existing = LessonTemplateSchema.safeParse(raw);
    if (!existing.success) return errorResponse(500, 'invalid_data', 'Stored lesson template is invalid');
    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    let next = { ...existing.data };
    if (typeof record.title === 'string') {
      const title = record.title.trim();
      if (!title) return errorResponse(400, 'validation_error', 'title must not be empty');
      next.title = title;
      next.slug = slugify(title);
    }
    const timestamp = nowIso();
    if (record.status !== undefined) {
      const statusFields = parseStatusPatch(body);
      if (!statusFields.ok) return errorResponse(400, statusFields.code, statusFields.message);
      try {
        next = applyStatusTransition(next, statusFields.status!, timestamp, statusFields.trash_reason);
      } catch (err) {
        return mapLifecycleError(err);
      }
    }
    next.updated_at = timestamp;
    const validated = LessonTemplateSchema.safeParse(next);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Lesson template is invalid', validated.error.flatten());
    }
    store.setJSON(lessonTemplateKey(id), validated.data);
    return okResponse(200, validated.data);
  }

  function handleGetUnitTemplates(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, { templates: listUnitTemplateSummaries() });
  }

  function handlePostUnitTemplate(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) return errorResponse(400, 'validation_error', 'title is required');
    const blocksParsed = BlockSchema.array().optional().safeParse(record.blocks);
    if (!blocksParsed.success) {
      return errorResponse(400, 'validation_error', 'blocks must be an array when provided');
    }
    const timestamp = nowIso();
    const id = newId('unit_template');
    const candidate: UnitTemplate = {
      id,
      type: 'unit_template',
      title,
      slug: slugify(title),
      status: 'active',
      description: typeof record.description === 'string' ? record.description : undefined,
      blocks: blocksParsed.data,
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };
    const validated = UnitTemplateSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Unit template is invalid', validated.error.flatten());
    }
    store.setJSON(unitTemplateKey(id), validated.data);
    return okResponse(201, validated.data);
  }

  function handleGetUnitTemplate(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const raw = store.getJSON<UnitTemplate>(unitTemplateKey(id));
    if (!raw) return notFoundResponse('Unit template not found');
    const parsed = UnitTemplateSchema.safeParse(raw);
    if (!parsed.success) return errorResponse(500, 'invalid_data', 'Stored unit template is invalid');
    return okResponse(200, parsed.data);
  }

  function handlePatchUnitTemplate(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    const raw = store.getJSON<UnitTemplate>(unitTemplateKey(id));
    if (!raw) return notFoundResponse('Unit template not found');
    const existing = UnitTemplateSchema.safeParse(raw);
    if (!existing.success) return errorResponse(500, 'invalid_data', 'Stored unit template is invalid');
    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    let next = { ...existing.data };
    if (typeof record.title === 'string') {
      const title = record.title.trim();
      if (!title) return errorResponse(400, 'validation_error', 'title must not be empty');
      next.title = title;
      next.slug = slugify(title);
    }
    const timestamp = nowIso();
    if (record.status !== undefined) {
      const statusFields = parseStatusPatch(body);
      if (!statusFields.ok) return errorResponse(400, statusFields.code, statusFields.message);
      try {
        next = applyStatusTransition(next, statusFields.status!, timestamp, statusFields.trash_reason);
      } catch (err) {
        return mapLifecycleError(err);
      }
    }
    next.updated_at = timestamp;
    const validated = UnitTemplateSchema.safeParse(next);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Unit template is invalid', validated.error.flatten());
    }
    store.setJSON(unitTemplateKey(id), validated.data);
    return okResponse(200, validated.data);
  }

  function optionalNonEmptyString(
    record: Record<string, unknown>,
    key: string
  ): string | undefined | { error: string } {
    if (record[key] === undefined) return undefined;
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
      return { error: `${key} must be a non-empty string when provided` };
    }
    return (record[key] as string).trim();
  }

  function handlePostMedia(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) {
      return errorResponse(400, 'validation_error', 'title is required');
    }

    const provider = typeof record.provider === 'string' ? record.provider : '';
    if (provider !== 'external' && provider !== 'google_drive') {
      return errorResponse(
        400,
        'validation_error',
        'provider must be external or google_drive (direct uploads use /api/media/upload)'
      );
    }

    const mediaTypeParsed = MediaTypeSchema.safeParse(record.media_type);
    if (!mediaTypeParsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'media_type is required and must be a valid media type'
      );
    }

    const optionals: Partial<
      Pick<
        Media,
        | 'preview_url'
        | 'download_url'
        | 'thumbnail_url'
        | 'provider_file_id'
        | 'mime_type'
        | 'file_name'
      >
    > = {};
    for (const key of [
      'preview_url',
      'download_url',
      'thumbnail_url',
      'provider_file_id',
      'mime_type',
      'file_name'
    ] as const) {
      const value = optionalNonEmptyString(record, key);
      if (value && typeof value === 'object' && 'error' in value) {
        return errorResponse(400, 'validation_error', value.error);
      }
      if (typeof value === 'string') {
        optionals[key] = value;
      }
    }

    let sharing: Media['sharing'];
    if (record.sharing !== undefined) {
      const sharingParsed = MediaSharingSchema.safeParse(record.sharing);
      if (!sharingParsed.success) {
        return errorResponse(400, 'validation_error', 'sharing is invalid');
      }
      sharing = sharingParsed.data;
    }

    const timestamp = nowIso();
    const id = newId('media');
    const candidate: Media = {
      id,
      type: 'media',
      title,
      slug: slugify(title),
      status: 'active',
      provider,
      media_type: mediaTypeParsed.data,
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1,
      ...optionals,
      ...(sharing !== undefined ? { sharing } : {})
    };

    const validated = MediaSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Media data is invalid',
        validated.error.flatten()
      );
    }

    store.setJSON(mediaKey(id), validated.data);
    seedIds.media.push(id);
    return okResponse(201, validated.data);
  }

  function handleGetMedia(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const raw = store.getJSON<Media>(mediaKey(id));
    if (!raw) return notFoundResponse('Media not found');

    const parsed = MediaSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(500, 'invalid_data', 'Stored media is invalid');
    }

    return okResponse(200, parsed.data);
  }

  function handlePatchMedia(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const raw = store.getJSON(mediaKey(id));
    if (!raw) return notFoundResponse('Media not found');

    const existing = MediaSchema.safeParse(raw);
    if (!existing.success) {
      return errorResponse(500, 'invalid_data', 'Stored media is invalid');
    }

    const record = body as Record<string, unknown>;
    const patch: {
      title?: string;
      status?: Media['status'];
      preview_url?: string;
      download_url?: string;
      thumbnail_url?: string;
      provider_file_id?: string;
      sharing?: Media['sharing'];
      mime_type?: string;
      file_name?: string;
    } = {};

    if (record.title !== undefined) {
      if (typeof record.title !== 'string' || !record.title.trim()) {
        return errorResponse(400, 'validation_error', 'title must be a non-empty string');
      }
      patch.title = record.title.trim();
    }

    if (record.status !== undefined) {
      const statusParsed = StatusSchema.safeParse(record.status);
      if (!statusParsed.success) {
        return errorResponse(
          400,
          'validation_error',
          'status must be active, archived, or trashed'
        );
      }
      patch.status = statusParsed.data;
    }

    for (const key of [
      'preview_url',
      'download_url',
      'thumbnail_url',
      'provider_file_id',
      'mime_type',
      'file_name'
    ] as const) {
      const value = optionalNonEmptyString(record, key);
      if (value && typeof value === 'object' && 'error' in value) {
        return errorResponse(400, 'validation_error', value.error);
      }
      if (typeof value === 'string') {
        patch[key] = value;
      }
    }

    if (record.sharing !== undefined) {
      const sharingParsed = MediaSharingSchema.safeParse(record.sharing);
      if (!sharingParsed.success) {
        return errorResponse(400, 'validation_error', 'sharing is invalid');
      }
      patch.sharing = sharingParsed.data;
    }

    if (
      patch.title === undefined &&
      patch.status === undefined &&
      patch.preview_url === undefined &&
      patch.download_url === undefined &&
      patch.thumbnail_url === undefined &&
      patch.provider_file_id === undefined &&
      patch.sharing === undefined &&
      patch.mime_type === undefined &&
      patch.file_name === undefined
    ) {
      return errorResponse(
        400,
        'validation_error',
        'Provide title, status, preview_url, download_url, thumbnail_url, provider_file_id, sharing, mime_type, and/or file_name'
      );
    }

    const timestamp = nowIso();
    let merged: Media = {
      ...existing.data,
      updated_at: timestamp
    };

    if (patch.title !== undefined) {
      merged.title = patch.title;
      merged.slug = slugify(patch.title);
    }
    if (patch.status !== undefined) {
      try {
        merged = applyStatusTransition(
          merged,
          patch.status,
          timestamp,
          typeof record.trash_reason === 'string' ? record.trash_reason.trim() || undefined : undefined
        );
        merged.updated_at = timestamp;
      } catch (err) {
        return mapLifecycleError(err);
      }
    }
    if (patch.preview_url !== undefined) merged.preview_url = patch.preview_url;
    if (patch.download_url !== undefined) merged.download_url = patch.download_url;
    if (patch.thumbnail_url !== undefined) merged.thumbnail_url = patch.thumbnail_url;
    if (patch.provider_file_id !== undefined) merged.provider_file_id = patch.provider_file_id;
    if (patch.sharing !== undefined) merged.sharing = patch.sharing;
    if (patch.mime_type !== undefined) merged.mime_type = patch.mime_type;
    if (patch.file_name !== undefined) merged.file_name = patch.file_name;

    const validated = MediaSchema.safeParse(merged);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Media data is invalid',
        validated.error.flatten()
      );
    }

    store.setJSON(mediaKey(id), validated.data);
    return okResponse(200, validated.data);
  }

  async function handlePostMediaUpload(
    cookie: string | null | undefined,
    body: unknown
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (!(body instanceof FormData)) {
      return errorResponse(400, 'validation_error', 'Request body must be multipart form data');
    }

    const fileEntry = body.get('file');
    if (
      fileEntry === null ||
      typeof fileEntry === 'string' ||
      typeof (fileEntry as Blob).arrayBuffer !== 'function'
    ) {
      return errorResponse(400, 'validation_error', 'file is required');
    }

    const file = fileEntry as Blob & { name?: string };
    const mime = (file.type || '').trim();
    if (!mime || !ALLOWED_MEDIA_MIME.has(mime)) {
      return errorResponse(400, 'validation_error', 'File MIME type is not allowed');
    }

    if (file.size > MAX_MEDIA_BYTES) {
      return errorResponse(
        400,
        'validation_error',
        `File exceeds maximum size of ${MAX_MEDIA_BYTES} bytes`
      );
    }

    const titleField = body.get('title');
    const titleFromForm =
      typeof titleField === 'string' && titleField.trim() ? titleField.trim() : '';
    const fileName = typeof file.name === 'string' ? file.name : '';
    const title = titleFromForm || fileName.trim() || 'Untitled';

    const providerFileIdField = body.get('provider_file_id');
    let provider_file_id: string | undefined;
    if (providerFileIdField !== null && providerFileIdField !== undefined) {
      if (typeof providerFileIdField !== 'string' || !providerFileIdField.trim()) {
        return errorResponse(
          400,
          'validation_error',
          'provider_file_id must be a non-empty string when provided'
        );
      }
      provider_file_id = providerFileIdField.trim();
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = newId('media');
    const fileUrl = `http://localhost/api/media/${id}/file`;
    const timestamp = nowIso();

    const candidate: Media = {
      id,
      type: 'media',
      title,
      slug: slugify(title),
      status: 'active',
      provider: 'direct',
      media_type: mediaTypeFromMime(mime),
      mime_type: mime,
      ...(fileName ? { file_name: fileName } : {}),
      preview_url: fileUrl,
      download_url: fileUrl,
      sharing: 'public_link',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1,
      ...(provider_file_id !== undefined ? { provider_file_id } : {})
    };

    const validated = MediaSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Media data is invalid',
        validated.error.flatten()
      );
    }

    store.setBinary(mediaFileKey(id), bytes, mime);
    store.setJSON(mediaKey(id), validated.data);
    seedIds.media.push(id);
    return okResponse(201, validated.data);
  }

  function handleGetMediaFile(id: string): MockResponse {
    const raw = store.getJSON(mediaKey(id));
    if (!raw) return notFoundResponse('Media file not found');

    const parsed = MediaSchema.safeParse(raw);
    if (!parsed.success || parsed.data.status !== 'active') {
      return notFoundResponse('Media file not found');
    }

    const binary = store.getBinary(mediaFileKey(id));
    if (!binary) return notFoundResponse('Media file not found');

    const contentType = parsed.data.mime_type || binary.contentType || 'application/octet-stream';
    return binaryResponse(200, binary.bytes, contentType, {
      'cache-control': 'public, max-age=86400'
    });
  }

  const LESSON_ID_RE = /^\/api\/lessons\/([^/]+)$/;
  const LESSON_PUBLISH_RE = /^\/api\/lessons\/([^/]+)\/publish$/;
  const LESSON_VERSION_RESTORE_RE = /^\/api\/lessons\/([^/]+)\/versions\/([^/]+)\/restore$/;
  const LESSON_VERSION_ITEM_RE = /^\/api\/lessons\/([^/]+)\/versions\/([^/]+)$/;
  const LESSON_VERSIONS_RE = /^\/api\/lessons\/([^/]+)\/versions$/;
  const UNIT_ID_RE = /^\/api\/units\/([^/]+)$/;
  const UNIT_VERSION_RESTORE_RE = /^\/api\/units\/([^/]+)\/versions\/([^/]+)\/restore$/;
  const UNIT_VERSION_ITEM_RE = /^\/api\/units\/([^/]+)\/versions\/([^/]+)$/;
  const UNIT_VERSIONS_RE = /^\/api\/units\/([^/]+)\/versions$/;
  const CLASS_VERSION_RESTORE_RE = /^\/api\/classes\/([^/]+)\/versions\/([^/]+)\/restore$/;
  const CLASS_VERSION_ITEM_RE = /^\/api\/classes\/([^/]+)\/versions\/([^/]+)$/;
  const CLASS_VERSIONS_RE = /^\/api\/classes\/([^/]+)\/versions$/;
  const RESTORE_FROM_TRASH_RE =
    /^\/api\/(lessons|units|classes|media|lesson-templates|unit-templates|compositions)\/([^/]+)\/restore-from-trash$/;
  const DEPENDENCIES_RE =
    /^\/api\/(lessons|units|classes|media|lesson-templates|unit-templates|compositions)\/([^/]+)\/dependencies$/;
  const PUBLISHED_LESSON_RE = /^\/api\/published\/lessons\/([^/]+)$/;
  const PUBLISHED_UNIT_RE = /^\/api\/published\/units\/([^/]+)$/;
  const PUBLISHED_CLASS_RE = /^\/api\/published\/classes\/([^/]+)$/;
  const CLASS_PATCH_RE = /^\/api\/classes\/([^/]+)$/;
  const UNIT_PATCH_RE = /^\/api\/units\/([^/]+)$/;
  const SCOPE_SEQUENCE_PATCH_RE = /^\/api\/scope-sequences\/([^/]+)$/;
  const SCHEDULE_UNIT_RE = /^\/api\/classes\/([^/]+)\/schedule-unit$/;
  const SCHEDULED_LESSON_RE = /^\/api\/scheduled-lessons\/([^/]+)$/;
  const COMPOSITION_ID_RE = /^\/api\/compositions\/([^/]+)$/;
  const LESSON_TEMPLATE_ID_RE = /^\/api\/lesson-templates\/([^/]+)$/;
  const UNIT_TEMPLATE_ID_RE = /^\/api\/unit-templates\/([^/]+)$/;
  const MEDIA_FILE_RE = /^\/api\/media\/([^/]+)\/file$/;
  const MEDIA_ID_RE = /^\/api\/media\/([^/]+)$/;
  const AI_JOB_RE = /^\/api\/ai\/jobs\/([^/]+)$/;
  const AI_JOB_RUN_RE = /^\/api\/ai\/jobs\/([^/]+)\/run$/;

  function readJobInbox(): AiJobInbox {
    return store.getJSON<AiJobInbox>(aiJobsInboxKey()) ?? { jobs: [] };
  }

  function writeJobInbox(job: AiJob): void {
    const lesson = store.getJSON<Lesson>(draftLessonKey(job.lesson_id));
    store.setJSON(aiJobsInboxKey(), syncInboxForJob(readJobInbox(), job, lesson?.title ?? 'Lesson'));
  }

  function completeMockJob(job: AiJob): AiJob {
    if (job.status !== 'working') return job;
    const proposal =
      job.agent === 'hammond'
        ? {
            kind: 'review_only' as const,
            summary: 'Mock review: keep the focus tight and one teaching move at a time.'
          }
        : fixtureReplaceLessonProposal();
    const done: AiJob = { ...job, status: 'done', proposal };
    store.setJSON(aiJobKey(job.id), done);
    const existing = store.getJSON<AiTranscriptTurn[]>(aiTranscriptKey(job.lesson_id, job.agent));
    store.setJSON(
      aiTranscriptKey(job.lesson_id, job.agent),
      appendTranscriptTurns(existing, [
        { role: 'user', content: job.message },
        { role: 'assistant', content: 'Proposed a replace_lesson draft.' }
      ])
    );
    writeJobInbox(done);
    return done;
  }

  async function handle(
    method: string,
    pathWithQuery: string,
    cookie: string | null | undefined,
    body: unknown
  ): Promise<MockResponse> {
    const qIndex = pathWithQuery.indexOf('?');
    const path = qIndex >= 0 ? pathWithQuery.slice(0, qIndex) : pathWithQuery;
    const search = qIndex >= 0 ? pathWithQuery.slice(qIndex + 1) : '';
    const query = new URLSearchParams(search);

    if (method === 'POST' && path === '/api/auth') return handleAuth(body);
    if (method === 'GET' && path === '/api/session') return handleSession(cookie);
    if (method === 'POST' && path === '/api/logout') return handleLogout();
    if (method === 'GET' && path === '/api/curriculum') return handleGetCurriculum(cookie);
    if (method === 'GET' && path === '/api/export') return handleGetExport(cookie, query);
    if (method === 'POST' && path === '/api/backup/github') return handlePostGithubBackup(cookie);
    if (method === 'GET' && path === '/api/trash') return handleGetTrash(cookie);
    if (method === 'GET' && path === '/api/search') {
      return handleGetSearch(cookie, query.get('q') ?? '');
    }

    if (method === 'POST' && path === '/api/html-app-ai') {
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'bad_request', 'Invalid JSON body');
      }
      const req = body as {
        lesson_id?: unknown;
        block_id?: unknown;
        messages?: unknown;
      };
      if (
        typeof req.lesson_id !== 'string' ||
        typeof req.block_id !== 'string' ||
        !Array.isArray(req.messages)
      ) {
        return errorResponse(400, 'bad_request', 'lesson_id, block_id, and messages are required');
      }
      return okResponse(200, { text: 'mock-ai-reply' });
    }

    if (method === 'POST' && path === '/api/alchemy-lab') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'invalid_json', 'Request body is not valid JSON');
      }
      const lessonText = (body as { lessonText?: unknown }).lessonText;
      if (typeof lessonText !== 'string' || !lessonText.trim()) {
        return errorResponse(400, 'bad_request', 'Lesson text is required.');
      }
      return okResponse(200, {
        mode: 'local',
        connections: [
          {
            icon: 'Irony',
            summary: 'Inherited duty in a Roman exemplum',
            sourcePageId: 'note_caesar',
            sourcePageTitle: 'Caesar and pietas',
            sourceExcerpt: 'Duty arrives as an inheritance, not a choice.',
            whyNonObvious: 'The lesson is a poem; the archive note is military history.'
          },
          {
            icon: 'Multiple Perspectives',
            summary: 'A later self looking back',
            sourcePageId: 'note_heaney',
            sourcePageTitle: 'Heaney and the given past',
            sourceExcerpt: 'The speaker inherits a role he did not ask for.',
            whyNonObvious: 'Same thread as the Roman note, different century and genre.'
          },
          {
            icon: 'Ethics',
            summary: 'Who gets to refuse the inheritance',
            sourcePageId: 'note_ethics',
            sourcePageTitle: 'Agency vs givenness',
            sourceExcerpt: 'Some duties are assigned before the student can consent.',
            whyNonObvious: 'Turns a literature starter into an ethics question.'
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/ai/chat') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      return okResponse(200, {
        anthropic_configured: true,
        model: DEFAULT_ANTHROPIC_MODEL
      });
    }

    if (method === 'POST' && path === '/api/ai/chat') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'invalid_json', 'Request body is not valid JSON');
      }
      const req = body as {
        lesson_id?: unknown;
        agent?: unknown;
        scope?: unknown;
        selected_block_id?: unknown;
        message?: unknown;
        action?: unknown;
      };
      if (
        typeof req.lesson_id !== 'string' ||
        typeof req.agent !== 'string' ||
        typeof req.message !== 'string' ||
        (req.scope !== undefined && typeof req.scope !== 'string') ||
        (req.selected_block_id !== undefined && typeof req.selected_block_id !== 'string')
      ) {
        return errorResponse(400, 'validation_error', 'Invalid AI chat request');
      }
      const lesson = store.getJSON<Lesson>(draftLessonKey(req.lesson_id));
      if (!lesson) return notFoundResponse('Lesson not found');
      // An id the canvas has but storage does not is a stale hint, not a bad
      // request: the teacher may have added the block a moment ago.
      const selected =
        typeof req.selected_block_id === 'string'
          ? lesson.blocks.find((b) => b.id === req.selected_block_id)
          : undefined;
      const now = new Date().toISOString();
      const proposal = /mind\s*map.*cheese|cheese.*mind\s*map/i.test(req.message)
        ? {
            kind: 'insert_blocks' as const,
            anchor_block_id: selected?.id,
            position: 'below' as const,
            blocks: [mockCheeseMindMap()]
          }
        : selected
          ? selected.block_type === 'rich_text' || selected.block_type === 'heading'
            ? {
                kind: 'replace_block' as const,
                block_id: selected.id,
                block: {
                  ...selected,
                  content:
                    selected.block_type === 'heading'
                      ? { ...selected.content, text: `${selected.content.text || 'Heading'} (AI)` }
                      : { ...selected.content, html: '<p>Mock AI rewrite.</p>' }
                }
              }
            : {
                kind: 'review_only' as const,
                summary: 'Mock review: keep the focus tight and one teaching move at a time.'
              }
          : {
              kind: 'replace_lesson' as const,
              blocks: [
                {
                  id: 'mock-ai-heading',
                  type: 'block' as const,
                  block_type: 'heading' as const,
                  variant: 'page' as const,
                  visibility: 'student_teacher' as const,
                  content: { text: 'Heading' },
                  layout: {},
                  print: {},
                  settings: {},
                  created_at: now,
                  updated_at: now,
                  schema_version: 1 as const
                }
              ]
            };
      return sseResponse([
        { type: 'status', text: 'Thinking…' },
        { type: 'text', text: 'Mock AI response. ' },
        { type: 'proposal', proposal },
        { type: 'done' }
      ]);
    }

    if (method === 'GET' && path === '/api/ai/jobs') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      return okResponse(200, readJobInbox());
    }

    if (method === 'POST' && path === '/api/ai/jobs') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'invalid_json', 'Request body is not valid JSON');
      }
      const parsed = AiJobCreateSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, 'validation_error', 'Invalid AI job request');
      }
      const req = parsed.data;
      const lesson = store.getJSON<Lesson>(draftLessonKey(req.lesson_id));
      if (!lesson) return notFoundResponse('Lesson not found');
      const existing = unresolvedJobForLesson(readJobInbox(), req.lesson_id);
      if (existing) {
        return errorResponse(409, 'conflict', 'An unresolved job already exists for this lesson', {
          id: existing.id,
          status: existing.status
        });
      }
      const now = nowIso();
      const id = newId('ai_job');
      const job: AiJob = {
        id,
        lesson_id: req.lesson_id,
        agent: req.agent,
        status: 'working',
        snapshot_at: req.lesson_snapshot_at ?? now,
        message: req.message,
        scope: req.scope,
        selected_block_id: req.selected_block_id,
        protocol_id: req.protocol_id,
        action: req.action,
        history: req.history,
        phase: 'queued',
        created_at: now
      };
      store.setJSON(aiJobKey(id), job);
      writeJobInbox(job);
      setTimeout(() => {
        const current = store.getJSON<AiJob>(aiJobKey(id));
        if (current?.status === 'working') completeMockJob(current);
      }, 0);
      return okResponse(202, { id, status: 'working' });
    }

    const aiJobRunMatch = AI_JOB_RUN_RE.exec(path);
    if (aiJobRunMatch && method === 'POST') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      const job = store.getJSON<AiJob>(aiJobKey(aiJobRunMatch[1]!));
      if (!job) return notFoundResponse('Job not found');
      return okResponse(200, completeMockJob(job));
    }

    const aiJobMatch = AI_JOB_RE.exec(path);
    if (aiJobMatch && method === 'GET') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      const id = aiJobMatch[1]!;
      const job = store.getJSON<AiJob>(aiJobKey(id));
      if (!job) return notFoundResponse('Job not found');
      const stale = staleWorkingJobError(job);
      if (stale) {
        store.setJSON(aiJobKey(id), stale);
        writeJobInbox(stale);
        return okResponse(200, stale);
      }
      return okResponse(200, job);
    }

    if (aiJobMatch && method === 'PATCH') {
      const session = getSession(cookie);
      if (!session.authenticated) return unauthorizedResponse();
      const id = aiJobMatch[1]!;
      const job = store.getJSON<AiJob>(aiJobKey(id));
      if (!job) return notFoundResponse('Job not found');
      if (!body || typeof body !== 'object' || typeof (body as { resolution?: unknown }).resolution !== 'string') {
        return errorResponse(400, 'validation_error', 'Invalid job resolution');
      }
      const applied = applyJobResolution(
        job,
        (body as { resolution: 'accepted' | 'rejected' | 'dismissed' }).resolution
      );
      if (!applied.ok) return errorResponse(400, 'validation_error', applied.message);
      store.setJSON(aiJobKey(id), applied.job);
      writeJobInbox(applied.job);
      return okResponse(200, applied.job);
    }

    if (method === 'POST' && path === '/api/classes') return handlePostClass(cookie, body);
    if (method === 'POST' && path === '/api/subjects') return handlePostSubject(cookie, body);
    if (method === 'POST' && path === '/api/outcomes') return handlePostOutcome(cookie, body);
    if (method === 'POST' && path === '/api/units') return handlePostUnit(cookie, body);
    if (method === 'POST' && path === '/api/lessons') return handlePostLesson(cookie, body);
    if (method === 'POST' && path === '/api/scope-sequences') {
      return handlePostScopeSequence(cookie, body);
    }
    if (method === 'GET' && path === '/api/compositions') return handleGetCompositions(cookie);
    if (method === 'POST' && path === '/api/compositions') return handlePostComposition(cookie, body);
    if (method === 'GET' && path === '/api/lesson-templates') return handleGetLessonTemplates(cookie);
    if (method === 'POST' && path === '/api/lesson-templates') return handlePostLessonTemplate(cookie, body);
    if (method === 'GET' && path === '/api/unit-templates') return handleGetUnitTemplates(cookie);
    if (method === 'POST' && path === '/api/unit-templates') return handlePostUnitTemplate(cookie, body);
    if (method === 'POST' && path === '/api/media/upload') {
      return handlePostMediaUpload(cookie, body);
    }
    if (method === 'POST' && path === '/api/media') return handlePostMedia(cookie, body);

    const compositionMatch = COMPOSITION_ID_RE.exec(path);
    if (compositionMatch) {
      const id = compositionMatch[1]!;
      if (method === 'GET') return handleGetComposition(cookie, id);
      if (method === 'PATCH') return handlePatchComposition(cookie, id, body);
      if (method === 'DELETE') return handlePermanentDeleteRoute(cookie, 'composition', id);
    }
    const lessonTemplateMatch = LESSON_TEMPLATE_ID_RE.exec(path);
    if (lessonTemplateMatch) {
      const id = lessonTemplateMatch[1]!;
      if (method === 'GET') return handleGetLessonTemplate(cookie, id);
      if (method === 'PATCH') return handlePatchLessonTemplate(cookie, id, body);
      if (method === 'DELETE') return handlePermanentDeleteRoute(cookie, 'lesson_template', id);
    }
    const unitTemplateMatch = UNIT_TEMPLATE_ID_RE.exec(path);
    if (unitTemplateMatch) {
      const id = unitTemplateMatch[1]!;
      if (method === 'GET') return handleGetUnitTemplate(cookie, id);
      if (method === 'PATCH') return handlePatchUnitTemplate(cookie, id, body);
      if (method === 'DELETE') return handlePermanentDeleteRoute(cookie, 'unit_template', id);
    }

    const restoreFromTrashMatch = RESTORE_FROM_TRASH_RE.exec(path);
    if (restoreFromTrashMatch && method === 'POST') {
      const type = collectionToType(restoreFromTrashMatch[1]!);
      if (!type) return errorResponse(404, 'not_found', 'Not found');
      return handleRestoreFromTrashRoute(cookie, type, restoreFromTrashMatch[2]!);
    }

    const dependenciesMatch = DEPENDENCIES_RE.exec(path);
    if (dependenciesMatch && method === 'GET') {
      const type = collectionToType(dependenciesMatch[1]!);
      if (!type) return errorResponse(404, 'not_found', 'Not found');
      return handleDependenciesRoute(cookie, type, dependenciesMatch[2]!);
    }

    const mediaFileMatch = MEDIA_FILE_RE.exec(path);
    if (mediaFileMatch && method === 'GET') {
      return handleGetMediaFile(mediaFileMatch[1]!);
    }

    const mediaMatch = MEDIA_ID_RE.exec(path);
    if (mediaMatch) {
      if (method === 'GET') return handleGetMedia(cookie, mediaMatch[1]!);
      if (method === 'PATCH') return handlePatchMedia(cookie, mediaMatch[1]!, body);
      if (method === 'DELETE') return handlePermanentDeleteRoute(cookie, 'media', mediaMatch[1]!);
    }

    const publishMatch = LESSON_PUBLISH_RE.exec(path);
    if (publishMatch && method === 'POST') {
      return handlePublishLesson(cookie, publishMatch[1]);
    }

    const lessonVersionRestoreMatch = LESSON_VERSION_RESTORE_RE.exec(path);
    if (lessonVersionRestoreMatch && method === 'POST') {
      return handleVersionRestore(
        cookie,
        'lesson',
        lessonVersionRestoreMatch[1]!,
        lessonVersionRestoreMatch[2]!
      );
    }
    const lessonVersionItemMatch = LESSON_VERSION_ITEM_RE.exec(path);
    if (lessonVersionItemMatch && method === 'GET') {
      return handleVersionItem(
        cookie,
        'lesson',
        lessonVersionItemMatch[1]!,
        lessonVersionItemMatch[2]!
      );
    }
    const lessonVersionsMatch = LESSON_VERSIONS_RE.exec(path);
    if (lessonVersionsMatch && (method === 'GET' || method === 'POST')) {
      return handleVersionCollection(
        cookie,
        'lesson',
        lessonVersionsMatch[1]!,
        method,
        body
      );
    }

    const unitVersionRestoreMatch = UNIT_VERSION_RESTORE_RE.exec(path);
    if (unitVersionRestoreMatch && method === 'POST') {
      return handleVersionRestore(
        cookie,
        'unit',
        unitVersionRestoreMatch[1]!,
        unitVersionRestoreMatch[2]!
      );
    }
    const unitVersionItemMatch = UNIT_VERSION_ITEM_RE.exec(path);
    if (unitVersionItemMatch && method === 'GET') {
      return handleVersionItem(
        cookie,
        'unit',
        unitVersionItemMatch[1]!,
        unitVersionItemMatch[2]!
      );
    }
    const unitVersionsMatch = UNIT_VERSIONS_RE.exec(path);
    if (unitVersionsMatch && (method === 'GET' || method === 'POST')) {
      return handleVersionCollection(cookie, 'unit', unitVersionsMatch[1]!, method, body);
    }

    const classVersionRestoreMatch = CLASS_VERSION_RESTORE_RE.exec(path);
    if (classVersionRestoreMatch && method === 'POST') {
      return handleVersionRestore(
        cookie,
        'class_homepage',
        classVersionRestoreMatch[1]!,
        classVersionRestoreMatch[2]!
      );
    }
    const classVersionItemMatch = CLASS_VERSION_ITEM_RE.exec(path);
    if (classVersionItemMatch && method === 'GET') {
      return handleVersionItem(
        cookie,
        'class_homepage',
        classVersionItemMatch[1]!,
        classVersionItemMatch[2]!
      );
    }
    const classVersionsMatch = CLASS_VERSIONS_RE.exec(path);
    if (classVersionsMatch && (method === 'GET' || method === 'POST')) {
      return handleVersionCollection(
        cookie,
        'class_homepage',
        classVersionsMatch[1]!,
        method,
        body
      );
    }

    const lessonMatch = LESSON_ID_RE.exec(path);
    if (lessonMatch) {
      if (method === 'GET') return handleGetDraftLesson(cookie, lessonMatch[1]);
      if (method === 'PUT') return handlePutDraftLesson(cookie, lessonMatch[1], body);
      if (method === 'PATCH') return handlePatchLessonStatus(cookie, lessonMatch[1]!, body);
      if (method === 'DELETE') return handlePermanentDeleteRoute(cookie, 'lesson', lessonMatch[1]!);
    }

    const unitMatch = UNIT_ID_RE.exec(path);
    if (unitMatch) {
      if (method === 'PATCH') return handlePatchUnit(cookie, unitMatch[1]!, body);
      if (method === 'DELETE') return handlePermanentDeleteRoute(cookie, 'unit', unitMatch[1]!);
    }

    const publishedMatch = PUBLISHED_LESSON_RE.exec(path);
    if (publishedMatch && method === 'GET') {
      return handleGetPublishedLesson(publishedMatch[1]);
    }

    const publishedUnitMatch = PUBLISHED_UNIT_RE.exec(path);
    if (publishedUnitMatch && method === 'GET') {
      return handleGetPublishedUnit(publishedUnitMatch[1]);
    }

    const publishedClassMatch = PUBLISHED_CLASS_RE.exec(path);
    if (publishedClassMatch && method === 'GET') {
      return handleGetPublishedClass(publishedClassMatch[1]);
    }

    const scheduleUnitMatch = SCHEDULE_UNIT_RE.exec(path);
    if (scheduleUnitMatch && method === 'POST') {
      return handleScheduleUnit(cookie, scheduleUnitMatch[1], body);
    }

    const classPatchMatch = CLASS_PATCH_RE.exec(path);
    if (classPatchMatch) {
      if (method === 'PATCH') return handlePatchClass(cookie, classPatchMatch[1], body);
      if (method === 'DELETE') {
        return handlePermanentDeleteRoute(cookie, 'class', classPatchMatch[1]!);
      }
    }

    const unitPatchMatch = UNIT_PATCH_RE.exec(path);
    if (unitPatchMatch && method === 'PATCH') {
      return handlePatchUnit(cookie, unitPatchMatch[1]!, body);
    }

    const scopeSequencePatchMatch = SCOPE_SEQUENCE_PATCH_RE.exec(path);
    if (scopeSequencePatchMatch && method === 'PATCH') {
      return handlePatchScopeSequence(cookie, scopeSequencePatchMatch[1], body);
    }

    const scheduledLessonMatch = SCHEDULED_LESSON_RE.exec(path);
    if (scheduledLessonMatch && method === 'PATCH') {
      return handlePatchScheduledLesson(cookie, scheduledLessonMatch[1], body);
    }

    return errorResponse(404, 'not_found', `No route for ${method} ${path}`);
  }

  async function request(
    method: string,
    path: string,
    requestOptions: MockApiRequestOptions = {}
  ): Promise<MockResponse> {
    return handle(method.toUpperCase(), path, requestOptions.cookie, requestOptions.body);
  }

  async function readNodeRequestBody(req: IncomingMessage): Promise<unknown> {
    const contentType = req.headers['content-type'] ?? '';
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return undefined;
    const buf = Buffer.concat(chunks);

    if (contentType.includes('multipart/form-data')) {
      const request = new Request(`http://localhost${req.url ?? '/'}`, {
        method: req.method,
        headers: { 'content-type': contentType },
        body: buf
      });
      return request.formData();
    }

    const raw = buf.toString('utf-8');
    if (raw.trim().length === 0) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return { __invalidJson: true };
    }
  }

  async function handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = req.url ?? '/';
    const cookie = req.headers.cookie ?? null;

    let body: unknown;
    if (method === 'PUT' || method === 'POST' || method === 'PATCH') {
      body = await readNodeRequestBody(req);
    }

    if (body && typeof body === 'object' && '__invalidJson' in body) {
      const response = errorResponse(400, 'invalid_json', 'Request body is not valid JSON');
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
      return;
    }

    const response = await handle(method, url, cookie, body);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.bodyBytes) {
      res.end(Buffer.from(response.bodyBytes));
      return;
    }
    res.end(await response.text());
  }

  return { request, handleNodeRequest };
}
