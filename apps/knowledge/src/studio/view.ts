import "./studio.css";
import { formatDisplayDate } from "../../design-kit/js/format-display-date.js";
import { escapeHtml, showToast } from "../lib/dom";
import { newHubPageId, type Page, type PageManifestEntry } from "../domain/page";
import { changeStudio, getStudio, type StudioOp } from "./client";
import {
  alreadyWritten,
  assembleDraft,
  chapterCount,
  chapterWords,
  cornerstones,
  draftMarkdown,
  flatChapters,
  formatWords,
  inKnowledge,
  insights,
  nextMove,
  researchedChapters,
  sharedNotes,
  singleSourceRisk,
  suggestNotes,
  type DraftParagraph,
  type Insight,
} from "./model";
import { STUDIO_STAGES, type StudioArea, type StudioBook, type StudioData } from "./schema";
import { constellationLayout } from "./layout";

export type StudioDeps = {
  entries: PageManifestEntry[];
  header: (supportingHtml: string, actionsHtml: string) => string;
  openPage: (id: string) => void;
  getPage: (id: string) => Promise<Page>;
  savePage: (page: Page) => Promise<Page>;
  onSaved?: () => Promise<void> | void;
};

const SHELF_LABEL: Record<StudioArea, string> = {
  series: "Series",
  gifted: "Gifted",
  science: "Science",
  systems: "Systems",
  teachers: "Teachers",
  history: "History",
  new: "New",
};

export const AREA_LABEL: Record<StudioArea, string> = {
  series: "Series",
  gifted: "Gifted and potential",
  science: "Learning science",
  systems: "Schools and systems",
  teachers: "Teachers",
  history: "History",
  new: "New ideas",
};
const AREA_ORDER: StudioArea[] = ["series", "gifted", "science", "systems", "teachers", "history", "new"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

const ICON_PLUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const ICON_SPARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>`;
const ICON_WARN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>`;
const ICON_PERSON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>`;

type DraftState = { key: string; status: "loading" | "ready" | "error"; paragraphs: DraftParagraph[]; message?: string };

type State = {
  data: StudioData | null;
  loadError: string;
  sel: string | null;
  chapter: number | null;
  view: "shelf" | "graph";
  sort: "shelf" | "written";
  filter: StudioArea | "all";
  composer: boolean;
  confirm: string | null;
  busy: boolean;
  draft: DraftState | null;
  savingDraft: boolean;
};

const words = (n: number) => `${n.toLocaleString("en-AU")} ${n === 1 ? "word" : "words"}`;
const isoDay = (day: string) => formatDisplayDate(day.length === 10 ? `${day}T00:00:00` : day);

export function mountStudio(host: HTMLElement, deps: StudioDeps): () => void {
  const state: State = {
    data: null,
    loadError: "",
    sel: null,
    chapter: null,
    view: "shelf",
    sort: "shelf",
    filter: "all",
    composer: false,
    confirm: null,
    busy: false,
    draft: null,
    savingDraft: false,
  };
  let alive = true;
  const docs = deps.entries.map(entry => ({ id: entry.id, title: entry.title, excerpt: entry.excerpt, tags: entry.tags, area: entry.area }));
  const entryById = new Map(deps.entries.map(entry => [entry.id, entry]));

  const book = (): StudioBook | null => state.data?.books.find(b => b.id === state.sel) ?? null;
  const matches = (b: StudioBook) => state.filter === "all" || b.area === state.filter || (state.filter === "gifted" && b.area === "series");

  async function load() {
    try {
      state.data = await getStudio();
      state.loadError = "";
      if (!state.sel || !state.data.books.some(b => b.id === state.sel)) {
        state.sel = [...state.data.books].sort((a, b) => alreadyWritten(b, state.data!).words - alreadyWritten(a, state.data!).words)[0]?.id ?? null;
      }
    } catch (error) {
      state.loadError = error instanceof Error ? error.message : "Studio could not load.";
    }
    if (alive) render();
  }

  async function apply(op: StudioOp, success?: string) {
    if (state.busy) return;
    state.busy = true;
    try {
      state.data = await changeStudio(op);
      if (success) showToast(success);
    } catch (error) {
      // V5: say why it failed.
      showToast(error instanceof Error ? error.message : "Studio could not save.");
    } finally {
      state.busy = false;
      if (alive) render();
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  function statsHtml(data: StudioData) {
    const planned = data.books.reduce((n, b) => n + chapterCount(b), 0);
    const researched = data.books.reduce((n, b) => n + researchedChapters(b, data).length, 0);
    const moving = data.books.filter(b => b.stage !== "Just an Idea").length;
    const notes = new Set(data.books.flatMap(b => [...b.notes, ...flatChapters(b).flatMap(c => c.notes)]).filter(ref => inKnowledge(data, ref)));
    const totalWords = [...notes].reduce((n, ref) => n + data.notes[ref].words, 0);
    return `<ul class="studio-stats">
      <li><b>${data.books.length}</b><span>ideas on the shelf</span></li>
      <li><b>${moving}<em>/${data.books.length}</em></b><span>past “Just an Idea”</span></li>
      <li><b>${researched}<em>/${planned}</em></b><span>chapters with notes behind them</span></li>
      <li class="studio-stats__hero"><b>${formatWords(totalWords)}</b><span>words already in your notes</span></li>
    </ul>`;
  }

  function spineHtml(b: StudioBook, data: StudioData) {
    const w = alreadyWritten(b, data);
    const count = chapterCount(b);
    const height = Math.round(150 + Math.min(count, 25) * 5.2);
    const material = w.notes || (b.history ? b.history.web_sources * 0.7 : 0);
    const width = Math.round(Math.max(30, Math.min(58, 24 + material * 1.2)));
    const cls = [
      "studio-spine",
      `studio-spine--${b.area}`,
      b.history ? "studio-spine--web" : "",
      b.kind === "blank" ? "studio-spine--blank" : "",
      matches(b) ? "" : "is-dim",
    ].join(" ");
    const label = `${b.title}. ${count} chapters planned. ${words(w.words)} already in your notes.`;
    return `<button class="${cls}" type="button" data-book="${escapeHtml(b.id)}" aria-pressed="${state.sel === b.id}"
      style="--h:${height}px;--w:${width}px;--ink:${Math.round(w.ink * 100)}%" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="studio-spine__ink" aria-hidden="true"></span>
      <span class="studio-spine__bands" aria-hidden="true"><i></i><i></i></span>
      <span class="studio-spine__title">${escapeHtml(b.short)}</span>
      <span class="studio-spine__words" aria-hidden="true">${w.words ? formatWords(w.words) : "–"}</span>
    </button>`;
  }

  function shelfHtml(data: StudioData) {
    if (state.sort === "written") {
      const sorted = [...data.books].sort((a, b) => alreadyWritten(b, data).words - alreadyWritten(a, data).words);
      return `<div class="studio-shelf"><div class="studio-shelf__group"><div class="studio-shelf__books">${sorted.map(b => spineHtml(b, data)).join("")}</div>
        <span class="studio-shelf__label">Most written first</span></div>${ghostHtml()}</div>`;
    }
    const groups = AREA_ORDER.map(area => ({ area, books: data.books.filter(b => b.area === area) })).filter(g => g.books.length);
    return `<div class="studio-shelf">${groups
      .map(g => {
        const series = g.area === "series" ? g.books[0].series ?? "Series" : "";
        return `<div class="studio-shelf__group${series ? " studio-shelf__group--series" : ""}">
          ${series ? `<div class="studio-shelf__bracket"><span>${escapeHtml(series)}</span></div>` : ""}
          <div class="studio-shelf__books">${g.books.map(b => spineHtml(b, data)).join("")}</div>
          ${series ? "" : `<span class="studio-shelf__label">${escapeHtml(SHELF_LABEL[g.area])}</span>`}
        </div>`;
      })
      .join("")}${ghostHtml()}</div>`;
  }

  const ghostHtml = () =>
    `<button class="studio-ghost" type="button" data-new-idea aria-label="Put a new idea on the shelf">${ICON_PLUS}</button>`;

  function graphHtml(data: StudioData) {
    const layout = constellationLayout(data);
    const selIndex = layout.nodes.findIndex(n => n.book.id === state.sel);
    const near = new Set<number>([selIndex]);
    layout.edges.forEach(e => {
      if (e.a === selIndex || e.b === selIndex) {
        near.add(e.a);
        near.add(e.b);
      }
    });
    const focus = selIndex >= 0;
    const links = layout.edges
      .filter(e => e.a === selIndex || e.b === selIndex)
      .map(e => ({ other: layout.nodes[e.a === selIndex ? e.b : e.a].book, e }))
      .sort((x, y) => y.e.weight - x.e.weight);
    const sel = book();
    return `<div class="studio-graph${focus ? " has-focus" : ""}">
      <svg viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Book ideas joined by the research they share">
        ${layout.edges
          .map(e => {
            const a = layout.nodes[e.a];
            const b = layout.nodes[e.b];
            const hot = e.a === selIndex || e.b === selIndex;
            return `<line class="studio-edge studio-edge--${e.kind}${hot ? " is-hot" : ""}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${e.kind === "share" ? (1 + e.weight * 0.45).toFixed(1) : 2}"/>`;
          })
          .join("")}
        ${layout.nodes
          .map((n, i) => `<g class="studio-node studio-node--${n.book.area}${near.has(i) ? " is-near" : ""}${i === selIndex ? " is-hot" : ""}${matches(n.book) ? "" : " is-dim"}" data-book="${escapeHtml(n.book.id)}" tabindex="0" role="button" aria-label="${escapeHtml(n.book.title)}">
            <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}"/>
            <text x="${n.x.toFixed(1)}" y="${(n.y + n.r + 14).toFixed(1)}" text-anchor="middle">${escapeHtml(n.book.short)}</text></g>`)
          .join("")}
      </svg>
      ${sel ? `<div class="studio-graph__preview"><p class="eyebrow">${escapeHtml(AREA_LABEL[sel.area])}</p><h3>${escapeHtml(sel.title)}</h3>
        ${links.length
          ? `<ul>${links.slice(0, 5).map(({ other, e }) => `<li><span>${escapeHtml(other.short)}</span><b>${e.kind === "twin" ? "same idea?" : e.kind === "cite" ? "cites" : `${e.weight} notes`}</b></li>`).join("")}</ul>`
          : `<p class="studio-muted">No shared notes yet.</p>`}</div>` : ""}
    </div>
    <p class="studio-note">Lines join ideas that cite the same notes; thicker lines share more. Dashed: one idea cites another. Dotted orange: two ideas that look like one book.</p>`;
  }

  function stageHtml(b: StudioBook) {
    const at = STUDIO_STAGES.indexOf(b.stage);
    return `<div class="studio-stepper">
      <ol>${STUDIO_STAGES.map((s, i) => `<li class="${i < at ? "is-done" : i === at ? "is-now" : ""}">${s}</li>`).join("")}</ol>
      ${at < STUDIO_STAGES.length - 1 ? `<button class="btn btn--secondary btn--sm" type="button" data-stage="${STUDIO_STAGES[at + 1]}" ${state.busy ? "disabled" : ""}>Move to ${STUDIO_STAGES[at + 1]}</button>` : ""}
    </div>`;
  }

  function noteRowHtml(ref: string, data: StudioData, b: StudioBook, chapter: number | null) {
    const note = data.notes[ref];
    if (!note) return "";
    const also = data.books.filter(o => o !== b && [...o.notes, ...flatChapters(o).flatMap(c => c.notes)].includes(ref));
    const unlink = chapter !== null && inKnowledge(data, ref)
      ? `<button class="studio-linkish studio-linkish--quiet" type="button" data-unlink="${escapeHtml(ref)}">Unlink</button>` : "";
    return `<li class="studio-noterow${note.in_knowledge ? "" : " is-missing"}">
      ${note.in_knowledge
        ? `<button class="studio-noterow__title" type="button" data-open-page="${escapeHtml(ref)}">${escapeHtml(note.title)}</button>`
        : `<span class="studio-noterow__title">${escapeHtml(note.title)}</span>`}
      <span class="studio-noterow__meta">${note.in_knowledge ? words(note.words) : "Not available in Knowledge yet"}${note.topic_label ? " · topic only" : ""}</span>
      ${also.length || unlink ? `<span class="studio-noterow__also">${also.map(o => `<button class="studio-mini studio-mini--${o.area}" type="button" data-book="${escapeHtml(o.id)}">${escapeHtml(o.short)}</button>`).join("")}${unlink}</span>` : ""}
    </li>`;
  }

  function chapterPanelHtml(b: StudioBook, data: StudioData) {
    const chapters = flatChapters(b);
    if (state.chapter === null || !chapters[state.chapter]) {
      const others = data.books
        .filter(o => o !== b)
        .map(o => ({ o, n: sharedNotes(b, o, data).length }))
        .filter(x => x.n)
        .sort((x, y) => y.n - x.n)
        .slice(0, 5);
      return `<div class="studio-card"><p class="eyebrow">Shares research with</p>
        ${others.length
          ? `<ul class="studio-notelist">${others.map(({ o, n }) => `<li class="studio-noterow"><button class="studio-noterow__title" type="button" data-book="${escapeHtml(o.id)}">${escapeHtml(o.title)}</button><span class="studio-noterow__meta">${n} shared ${n === 1 ? "note" : "notes"} · ${escapeHtml(AREA_LABEL[o.area])}</span></li>`).join("")}</ul>`
          : `<p class="studio-muted">No other idea uses these notes yet.</p>`}
        <p class="studio-muted">Pick a chapter to see the notes behind it and assemble a first draft.</p></div>`;
    }
    const ch = chapters[state.chapter];
    const linked = ch.notes;
    const suggestions = suggestNotes(b, ch, docs, 4);
    const draftKey = `${b.id}:${ch.index}`;
    const draft = state.draft?.key === draftKey ? state.draft : null;
    const hasMaterial = linked.some(ref => inKnowledge(data, ref));
    return `<div class="studio-card">
      <p class="eyebrow">Chapter ${ch.index + 1} · ${words(chapterWords(ch, data))} in your notes</p>
      <h3 class="studio-card__title">${escapeHtml(ch.title)}</h3>
      ${linked.length ? `<ul class="studio-notelist">${linked.map(ref => noteRowHtml(ref, data, b, ch.index)).join("")}</ul>` : `<p class="studio-muted">Nothing linked yet.</p>`}
      ${(ch.cites ?? []).map(id => data.books.find(o => o.id === id)).filter(Boolean).map(o => `<p class="studio-muted">Also cites your idea <button class="studio-mini studio-mini--${o!.area}" type="button" data-book="${escapeHtml(o!.id)}">${escapeHtml(o!.short)}</button></p>`).join("")}
      <div class="studio-card__actions">
        <button class="btn btn--primary btn--sm" type="button" data-draft ${hasMaterial && draft?.status !== "loading" ? "" : "disabled"}>${draft?.status === "loading" ? "Assembling…" : "Assemble a first draft"}</button>
      </div>
      ${hasMaterial ? "" : `<p class="studio-muted">Link a note below to give this chapter material.</p>`}
      ${suggestions.length
        ? `<p class="eyebrow studio-card__sub">Notes in Knowledge that look relevant</p>
          <ul class="studio-notelist">${suggestions.map(s => `<li class="studio-noterow"><button class="studio-noterow__title" type="button" data-open-page="${escapeHtml(s.id)}">${escapeHtml(s.title)}</button>
            <span class="studio-noterow__also"><button class="btn btn--ghost btn--sm" type="button" data-link="${escapeHtml(s.id)}" ${state.busy ? "disabled" : ""}>Link to this chapter</button></span></li>`).join("")}</ul>`
        : ""}
    </div>`;
  }

  function draftHtml(b: StudioBook) {
    const d = state.draft;
    if (!d || d.key.split(":")[0] !== b.id) return "";
    if (d.status === "loading") return `<section class="studio-draft"><p class="studio-muted">Reading your notes for this chapter…</p></section>`;
    if (d.status === "error") return `<section class="studio-draft"><p class="studio-error">${escapeHtml(d.message ?? "Could not read the notes.")}</p></section>`;
    const ch = flatChapters(b)[Number(d.key.split(":")[1])];
    if (!d.paragraphs.length) {
      return `<section class="studio-draft"><p class="studio-muted">These notes have no paragraphs long enough to quote for “${escapeHtml(ch.title)}”. Link a fuller note and try again.</p></section>`;
    }
    const total = d.paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
    return `<section class="studio-draft" aria-labelledby="studio-draft-h">
      <div class="studio-draft__head">
        <div><p class="eyebrow">First draft · Chapter ${ch.index + 1}</p><h3 id="studio-draft-h">${escapeHtml(ch.title)}</h3>
        <p class="studio-muted">${d.paragraphs.length} paragraphs, ${words(total)}, quoted from your notes. Nothing here is invented: each paragraph names its note.</p></div>
        <div class="studio-draft__actions">
          <button class="btn btn--primary btn--sm" type="button" data-save-draft ${state.savingDraft ? "disabled" : ""}>${state.savingDraft ? "Saving…" : "Save as a note"}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-close-draft>Close</button>
        </div>
      </div>
      <ol class="studio-draft__body">${d.paragraphs
        .map(p => `<li><p>${escapeHtml(p.text)}</p><button class="studio-draft__src" type="button" data-open-page="${escapeHtml(p.source.id)}">from ${escapeHtml(p.source.title)}</button></li>`)
        .join("")}</ol>
    </section>`;
  }

  function chaptersHtml(b: StudioBook, data: StudioData) {
    const move = nextMove(b, data);
    const risk = singleSourceRisk(b, data);
    const maxWords = Math.max(1, ...flatChapters(b).map(ch => chapterWords(ch, data)));
    let n = 0;
    return `${move ? `<div class="studio-callout">${ICON_SPARK}<div>
        <p><b>Start with Part ${ROMAN[move.part]}, ${escapeHtml(move.partName)}.</b> Notes already cover ${move.researched} of its ${move.total} chapters.</p>
        <p>Chapter ${move.chapter.index + 1}, “${escapeHtml(move.chapter.title)}”, has ${words(move.chapterWords)} behind it. <button class="studio-linkish" type="button" data-chapter="${move.chapter.index}">Open it</button></p></div></div>` : ""}
      ${risk ? `<div class="studio-callout studio-callout--risk">${ICON_WARN}<div><p><b>${risk.leaning} of ${risk.researched} researched chapters lean on one note.</b></p>
        <p>“${escapeHtml(data.notes[risk.ref].title)}” carries most of this book. Add more sources before you outline.</p></div></div>` : ""}
      <div class="studio-section-head"><h3>Chapters</h3><p>Ink shows how many words of your notes sit under each chapter</p></div>
      ${(b.parts ?? [])
        .map((part, p) => {
          const researched = part.chapters.filter(ch => ch.notes.some(ref => inKnowledge(data, ref))).length;
          return `<div class="studio-part"><div class="studio-part__name">${ROMAN[p] ?? p + 1} · ${escapeHtml(part.name)}<span>${researched}/${part.chapters.length} with notes</span></div>
            <div class="studio-chapters">${part.chapters
              .map(ch => {
                const i = n++;
                const w = chapterWords(ch, data);
                const level = w === 0 ? 0 : Math.max(0.12, w / maxWords);
                return `<button class="studio-ch${w ? "" : " is-cold"}" type="button" data-chapter="${i}" aria-pressed="${state.chapter === i}" style="--fill:${Math.round(level * 100)}%">
                  ${ch.cites?.length ? `<i class="studio-ch__xref" title="Cites another of your ideas"></i>` : ""}
                  <b>CH ${String(i + 1).padStart(2, "0")}</b><span class="studio-ch__title">${escapeHtml(ch.title)}</span>
                  <span class="studio-ch__words">${w ? `${formatWords(w)} words` : "No notes yet"}</span></button>`;
              })
              .join("")}</div></div>`;
        })
        .join("")}`;
  }

  function interviewHtml(b: StudioBook, data: StudioData) {
    const iv = b.interview!;
    const twin = insights(data).find(i => i.id.startsWith("merge:") && i.open === b.id);
    return `<div class="studio-callout">${ICON_SPARK}<div><p><b>This book is ready for its first interview.</b> The five questions are written and the cast has ${iv.cast.length} seats.</p>
      <p>Book one educator before outlining anything else. The conversations become the chapters.</p></div></div>
      <div class="studio-section-head"><h3>The interview spine</h3><p>Every educator answers the same ${iv.questions.length}</p></div>
      <ol class="studio-questions">${iv.questions
        .map(([q, d]) => {
          const isTwin = Boolean(twin) && /stolen|borrow/i.test(q);
          return `<li class="${isTwin ? "is-twin" : ""}"><div><b>${escapeHtml(q)}</b><span>${escapeHtml(d)}</span>${isTwin ? `<em>“Can I Borrow That?” is this question as a whole series.</em>` : ""}</div></li>`;
        })
        .join("")}</ol>
      <div class="studio-section-head"><h3>The cast</h3><p>0 of ${iv.cast.length} seats filled</p></div>
      <div class="studio-cast">${iv.cast.map(c => `<div class="studio-seat">${ICON_PERSON}<span>${escapeHtml(c)}</span></div>`).join("")}</div>`;
  }

  function historyHtml(b: StudioBook) {
    const h = b.history!;
    const empty = h.schools.filter(([, n]) => n === 0).map(([s]) => s.split(",")[0]);
    return `<div class="studio-callout">${ICON_SPARK}<div><p><b>The most fully framed idea on the shelf.</b> A thesis, a five-lens method and ${h.schools.length} case studies.</p>
      <p>All ${h.web_sources} sources are web links. Capture them into Knowledge so each case study has notes behind it.</p></div></div>
      <div class="studio-section-head"><h3>Case studies</h3><p>Web sources cited for each closed school</p></div>
      <ul class="studio-schools">${h.schools
        .map(([s, n]) => `<li><span>${escapeHtml(s)}</span><span class="studio-dots" aria-label="${n} sources">${Array.from({ length: Math.max(n, 1) }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span></li>`)
        .join("")}</ul>
      ${empty.length ? `<p class="studio-muted">${empty.length} of ${h.schools.length} schools have no source yet: ${escapeHtml(empty.join(", "))}.</p>` : ""}
      <div class="studio-section-head"><h3>Working titles</h3><p>Pick one when you outline</p></div>
      <ul class="studio-titles">${h.titles.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      <p class="studio-muted">Lenses: ${escapeHtml(h.lenses.join(", "))}.</p>`;
  }

  function deskHtml(data: StudioData) {
    const b = book();
    if (!b) return `<section class="studio-desk studio-panel"><p class="studio-muted">Pick a spine to put it on the desk.</p></section>`;
    const w = alreadyWritten(b, data);
    const count = chapterCount(b);
    const shareCount = data.books.filter(o => o !== b && sharedNotes(b, o, data).length).length;
    const tags = [
      ...(b.series ? [`${b.series} · ${data.books.filter(x => x.series === b.series).indexOf(b) + 1} of ${data.books.filter(x => x.series === b.series).length}`] : []),
      ...(b.audience ?? []),
      ...(b.subjects ?? []),
    ];
    let body = "";
    if (b.parts) {
      body = `<div class="studio-written">
          <div><b>${w.words.toLocaleString("en-AU")}</b><span>words of your notes already sit under these chapters</span></div>
          <ul>
            <li><b>${researchedChapters(b, data).length}<em>/${count}</em></b><span>chapters with notes</span></li>
            <li><b>${w.notes}</b><span>notes in Knowledge</span></li>
            ${w.missing ? `<li><b>${w.missing}</b><span>cited but not imported</span></li>` : ""}
            <li><b>${shareCount}</b><span>other ideas share them</span></li>
          </ul>
        </div>
        <div class="studio-desk__grid"><div class="studio-desk__main">${chaptersHtml(b, data)}</div><div class="studio-desk__side">${chapterPanelHtml(b, data)}</div></div>
        ${draftHtml(b)}`;
    } else if (b.interview) {
      body = interviewHtml(b, data);
    } else if (b.history) {
      body = historyHtml(b);
    } else {
      const merge = insights(data).find(i => i.id.startsWith(`merge:${b.id}:`));
      body = `<div class="studio-callout">${ICON_SPARK}<div><p><b>A blank page.</b> ${b.blurb ? "The idea lives in its description so far." : "Nothing is planned or linked yet."}</p>
        <p>${merge ? escapeHtml(merge.title) : "Give it a chapter plan here, then link notes to each chapter."}</p></div></div>`;
    }
    return `<section class="studio-desk studio-panel" aria-labelledby="studio-desk-title">
      <div class="studio-desk__head">
        <div><p class="eyebrow">On the desk · ${escapeHtml(AREA_LABEL[b.area])}</p>
          <h2 class="studio-desk__title" id="studio-desk-title">${escapeHtml(b.title)}</h2>
          ${b.subtitle ? `<p class="studio-desk__sub">${escapeHtml(b.subtitle)}</p>` : ""}</div>
        <div class="studio-cover studio-cover--${b.area}" aria-hidden="true"><small>${escapeHtml(b.series ?? "Adam Russell")}</small><span>${escapeHtml(b.short)}</span></div>
      </div>
      ${b.blurb ? `<p class="studio-desk__blurb">${escapeHtml(b.blurb)}</p>` : ""}
      <div class="studio-desk__meta">
        <span class="studio-stage studio-stage--${STUDIO_STAGES.indexOf(b.stage)}">${escapeHtml(b.stage)}</span>
        ${tags.map(t => `<span class="studio-tag">${escapeHtml(t)}</span>`).join("")}
        <span class="studio-muted">Added ${escapeHtml(isoDay(b.added))}</span>

      </div>
      ${stageHtml(b)}
      ${body}
    </section>`;
  }

  function insightHtml(item: Insight) {
    const confirming = state.confirm === item.id && item.action;
    return `<article class="studio-insight">
      <p class="eyebrow">${escapeHtml(item.eyebrow)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
      ${item.why ? `<p class="studio-muted">${escapeHtml(item.why)}</p>` : ""}
      ${confirming
        ? `<div class="confirm-card"><div class="confirm-card__head"><span class="confirm-card__title">${escapeHtml(item.action!.confirm)}</span></div>
            <div class="confirm-card__actions"><button class="btn btn--ghost btn--sm" type="button" data-cancel-confirm>Discard</button><button class="btn btn--primary btn--sm" type="button" data-decide="${escapeHtml(item.id)}" data-choice="${escapeHtml(item.action!.choice)}" ${state.busy ? "disabled" : ""}>Confirm</button></div></div>`
        : `<div class="studio-insight__actions">
            ${item.action ? `<button class="btn btn--secondary btn--sm" type="button" data-confirm="${escapeHtml(item.id)}">${escapeHtml(item.action.label)}</button>` : ""}
            ${item.open ? `<button class="studio-linkish" type="button" data-book="${escapeHtml(item.open)}">Open on desk</button>` : ""}
            <button class="studio-linkish studio-linkish--quiet" type="button" data-decide="${escapeHtml(item.id)}" data-choice="dismissed" ${state.busy ? "disabled" : ""}>Not now</button>
          </div>`}
    </article>`;
  }

  function asideHtml(data: StudioData) {
    const list = insights(data);
    const corner = cornerstones(data).slice(0, 5);
    const planned = data.books.filter(b => knowledgeBooks(b, data));
    return `<aside class="studio-aside">
      <section class="studio-panel">
        <div class="studio-aside__head"><span class="studio-clem" aria-hidden="true"></span><div><h2>Clementine noticed</h2><p>${list.length ? `${list.length} ${list.length === 1 ? "thing" : "things"} across your ${data.books.length} ideas` : "Nothing new right now"}</p></div></div>
        <div class="studio-insights">${list.map(insightHtml).join("") || `<p class="studio-muted">You've answered everything. New suggestions appear as your notes change.</p>`}</div>
      </section>
      ${corner.length ? `<section class="studio-panel studio-corner">
        <p class="eyebrow">Cornerstone notes</p><h2>The notes your ideas lean on most</h2>
        ${corner.map(({ ref, books }) => `<div class="studio-corner__row">
          <button class="studio-noterow__title" type="button" data-open-page="${escapeHtml(ref)}">${escapeHtml(data.notes[ref].title)}</button><b>${books.length}</b>
          <span class="studio-corner__bar" title="${escapeHtml(books.map(b => b.short).join(", "))}">${planned.map(b => `<i class="${books.includes(b) ? `on studio-fill--${b.area}` : ""}"></i>`).join("")}</span></div>`).join("")}
        <p class="studio-muted">Each bar is one of your ${planned.length} ideas with notes; filled if it cites the note.</p>
      </section>` : ""}
    </aside>`;
  }

  const knowledgeBooks = (b: StudioBook, data: StudioData) =>
    [...b.notes, ...flatChapters(b).flatMap(c => c.notes)].some(ref => inKnowledge(data, ref));

  function render() {
    const actions = `<button class="btn btn--primary" type="button" data-new-idea>${ICON_PLUS}<span>New idea</span></button>`;
    const header = deps.header("The books you haven't written yet, standing on the notes you already have.", actions);
    if (state.loadError) {
      host.innerHTML = `${header}<div class="studio-panel studio-error-panel"><p class="studio-error">${escapeHtml(state.loadError)}</p><button class="btn btn--secondary" type="button" data-retry>Try again</button></div>`;
      bind();
      return;
    }
    const data = state.data;
    if (!data) {
      host.innerHTML = `${header}<p class="canvas-status">Opening the studio…</p>`;
      return;
    }
    if (!data.books.length) {
      host.innerHTML = `${header}<div class="studio-panel studio-empty"><p>No book ideas yet. Put the first one on the shelf.</p>${composerHtml()}</div>`;
      bind();
      return;
    }
    host.innerHTML = `${header}
      <div class="studio">
        <div class="studio__shelf">
          ${statsHtml(data)}
          <section class="studio-panel studio-shelf-panel" aria-label="Your unwritten shelf">
            <div class="studio-toolbar">
              <div class="hub-pills" role="tablist" aria-label="View">
                <button class="hub-pills__btn" role="tab" type="button" data-view="shelf" aria-selected="${state.view === "shelf"}">Shelf</button>
                <button class="hub-pills__btn" role="tab" type="button" data-view="graph" aria-selected="${state.view === "graph"}">Constellation</button>
              </div>
              ${state.view === "shelf" ? `<div class="hub-pills" aria-label="Order">
                <button class="hub-pills__btn" type="button" data-sort="shelf" aria-selected="${state.sort === "shelf"}">By area</button>
                <button class="hub-pills__btn" type="button" data-sort="written" aria-selected="${state.sort === "written"}">Most written</button>
              </div>` : ""}
              <div class="studio-filters">${(["all", ...AREA_ORDER.filter(a => data.books.some(b => b.area === a))] as Array<StudioArea | "all">)
                .map(a => `<button class="hub-chip${state.filter === a ? " is-active" : ""}" type="button" data-filter="${a}">${a === "all" ? "All" : escapeHtml(AREA_LABEL[a])}</button>`)
                .join("")}</div>
            </div>
            ${state.view === "shelf"
              ? `<div class="studio-shelf-scroll">${shelfHtml(data)}</div>
                 <div class="studio-legend"><span><i class="studio-legend__ink"></i>Ink: share of chapters with notes behind them</span><span><i class="studio-legend__w"></i>Number: words already in your notes</span><span><i class="studio-legend__h"></i>Height: chapters planned</span><span><i class="studio-legend__x"></i>Striped: web sources not yet in Knowledge</span></div>`
              : graphHtml(data)}
            ${composerHtml()}
          </section>
        </div>
        ${deskHtml(data)}
        ${asideHtml(data)}
      </div>`;
    bind();
  }

  function composerHtml() {
    if (!state.composer) return "";
    return `<form class="studio-composer" data-composer>
      <label class="hub-label" for="studio-new-title">Working title</label>
      <div class="studio-composer__row"><input class="hub-input" id="studio-new-title" name="title" autocomplete="off" placeholder="e.g. The Feedback Illusion" maxlength="160" />
      <button class="btn btn--primary" type="submit" ${state.busy ? "disabled" : ""}>Put it on the shelf</button>
      <button class="btn btn--ghost" type="button" data-cancel-idea>Cancel</button></div>
    </form>`;
  }

  // ── Events ────────────────────────────────────────────────────────────

  async function assemble() {
    const b = book();
    const data = state.data;
    if (!b || !data || state.chapter === null) return;
    const ch = flatChapters(b)[state.chapter];
    const key = `${b.id}:${ch.index}`;
    state.draft = { key, status: "loading", paragraphs: [] };
    render();
    try {
      const refs = ch.notes.filter(ref => inKnowledge(data, ref));
      const pages = await Promise.all(refs.map(ref => deps.getPage(ref)));
      const paragraphs = assembleDraft(b, ch, pages.map(p => ({ id: p.id, title: p.title, body: p.body })));
      if (state.draft?.key === key) state.draft = { key, status: "ready", paragraphs };
    } catch (error) {
      if (state.draft?.key === key) state.draft = { key, status: "error", paragraphs: [], message: error instanceof Error ? error.message : "Could not read the notes." };
    }
    if (alive) {
      render();
      host.querySelector(".studio-draft")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  async function saveDraft() {
    const b = book();
    const d = state.draft;
    if (!b || !d || d.status !== "ready" || state.savingDraft) return;
    const ch = flatChapters(b)[Number(d.key.split(":")[1])];
    const now = new Date();
    const iso = now.toISOString();
    state.savingDraft = true;
    render();
    try {
      const saved = await deps.savePage({
        id: newHubPageId(),
        title: `${b.short} · Ch ${ch.index + 1}: ${ch.title} (draft)`,
        area: "notes",
        tags: ["Studio draft", b.short],
        body: draftMarkdown(b, ch, d.paragraphs, formatDisplayDate(now)),
        connected: [...new Set(d.paragraphs.map(p => p.source.id))],
        attachments: [],
        source: "hub",
        created_at: iso,
        updated_at: iso,
        schema_version: 1,
      });
      await deps.onSaved?.();
      showToast("Draft saved to Knowledge");
      state.savingDraft = false;
      deps.openPage(saved.id);
      return;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the draft.");
    }
    state.savingDraft = false;
    if (alive) render();
  }

  async function link(ref: string) {
    const b = book();
    if (!b || state.chapter === null) return;
    let wordsCount = 0;
    let title = entryById.get(ref)?.title ?? ref;
    try {
      const page = await deps.getPage(ref);
      wordsCount = page.body.split(/\s+/).filter(Boolean).length;
      title = page.title;
    } catch {
      // the link still saves; words fill in when the note is readable
    }
    await apply({ op: "link", bookId: b.id, chapter: state.chapter, ref, title, words: wordsCount }, "Linked to the chapter");
  }

  function bind() {
    host.querySelectorAll<HTMLElement>("[data-book]").forEach(el => {
      const go = () => {
        state.sel = el.dataset.book!;
        state.chapter = null;
        state.confirm = null;
        render();
        if (el.closest(".studio-insight, .studio-noterow, .studio-card")) host.querySelector(".studio-desk")?.scrollIntoView({ block: "start", behavior: "smooth" });
      };
      el.addEventListener("click", go);
      if (el.tagName === "g") el.addEventListener("keydown", e => { if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") { e.preventDefault(); go(); } });
    });
    host.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(btn => (btn.onclick = () => { state.view = btn.dataset.view as State["view"]; render(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach(btn => (btn.onclick = () => { state.sort = btn.dataset.sort as State["sort"]; render(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(btn => (btn.onclick = () => { state.filter = btn.dataset.filter as State["filter"]; render(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-chapter]").forEach(btn => (btn.onclick = () => {
      const i = Number(btn.dataset.chapter);
      state.chapter = state.chapter === i && !btn.classList.contains("studio-linkish") ? null : i;
      render();
      if (window.matchMedia("(max-width: 1100px)").matches) host.querySelector(".studio-desk__side")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }));
    host.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(btn => (btn.onclick = () => deps.openPage(btn.dataset.openPage!)));
    host.querySelectorAll<HTMLButtonElement>("[data-new-idea]").forEach(btn => (btn.onclick = () => {
      state.composer = true;
      state.view = "shelf";
      render();
      host.querySelector<HTMLInputElement>("#studio-new-title")?.focus();
    }));
    host.querySelector<HTMLButtonElement>("[data-cancel-idea]")?.addEventListener("click", () => { state.composer = false; render(); });
    host.querySelector<HTMLFormElement>("[data-composer]")?.addEventListener("submit", event => {
      event.preventDefault();
      const title = (host.querySelector<HTMLInputElement>("#studio-new-title")?.value ?? "").trim();
      if (!title) return;
      state.composer = false;
      const before = new Set(state.data?.books.map(b => b.id));
      void apply({ op: "idea", title }, "On the shelf").then(() => {
        const added = state.data?.books.find(b => !before.has(b.id));
        if (added) { state.sel = added.id; state.chapter = null; render(); }
      });
    });
    host.querySelector<HTMLButtonElement>("[data-stage]")?.addEventListener("click", event => {
      const b = book();
      const stage = (event.currentTarget as HTMLButtonElement).dataset.stage as StudioBook["stage"];
      if (b) void apply({ op: "stage", bookId: b.id, stage }, `Moved to ${stage}`);
    });
    host.querySelectorAll<HTMLButtonElement>("[data-confirm]").forEach(btn => (btn.onclick = () => { state.confirm = btn.dataset.confirm!; render(); }));
    host.querySelector<HTMLButtonElement>("[data-cancel-confirm]")?.addEventListener("click", () => { state.confirm = null; render(); });
    host.querySelectorAll<HTMLButtonElement>("[data-decide]").forEach(btn => (btn.onclick = () => {
      state.confirm = null;
      void apply({ op: "decide", insightId: btn.dataset.decide!, choice: btn.dataset.choice! }, btn.dataset.choice === "dismissed" ? "Hidden for now" : "Noted");
    }));
    host.querySelector<HTMLButtonElement>("[data-draft]")?.addEventListener("click", () => void assemble());
    host.querySelector<HTMLButtonElement>("[data-close-draft]")?.addEventListener("click", () => { state.draft = null; render(); });
    host.querySelector<HTMLButtonElement>("[data-save-draft]")?.addEventListener("click", () => void saveDraft());
    host.querySelectorAll<HTMLButtonElement>("[data-link]").forEach(btn => (btn.onclick = () => void link(btn.dataset.link!)));
    host.querySelectorAll<HTMLButtonElement>("[data-unlink]").forEach(btn => (btn.onclick = () => {
      const b = book();
      if (b && state.chapter !== null) void apply({ op: "unlink", bookId: b.id, chapter: state.chapter, ref: btn.dataset.unlink! }, "Unlinked");
    }));
    host.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => { state.loadError = ""; render(); void load(); });
  }

  render();
  void load();
  return () => {
    alive = false;
  };
}
