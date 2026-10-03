import "./bookshelf.css";
import type { PageManifestEntry } from "../domain/page";
import { checkBookFacts, deleteBookRecord, getShelf, saveBookFacts, savePlacements, startBookFacts } from "./client";
import { CARD_HEIGHT, layoutDescent, orderedLinks, packShelf } from "./layout";
import { buildShelf, findBook, matchShelf, type BookModel, type BookNote } from "./model";
import { bookFactsPrompt, parseBookFacts } from "./facts";
import { notesToRead, readNotesForShelf } from "./backfill";
import { buildAtlas } from "./atlasLayout";
import { mountAtlas } from "./atlasView";
import { AIR_ROUTE, createWireless } from "./wireless";
import type { FactsJob, ShelfData, ShelfStance } from "./schema";

export type BookshelfContext = {
  entries: PageManifestEntry[];
  notebookLabels: string[];
  /** Page header HTML (kit chrome) for the shelf view. Title is HTML. */
  header: (supporting: string, opts?: { eyebrow?: string; title?: string; actions?: string }) => string;
  /** Starts a From-a-book note in Chat at this book and page (the Wireless's Hold this thought). */
  holdThought: (bookLabel: string, locus?: string, draft?: string) => void;
  openPage: (id: string) => void;
  /** Fetches a note's body, for reading pages, stances and gaps out of old notes. */
  getPage: (id: string) => Promise<{ id: string; body: string }>;
  /** Re-points these notes from the book to a notebook, saves them, and returns the refreshed archive list. */
  moveNotesToNotebook: (bookLabel: string, noteIds: string[], notebook: string) => Promise<PageManifestEntry[]>;
  /** Book key from the URL, if the route named one. */
  initialBook?: string;
  initialNote?: string;
};

const STANCE_WORD: Record<ShelfStance, string> = { supports: "supports", complicates: "complicates", extends: "extends" };
const PHONE = "(max-width: 720px)";
const MODE_KEY = "knowledge-hub:shelf-mode";
const ROOM_KEY = "knowledge-hub:shelf-room";

type Room = "shelf" | "wireless";

function readRoom(): Room {
  try {
    return localStorage.getItem(ROOM_KEY) === "wireless" ? "wireless" : "shelf";
  } catch {
    return "shelf";
  }
}

function readMode(): "map" | "page" {
  try {
    return localStorage.getItem(MODE_KEY) === "page" ? "page" : "map";
  } catch {
    return "map";
  }
}

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function stanceVar(stance?: ShelfStance) {
  return `var(--stance-${stance ?? "unknown"})`;
}

function pageLabel(note: BookNote) {
  return note.page ? `${note.guessed ? "≈ " : ""}p.${note.page}` : "no page";
}

export function bookRoute(key?: string, noteId?: string) {
  if (!key) return "#bookshelf";
  return `#bookshelf/${encodeURIComponent(key)}${noteId ? `/${encodeURIComponent(noteId)}` : ""}`;
}

export function parseBookshelfHash(hash: string): { book?: string; note?: string } | null {
  const match = hash.match(/^#bookshelf(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!match) return null;
  return {
    book: match[1] ? decodeURIComponent(match[1]) : undefined,
    note: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
}

export function mountBookshelf(host: HTMLElement, ctx: BookshelfContext): () => void {
  let data: ShelfData = { books: [], placements: [] };
  let books: BookModel[] = [];
  let loaded = false;
  let loadError = "";
  let query = "";
  let reading: { done: number; total: number } | null = null;
  let factsTimer = 0;
  /** True once this visit started or watched a running batch, so finishing gets a toast. */
  let watchingFacts = false;
  /** #bookshelf/~air/<book>: the Wireless, on air with that book. */
  let pendingAir: string | undefined = ctx.initialBook === AIR_ROUTE ? ctx.initialNote : undefined;
  let active: string | undefined = pendingAir ? undefined : ctx.initialBook;
  let focusNote: string | undefined = pendingAir ? undefined : ctx.initialNote;
  let openNote: string | undefined = pendingAir ? undefined : ctx.initialNote;
  let alive = true;
  /** True when the next paint should bring the focused note into view (navigation), false for in-place edits. */
  let jumpToFocus = true;
  let paintedBook: string | undefined;
  /** Inside a book: the Atlas map or the page-by-page descent. Remembered per viewer. */
  let mode = readMode();
  let atlasTeardown: (() => void) | null = null;
  /** The shelf as a bookcase, or as the Wireless dial. Remembered per viewer. */
  let room: Room = pendingAir ? "wireless" : readRoom();
  const wireless = createWireless({
    header: ctx.header,
    openPage: ctx.openPage,
    holdThought: ctx.holdThought,
    toast: (message, ms) => toast(message, ms),
    repaint: () => paint(),
  });
  const cleanups: Array<() => void> = [];
  const phone = window.matchMedia(PHONE);

  let entries = ctx.entries;
  const rebuild = () => {
    books = buildShelf(entries, data);
  };

  async function load() {
    try {
      data = await getShelf();
      loadError = "";
    } catch (error) {
      loadError = error instanceof Error ? error.message : "The bookshelf could not load.";
    }
    loaded = true;
    if (!alive) return;
    rebuild();
    paint();
    if (pendingAir) {
      wireless.restore(pendingAir);
      pendingAir = undefined;
    }
    if (data.factsJob?.status === "running") watchFacts();
  }

  // ── Book facts batch ────────────────────────────────────────────────

  function booksWithoutFacts() {
    return books.filter(book => !book.pagesKnown);
  }

  function watchFacts() {
    watchingFacts = true;
    window.clearTimeout(factsTimer);
    const tick = async () => {
      if (!alive) return;
      try {
        const job = await checkBookFacts();
        data = { ...data, factsJob: job };
        if (job.status === "done") {
          data = await getShelf();
          rebuild();
          paint();
          if (watchingFacts) toast(factsSummary(job), 12000);
          watchingFacts = false;
          return;
        }
        paint();
      } catch (error) {
        console.warn("Bookshelf: could not check book facts yet.", error);
      }
      factsTimer = window.setTimeout(() => void tick(), 60_000);
    };
    void tick();
  }

  function factsSummary(job: FactsJob) {
    const misses = (job.unknown?.length ?? 0) + (job.failed?.length ?? 0);
    return `Book facts filled for ${job.filled ?? 0} ${job.filled === 1 ? "book" : "books"}.${misses ? ` ${misses} still need yours: open them and paste facts from ChatGPT.` : ""}`;
  }

  function factsDismissKey(job: FactsJob) {
    return `knowledge-hub:shelf-facts-dismissed:${job.finished_at ?? ""}`;
  }

  function factsCardHtml() {
    const job = data.factsJob;
    if (job?.status === "running") {
      const done = job.finished ?? 0;
      return `<div class="shelf-card" role="status">
        <p class="shelf-eyebrow">Book facts</p>
        <h3>Claude is working out ${job.total ?? "your"} ${job.total === 1 ? "book" : "books"}</h3>
        <p>${done ? `${done} done so far. ` : ""}It runs in the background and usually finishes within the hour. You can leave this page; the facts appear when it's done.</p>
      </div>`;
    }
    if (job?.status !== "done") return "";
    try {
      if (localStorage.getItem(factsDismissKey(job))) return "";
    } catch {
      // Storage blocked: show the card; dismiss just won't stick.
    }
    const misses = [...(job.unknown ?? []), ...(job.failed ?? [])];
    const low = job.lowConfidence ?? [];
    const open = (label: string) => {
      const book = books.find(b => b.label.toLowerCase() === label.toLowerCase());
      return book ? `<li><button type="button" data-open-book="${esc(book.key)}">${esc(label)}</button></li>` : `<li>${esc(label)}</li>`;
    };
    return `<div class="shelf-card">
      <p class="shelf-eyebrow">Book facts</p>
      <h3>Filled for ${job.filled ?? 0} ${job.filled === 1 ? "book" : "books"}</h3>
      <p>These are Claude's estimates for a common edition. Check any you read closely against your copy; pasting real facts replaces the estimate.</p>
      ${misses.length ? `<p><b>${misses.length} Claude didn't recognise.</b> Open each and paste facts from ChatGPT:</p><ul>${misses.slice(0, 12).map(open).join("")}</ul>` : ""}
      ${low.length ? `<p><b>${low.length} low-confidence:</b> page count only, no chapters.</p>` : ""}
      <button class="btn btn--ghost" type="button" data-facts-dismiss>Dismiss</button>
    </div>`;
  }

  /** A book you're reading before any note points at it (notes add books on their own). */
  function openAddBookSheet() {
    const { sheet, close } = openSheet(`
      <p class="shelf-eyebrow">Bookshelf</p>
      <h2>Add a book</h2>
      <div class="shelf-sheet__grid">
        <label>Title<input type="text" id="add-title" autocomplete="off" required style="width:100%;box-sizing:border-box;padding:var(--space-2) var(--space-3);border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--warm-white);font:inherit;font-weight:400" /></label>
        <label>Author (optional)<input type="text" id="add-author" autocomplete="off" style="width:100%;box-sizing:border-box;padding:var(--space-2) var(--space-3);border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--warm-white);font:inherit;font-weight:400" /></label>
      </div>
      <div class="shelf-sheet__grid">
        <label class="shelf-sheet__check"><input type="checkbox" id="add-reading" checked /> I'm reading this now</label>
        <label>Page I'm on<input type="number" id="add-page" min="1" inputmode="numeric" /></label>
      </div>
      <p class="place-readout" style="display:block">Use the exact title your notes will use, so they land on this book.</p>
      <p class="shelf-sheet__error" data-error role="alert" hidden></p>
      <div class="shelf-sheet__row shelf-sheet__row--end">
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn--primary" type="button" data-save>Add to shelf</button>
      </div>`, "Add a book");
    const fail = (message: string) => {
      const el = sheet.querySelector<HTMLElement>("[data-error]")!;
      el.textContent = message;
      el.hidden = false;
    };
    sheet.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close;
    const save = async () => {
      const label = sheet.querySelector<HTMLInputElement>("#add-title")!.value.replace(/\s+/g, " ").trim();
      if (!label) return fail("Give the book a title.");
      const existing = books.find(book => book.key === label.toLowerCase());
      if (existing) return fail(`“${existing.label}” is already on the shelf.`);
      const author = sheet.querySelector<HTMLInputElement>("#add-author")!.value.trim();
      const readingOn = sheet.querySelector<HTMLInputElement>("#add-reading")!.checked;
      const page = Number(sheet.querySelector<HTMLInputElement>("#add-page")!.value);
      try {
        await saveFacts({
          label,
          ...(author ? { author } : {}),
          ...(readingOn ? { reading: { page: Number.isInteger(page) && page > 0 ? page : null } } : {}),
        }, `${label} is on the shelf.`);
        close();
      } catch (error) {
        fail(error instanceof Error ? error.message : "Could not add the book.");
      }
    };
    sheet.querySelector<HTMLButtonElement>("[data-save]")!.onclick = () => void save();
    sheet.querySelector<HTMLInputElement>("#add-title")!.focus();
  }

  function openFactsBatchSheet() {
    const targets = booksWithoutFacts();
    const { sheet, close } = openSheet(`
      <p class="shelf-eyebrow">Book facts</p>
      <h2>Fill facts for ${targets.length} ${targets.length === 1 ? "book" : "books"}</h2>
      <p class="place-readout" style="display:block;line-height:1.5">Claude works out the page count and the chapter start pages for every book that doesn't have them yet, for the edition most readers in Australia own. It runs in the background, usually within the hour, and costs roughly $${Math.max(1, Math.ceil(targets.length * 0.04))}.</p>
      <p class="place-readout" style="display:block;line-height:1.5;margin-top:var(--space-3)">It only fills blanks. Anything you've set stays. Books Claude doesn't recognise are listed afterwards so you can paste those from ChatGPT.</p>
      <p class="shelf-sheet__error" data-error role="alert" hidden></p>
      <div class="shelf-sheet__row shelf-sheet__row--end">
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn--primary" type="button" data-start>Start</button>
      </div>`, "Fill book facts");
    sheet.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close;
    sheet.querySelector<HTMLButtonElement>("[data-start]")!.onclick = async event => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        const job = await startBookFacts(targets.map(book => book.label));
        data = { ...data, factsJob: job };
        close();
        paint();
        toast("Started. Claude is working out your book facts in the background.");
        factsTimer = window.setTimeout(() => watchFacts(), 60_000);
        watchingFacts = true;
      } catch (error) {
        const el = sheet.querySelector<HTMLElement>("[data-error]")!;
        el.textContent = error instanceof Error ? error.message : "Could not start book facts.";
        el.hidden = false;
        button.disabled = false;
      }
    };
  }

  function setRoute(key?: string, noteId?: string, push = false) {
    const next = bookRoute(key, noteId);
    if (location.hash === next) return;
    if (push) history.pushState(null, "", next);
    else history.replaceState(null, "", next);
  }

  function go(key: string | undefined, noteId?: string) {
    const changedBook = key !== active;
    active = key;
    focusNote = noteId;
    openNote = noteId;
    jumpToFocus = true;
    setRoute(key, noteId, changedBook);
    paint();
  }

  const onPop = () => {
    const route = parseBookshelfHash(location.hash);
    if (!route) return;
    if (route.book === AIR_ROUTE) {
      // Forward onto a broadcast, or Back from a note opened on air.
      room = "wireless";
      active = undefined;
      if (route.note && wireless.onAirBook() !== route.note) wireless.restore(route.note);
      else paint();
      return;
    }
    if (wireless.onAir) {
      // Back from on air lands on the dial.
      wireless.leaveAir();
      return;
    }
    active = route.book;
    focusNote = route.note;
    openNote = route.note;
    jumpToFocus = true;
    paint();
  };
  window.addEventListener("popstate", onPop);
  cleanups.push(() => window.removeEventListener("popstate", onPop));

  const onMedia = () => paint();
  phone.addEventListener("change", onMedia);
  cleanups.push(() => phone.removeEventListener("change", onMedia));

  function paint() {
    if (!alive) return;
    const book = active ? findBook(books, active) : undefined;
    const previousScroll = host.querySelector<HTMLElement>(".descent")?.scrollTop;
    atlasTeardown?.();
    atlasTeardown = null;
    wireless.unmount();
    paintShelf();
    document.body.classList.toggle("is-bookshelf-immersive", Boolean(book));
    if (book) {
      const sameBook = paintedBook === book.key;
      paintDescent(book, sameBook && !jumpToFocus ? previousScroll : undefined, !sameBook);
    }
    paintedBook = book?.key;
    jumpToFocus = false;
  }

  // ── Shelf ────────────────────────────────────────────────────────────

  function shelfSupporting() {
    if (!loaded) return "Taking the books down…";
    const notes = books.reduce((sum, book) => sum + book.noteCount, 0);
    const loose = books.reduce((sum, book) => sum + book.loose.length, 0);
    const parts = [`${books.length} ${books.length === 1 ? "book" : "books"}`, `${notes} ${notes === 1 ? "note" : "notes"}`];
    if (loose) parts.push(`${loose} still need a page`);
    return `${parts.join(" · ")}. Books sit page-edge out; every line is a note at the page you wrote it.`;
  }

  function roomPillsHtml() {
    if (!books.length) return "";
    const pill = (value: Room, label: string) =>
      `<button class="hub-pills__btn${room === value ? " is-active" : ""}" type="button" data-room="${value}" aria-pressed="${room === value}">${label}</button>`;
    return `<div class="hub-pills shelf-rooms" role="group" aria-label="View">${pill("shelf", "Shelf")}${pill("wireless", "Wireless")}</div>`;
  }

  function bindRooms() {
    host.querySelectorAll<HTMLButtonElement>("[data-room]").forEach(button => {
      button.onclick = () => {
        const next = button.dataset.room as Room;
        if (next === room) return;
        room = next;
        try {
          localStorage.setItem(ROOM_KEY, room);
        } catch {
          // Not remembered; the toggle still works this visit.
        }
        paint();
      };
    });
  }

  function paintWireless() {
    const onAir = wireless.headerHtml();
    host.innerHTML = `<div class="shelf-root shelf-root--wireless">
      ${onAir ?? ctx.header(esc(loaded ? wireless.supporting() : "Warming up the valves…"))}
      ${onAir ? "" : `<div class="shelf-tools">${roomPillsHtml()}</div>`}
      ${loadError ? `<p class="shelf-sheet__error" role="alert">${esc(loadError)}</p>` : ""}
      <div class="wl-room" data-wireless></div>
    </div>`;
    bindRooms();
    wireless.setBooks(books);
    wireless.mount(host.querySelector<HTMLElement>("[data-wireless]")!);
  }

  function paintShelf() {
    if (room === "wireless" && books.length) return paintWireless();
    const searching = query.trim().length > 0;
    const hits = matchShelf(books, query);
    host.innerHTML = `<div class="shelf-root">
      ${ctx.header(esc(shelfSupporting()))}
      <div class="shelf-tools">
        ${roomPillsHtml()}
        <label class="hub-search">
          <svg class="hub-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input class="hub-search__input" id="shelf-search" type="search" placeholder="Find an idea across books" value="${esc(query)}" aria-label="Find an idea across books" />
        </label>
        ${readButtonHtml()}
        ${factsButtonHtml()}
        ${loaded && !loadError ? `<button class="btn btn--ghost" type="button" data-add-book>Add a book</button>` : ""}
      </div>
      ${loadError ? `<p class="shelf-sheet__error" role="alert">${esc(loadError)} Notes still show; pages and book facts are missing until it loads.</p>` : ""}
      ${books.length ? "" : loaded ? emptyHtml() : ""}
      <div class="shelf-room${searching ? " is-searching" : ""}${searching || readingBooks().length || factsCardHtml() ? "" : " is-quiet"}">
        <div class="shelf-stage" data-stage></div>
        ${sideHtml(hits)}
      </div>
    </div>`;
    bindRooms();
    const input = host.querySelector<HTMLInputElement>("#shelf-search");
    if (input) {
      input.oninput = () => {
        query = input.value;
        const caret = input.selectionStart;
        paintShelf();
        const next = host.querySelector<HTMLInputElement>("#shelf-search");
        next?.focus();
        if (caret !== null) next?.setSelectionRange(caret, caret);
      };
    }
    host.querySelector<HTMLButtonElement>("[data-read-notes]")?.addEventListener("click", () => void readNotes());
    host.querySelector<HTMLButtonElement>("[data-fill-facts]")?.addEventListener("click", openFactsBatchSheet);
    host.querySelector<HTMLButtonElement>("[data-add-book]")?.addEventListener("click", openAddBookSheet);
    host.querySelector<HTMLButtonElement>("[data-facts-dismiss]")?.addEventListener("click", () => {
      try {
        if (data.factsJob) localStorage.setItem(factsDismissKey(data.factsJob), "1");
      } catch {
        // Not stored; the card returns next visit.
      }
      paintShelf();
    });
    host.querySelectorAll<HTMLButtonElement>("[data-open-book]").forEach(button => {
      button.onclick = () => go(button.dataset.openBook, button.dataset.note || undefined);
    });
    const stage = host.querySelector<HTMLElement>("[data-stage]");
    if (stage && books.length) drawShelf(stage, hits);
  }

  function factsButtonHtml() {
    if (!loaded || loadError || data.factsJob?.status === "running") return "";
    const count = booksWithoutFacts().length;
    return count ? `<button class="btn btn--secondary" type="button" data-fill-facts>Fill book facts (${count})</button>` : "";
  }

  function readButtonHtml() {
    if (!loaded || loadError) return "";
    if (reading) return `<button class="btn btn--secondary" type="button" disabled>Reading notes ${reading.done} of ${reading.total}…</button>`;
    const count = notesToRead(books).length;
    return count
      ? `<button class="btn btn--secondary" type="button" data-read-notes title="Fills in any page, stance and open questions your notes already state. It never changes what you've set.">Read my notes</button>`
      : "";
  }

  async function readNotes() {
    const total = notesToRead(books).length;
    reading = { done: 0, total };
    paintShelf();
    const button = () => host.querySelector<HTMLButtonElement>(".shelf-tools .btn");
    const { patches, failed } = await readNotesForShelf(books, ctx.getPage, (done, total) => {
      reading = { done, total };
      const el = button();
      if (el) el.textContent = `Reading notes ${done} of ${total}…`;
    });
    try {
      for (let i = 0; i < patches.length; i += 200) {
        const saved = await savePlacements(patches.slice(i, i + 200));
        const byId = new Map(saved.map(item => [item.pageId, item]));
        data = { ...data, placements: [...data.placements.filter(item => !byId.has(item.pageId)), ...saved] };
      }
      const pages = patches.filter(p => p.page).length;
      const stances = patches.filter(p => p.stance).length;
      const gaps = patches.filter(p => p.gaps).length;
      rebuild();
      const stillLoose = books.reduce((sum, book) => sum + book.loose.length, 0);
      const found = `Read ${total} ${total === 1 ? "note" : "notes"}: found ${pages} ${pages === 1 ? "page" : "pages"}, ${stances} ${stances === 1 ? "stance" : "stances"}, ${gaps} sets of open questions.`;
      const left = stillLoose ? ` ${stillLoose} ${stillLoose === 1 ? "note doesn't" : "notes don't"} name a page, so place ${stillLoose === 1 ? "it" : "them"} by hand.` : "";
      toast(`${found}${left}${failed ? ` ${failed} couldn't be opened.` : ""}`, 9000);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save what was read.");
    }
    reading = null;
    rebuild();
    paint();
  }

  function coverImg(book: BookModel, className: string) {
    return book.cover
      ? `<img class="${className}" src="${esc(book.cover)}" alt="" loading="lazy" decoding="async" style="--c:${book.swatch.fill}" />`
      : "";
  }

  function readingBooks() {
    return books.filter(book => book.reading);
  }

  function emptyHtml() {
    return `<div class="shelf-empty"><p class="shelf-eyebrow">No books yet</p>
      <p>Books appear here when a note has a book as its origin. In Chat, choose <b>From a book</b>, name the book and the page, and the note lands on this shelf.</p></div>`;
  }

  function sideHtml(hits: Set<string>) {
    const facts = factsCardHtml();
    const main = mainSideCard(hits);
    return facts || main ? `<aside class="shelf-side">${facts}${main}</aside>` : "";
  }

  function mainSideCard(hits: Set<string>) {
    if (query.trim()) {
      const counts = books
        .map(book => ({ book, count: [...book.placed, ...book.loose].filter(note => hits.has(note.id)).length }))
        .filter(item => item.count)
        .sort((a, b) => b.count - a.count);
      const total = counts.reduce((sum, item) => sum + item.count, 0);
      if (!counts.length) {
        return `<div class="shelf-card"><p class="shelf-eyebrow">Thread</p><h3>Nothing on the shelf mentions “${esc(query.trim())}”</h3><p>Search reads note titles, tags and excerpts.</p></div>`;
      }
      const top = counts[0]!.book;
      const firstHit = [...top.placed, ...top.loose].find(note => hits.has(note.id));
      return `<div class="shelf-card">
        <p class="shelf-eyebrow">Thread</p>
        <h3>“${esc(query.trim())}” runs through ${counts.length} ${counts.length === 1 ? "book" : "books"}</h3>
        <p>${total} ${total === 1 ? "note" : "notes"}. Strongest in ${esc(top.label)}.</p>
        <ul>${counts.slice(0, 8).map(item => `<li><button type="button" data-open-book="${esc(item.book.key)}" data-note="${esc([...item.book.placed, ...item.book.loose].find(note => hits.has(note.id))?.id ?? "")}">${esc(item.book.label)}</button><span>${item.count}</span></li>`).join("")}</ul>
        <button class="btn btn--primary" type="button" data-open-book="${esc(top.key)}" data-note="${esc(firstHit?.id ?? "")}" style="width:100%">Open ${esc(top.label)}</button>
      </div>`;
    }
    const reading = readingBooks();
    if (!reading.length) return "";
    return `<div class="shelf-card">
      <p class="shelf-eyebrow">Reading now</p>
      <ul>${reading.map(book => `<li><button type="button" class="shelf-reading" data-open-book="${esc(book.key)}">${coverImg(book, "shelf-reading__cover")}${esc(book.label)}</button><span>${book.reading?.page ? `p.${book.reading.page}` : "just started"}</span></li>`).join("")}</ul>
    </div>`;
  }

  function drawShelf(stage: HTMLElement, hits: Set<string>) {
    const width = stage.clientWidth || 900;
    const rows = packShelf(books, width);
    stage.innerHTML = rows.map(row => {
      let plaqueX = 12;
      const plaques: string[] = [];
      let lastNotebook: string | undefined | null = null;
      const stacks = row.stacks.map((stack, index) => {
        if (stack.notebook !== lastNotebook) {
          plaques.push(`<span class="shelf-plaque" style="left:${plaqueX}px">${esc(stack.notebook ?? "No notebook yet")}</span>`);
          lastNotebook = stack.notebook;
        }
        plaqueX += stack.width + (index ? 24 : 0);
        return `<div class="shelf-stack" style="width:${stack.width}px">${stack.books.map(box => bookHtml(box.book, box.width, box.thickness, hits)).join("")}</div>`;
      }).join("");
      return `<div class="shelf-row">${stacks}${plaques.join("")}</div>`;
    }).join("") + `<div class="shelf-legend">
        <span class="shelf-key" style="--k:var(--stance-supports)">Supports the book</span>
        <span class="shelf-key" style="--k:var(--stance-complicates)">Complicates it</span>
        <span class="shelf-key" style="--k:var(--stance-extends)">Extends it</span>
        <span class="shelf-key" style="--k:var(--stance-unknown)">Stance not read yet</span>
        <span class="shelf-key" style="--k:var(--navy)">Where you're reading</span>
        ${query.trim() ? `<span class="shelf-key" style="--k:var(--high-sea)">Matches “${esc(query.trim())}”</span>` : ""}
      </div><svg class="shelf-threads" data-threads aria-hidden="true"></svg>`;

    stage.querySelectorAll<HTMLButtonElement>(".shelf-book").forEach(button => {
      const book = findBook(books, button.dataset.book!)!;
      button.onclick = event => {
        const note = noteAtPointer(button, book, event as MouseEvent);
        go(book.key, note?.id);
      };
      button.onpointermove = event => showTip(stage, button, book, event);
      button.onpointerleave = () => stage.querySelector(".shelf-tip")?.remove();
    });
    if (hits.size) drawThreads(stage, hits);
  }

  function bookHtml(book: BookModel, width: number, thickness: number, hits: Set<string>) {
    const inner = thickness - 18;
    const top = (page: number) => 2 + ((page - 1) / book.pages) * (inner - 4);
    const marks = book.placed.map(note => `<i class="shelf-mark${note.guessed ? " shelf-mark--guess" : ""}${hits.has(note.id) ? " is-hit" : ""}" style="top:${top(note.page!)}px;--m:${stanceVar(note.stance)}"></i>`).join("");
    const ribbon = book.reading?.page ? `<i class="shelf-ribbon" style="top:${top(book.reading.page)}px"></i>` : "";
    const slips = book.loose.length ? `<span class="shelf-slips">${"<i></i>".repeat(Math.min(book.loose.length, 5))}</span>` : "";
    const empty = book.noteCount ? "" : `<span class="shelf-book__empty">No notes yet</span>`;
    const label = `${book.label}, ${book.noteCount} ${book.noteCount === 1 ? "note" : "notes"}${book.loose.length ? `, ${book.loose.length} without a page` : ""}`;
    return `<button type="button" class="shelf-book" data-book="${esc(book.key)}" aria-label="${esc(label)}"
      style="width:${width}px;height:${thickness}px;--c:${book.swatch.fill};--c-ink:${book.swatch.ink}">
      <span class="shelf-book__title">${esc(book.label)}</span>${marks}${ribbon}${slips}${empty}</button>`;
  }

  function noteAtPointer(button: HTMLElement, book: BookModel, event: MouseEvent): BookNote | undefined {
    const rect = button.getBoundingClientRect();
    const inner = rect.height - 18;
    const y = event.clientY - rect.top - 15;
    let best: BookNote | undefined;
    let bestDistance = 6;
    for (const note of book.placed) {
      const distance = Math.abs(2 + ((note.page! - 1) / book.pages) * (inner - 4) - y);
      if (distance < bestDistance) {
        best = note;
        bestDistance = distance;
      }
    }
    return best;
  }

  function showTip(stage: HTMLElement, button: HTMLElement, book: BookModel, event: PointerEvent) {
    stage.querySelector(".shelf-tip")?.remove();
    if (event.pointerType === "touch") return;
    const note = noteAtPointer(button, book, event);
    const stageRect = stage.getBoundingClientRect();
    const tip = document.createElement("div");
    tip.className = "shelf-tip";
    tip.innerHTML = note
      ? `<b>${esc(book.label)} · ${esc(pageLabel(note))}</b>${esc(note.title)}${note.stance ? ` · ${STANCE_WORD[note.stance]}` : ""}`
      : `<b>${esc(book.label)}</b>${book.noteCount} ${book.noteCount === 1 ? "note" : "notes"}${book.author ? ` · ${esc(book.author)}` : ""}`;
    tip.style.left = `${event.clientX - stageRect.left + 16}px`;
    tip.style.top = `${event.clientY - stageRect.top - 46}px`;
    stage.appendChild(tip);
  }

  function drawThreads(stage: HTMLElement, hits: Set<string>) {
    const svg = stage.querySelector<SVGSVGElement>("[data-threads]");
    if (!svg) return;
    const base = stage.getBoundingClientRect();
    const perBook: Array<Array<{ x: number; y: number }>> = [];
    stage.querySelectorAll<HTMLElement>(".shelf-book").forEach(button => {
      const points = [...button.querySelectorAll<HTMLElement>(".shelf-mark.is-hit")].map(mark => {
        const r = mark.getBoundingClientRect();
        return { x: r.right - base.left, y: r.top - base.top + 1.5 };
      });
      if (points.length) perBook.push(points);
    });
    let paths = "";
    for (let i = 0; i < perBook.length - 1; i += 1) {
      const a = perBook[i]![0]!;
      const b = perBook[i + 1]![0]!;
      const bend = Math.max(40, Math.abs(b.x - a.x) / 3);
      paths += `<path d="M${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x + bend} ${b.y}, ${b.x} ${b.y}" fill="none" stroke="var(--high-sea)" stroke-width="1.3" stroke-dasharray="3 4" opacity=".8"/>`;
    }
    for (const points of perBook) for (const p of points) paths += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--high-sea)"/>`;
    svg.innerHTML = paths;
  }

  // ── Inside a book ───────────────────────────────────────────────────

  function paintDescent(book: BookModel, restoreScroll?: number, focusBack = false) {
    const shell = document.createElement("div");
    shell.className = "descent";
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", book.label);
    shell.style.setProperty("--c", book.swatch.fill);
    const onMap = mode === "map" && book.noteCount > 0;
    shell.classList.toggle("is-map", onMap);
    shell.innerHTML = `${descentBarHtml(book, onMap)}${onMap ? `<div class="descent__map" data-map></div>` : `<div class="descent__body" data-body></div>`}`;
    host.appendChild(shell);
    bindDescentBar(shell, book);
    if (onMap) {
      const bar = shell.querySelector<HTMLElement>(".descent__bar")!;
      shell.style.setProperty("--descent-bar", `${bar.offsetHeight}px`);
      atlasTeardown = mountAtlas(shell.querySelector<HTMLElement>("[data-map]")!, book, buildAtlas(book), {
        openNote: id => {
          void savePlacements([{ pageId: id, lastOpened: new Date().toISOString() }]).catch(() => undefined);
          document.body.classList.remove("is-bookshelf-immersive");
          ctx.openPage(id);
        },
        showByPage: id => setMode("page", id),
        goBook: (key, noteId) => go(key, noteId),
        swatchFor: key => findBook(books, key)?.swatch,
        focusNote,
      });
      if (focusBack) shell.querySelector<HTMLElement>("[data-back]")?.focus({ preventScroll: true });
      return;
    }
    const body = shell.querySelector<HTMLElement>("[data-body]")!;
    if (phone.matches) paintDescentList(body, book);
    else paintDescentColumns(shell, body, book);
    if (focusBack) shell.querySelector<HTMLElement>("[data-back]")?.focus({ preventScroll: true });
    if (restoreScroll !== undefined) {
      shell.scrollTop = restoreScroll;
    } else if (focusNote) {
      const card = shell.querySelector<HTMLElement>(`[data-note-card="${CSS.escape(focusNote)}"]`);
      if (card) requestAnimationFrame(() => card.scrollIntoView({ block: "center" }));
    }
  }

  function descentMeta(book: BookModel) {
    const parts = [`${book.noteCount} ${book.noteCount === 1 ? "note" : "notes"}`];
    parts.push(book.pagesKnown ? `${book.pages} pages${book.estimated ? " (estimated)" : ""}` : "page count not set");
    if (book.densestChapter?.noteCount) parts.push(`densest in ${book.densestChapter.label ? `chapter ${book.densestChapter.label}` : book.densestChapter.title}`);
    if (book.lastNotePage && book.pagesKnown && book.lastNotePage < book.pages * 0.85) parts.push(`nothing written after p.${book.lastNotePage}`);
    return parts.join(" · ");
  }

  function setMode(next: "map" | "page", noteId?: string) {
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Not remembered; this visit still switches.
    }
    if (noteId) {
      focusNote = noteId;
      openNote = noteId;
    }
    jumpToFocus = true;
    paint();
  }

  function descentBarHtml(book: BookModel, onMap = false) {
    const reading = book.reading
      ? `<label class="descent__reading">Reading · p.<input id="descent-reading" type="number" inputmode="numeric" min="1" max="${book.pages}" value="${book.reading.page ?? ""}" aria-label="Page you're on" /></label>`
      : "";
    return `<header class="descent__bar">
      <button class="btn btn--ghost" type="button" data-back>← Bookshelf</button>
      ${coverImg(book, "descent__cover")}
      <div class="descent__id"><h1>${esc(book.label)}</h1><p>${esc([book.author, descentMeta(book)].filter(Boolean).join(" · "))}</p></div>
      <div class="descent__actions">
        ${book.noteCount ? `<div class="hub-pills descent__modes" role="group" aria-label="View"><button class="hub-pills__btn${onMap ? " is-active" : ""}" type="button" data-mode="map" aria-pressed="${onMap}">Map</button><button class="hub-pills__btn${onMap ? "" : " is-active"}" type="button" data-mode="page" aria-pressed="${!onMap}">By page</button></div>` : ""}
        ${reading}
        ${book.loose.length ? `<button class="btn btn--secondary" type="button" data-place>Place ${book.loose.length} loose ${book.loose.length === 1 ? "page" : "pages"}</button>` : ""}
        <button class="btn btn--primary" type="button" data-facts>Book facts</button>
      </div>
    </header>`;
  }

  function bindDescentBar(shell: HTMLElement, book: BookModel) {
    shell.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => go(undefined);
    shell.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => {
      button.onclick = () => {
        if (button.dataset.mode !== mode) setMode(button.dataset.mode === "page" ? "page" : "map");
      };
    });
    shell.querySelector<HTMLButtonElement>("[data-facts]")!.onclick = () => openFactsSheet(book);
    const place = shell.querySelector<HTMLButtonElement>("[data-place]");
    if (place) place.onclick = () => openPlaceSheet(book);
    const reading = shell.querySelector<HTMLInputElement>("#descent-reading");
    if (reading) {
      reading.onchange = () => {
        const page = Number(reading.value);
        if (!Number.isInteger(page) || page < 1) return;
        void saveFacts({ label: book.label, reading: { page } }, "Reading page saved.");
      };
    }
  }

  function noteCardHtml(note: BookNote, book: BookModel, style = "") {
    const open = note.id === openNote;
    const body = open
      ? `<div class="descent-note__body">
          ${note.excerpt ? `<p>${esc(note.excerpt)}</p>` : ""}
          ${note.gaps.length ? `<ul class="descent-note__gaps">${note.gaps.map(gap => `<li>${esc(gap)}</li>`).join("")}</ul>` : ""}
          <div class="descent-note__actions">
            <button class="btn btn--primary" type="button" data-open-note="${esc(note.id)}">Open note</button>
            <label class="descent-note__page">p.<input type="number" inputmode="numeric" min="1" max="${book.pages}" value="${note.page ?? ""}" data-move="${esc(note.id)}" aria-label="Move to page" /></label>
          </div>
        </div>`
      : "";
    return `<article class="descent-note${open ? " is-open" : ""}" data-note-card="${esc(note.id)}" style="--m:${stanceVar(note.stance)};${style}">
      <button class="descent-note__row" type="button" data-toggle="${esc(note.id)}" aria-expanded="${open}">
        <b>${esc(note.title)}</b><span class="descent-note__meta">${esc(pageLabel(note))}${note.stance ? ` · ${STANCE_WORD[note.stance]}` : ""}</span>
      </button>${body}</article>`;
  }

  function bindNotes(scope: HTMLElement, book: BookModel) {
    scope.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach(button => {
      button.onclick = () => {
        const id = button.dataset.toggle!;
        openNote = openNote === id ? undefined : id;
        focusNote = openNote;
        setRoute(book.key, openNote);
        paint();
        host.querySelector<HTMLElement>(`[data-toggle="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      };
    });
    scope.querySelectorAll<HTMLButtonElement>("[data-open-note]").forEach(button => {
      button.onclick = () => {
        const id = button.dataset.openNote!;
        void savePlacements([{ pageId: id, lastOpened: new Date().toISOString() }]).catch(() => undefined);
        document.body.classList.remove("is-bookshelf-immersive");
        ctx.openPage(id);
      };
    });
    scope.querySelectorAll<HTMLInputElement>("[data-move]").forEach(input => {
      input.onchange = () => {
        const page = Number(input.value);
        if (!Number.isInteger(page) || page < 1 || page > book.pages) {
          toast(`Pick a page from 1 to ${book.pages}.`);
          return;
        }
        void place([{ pageId: input.dataset.move!, page, guessed: false }], `Moved to p.${page}.`);
      };
    });
    scope.querySelectorAll<HTMLButtonElement>("[data-exit]").forEach(button => {
      button.onclick = () => go(button.dataset.exit, button.dataset.exitNote || undefined);
    });
  }

  function paintDescentColumns(shell: HTMLElement, body: HTMLElement, book: BookModel) {
    const viewport = Math.max(420, window.innerHeight - 220);
    const openCardHeight = 210;
    const layout = layoutDescent(book, viewport, openNote, openCardHeight);
    const y = (page: number) => (page - 1) * layout.pxPerPage;
    const links = orderedLinks(book);
    const stripH = Math.max(240, window.innerHeight - 190);
    const stripY = (page: number) => ((page - 1) / book.pages) * (stripH - 12);
    const rulerStep = [10, 25, 50, 100, 200].find(step => (book.pages / step) * 1 <= Math.max(6, layout.height / 90)) ?? 200;
    const rulers = [1, ...Array.from({ length: Math.floor(book.pages / rulerStep) }, (_, i) => (i + 1) * rulerStep)];
    const unread = book.pagesKnown && book.lastNotePage && book.lastNotePage < book.pages * 0.85;

    body.innerHTML = `
      <p class="descent__head">Whole book</p><p class="descent__head" style="text-align:right">Chapters</p><p class="descent__head">${book.pagesKnown ? `pp. 1–${book.pages}` : "Pages"}</p><p class="descent__head">Your notes, at their page</p><p class="descent__head">Where they lead out</p>
      <div class="descent__col"><div class="descent__strip" style="height:${stripH}px" data-strip>
        ${book.placed.map(note => `<i style="top:${stripY(note.page!)}px;--m:${stanceVar(note.stance)}"></i>`).join("")}
        ${book.reading?.page ? `<i style="top:${stripY(book.reading.page)}px;--m:var(--navy);left:-6px;right:-6px;height:3px"></i>` : ""}
        ${unread ? `<div class="descent__unread" style="height:${stripH - 12 - stripY(book.lastNotePage!)}px" title="No notes after p.${book.lastNotePage}"></div>` : ""}
        <div class="descent__bracket" data-bracket></div>
      </div></div>
      <div class="descent__col" style="height:${layout.height}px">
        ${book.chapters.length
          ? chapterTops(book, y).map(({ ch, top }) => `<div class="descent__chapter" style="top:${top}px"><b>${esc(ch.label ? `${ch.label} · ${ch.title}` : ch.title)}</b><span>${ch.noteCount ? `${ch.noteCount} ${ch.noteCount === 1 ? "note" : "notes"}` : "no notes"}</span></div>`).join("")
          : `<p class="descent__hint">No chapters yet.<br />Add them in Book facts.</p>`}
      </div>
      <div class="descent__col descent__core" style="height:${layout.height}px">
        ${book.chapters.map((ch, i) => (i % 2 ? "" : `<div class="descent__band" style="top:${y(ch.start)}px;height:${(ch.end - ch.start + 1) * layout.pxPerPage}px"></div>`)).join("")}
        ${rulers.map(page => `<span class="descent__ruler" style="top:${y(page)}px">p.${page}</span>`).join("")}
        ${book.placed.map(note => `<i class="descent__tick${note.guessed ? " descent__tick--guess" : ""}" style="top:${y(note.page!)}px;--m:${stanceVar(note.stance)}"></i>`).join("")}
        ${book.reading?.page ? `<i class="descent__tick" style="top:${y(book.reading.page)}px;--m:var(--navy);left:-12px;right:-12px"></i>` : ""}
      </div>
      <div class="descent__col" style="height:${layout.height}px" data-lane>
        ${layout.cards.map(card => noteCardHtml(card.note, book, `top:${card.top}px`)).join("")}
        ${book.placed.length ? "" : `<p class="descent__hint" style="text-align:left">No notes have a page yet.</p>`}
      </div>
      <div class="descent__col" style="height:${layout.height}px">
        ${layout.exits.map((exit, i) => {
          const link = links[i]!;
          const swatch = findBook(books, link.toBook)?.swatch;
          return `<button class="descent-exit" type="button" style="top:${exit.top}px;--c:${swatch?.fill ?? "var(--shallow)"}" data-exit="${esc(link.toBook)}" data-exit-note="${esc(link.toId)}">
            <b>${esc(link.toLabel)}</b><span>${esc([link.toPage ? `p.${link.toPage}` : "", link.toTitle].filter(Boolean).join(" · "))}</span></button>`;
        }).join("")}
      </div>
      ${book.loose.length ? `<div class="descent__loose"><span>${book.loose.length} ${book.loose.length === 1 ? "note has" : "notes have"} no page yet, so ${book.loose.length === 1 ? "it isn't" : "they aren't"} in the column.</span><button class="btn btn--secondary" type="button" data-place-bottom>Place them</button></div>` : ""}
      <svg class="descent__links" data-links aria-hidden="true"></svg>`;

    bindNotes(body, book);
    body.querySelector<HTMLButtonElement>("[data-place-bottom]")?.addEventListener("click", () => openPlaceSheet(book));

    // Leader lines: tick → card, card → exit. Measured after layout so columns can flex.
    const svg = body.querySelector<SVGSVGElement>("[data-links]")!;
    const draw = () => {
      const base = body.getBoundingClientRect();
      const core = body.querySelector<HTMLElement>(".descent__core")!.getBoundingClientRect();
      const lane = body.querySelector<HTMLElement>("[data-lane]")!.getBoundingClientRect();
      let paths = "";
      for (const card of layout.cards) {
        const x0 = core.right - base.left;
        const y0 = core.top - base.top + card.anchor;
        const x1 = lane.left - base.left;
        const y1 = lane.top - base.top + card.top + CARD_HEIGHT / 2;
        const mx = (x0 + x1) / 2;
        paths += `<path d="M${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}" fill="none" stroke="${stanceVar(card.note.stance)}" stroke-width="1.2" opacity=".7"/>`;
      }
      const exitButtons = body.querySelectorAll<HTMLElement>(".descent-exit");
      layout.exits.forEach((exit, i) => {
        const button = exitButtons[i];
        if (!button) return;
        const r = button.getBoundingClientRect();
        const x0 = lane.right - base.left;
        const y0 = lane.top - base.top + exit.anchor;
        const x1 = r.left - base.left;
        const y1 = r.top - base.top + r.height / 2;
        const mx = (x0 + x1) / 2;
        const hot = exit.fromId === openNote;
        paths += `<path d="M${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}" fill="none" stroke="${hot ? "var(--high-sea)" : "var(--shallow)"}" stroke-width="1.4" stroke-dasharray="3 4"/>`;
      });
      svg.setAttribute("width", String(base.width));
      svg.setAttribute("height", String(base.height));
      svg.innerHTML = paths;
    };
    requestAnimationFrame(draw);

    // Bracket on the whole-book strip follows the scroll position.
    const strip = body.querySelector<HTMLElement>("[data-strip]")!;
    const bracket = body.querySelector<HTMLElement>("[data-bracket]")!;
    const core = body.querySelector<HTMLElement>(".descent__core")!;
    const syncBracket = () => {
      const coreTop = core.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop;
      const viewTop = shell.scrollTop + 90 - coreTop;
      const first = Math.max(1, viewTop / layout.pxPerPage + 1);
      const last = Math.min(book.pages, (viewTop + shell.clientHeight - 90) / layout.pxPerPage + 1);
      bracket.style.top = `${stripY(first) - 3}px`;
      bracket.style.height = `${Math.max(8, stripY(last) - stripY(first) + 6)}px`;
    };
    syncBracket();
    shell.addEventListener("scroll", syncBracket, { passive: true });
    strip.onclick = event => {
      const r = strip.getBoundingClientRect();
      const page = ((event.clientY - r.top) / (r.height - 12)) * book.pages;
      const coreTop = core.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop;
      shell.scrollTo({ top: coreTop + page * layout.pxPerPage - shell.clientHeight / 2, behavior: "smooth" });
    };
  }

  /** Chapter labels sit at their start page but never on top of each other. */
  function chapterTops(book: BookModel, y: (page: number) => number) {
    let floor = -Infinity;
    return book.chapters.map(ch => {
      const top = Math.max(y(ch.start) + 6, floor + 6);
      floor = top + 40;
      return { ch, top };
    });
  }

  function paintDescentList(body: HTMLElement, book: BookModel) {
    const groups: string[] = [];
    let chapterIndex: number | undefined = -1;
    for (const note of book.placed) {
      if (book.chapters.length && note.chapterIndex !== chapterIndex) {
        chapterIndex = note.chapterIndex;
        const ch = chapterIndex === undefined ? undefined : book.chapters[chapterIndex];
        groups.push(`<p class="descent-list__chapter">${esc(ch ? (ch.label ? `${ch.label} · ${ch.title}` : ch.title) : "Before chapter 1")} <span>· from p.${ch?.start ?? 1}</span></p>`);
      }
      const exits = book.links.filter(link => link.fromId === note.id);
      const card = noteCardHtml(note, book);
      groups.push(exits.length
        ? card.replace(/<\/article>$/, `<div class="descent-list__exits">${exits.map(link => `<button type="button" style="--c:${findBook(books, link.toBook)?.swatch.fill ?? "var(--shallow)"}" data-exit="${esc(link.toBook)}" data-exit-note="${esc(link.toId)}">→ ${esc(link.toLabel)}${link.toPage ? ` p.${link.toPage}` : ""}</button>`).join("")}</div></article>`)
        : card);
    }
    body.innerHTML = `<div class="descent-list">
      ${groups.join("") || `<p class="descent__hint" style="text-align:left">No notes have a page yet.</p>`}
      ${book.loose.length ? `<div class="descent__loose"><span>${book.loose.length} without a page</span><button class="btn btn--secondary" type="button" data-place-bottom>Place them</button></div>` : ""}
    </div>`;
    bindNotes(body, book);
    body.querySelector<HTMLButtonElement>("[data-place-bottom]")?.addEventListener("click", () => openPlaceSheet(book));
  }

  // ── Saving ──────────────────────────────────────────────────────────

  function toast(message: string, ms = 2600) {
    const existing = document.querySelector(".shelf-toast");
    existing?.remove();
    const el = document.createElement("div");
    el.className = "toast shelf-toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    el.style.cssText = "position:fixed;left:50%;bottom:2rem;transform:translateX(-50%);z-index:60;max-width:min(36rem,calc(100vw - 2rem));padding:.6rem 1rem;border-radius:var(--radius-sm);background:var(--navy);color:#fff;font-size:var(--text-sm);box-shadow:var(--elev-4)";
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), ms);
  }

  async function place(list: Parameters<typeof savePlacements>[0], done: string) {
    try {
      const saved = await savePlacements(list);
      const byId = new Map(saved.map(item => [item.pageId, item]));
      data = { ...data, placements: [...data.placements.filter(item => !byId.has(item.pageId)), ...saved] };
      rebuild();
      paint();
      toast(done);
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the page.");
      return false;
    }
  }

  async function saveFacts(input: Parameters<typeof saveBookFacts>[0], done: string) {
    const saved = await saveBookFacts(input);
    data = { ...data, books: [...data.books.filter(book => book.label.toLowerCase() !== saved.label.toLowerCase()), saved] };
    rebuild();
    paint();
    toast(done);
    return saved;
  }

  // ── Sheets ──────────────────────────────────────────────────────────

  function openSheet(html: string, label: string, onClose?: () => void) {
    const backdrop = document.createElement("div");
    backdrop.className = "shelf-sheet-backdrop";
    backdrop.innerHTML = `<div class="shelf-sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
    document.body.appendChild(backdrop);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
      if (alive) onClose?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) close();
    });
    cleanups.push(close);
    return { sheet: backdrop.querySelector<HTMLElement>(".shelf-sheet")!, close };
  }

  function openFactsSheet(book: BookModel) {
    const chapters = book.chapters.length
      ? `<ol class="shelf-sheet__chapters">${book.chapters.map(ch => `<li>${esc(ch.title)} <span>· p.${ch.start}</span></li>`).join("")}</ol>`
      : "None yet";
    const notebooks = ctx.notebookLabels;
    const { sheet, close } = openSheet(`
      <div class="shelf-sheet__head">
        <div><p class="shelf-eyebrow">Book facts</p><h2>${esc(book.label)}</h2></div>
        ${coverImg(book, "shelf-sheet__cover")}
      </div>
      <dl class="shelf-sheet__facts">
        <dt>Author</dt><dd>${esc(book.author ?? "Not set")}</dd>
        <dt>Edition</dt><dd>${esc(book.edition ?? "Not set")}</dd>
        <dt>Pages</dt><dd>${book.pagesKnown ? book.pages : "Not set (the column assumes 300)"}</dd>
        ${book.estimated ? `<dt>Source</dt><dd>Estimated by Claude (${book.estimated.confidence} confidence). Check against your copy; pasting facts replaces the estimate.</dd>` : ""}
        <dt>Chapters</dt><dd>${chapters}</dd>
      </dl>
      <div class="shelf-sheet__grid">
        <label>Notebook (radio band)
          <select id="facts-notebook"><option value="">No notebook</option>${notebooks.map(label => `<option${label === book.notebook ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>
        </label>
        <div>
          <label class="shelf-sheet__check"><input type="checkbox" id="facts-reading"${book.reading ? " checked" : ""} /> I'm reading this now</label>
          <label style="margin-top:var(--space-2)">Page I'm on<input type="number" id="facts-reading-page" min="1" inputmode="numeric" value="${book.reading?.page ?? ""}" /></label>
        </div>
      </div>
      <label>Paste book facts from ChatGPT
        <textarea id="facts-paste" spellcheck="false" placeholder='{"label": "${esc(book.label)}", "author": "…", "pages": 396, "chapters": [{"label": "1", "title": "…", "start": 11}]}'></textarea>
      </label>
      <p class="shelf-sheet__error" data-error role="alert" hidden></p>
      <div class="shelf-remove" data-remove-panel hidden>
        <p class="shelf-eyebrow">Remove from shelf</p>
        ${book.noteCount
          ? `<p>${book.noteCount} ${book.noteCount === 1 ? "note points" : "notes point"} to this book. They move to a notebook, then the book comes off the shelf. The ${book.noteCount === 1 ? "note itself is" : "notes themselves are"} kept.</p>
             <label>Move ${book.noteCount === 1 ? "it" : "them"} to<select id="remove-notebook">${notebooks.map(label => `<option${label === book.notebook ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`
          : `<p>No notes point to this book. Removing it clears its facts and reading page.</p>`}
        <div class="shelf-sheet__row shelf-sheet__row--end">
          <button class="btn btn--ghost" type="button" data-remove-cancel>Keep the book</button>
          <button class="btn btn--high-sea" type="button" data-remove-confirm>${book.noteCount ? "Move and remove" : "Remove the book"}</button>
        </div>
      </div>
      <div class="shelf-sheet__row">
        <button class="btn btn--ghost" type="button" data-copy>Copy ChatGPT prompt</button>
        <button class="btn btn--ghost" type="button" data-remove-open>Remove from shelf</button>
        <span style="flex:1"></span>
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn--primary" type="button" data-save>Save</button>
      </div>`, `${book.label} facts`);
    const error = sheet.querySelector<HTMLElement>("[data-error]")!;
    const fail = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };
    sheet.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close;
    const panel = sheet.querySelector<HTMLElement>("[data-remove-panel]")!;
    sheet.querySelector<HTMLButtonElement>("[data-remove-open]")!.onclick = () => {
      panel.hidden = false;
      panel.scrollIntoView({ block: "nearest" });
    };
    sheet.querySelector<HTMLButtonElement>("[data-remove-cancel]")!.onclick = () => {
      panel.hidden = true;
    };
    sheet.querySelector<HTMLButtonElement>("[data-remove-confirm]")!.onclick = async event => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      error.hidden = true;
      try {
        const ids = [...book.placed, ...book.loose].map(note => note.id);
        if (ids.length) {
          const notebook = sheet.querySelector<HTMLSelectElement>("#remove-notebook")!.value;
          button.textContent = `Moving ${ids.length} ${ids.length === 1 ? "note" : "notes"}…`;
          entries = await ctx.moveNotesToNotebook(book.label, ids, notebook);
        }
        await deleteBookRecord(book.label);
        data = { ...data, books: data.books.filter(item => item.label.toLowerCase() !== book.key) };
        close();
        rebuild();
        go(undefined);
        toast(ids.length ? `${book.label} is off the shelf. Its ${ids.length === 1 ? "note is" : "notes are"} in the notebook now.` : `${book.label} is off the shelf.`);
      } catch (err) {
        fail(err instanceof Error ? err.message : "Could not remove the book.");
        button.disabled = false;
        button.textContent = book.noteCount ? "Move and remove" : "Remove the book";
      }
    };
    sheet.querySelector<HTMLButtonElement>("[data-copy]")!.onclick = async () => {
      const prompt = bookFactsPrompt(book.label, book.author);
      try {
        await navigator.clipboard.writeText(prompt);
        toast("Prompt copied. Paste ChatGPT's answer back here.");
      } catch {
        const area = sheet.querySelector<HTMLTextAreaElement>("#facts-paste")!;
        area.value = prompt;
        area.select();
        fail("Couldn't reach the clipboard, so the prompt is in the box. Copy it from there.");
      }
    };
    sheet.querySelector<HTMLButtonElement>("[data-save]")!.onclick = async () => {
      error.hidden = true;
      const pasted = sheet.querySelector<HTMLTextAreaElement>("#facts-paste")!.value.trim();
      const parsed = pasted ? parseBookFacts(pasted, book.label) : { ok: true as const, facts: {} };
      if (!parsed.ok) return fail(parsed.error);
      const readingOn = sheet.querySelector<HTMLInputElement>("#facts-reading")!.checked;
      const readingPage = Number(sheet.querySelector<HTMLInputElement>("#facts-reading-page")!.value);
      const notebook = sheet.querySelector<HTMLSelectElement>("#facts-notebook")!.value;
      try {
        await saveFacts({
          ...parsed.facts,
          label: book.label,
          notebook: notebook || null,
          reading: readingOn ? { page: Number.isInteger(readingPage) && readingPage > 0 ? readingPage : null } : null,
        }, "Book facts saved.");
        close();
      } catch (err) {
        fail(err instanceof Error ? err.message : "Could not save the book facts.");
      }
    };
  }

  function openPlaceSheet(book: BookModel) {
    const queue = [...book.loose];
    if (!queue.length) return;
    let index = 0;
    // Start where you're reading: a new loose note is most likely from there.
    let current = book.reading?.page ?? Math.round(book.pages / 2);
    let placedCount = 0;
    const { sheet, close } = openSheet(`<div data-place-body></div>`, `Place loose pages in ${book.label}`, () => {
      rebuild();
      paint();
    });
    const pct = (page: number) => `${((page - 1) / Math.max(1, book.pages - 1)) * 100}%`;
    const chapterAt = (page: number) => {
      let found;
      for (const ch of book.chapters) if (ch.start <= page) found = ch;
      return found;
    };
    const render = () => {
      const note = queue[index];
      const host = sheet.querySelector<HTMLElement>("[data-place-body]")!;
      if (!note) {
        host.innerHTML = `<p class="shelf-eyebrow">Done</p><h2>${placedCount} ${placedCount === 1 ? "page" : "pages"} placed</h2>
          <p class="place-readout">${queue.length - placedCount ? `${queue.length - placedCount} skipped. They stay on the loose pile.` : "Every note in this book now has a page."}</p>
          <div class="shelf-sheet__row shelf-sheet__row--end"><button class="btn btn--primary" type="button" data-close>Back to the book</button></div>`;
        host.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
        return;
      }
      const ch = chapterAt(current);
      host.innerHTML = `
        <p class="shelf-eyebrow">Loose page ${index + 1} of ${queue.length} · ${esc(book.label)}</p>
        <div class="place-note"><h3>${esc(note.title)}</h3>${note.excerpt ? `<p>${esc(note.excerpt)}</p>` : ""}</div>
        <div class="place-edge" style="--c:${book.swatch.fill}">
          ${book.chapters.map(c => `<span class="place-edge__chapter" style="left:${pct(c.start)};width:calc(${pct(c.end + 1)} - ${pct(c.start)})" title="${esc(c.title)}"></span>`).join("")}
          ${book.placed.map(n => `<i class="place-edge__mark" style="left:${pct(n.page!)};--m:${stanceVar(n.stance)}"></i>`).join("")}
          <i class="place-edge__pin" style="left:${pct(current)}"></i>
          <input type="range" id="place-range" min="1" max="${book.pages}" value="${current}" aria-label="Rough page in the book" />
        </div>
        <div class="place-readout"><span>${ch ? esc(ch.label ? `Chapter ${ch.label} · ${ch.title}` : ch.title) : book.chapters.length ? "Front matter" : "Drag along the page edge, or type a page"}</span>
          <label class="descent-note__page">p.<input type="number" id="place-page" inputmode="numeric" min="1" max="${book.pages}" value="${current}" /></label></div>
        <label class="shelf-sheet__check" style="margin-top:var(--space-3)"><input type="checkbox" id="place-guess" checked /> This is a rough guess</label>
        <p class="shelf-sheet__error" data-error role="alert" hidden></p>
        <div class="shelf-sheet__row">
          <button class="btn btn--ghost" type="button" data-close>Stop</button>
          <span style="flex:1"></span>
          <button class="btn btn--ghost" type="button" data-skip>Skip</button>
          <button class="btn btn--primary" type="button" data-place>Place at p.${current}</button>
        </div>`;
      const range = host.querySelector<HTMLInputElement>("#place-range")!;
      const number = host.querySelector<HTMLInputElement>("#place-page")!;
      const setPage = (page: number, from: "range" | "number") => {
        current = Math.max(1, Math.min(book.pages, Math.round(page)));
        if (from !== "range") range.value = String(current);
        if (from !== "number") number.value = String(current);
        host.querySelector<HTMLElement>(".place-edge__pin")!.style.left = pct(current);
        host.querySelector<HTMLButtonElement>("[data-place]")!.textContent = `Place at p.${current}`;
        const c = chapterAt(current);
        host.querySelector<HTMLElement>(".place-readout span")!.textContent = c ? (c.label ? `Chapter ${c.label} · ${c.title}` : c.title) : book.chapters.length ? "Front matter" : "Drag along the page edge, or type a page";
      };
      range.oninput = () => setPage(Number(range.value), "range");
      number.oninput = () => {
        const value = Number(number.value);
        if (Number.isFinite(value) && value >= 1) setPage(value, "number");
      };
      const commit = async () => {
        const button = host.querySelector<HTMLButtonElement>("[data-place]")!;
        button.disabled = true;
        const guessed = host.querySelector<HTMLInputElement>("#place-guess")!.checked;
        try {
          const saved = await savePlacements([{ pageId: note.id, page: current, guessed }]);
          data = { ...data, placements: [...data.placements.filter(item => item.pageId !== note.id), ...saved] };
          placedCount += 1;
          index += 1;
          render();
        } catch (err) {
          const error = host.querySelector<HTMLElement>("[data-error]")!;
          error.textContent = err instanceof Error ? err.message : "Could not save that page. Try again.";
          error.hidden = false;
          button.disabled = false;
        }
      };
      host.querySelector<HTMLButtonElement>("[data-place]")!.onclick = () => void commit();
      host.querySelector<HTMLButtonElement>("[data-skip]")!.onclick = () => {
        index += 1;
        render();
      };
      host.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
      host.onkeydown = event => {
        if (event.key === "Enter" && !(event.target as HTMLElement).matches("button")) {
          event.preventDefault();
          void commit();
        }
      };
      range.focus();
    };
    render();
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || document.querySelector(".shelf-sheet-backdrop")) return;
    if (!active) {
      // Escape on air goes back to the dial, unless you're typing (I8).
      const target = event.target as HTMLElement | null;
      if (room === "wireless" && !target?.closest("input, textarea, [contenteditable]")) wireless.escape();
      return;
    }
    go(undefined);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));

  let resizeFrame = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      // The map handles its own resizing; repainting would throw away the pan and zoom.
      if (active && mode === "map") return;
      if (!phone.matches || !active) paint();
    });
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));

  rebuild();
  paint();
  void load();

  return () => {
    alive = false;
    window.clearTimeout(factsTimer);
    atlasTeardown?.();
    wireless.destroy();
    document.body.classList.remove("is-bookshelf-immersive");
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}

