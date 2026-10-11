import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA } from "../api/client";
import { readApiError, unwrapApiPayload } from "../api/envelope";
import { bookKey } from "./model";
import {
  parseShelfData,
  FactsJobSchema,
  KindsJobSchema,
  type BookFactsInput,
  type FactsJob,
  type KindsJob,
  type Placement,
  type PlacementInput,
  type ShelfBook,
  type ShelfData,
} from "./schema";

const LOCAL_KEY = "knowledge-hub:shelf-preview-v1";

async function apiFetch<T>(init?: RequestInit): Promise<T> {
  // API_BASE already ends in /api/knowledge (same as Stars: "/stars").
  const path = "/shelf";
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(readApiError(payload, response.status, path));
  return unwrapApiPayload<T>(payload);
}

function post<T>(body: unknown) {
  return apiFetch<T>({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function readLocal(): ShelfData {
  try {
    return parseShelfData(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}"));
  } catch {
    return { books: [], placements: [] };
  }
}

function writeLocal(data: ShelfData) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // Preview only; nothing to recover.
  }
}

function strip<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as T;
}

export async function getShelf(): Promise<ShelfData> {
  if (USE_LOCAL_DATA) return readLocal();
  return parseShelfData(await apiFetch<unknown>());
}

export async function saveBookFacts(input: BookFactsInput): Promise<ShelfBook> {
  if (!USE_LOCAL_DATA) return (await post<{ book: ShelfBook }>({ op: "book", book: input })).book;
  const data = readLocal();
  const key = bookKey(input.label);
  const current = data.books.find(book => bookKey(book.label) === key) ?? { label: input.label };
  const reading = input.reading === true ? { page: current.reading?.page ?? null } : input.reading;
  const next = strip({ ...current, ...input, reading: reading ? { page: reading.page ?? null, updated_at: new Date().toISOString() } : reading }) as ShelfBook;
  if (input.completed_on) delete next.reading;
  else if (input.reading) delete next.completed_on;
  data.books = [...data.books.filter(book => bookKey(book.label) !== key), next];
  writeLocal(data);
  return next;
}

export async function savePlacements(list: PlacementInput[]): Promise<Placement[]> {
  if (!list.length) return [];
  if (!USE_LOCAL_DATA) return (await post<{ placements: Placement[] }>({ op: "place", placements: list })).placements;
  const data = readLocal();
  const saved = list.map(patch => {
    const current = data.placements.find(item => item.pageId === patch.pageId) ?? { pageId: patch.pageId };
    return strip({ ...current, ...patch }) as Placement;
  });
  const ids = new Set(saved.map(item => item.pageId));
  data.placements = [...data.placements.filter(item => !ids.has(item.pageId)), ...saved];
  writeLocal(data);
  return saved;
}

/** Asks Claude to estimate facts for every listed title in one background batch. */
export async function startBookFacts(labels: string[]): Promise<FactsJob> {
  if (USE_LOCAL_DATA) throw new Error("Filling book facts needs the live hub; local preview can't call Claude.");
  return FactsJobSchema.parse((await post<{ job: unknown }>({ op: "facts-start", books: labels })).job);
}

/** Checks the batch; once it has ended the server applies the results and returns the outcome. */
export async function checkBookFacts(): Promise<FactsJob> {
  if (USE_LOCAL_DATA) return { status: "none" };
  return FactsJobSchema.parse((await post<{ job: unknown }>({ op: "facts-check" })).job);
}

/** Takes a book's own record (facts, notebook, reading) off the shelf. */
export async function deleteBookRecord(label: string): Promise<void> {
  if (!USE_LOCAL_DATA) {
    await post<unknown>({ op: "book-delete", label });
    return;
  }
  const data = readLocal();
  data.books = data.books.filter(book => bookKey(book.label) !== bookKey(label));
  writeLocal(data);
}

/** Asks Claude to grade kinds for every book note that still needs one. */
export async function startBookKinds(ids?: string[], regrade = false): Promise<KindsJob> {
  if (USE_LOCAL_DATA) throw new Error("Grading kinds needs the live hub; local preview can't call Claude.");
  return KindsJobSchema.parse((await post<{ job: unknown }>({ op: "kinds-start", ids, regrade })).job);
}

/** Checks the kinds batch; once ended the server applies results and returns the outcome. */
export async function checkBookKinds(): Promise<KindsJob> {
  if (USE_LOCAL_DATA) return { status: "none" };
  return KindsJobSchema.parse((await post<{ job: unknown }>({ op: "kinds-check" })).job);
}

/** Grades one note's kind. A note that already has a kind keeps it unless `regrade` is set. */
export async function gradeKind(pageId: string, regrade = false): Promise<Placement> {
  if (USE_LOCAL_DATA) throw new Error("Grading kinds needs the live hub; local preview can't call Claude.");
  return (await post<{ placement: Placement }>({ op: "kind", pageId, ...(regrade ? { regrade } : {}) })).placement;
}
