import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA } from "../api/client";
import { escapeHtml } from "../lib/dom";

type Definition = { id: string; name: string; description: string; motif: string; defaultMode: string; modes: { id: string; label: string }[]; intake: { id: string; label: string; required: boolean; type: string; options?: { value: string; label: string }[] }[]; voices: { id: string; name: string; role: string }[] };
type Session = { id: string; status: string; stage: string; speaker: string | null; revision: number; transcript: { id: string; role: string; speaker: string; stage: string; text: string }[]; checkpoint: null | { kind: string; question: string }; allowedActions: string[]; error: null | { message: string; retryable: boolean } };
const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/cognitive-protocols`;
const voiceAsset: Record<string, string> = {
  "fates:clotho": "fates-clotho-spinner", "fates:atropos": "fates-atropos-cutter", "fates:lachesis": "fates-lachesis-measurer", "fates:weave": "fates-the-weave-witness",
  "horizon:ketill": "horizon-ketill-hearthkeeper", "horizon:alvar": "horizon-alvar-far-gazer", "horizon:sigrid": "horizon-sigrid-quiet",
  "refinery:builder": "refinery-builder", "refinery:breaker": "refinery-breaker", "refinery:reforger": "refinery-reforger",
  "cartographers:surveyor": "cartographers-surveyor", "cartographers:miner": "cartographers-miner", "cartographers:cartographer": "cartographers-cartographer",
  "mirror:retrospective": "mirror-retrospective", "mirror:prospective": "mirror-prospective", "mirror:present": "mirror-present",
  "consilium:principle": "consilium-principle", "consilium:consequence": "consilium-consequence", "consilium:virtue": "consilium-virtue",
  "witness:trace": "witness-process-trace", "witness:patterns": "witness-pattern-match", "witness:recalibration": "witness-recalibration",
  "tribunal:inverter": "tribunal-inverter", "tribunal:scaler": "tribunal-scaler", "tribunal:context-shifter": "tribunal-context-shifter"
};
function frontAsset(id: string) { return `${ASSET_ROOT}/card-fronts/${id === "fates" ? "fates-the-three-fates" : id}-card-front.png`; }
function backAsset(id: string) { return `${ASSET_ROOT}/card-backs/${id}-card-back.png`; }
function backgroundAsset(id: string) { return `${ASSET_ROOT}/backgrounds/${id}-background.png`; }

const localCatalog: Definition[] = [
  ["fates", "The Three Fates", "Live dialectic across generative, critical and strategic voices.", "Greek threads", "normal", ["Normal", "Sprint", "Long"], ["Lachesis", "Clotho", "Atropos", "The Weave"]],
  ["horizon", "The Horizon Council", "Map present trajectories against a desired future.", "Norse long hall", "full", ["Full", "Brief"], ["Ketill", "Alvar", "Sigrid"]],
  ["refinery", "The Refinery", "Build, break and reforge a defensible argument.", "Chevruta paired argument", "full", ["Full", "Build", "Break", "Reforge"], ["The Builder", "The Breaker", "The Reforger"]],
  ["cartographers", "The Cartographers", "Turn literature into a purpose-fit knowledge representation.", "Contours and bearings", "full", ["Full", "Focused", "Direct"], ["The Surveyor", "The Miner", "The Cartographer"]],
  ["mirror", "The Mirror Council", "Clarify the gap between behaviour, aspiration and present capacity.", "Confucian reflection", "quick", ["Quick", "Deep"], ["The Retrospective", "The Prospective", "The Present"]],
  ["consilium", "The Consilium", "Deliberate through incompatible ethical standpoints without a verdict.", "Roman advisory chamber", "standard", ["Standard", "Extended"], ["The Principle", "The Consequence", "The Virtue"]],
  ["witness", "The Witness", "Audit a specific thinking process before trusting its result.", "Zen and Vipassana observation", "standard", ["Standard", "Deep"], ["Process Trace", "Pattern Match", "Recalibration"]],
  ["tribunal", "The Tribunal of Frames", "Open three independent reframes of an entrenched problem.", "Nested frames and scale", "standard", ["Quick", "Standard", "Deep"], ["The Inverter", "The Scaler", "The Context Shifter"]]
].map(([id, name, description, motif, defaultMode, modes, voices]) => ({ id, name, description, motif, defaultMode, modes: (modes as string[]).map(label => ({ id: label.toLowerCase(), label })), intake: [{ id: "prompt", label: "What would you like to examine?", required: true, type: "textarea" }], voices: (voices as string[]).map((name, index) => ({ id: ({ fates: ["lachesis", "clotho", "atropos", "weave"], horizon: ["ketill", "alvar", "sigrid"], refinery: ["builder", "breaker", "reforger"], cartographers: ["surveyor", "miner", "cartographer"], mirror: ["retrospective", "prospective", "present"], consilium: ["principle", "consequence", "virtue"], witness: ["trace", "patterns", "recalibration"], tribunal: ["inverter", "scaler", "context-shifter"] } as Record<string, string[]>)[id as string][index], name, role: "" })) }));

async function catalog() {
  if (USE_LOCAL_DATA) return localCatalog;
  const response = await fetch(`${API_BASE}/protocols`, { credentials: "include" });
  if (!response.ok) throw new Error("The protocol catalogue is unavailable.");
  const body = await response.json();
  return body.data.catalog as Definition[];
}

function cardArt(id: string) {
  const paths: Record<string, string> = {
    fates: '<path d="M42 18C86 44 34 72 78 102S30 158 74 190"/><path d="M78 18C34 44 86 72 42 102s48 56 4 88"/><circle cx="60" cy="102" r="24"/><path d="M49 102h22M60 91v22"/>',
    horizon: '<path d="M18 129c18-16 36-16 54 0s36 16 54 0 36-16 54 0"/><path d="M18 151c18-16 36-16 54 0s36 16 54 0 36-16 54 0"/><path d="M60 38v66M36 62l24-24 24 24"/><circle cx="60" cy="38" r="10"/>',
    refinery: '<path d="M60 22l40 40-40 40-40-40z"/><path d="M60 102l28 28-28 28-28-28z"/><path d="M22 158h76M32 174h56"/><circle cx="60" cy="62" r="12"/>',
    cartographers: '<path d="M20 50c24-20 48 18 72-4s38 10 48-4"/><path d="M18 86c20-12 42 12 62-4s40 12 54-2"/><path d="M20 124c22-18 44 14 64-2s34 10 52-4"/><path d="M30 160l66-116"/><circle cx="30" cy="160" r="6"/><path d="M96 44l-4 12 12-4"/>',
    mirror: '<path d="M60 24c30 0 46 25 46 57s-16 57-46 57-46-25-46-57 16-57 46-57z"/><path d="M60 24v114"/><path d="M39 166c12-12 30-12 42 0"/><path d="M48 78h1M71 78h1"/><path d="M47 103c8 7 18 7 26 0"/>',
    consilium: '<path d="M22 156h76"/><path d="M30 156V98h60v58"/><path d="M38 98V62h44v36"/><path d="M46 62V38h28v24"/><path d="M50 122h20M50 138h20"/><circle cx="60" cy="26" r="8"/>',
    witness: '<circle cx="60" cy="104" r="46"/><circle cx="60" cy="104" r="25"/><path d="M60 20v22M60 166v22M16 104h22M82 104h22"/><path d="M31 54l16 16M89 54L73 70M31 154l16-16M89 154l-16-16"/>',
    tribunal: '<path d="M28 38h64v112H28z"/><path d="M18 54h64v112H18z"/><path d="M38 22h64v112H38z"/><path d="M48 78h20M48 94h20M48 110h20"/>'
  };
  return `<svg class="protocol-card__art" viewBox="0 0 120 208" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths[id] ?? paths.tribunal}</svg>`;
}

function cards(definitions: Definition[]) {
  return definitions.map((d, index) => `<article class="protocol-card protocol-card--${escapeHtml(d.id)}" data-protocol-card="${escapeHtml(d.id)}" style="--protocol-order:${index}">
    <div class="protocol-card__inner">
      <button type="button" class="protocol-card__front" data-protocol-flip aria-expanded="false" aria-label="Show details for ${escapeHtml(d.name)}">
        <img class="protocol-card__front-art" src="${frontAsset(d.id)}" alt="">
        <span class="protocol-card__corner">${String(index + 1).padStart(2, "0")}</span><span class="protocol-card__eyebrow">${escapeHtml(d.motif)}</span><strong>${escapeHtml(d.name)}</strong><em>View protocol</em>
      </button>
      <section class="protocol-card__back" aria-label="${escapeHtml(d.name)} details">
        <img src="${backAsset(d.id)}" alt=""><div class="protocol-card__back-copy"><p>${escapeHtml(d.description)}</p><p class="protocol-card__voices">${d.voices.map(v => escapeHtml(v.name)).join(" · ")}</p></div>
        <div class="protocol-card__actions"><button class="btn btn--ghost" data-protocol-flip type="button">Back</button><button class="btn btn--primary" data-protocol-begin="${escapeHtml(d.id)}" type="button">Begin</button></div>
      </section>
    </div>
  </article>`).join("");
}

function intake(definition: Definition) {
  return `<section class="protocol-intake" style="--protocol-background:url('${backgroundAsset(definition.id)}')"><div class="protocol-intake__content"><button class="btn btn--ghost" type="button" data-protocol-close>← Thinking</button><p class="page-header__eyebrow">${escapeHtml(definition.motif)}</p><h1>${escapeHtml(definition.name)}</h1><p>${escapeHtml(definition.description)}</p><form data-protocol-form><label>Run mode<select name="mode">${definition.modes.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === definition.defaultMode ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("")}</select></label><label>What would you like to examine?<textarea name="prompt" required placeholder="Write the situation, question or claim in your own words."></textarea></label><button class="btn btn--primary" type="submit">Begin ${escapeHtml(definition.name)}</button></form><p class="protocol-intake__error" data-protocol-error hidden role="status"></p><p class="protocol-intake__note">One clear brief is enough. The protocol will ask for detail only when it needs it.</p></div></section>`;
}

function compactIntake(definition: Definition, prompt: string) {
  const required: Record<string, string[]> = { fates: ["task"], horizon: ["focus"], refinery: ["claim", "context", "audience"], cartographers: ["topic", "purpose"], mirror: ["conflict"], consilium: ["dilemma", "parties", "constraints"], witness: ["instance"], tribunal: ["problem", "entrenchment", "framing"] };
  return Object.fromEntries([...(required[definition.id] ?? []), "userContext"].map(key => [key, prompt]));
}

function sessionView(session: Session, definition: Definition) {
  const turns = session.transcript.map(turn => `<article class="protocol-turn protocol-turn--${escapeHtml(turn.role)} ${turn.speaker === session.speaker ? "is-speaking" : ""}"><p>${escapeHtml(turn.speaker)}</p><div>${escapeHtml(turn.text)}</div></article>`).join("");
  const waiting = session.checkpoint ? `<form class="protocol-reply" data-protocol-reply><label>${escapeHtml(session.checkpoint.question)}<textarea name="reply" required></textarea></label><button class="btn btn--primary" type="submit">Continue</button>${session.allowedActions.includes("uncertain") ? `<button class="btn btn--ghost" name="action" value="uncertain" type="submit">Continue with uncertainty</button>` : ""}${session.allowedActions.includes("cancel") ? `<button class="btn btn--ghost" name="action" value="cancel" type="submit">End session</button>` : ""}</form>` : "";
  const failure = session.error ? `<div class="confirm-card"><p>${escapeHtml(session.error.message)}</p>${session.allowedActions.includes("retry") ? `<button class="btn btn--primary" data-protocol-action="retry">Retry this voice</button>` : ""}</div>` : "";
  return `<section class="protocol-session" style="--protocol-background:url('${backgroundAsset(definition.id)}')"><header><button class="btn btn--ghost" data-protocol-close type="button">← Thinking</button><p class="page-header__eyebrow">${escapeHtml(definition.name)}</p><h1>${escapeHtml(session.speaker ?? "Session")}</h1><p class="protocol-session__status">${escapeHtml(session.status)} · ${escapeHtml(session.stage)}</p></header><div class="protocol-stage" aria-live="polite">${definition.voices.map(voice => `<div class="protocol-speaker ${voice.id === session.speaker ? "is-active" : ""}"><img src="${ASSET_ROOT}/voices/${voiceAsset[`${definition.id}:${voice.id}`]}.png" alt=""><span>${escapeHtml(voice.name)}</span><small>${escapeHtml(voice.role)}</small></div>`).join("")}</div><div class="protocol-transcript">${turns || "<p>Preparing the first voice…</p>"}</div>${waiting}${failure}</section>`;
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
    host.querySelectorAll<HTMLButtonElement>("[data-protocol-flip]").forEach(button => button.onclick = () => { const card = button.closest<HTMLElement>("[data-protocol-card]")!; const open = !card.classList.contains("is-open"); card.classList.toggle("is-open", open); card.querySelector<HTMLButtonElement>(".protocol-card__front")?.setAttribute("aria-expanded", String(open)); });
    host.querySelectorAll<HTMLButtonElement>("[data-protocol-begin]").forEach(button => button.onclick = () => { selected = definitions.find(d => d.id === button.dataset.protocolBegin) ?? null; paint(); });
    host.querySelector<HTMLButtonElement>("[data-protocol-close]")?.addEventListener("click", () => { stopPolling(); selected = null; currentSession = null; paint(); });
    host.querySelector<HTMLFormElement>("[data-protocol-form]")?.addEventListener("submit", async event => { event.preventDefault(); if (USE_LOCAL_DATA || !selected) return; const form = new FormData(event.currentTarget); const error = host.querySelector<HTMLElement>("[data-protocol-error]"); const prompt = String(form.get("prompt") ?? "").trim(); try { const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ protocolId: selected.id, mode: form.get("mode"), intake: compactIntake(selected, prompt), requestId: crypto.randomUUID() }) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error?.message ?? "The protocol could not start."); currentSession = body.data.session; paint(); void poll(); } catch (reason) { if (error) { error.textContent = reason instanceof Error ? reason.message : "The protocol could not start."; error.hidden = false; } } });
    host.querySelector<HTMLFormElement>("[data-protocol-reply]")?.addEventListener("submit", async event => { event.preventDefault(); if (!currentSession) return; const form = new FormData(event.currentTarget); const kind = currentSession.checkpoint?.kind; const action = String(form.get("action") ?? (["verify", "confirm"].includes(kind ?? "") ? "confirm" : kind === "reflection" ? "reflect" : "answer")); const text = String(form.get("reply") ?? ""); const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: currentSession.id, revision: currentSession.revision, requestId: crypto.randomUUID(), action, text }) }); if (response.ok) { currentSession = (await response.json()).data.session; paint(); void poll(); } });
    host.querySelector<HTMLButtonElement>("[data-protocol-action]")?.addEventListener("click", async event => { if (!currentSession) return; const action = (event.currentTarget as HTMLButtonElement).dataset.protocolAction; const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: currentSession.id, revision: currentSession.revision, requestId: crypto.randomUUID(), action }) }); if (response.ok) { currentSession = (await response.json()).data.session; paint(); void poll(); } });
  };
  paint();
  void catalog().then(next => { definitions = next; if (!selected) paint(); }).catch(() => undefined);
  return stopPolling;
}
