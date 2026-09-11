import { formatDisplayDate } from "../../design-kit/js/format-display-date.js";
import type { PageManifestEntry } from "../domain/page";
import { escapeHtml, showToast } from "../lib/dom";
import type { ChatPhase } from "../api/client";
import { listSavedConstellations, researchStars, saveConstellation } from "./client";
import { mountStarsSky, mountStarsSymbol } from "./canvas";
import type { SavedConstellation, StarsNote, StarsProposal, StarsRelation } from "./schema";

type GraphExitMode = "constellation" | "showAll" | "universe";

export type StarsViewOptions = {
  entries: PageManifestEntry[];
  onOpenPage: (pageId: string, title?: string) => void;
  onModeChange: (mode: GraphExitMode) => void;
};

type StarsScreen = "sky" | "working" | "proposal" | "detail";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function graphModesHtml() {
  return `<div class="graph-modes stars-graph-modes" role="group" aria-label="Graph mode">
    <button type="button" data-stars-exit="constellation">Constellation</button>
    <button type="button" data-stars-exit="showAll">Show All</button>
    <button type="button" data-stars-exit="universe">Universe</button>
    <button type="button" class="is-active" aria-pressed="true">Stars</button>
  </div>`;
}

function phaseLabel(phase: ChatPhase | null) {
  if (!phase || phase.status === "searching") return "Clementine is searching your archive";
  if (phase.status === "researching") {
    const round = phase.research?.round;
    return round ? `Clementine is testing the connections · round ${round}` : "Clementine is testing the connections";
  }
  if (phase.status === "writing") return "Clementine is shaping the synthesis";
  return "Clementine is preparing the constellation";
}

function relationLabel(value: StarsRelation["type"]) {
  return value === "builds_on" ? "Builds on" : value.charAt(0).toUpperCase() + value.slice(1);
}

function sourceButtons(sourceIds: string[], notes: StarsNote[]) {
  return sourceIds.map(id => {
    const note = notes.find(item => item.pageId === id);
    return note
      ? `<button type="button" class="stars-source" data-stars-note="${escapeHtml(note.pageId)}" title="${escapeHtml(note.title)}">${escapeHtml(String(notes.indexOf(note) + 1))}</button>`
      : "";
  }).join("");
}

function synthesisHtml(proposal: StarsProposal) {
  return `<section class="stars-synthesis glass-panel" aria-labelledby="stars-synthesis-title">
    <div class="stars-synthesis__heading">
      <div>
        <p class="eyebrow">Clementine's synthesis</p>
        <h2 id="stars-synthesis-title">What this constellation shows</h2>
      </div>
      <p class="stars-synthesis__meta">${proposal.notes.length} notes · ${proposal.relations.length} relationships</p>
    </div>
    <p class="stars-synthesis__summary">${escapeHtml(proposal.synthesis.summary)}</p>
    <div class="stars-claims">
      ${proposal.synthesis.claims.map((claim, index) => `<article class="stars-claim">
        <p><span>${index + 1}.</span> ${escapeHtml(claim.text)}</p>
        <div class="stars-sources" aria-label="Sources for claim ${index + 1}">${sourceButtons(claim.sourceIds, proposal.notes)}</div>
      </article>`).join("")}
    </div>
    ${proposal.synthesis.tensions.length ? `<details class="stars-disclosure"><summary>Tensions</summary><ul>${proposal.synthesis.tensions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
    ${proposal.synthesis.gaps.length ? `<details class="stars-disclosure"><summary>Gaps</summary><ul>${proposal.synthesis.gaps.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
  </section>`;
}

function notePanelHtml(note: StarsNote | null, relation?: StarsRelation) {
  if (!note) {
    return `<aside class="stars-note-panel glass-panel"><p class="eyebrow">Selected note</p><p class="stars-note-panel__empty">Select a star to inspect its role and open the original note.</p></aside>`;
  }
  return `<aside class="stars-note-panel glass-panel">
    <p class="eyebrow">Selected note</p>
    <h3>${escapeHtml(note.title)}</h3>
    <p class="stars-note-panel__role">${escapeHtml(note.role)}</p>
    <p>${escapeHtml(note.excerpt)}</p>
    ${relation ? `<div class="stars-relation"><span>${escapeHtml(relationLabel(relation.type))}</span><p>${escapeHtml(relation.explanation)}</p></div>` : ""}
    <button type="button" class="btn btn--ghost" data-stars-open-note="${escapeHtml(note.pageId)}">Read full note</button>
  </aside>`;
}

export function mountStarsView(host: HTMLElement, options: StarsViewOptions) {
  let screen: StarsScreen = "sky";
  let saved: SavedConstellation[] = [];
  let proposal: StarsProposal | null = null;
  let selected: SavedConstellation | null = null;
  let selectedNote: StarsNote | null = null;
  let selectedRelation: StarsRelation | undefined;
  let query = "";
  let error = "";
  let phase: ChatPhase | null = null;
  let month = new Date().getMonth();
  let fullscreen = false;
  let canvasTeardown: (() => void) | null = null;
  let stopped = false;

  function teardownCanvas() {
    canvasTeardown?.();
    canvasTeardown = null;
  }

  function setFullscreen(next: boolean) {
    fullscreen = next;
    document.body.classList.toggle("is-stars-fullscreen", fullscreen);
    const wrap = host.querySelector<HTMLElement>("[data-stars-sky-wrap]");
    if (!wrap) return;
    wrap.classList.toggle("is-fullscreen", fullscreen);
    host.querySelectorAll<HTMLButtonElement>("[data-stars-fullscreen]").forEach(button => {
      button.setAttribute("aria-pressed", String(fullscreen));
      button.textContent = fullscreen ? "Exit" : "Full screen";
      button.classList.toggle("is-active", fullscreen);
    });
    const exit = host.querySelector<HTMLButtonElement>("[data-stars-exit-fullscreen]");
    if (exit) exit.hidden = !fullscreen;
  }

  function bindModeRow() {
    host.querySelectorAll<HTMLButtonElement>("[data-stars-exit]").forEach(button => {
      button.onclick = () => options.onModeChange(button.dataset.starsExit as GraphExitMode);
    });
  }

  function bindOpenNote() {
    host.querySelectorAll<HTMLButtonElement>("[data-stars-open-note], [data-stars-note]").forEach(button => {
      button.onclick = () => {
        const pageId = button.dataset.starsOpenNote ?? button.dataset.starsNote;
        const source = (proposal ?? selected)?.notes.find(note => note.pageId === pageId);
        if (source) options.onOpenPage(source.pageId, source.title);
      };
    });
  }

  async function create(raw: string) {
    const next = raw.trim();
    if (!next || screen === "working") return;
    query = next;
    error = "";
    phase = { status: "searching" };
    screen = "working";
    render();
    try {
      proposal = await researchStars(query, options.entries, nextPhase => {
        phase = nextPhase;
        const status = host.querySelector<HTMLElement>("[data-stars-status]");
        if (status) status.textContent = phaseLabel(phase);
      });
      selectedNote = proposal.notes[0] ?? null;
      selectedRelation = proposal.relations.find(item => item.sourceId === selectedNote?.pageId || item.targetId === selectedNote?.pageId);
      screen = "proposal";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Clementine could not build this constellation.";
      screen = "sky";
    }
    if (!stopped) render();
  }

  async function save() {
    if (!proposal) return;
    const button = host.querySelector<HTMLButtonElement>("[data-stars-save]");
    if (button) button.disabled = true;
    try {
      const item = await saveConstellation(proposal);
      saved = [item, ...saved.filter(existing => existing.id !== item.id)];
      selected = item;
      proposal = null;
      selectedNote = item.notes[0] ?? null;
      screen = "detail";
      showToast("Saved to your night sky");
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Constellation save failed.";
      showToast(error);
    }
    if (!stopped) render();
  }

  function renderShell(body: string) {
    teardownCanvas();
    if (screen !== "sky") {
      fullscreen = false;
      document.body.classList.remove("is-stars-fullscreen");
    }
    host.innerHTML = `<section class="stars-root">${graphModesHtml()}${body}</section>`;
    bindModeRow();
  }

  function renderWorking() {
    renderShell(`<section class="stars-working glass-panel" aria-live="polite">
      <div class="stars-working__field"><span class="stars-working__spark" aria-hidden="true">✦</span><p>${escapeHtml(query)}</p></div>
      <div class="stars-working__sky" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
      <p class="stars-working__status" data-stars-status>${escapeHtml(phaseLabel(phase))}</p>
      <p class="stars-working__detail">She is reusing the existing thematic synthesis protocol, then narrowing the result into one saved interpretation.</p>
    </section>`);
  }

  function renderProposal() {
    if (!proposal) return renderSky();
    renderShell(`<div class="stars-title-row">
      <div><p class="eyebrow">Proposed constellation</p><h2>${escapeHtml(proposal.title)}</h2><p>${escapeHtml(proposal.symbol.meaning)}</p></div>
      <button type="button" class="btn btn--ghost" data-stars-discard>Discard</button>
    </div>
    ${error ? `<p class="stars-error" role="alert">${escapeHtml(error)}</p>` : ""}
    <div class="stars-workbench">
      <section class="stars-symbol" data-stars-symbol aria-label="${escapeHtml(proposal.symbol.label)} constellation"></section>
      <div data-stars-note-panel>${notePanelHtml(selectedNote, selectedRelation)}</div>
    </div>
    ${synthesisHtml(proposal)}
    <section class="confirm-card stars-confirm">
      <div><h3>Save this interpretation?</h3><p>The notes, relationships, symbol, and synthesis will stay together in your night sky.</p></div>
      <div class="confirm-card__actions"><button type="button" class="btn btn--ghost" data-stars-discard>Discard</button><button type="button" class="btn btn--decisive" data-stars-save>Save to night sky</button></div>
    </section>`);
    const symbol = host.querySelector<HTMLElement>("[data-stars-symbol]")!;
    canvasTeardown = mountStarsSymbol(symbol, proposal, {
      onSelectNote: (note, relation) => {
        selectedNote = note;
        selectedRelation = relation;
        const panel = host.querySelector<HTMLElement>("[data-stars-note-panel]");
        if (panel) panel.innerHTML = notePanelHtml(note, relation);
        bindOpenNote();
      },
      onOpenNote: options.onOpenPage,
    });
    host.querySelectorAll<HTMLButtonElement>("[data-stars-discard]").forEach(button => {
      button.onclick = () => { proposal = null; screen = "sky"; render(); };
    });
    host.querySelector<HTMLButtonElement>("[data-stars-save]")!.onclick = () => void save();
    bindOpenNote();
  }

  function renderDetail() {
    if (!selected) return renderSky();
    const item = selected;
    renderShell(`<div class="stars-title-row">
      <div><p class="eyebrow">Saved constellation · ${escapeHtml(formatDisplayDate(item.createdAt))}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.symbol.meaning)}</p></div>
      <button type="button" class="btn btn--ghost" data-stars-back>Back to night sky</button>
    </div>
    <div class="stars-workbench">
      <section class="stars-symbol" data-stars-symbol aria-label="${escapeHtml(item.symbol.label)} constellation"></section>
      <div data-stars-note-panel>${notePanelHtml(selectedNote, selectedRelation)}</div>
    </div>
    ${synthesisHtml(item)}`);
    const symbol = host.querySelector<HTMLElement>("[data-stars-symbol]")!;
    canvasTeardown = mountStarsSymbol(symbol, item, {
      onSelectNote: (note, relation) => {
        selectedNote = note;
        selectedRelation = relation;
        const panel = host.querySelector<HTMLElement>("[data-stars-note-panel]");
        if (panel) panel.innerHTML = notePanelHtml(note, relation);
        bindOpenNote();
      },
      onOpenNote: options.onOpenPage,
    });
    host.querySelector<HTMLButtonElement>("[data-stars-back]")!.onclick = () => { screen = "sky"; render(); };
    bindOpenNote();
  }

  function renderSky() {
    const year = new Date().getFullYear();
    const date = new Date(Date.UTC(year, month, 15, 12));
    renderShell(`<div class="stars-sky-wrap" data-stars-sky-wrap>
      <div class="stars-sky-toolbar glass-panel">
        <div><p class="eyebrow">Stars</p><h2>Night sky</h2></div>
        <form class="stars-search" data-stars-search>
          <label class="sr-only" for="stars-query">Topic or question</label>
          <input id="stars-query" type="search" value="${escapeHtml(query)}" placeholder="What should Clementine connect?" autocomplete="off" required />
          <button type="submit" class="btn btn--primary">Find notes</button>
        </form>
        <button type="button" class="btn btn--ghost stars-fullscreen-btn" data-stars-fullscreen aria-pressed="false">Full screen</button>
      </div>
      ${error ? `<p class="stars-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <section class="stars-sky" data-stars-sky aria-label="Saved constellations and unconnected note stars"></section>
      <div class="stars-year glass-panel">
        <label for="stars-month">Sky position</label>
        <input id="stars-month" type="range" min="0" max="11" step="1" value="${month}" />
        <output for="stars-month">${MONTHS[month]} ${year}</output>
      </div>
      <button type="button" class="stars-fullscreen-exit btn btn--ghost" data-stars-exit-fullscreen hidden>Exit full screen</button>
    </div>`);
    const sky = host.querySelector<HTMLElement>("[data-stars-sky]")!;
    canvasTeardown = mountStarsSky(sky, saved, date, item => {
      selected = item;
      selectedNote = item.notes[0] ?? null;
      selectedRelation = item.relations.find(relation => relation.sourceId === selectedNote?.pageId || relation.targetId === selectedNote?.pageId);
      screen = "detail";
      render();
    }, options.entries.length);
    if (!saved.length) {
      sky.insertAdjacentHTML("beforeend", `<div class="stars-empty"><span aria-hidden="true">✦</span><h3>Your sky has no constellations yet</h3><p>Search a topic. Clementine will find the strongest notes, connect them, and propose a synthesis for you to approve.</p></div>`);
    }
    host.querySelector<HTMLFormElement>("[data-stars-search]")!.onsubmit = event => {
      event.preventDefault();
      const input = host.querySelector<HTMLInputElement>("#stars-query");
      void create(input?.value ?? "");
    };
    const slider = host.querySelector<HTMLInputElement>("#stars-month")!;
    slider.onchange = () => {
      month = Number(slider.value);
      renderSky();
    };
    host.querySelectorAll<HTMLButtonElement>("[data-stars-fullscreen]").forEach(button => {
      button.onclick = () => setFullscreen(!fullscreen);
    });
    host.querySelector<HTMLButtonElement>("[data-stars-exit-fullscreen]")!.onclick = () => setFullscreen(false);
    setFullscreen(fullscreen);
  }

  function render() {
    if (screen === "working") renderWorking();
    else if (screen === "proposal") renderProposal();
    else if (screen === "detail") renderDetail();
    else renderSky();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && fullscreen) {
      event.preventDefault();
      setFullscreen(false);
    }
  }
  document.addEventListener("keydown", onKeyDown);

  render();
  void listSavedConstellations()
    .then(items => { saved = items; if (!stopped && screen === "sky") render(); })
    .catch(caught => {
      error = caught instanceof Error ? caught.message : "Night sky could not load.";
      if (!stopped && screen === "sky") render();
    });

  return () => {
    stopped = true;
    document.removeEventListener("keydown", onKeyDown);
    document.body.classList.remove("is-stars-fullscreen");
    teardownCanvas();
    host.innerHTML = "";
  };
}
