import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA } from "../api/client";
import { escapeHtml } from "../lib/dom";

type Definition = { id: string; name: string; description: string; motif: string; defaultMode: string; modes: { id: string; label: string }[]; intake: { id: string; label: string; required: boolean; type: string; options?: { value: string; label: string }[] }[]; voices: { name: string; role: string }[] };
type Session = { id: string; status: string; stage: string; speaker: string | null; revision: number; transcript: { id: string; role: string; speaker: string; stage: string; text: string }[]; checkpoint: null | { kind: string; question: string }; allowedActions: string[]; error: null | { message: string; retryable: boolean } };

const localCatalog: Definition[] = [
  ["fates", "The Three Fates", "Live dialectic across generative, critical and strategic voices.", "Greek threads", "normal", ["Normal", "Sprint", "Long"], ["Lachesis", "Clotho", "Atropos", "The Weave"]],
  ["horizon", "The Horizon Council", "Map present trajectories against a desired future.", "Norse long hall", "full", ["Full", "Brief"], ["Ketill", "Alvar", "Sigrid"]],
  ["refinery", "The Refinery", "Build, break and reforge a defensible argument.", "Chevruta paired argument", "full", ["Full", "Build", "Break", "Reforge"], ["The Builder", "The Breaker", "The Reforger"]],
  ["cartographers", "The Cartographers", "Turn literature into a purpose-fit knowledge representation.", "Contours and bearings", "full", ["Full", "Focused", "Direct"], ["The Surveyor", "The Miner", "The Cartographer"]],
  ["mirror", "The Mirror Council", "Clarify the gap between behaviour, aspiration and present capacity.", "Confucian reflection", "quick", ["Quick", "Deep"], ["The Retrospective", "The Prospective", "The Present"]],
  ["consilium", "The Consilium", "Deliberate through incompatible ethical standpoints without a verdict.", "Roman advisory chamber", "standard", ["Standard", "Extended"], ["The Principle", "The Consequence", "The Virtue"]],
  ["witness", "The Witness", "Audit a specific thinking process before trusting its result.", "Zen and Vipassana observation", "standard", ["Standard", "Deep"], ["Process Trace", "Pattern Match", "Recalibration"]],
  ["tribunal", "The Tribunal of Frames", "Open three independent reframes of an entrenched problem.", "Nested frames and scale", "standard", ["Quick", "Standard", "Deep"], ["The Inverter", "The Scaler", "The Context Shifter"]]
].map(([id, name, description, motif, defaultMode, modes, voices]) => ({ id, name, description, motif, defaultMode, modes: (modes as string[]).map(label => ({ id: label.toLowerCase(), label })), intake: [{ id: "prompt", label: "What would you like to examine?", required: true, type: "textarea" }], voices: (voices as string[]).map(name => ({ name, role: "" })) }));

async function catalog() {
  if (USE_LOCAL_DATA) return localCatalog;
  const response = await fetch(`${API_BASE}/protocols`, { credentials: "include" });
  if (!response.ok) throw new Error("The protocol catalogue is unavailable.");
  const body = await response.json();
  return body.data.catalog as Definition[];
}

function motif(definition: Definition) {
  const shape = definition.id === "fates" ? "≈" : definition.id === "horizon" ? "⌁" : definition.id === "refinery" ? "◇" : definition.id === "cartographers" ? "⌇" : definition.id === "mirror" ? "◐" : definition.id === "consilium" ? "◡" : definition.id === "witness" ? "○" : "▣";
  return `<span class="protocol-card__glyph" aria-hidden="true">${shape}</span>`;
}

function cards(definitions: Definition[]) {
  return definitions.map((d, index) => `<article class="protocol-card" data-protocol-card="${escapeHtml(d.id)}" style="--protocol-order:${index}">
    <button type="button" class="protocol-card__face" aria-expanded="false" aria-controls="protocol-detail-${escapeHtml(d.id)}">
      <span class="protocol-card__eyebrow">${escapeHtml(d.motif)}</span>${motif(d)}<strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(d.description)}</span><em>Turn card</em>
    </button>
    <section id="protocol-detail-${escapeHtml(d.id)}" class="protocol-card__detail" hidden>
      <p>${escapeHtml(d.description)}</p><p class="protocol-card__voices">${d.voices.map(v => escapeHtml(v.name)).join(" · ")}</p>
      <button class="btn btn--primary" data-protocol-begin="${escapeHtml(d.id)}" type="button">Begin</button>
    </section>
  </article>`).join("");
}

function intake(definition: Definition) {
  const fields = definition.intake.map(field => field.type === "select"
    ? `<label>${escapeHtml(field.label)}<select name="${escapeHtml(field.id)}">${(field.options ?? []).map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}</select></label>`
    : `<label>${escapeHtml(field.label)}${field.required ? " <span aria-hidden=\"true\">*</span>" : ""}<textarea name="${escapeHtml(field.id)}" ${field.required ? "required" : ""}></textarea></label>`).join("");
  return `<section class="protocol-intake"><button class="btn btn--ghost" type="button" data-protocol-close>← All protocols</button><p class="page-header__eyebrow">${escapeHtml(definition.motif)}</p><h1>${escapeHtml(definition.name)}</h1><p>${escapeHtml(definition.description)}</p><form data-protocol-form><label>Run mode<select name="mode">${definition.modes.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === definition.defaultMode ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("")}</select></label>${fields}<button class="btn btn--primary" type="submit">Start session</button></form><p class="protocol-intake__note">${USE_LOCAL_DATA ? "Local preview has no AI session service. The cards and intake are available here; a signed-in live hub starts the real protocol." : "Each named voice receives its own turn. Your answers pause the protocol before it advances."}</p></section>`;
}

function sessionView(session: Session, definition: Definition) {
  const turns = session.transcript.map(turn => `<article class="protocol-turn protocol-turn--${escapeHtml(turn.role)} ${turn.speaker === session.speaker ? "is-speaking" : ""}"><p>${escapeHtml(turn.speaker)}</p><div>${escapeHtml(turn.text)}</div></article>`).join("");
  const waiting = session.checkpoint ? `<form class="protocol-reply" data-protocol-reply><label>${escapeHtml(session.checkpoint.question)}<textarea name="reply" required></textarea></label><button class="btn btn--primary" type="submit">Continue</button>${session.allowedActions.includes("uncertain") ? `<button class="btn btn--ghost" name="action" value="uncertain" type="submit">Continue with uncertainty</button>` : ""}</form>` : "";
  const failure = session.error ? `<div class="confirm-card"><p>${escapeHtml(session.error.message)}</p>${session.allowedActions.includes("retry") ? `<button class="btn btn--primary" data-protocol-action="retry">Retry this voice</button>` : ""}</div>` : "";
  return `<section class="protocol-session"><header><button class="btn btn--ghost" data-protocol-close type="button">← Protocols</button><p class="page-header__eyebrow">${escapeHtml(definition.name)}</p><h1>${escapeHtml(session.speaker ?? "Session")}</h1><p class="protocol-session__status">${escapeHtml(session.status)} · ${escapeHtml(session.stage)}</p></header><div class="protocol-stage" aria-live="polite">${definition.voices.map(voice => `<div class="protocol-speaker ${voice.name.toLowerCase().replaceAll(" ", "-") === session.speaker ? "is-active" : ""}"><span>${escapeHtml(voice.name)}</span><small>${escapeHtml(voice.role)}</small></div>`).join("")}</div><div class="protocol-transcript">${turns || "<p>Preparing the first voice…</p>"}</div>${waiting}${failure}</section>`;
}

export function renderProtocols({ host }: { host: HTMLElement }) {
  let definitions = localCatalog;
  let selected: Definition | null = null;
  let currentSession: Session | null = null;
  let pollTimer: number | null = null;
  const stopPolling = () => { if (pollTimer !== null) window.clearTimeout(pollTimer); pollTimer = null; };
  const poll = async () => {
    if (!currentSession || USE_LOCAL_DATA) return;
    try { const response = await fetch(`${API_BASE}/protocols?sessionId=${encodeURIComponent(currentSession.id)}`, { credentials: "include" }); if (!response.ok) throw new Error(); const body = await response.json(); currentSession = body.data.session; paint(); if (["queued", "running"].includes(currentSession.status)) pollTimer = window.setTimeout(poll, 1500); } catch { if (currentSession) { currentSession = { ...currentSession, error: { message: "Could not refresh this session. Retry keeps completed turns intact.", retryable: true } }; paint(); } }
  };
  const paint = () => {
    host.innerHTML = currentSession && selected ? sessionView(currentSession, selected) : selected ? intake(selected) : `<section class="protocol-library"><header class="page-header"><div><p class="page-header__eyebrow">Cognitive protocols</p><div class="page-header__title-row"><h1>Choose a way to think</h1></div><p class="page-header__supporting">Eight structured conversations, each with its own history, rhythm and discipline.</p></div></header><div class="protocol-library__grid">${cards(definitions)}</div></section>`;
    host.querySelectorAll<HTMLButtonElement>(".protocol-card__face").forEach(button => button.onclick = () => { const card = button.closest<HTMLElement>("[data-protocol-card]")!; const detail = card.querySelector<HTMLElement>(".protocol-card__detail")!; const open = detail.hidden; detail.hidden = !open; button.setAttribute("aria-expanded", String(open)); card.classList.toggle("is-open", open); });
    host.querySelectorAll<HTMLButtonElement>("[data-protocol-begin]").forEach(button => button.onclick = () => { selected = definitions.find(d => d.id === button.dataset.protocolBegin) ?? null; paint(); });
    host.querySelector<HTMLButtonElement>("[data-protocol-close]")?.addEventListener("click", () => { stopPolling(); selected = null; currentSession = null; paint(); });
    host.querySelector<HTMLFormElement>("[data-protocol-form]")?.addEventListener("submit", async event => { event.preventDefault(); if (USE_LOCAL_DATA || !selected) return; const form = new FormData(event.currentTarget); const intake = Object.fromEntries([...form.entries()].filter(([key]) => key !== "mode").map(([key, value]) => [key, String(value)])); const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ protocolId: selected.id, mode: form.get("mode"), intake, requestId: crypto.randomUUID() }) }); if (!response.ok) return; currentSession = (await response.json()).data.session; paint(); void poll(); });
    host.querySelector<HTMLFormElement>("[data-protocol-reply]")?.addEventListener("submit", async event => { event.preventDefault(); if (!currentSession) return; const form = new FormData(event.currentTarget); const action = String(form.get("action") ?? (currentSession.checkpoint?.kind === "verify" ? "confirm" : "answer")); const text = String(form.get("reply") ?? ""); const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: currentSession.id, revision: currentSession.revision, requestId: crypto.randomUUID(), action, text }) }); if (response.ok) { currentSession = (await response.json()).data.session; paint(); void poll(); } });
    host.querySelector<HTMLButtonElement>("[data-protocol-action]")?.addEventListener("click", async event => { if (!currentSession) return; const action = (event.currentTarget as HTMLButtonElement).dataset.protocolAction; const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: currentSession.id, revision: currentSession.revision, requestId: crypto.randomUUID(), action }) }); if (response.ok) { currentSession = (await response.json()).data.session; paint(); void poll(); } });
  };
  paint();
  void catalog().then(next => { definitions = next; if (!selected) paint(); }).catch(() => undefined);
}
