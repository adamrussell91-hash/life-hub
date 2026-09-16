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
export function backgroundAsset(id: string, stage?: number) { return `${ASSET_ROOT}/backgrounds/${id}-background${stage ? `-${stage}` : ""}.png`; }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 5 sequential lighting stages across the transcript so far — 1 (opening) to 5 (closing). */
export function lightingStage(viewingIndex: number, totalTurns: number): number {
  if (totalTurns <= 1) return 1;
  const fraction = clamp(viewingIndex, 0, totalTurns - 1) / (totalTurns - 1);
  return clamp(1 + Math.floor(fraction * 5), 1, 5);
}

const lightingArtCache = new Map<string, boolean>();
function probeImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
/** Swaps in a numbered lighting-stage background once confirmed to exist; leaves the default in place otherwise. */
function applyStagedBackground(section: HTMLElement, protocolId: string, stage: number) {
  const url = backgroundAsset(protocolId, stage);
  const cached = lightingArtCache.get(url);
  if (cached === true) { section.style.setProperty("--protocol-background", `url('${url}')`); return; }
  if (cached === false) return;
  void probeImage(url).then(ok => {
    lightingArtCache.set(url, ok);
    if (ok && section.isConnected) section.style.setProperty("--protocol-background", `url('${url}')`);
  });
}

export type ForkBranch = { label: string; body: string };
export type ForkSplit = { leading: string; branches: ForkBranch[] };
const FORK_MARKER_RE = /\bfork\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*:\s*/gi;
/** Splits "Fork one: ... Fork two: ..." style replies into branch cards. Returns null when the text doesn't follow that pattern. */
export function detectForks(text: string): ForkSplit | null {
  const matches = [...text.matchAll(FORK_MARKER_RE)];
  if (matches.length < 2) return null;
  const leading = text.slice(0, matches[0].index).trim();
  const branches: ForkBranch[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const body = text.slice(start, end).trim();
    if (body) branches.push({ label: `Fork ${i + 1}`, body });
  }
  return branches.length >= 2 ? { leading, branches } : null;
}

function paragraphs(text: string): string[] {
  const parts = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()];
}
function richTextHtml(text: string): string {
  return paragraphs(text).map(part => `<p>${escapeHtml(part)}</p>`).join("");
}
function turnBodyHtml(text: string): string {
  const forks = detectForks(text);
  if (!forks) return richTextHtml(text);
  const leadingHtml = forks.leading ? richTextHtml(forks.leading) : "";
  const branchesHtml = `<div class="protocol-forks">${forks.branches.map(branch => `<div class="protocol-fork"><p class="protocol-fork__label">${escapeHtml(branch.label)}</p>${richTextHtml(branch.body)}</div>`).join("")}</div>`;
  return leadingHtml + branchesHtml;
}

const SPEAKER_PALETTE = ["#9fb4d8", "#d9a5a5", "#c9b28a", "#a7c4a0", "#b6a7d1"];
function speakerColor(definition: Definition, speakerId: string): string {
  if (speakerId === "you") return "#7d93b8";
  const index = definition.voices.findIndex(voice => voice.id === speakerId);
  return SPEAKER_PALETTE[(index < 0 ? 0 : index) % SPEAKER_PALETTE.length];
}

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

export const PROTOCOL_POLL_MS = 400;
const VOICE_ROLES: Record<string, string> = {
  lachesis: "Strategist and measurer", clotho: "Generative spinner", atropos: "Critical cutter", weave: "Witness and mapper",
  ketill: "Near horizon", alvar: "Far horizon", sigrid: "The Reckoning",
  builder: "Affirmative structure", breaker: "Structural critique", reforger: "Rebuild with limits",
  surveyor: "Map the terrain", miner: "Extract claims", cartographer: "Map relationships",
  retrospective: "Revealed preferences", prospective: "Stated aspirations", present: "Present tension",
  principle: "Duty and rights", consequence: "Outcomes", virtue: "Character",
  trace: "Process reconstruction", patterns: "Pattern match", recalibration: "Confidence",
  inverter: "Hidden relationship", scaler: "Downscale and upscale", "context-shifter": "Context dissolution"
};

function voiceOf(definition: Definition, id: string | null) {
  return definition.voices.find(voice => voice.id === id) ?? null;
}
export function speakerName(session: Session, definition: Definition) {
  return voiceOf(definition, session.speaker)?.name ?? (session.speaker === "you" ? "You" : session.speaker ?? "Session");
}
export function statusLabel(session: Session) {
  if (["queued", "running"].includes(session.status)) return "thinking";
  if (session.status === "waiting") return "listening";
  if (session.status === "failed") return "needs a retry";
  if (session.status === "completed") return "closed";
  return session.status;
}
function voiceSrc(definition: Definition, id: string) {
  return `${ASSET_ROOT}/voices/${voiceAsset[`${definition.id}:${id}`]}.png`;
}
function personaMetaHtml(name: string, role: string) {
  return `<p class="protocol-turn-card__meta">✦ ${escapeHtml(name)} ✦</p>${role ? `<p class="protocol-turn-card__role">${escapeHtml(role)}</p>` : ""}`;
}
function liveSlotHtml(session: Session, who: string, role: string, precedingText: string | null): string {
  const preceding = precedingText ? turnBodyHtml(precedingText) : "";
  if (session.error) {
    return `<div class="protocol-turn-card protocol-turn-card--live" data-protocol-composer>${personaMetaHtml(who, role)}${preceding}<p>${escapeHtml(session.error.message)}</p>${session.allowedActions.includes("retry") ? `<button class="btn btn--primary" data-protocol-action="retry" type="button">Retry this voice</button>` : ""}</div>`;
  }
  if (["queued", "running"].includes(session.status)) {
    return `<div class="protocol-turn-card protocol-turn-card--live protocol-turn-card--listening" data-protocol-composer>${personaMetaHtml(who, role)}${preceding}<p aria-live="polite">${escapeHtml(who)} is thinking</p>${session.id ? `<button class="btn btn--ghost" data-protocol-action="cancel" type="button">End session</button>` : ""}</div>`;
  }
  if (!session.checkpoint) return `<div class="protocol-turn-card protocol-turn-card--live" data-protocol-composer>${preceding}</div>`;
  return `<form class="protocol-turn-card protocol-turn-card--live protocol-reply" data-protocol-reply data-protocol-composer data-checkpoint="${escapeHtml(session.checkpoint.question)}">${personaMetaHtml(who, role)}${preceding}<label class="protocol-reply__field"><span class="protocol-reply__visually-hidden">Reply to ${escapeHtml(who)}</span><textarea name="reply" placeholder="Reply to ${escapeHtml(who)}" autofocus></textarea></label><div class="protocol-reply__actions"><button class="btn btn--primary" type="submit">Continue</button>${session.allowedActions.includes("uncertain") ? `<button class="btn btn--ghost" name="action" value="uncertain" type="submit">Continue with uncertainty</button>` : ""}${session.allowedActions.includes("cancel") ? `<button class="btn btn--ghost" name="action" value="cancel" type="submit">End session</button>` : ""}</div></form>`;
}
function readTurnCardHtml(turn: Session["transcript"][number], who: string, role: string): string {
  return `<article class="protocol-turn-card" data-turn-id="${escapeHtml(turn.id)}">${personaMetaHtml(who, role)}${turnBodyHtml(turn.text)}</article>`;
}
function joiningCardHtml(who: string, role: string): string {
  return `<div class="protocol-turn-card protocol-turn-card--live">${personaMetaHtml(who, role)}<p>${escapeHtml(who)} is joining the conversation…</p></div>`;
}
function renderScrubber(session: Session, index: number, isLatest: boolean, definition: Definition): string {
  const total = session.transcript.length;
  if (total === 0) return "";
  const dots = session.transcript.map((turn, i) => {
    const current = i === index;
    const label = turn.speaker === "you" ? "You" : voiceOf(definition, turn.speaker)?.name ?? turn.speaker;
    return `<button type="button" class="protocol-dot${current ? " is-current" : ""}" data-protocol-scrub-to="${i}" style="--dot-color:${speakerColor(definition, turn.speaker)}" aria-current="${current}" aria-label="${escapeHtml(label)}, turn ${i + 1} of ${total}"></button>`;
  }).join("");
  const nudge = !isLatest ? `<button type="button" class="protocol-scrub-nudge" data-protocol-scrub="latest">New reply ↓</button>` : "";
  return `<nav class="protocol-scrubber" aria-label="Conversation history"><button type="button" class="protocol-scrub-arrow" data-protocol-scrub="prev" ${index === 0 ? "disabled" : ""} aria-label="Previous turn">‹</button><div class="protocol-scrub-dots">${dots}</div><button type="button" class="protocol-scrub-arrow" data-protocol-scrub="next" ${index === total - 1 ? "disabled" : ""} aria-label="Next turn">›</button></nav>${nudge}`;
}
export function sessionView(session: Session, definition: Definition, viewingIndex?: number) {
  const total = session.transcript.length;
  const index = total === 0 ? 0 : clamp(viewingIndex ?? total - 1, 0, total - 1);
  const isLatest = total === 0 || index === total - 1;
  const listening = ["queued", "running"].includes(session.status);
  const turn = total > 0 ? session.transcript[index] : null;
  const cardIsLive = isLatest && (listening || Boolean(session.error) || Boolean(session.checkpoint) || !turn);
  const activeSpeakerId = cardIsLive ? session.speaker : turn ? turn.speaker : session.speaker;
  const activeVoice = activeSpeakerId && activeSpeakerId !== "you" ? voiceOf(definition, activeSpeakerId) : null;
  const activeRole = activeVoice ? activeVoice.role || VOICE_ROLES[activeVoice.id] || "" : "";
  const activeName = activeVoice ? activeVoice.name : activeSpeakerId === "you" ? "You" : speakerName(session, definition);
  const precedingText = cardIsLive && turn && turn.speaker !== "you" ? turn.text : null;
  const cardHtml = cardIsLive
    ? liveSlotHtml(session, activeName, activeRole, precedingText)
    : turn
      ? readTurnCardHtml(turn, activeName, activeRole)
      : joiningCardHtml(activeName, activeRole);
  const portraitHtml = activeVoice
    ? `<div class="protocol-portrait"><img src="${voiceSrc(definition, activeVoice.id)}" alt="${escapeHtml(activeVoice.name)}" width="220" height="220"></div>`
    : activeSpeakerId === "you"
      ? `<div class="protocol-portrait protocol-portrait--you" aria-hidden="true">You</div>`
      : "";
  return `<section class="protocol-session${listening ? " is-listening" : ""}" data-speaker="${escapeHtml(session.speaker ?? "")}" style="--protocol-background:url('${backgroundAsset(definition.id)}')"><header><button class="btn btn--ghost" data-protocol-close type="button">← Thinking</button><p class="page-header__eyebrow">${escapeHtml(definition.name)}</p>${total > 0 ? `<p class="protocol-session__position">Turn ${index + 1} of ${total}</p>` : ""}</header>${portraitHtml}<div class="protocol-turn-card-slot">${cardHtml}</div>${renderScrubber(session, index, isLatest, definition)}</section>`;
}
export function applySession(root: HTMLElement, session: Session, definition: Definition, viewingIndex?: number) {
  const total = session.transcript.length;
  const index = total === 0 ? 0 : clamp(viewingIndex ?? total - 1, 0, total - 1);
  const key = [session.id, session.revision, session.status, session.error?.message ?? "", index, total].join("|");
  if (root.dataset.protocolRenderKey === key) return;
  root.dataset.protocolRenderKey = key;
  root.innerHTML = sessionView(session, definition, index);
  const section = root.querySelector<HTMLElement>(".protocol-session");
  if (section) applyStagedBackground(section, definition.id, lightingStage(index, total));
}

export function renderProtocols({ host }: { host: HTMLElement }) {
  let definitions = localCatalog;
  let selected: Definition | null = null;
  let currentSession: Session | null = null;
  let pollTimer: number | null = null;
  let viewingIndex: number | null = null;
  const effectiveIndex = () => {
    const total = currentSession?.transcript.length ?? 0;
    if (total === 0) return 0;
    return viewingIndex === null ? total - 1 : clamp(viewingIndex, 0, total - 1);
  };
  const stopPolling = () => { if (pollTimer !== null) window.clearTimeout(pollTimer); pollTimer = null; };
  const paint = () => {
    if (currentSession && selected) applySession(host, currentSession, selected, effectiveIndex());
    else host.innerHTML = selected ? intake(selected) : `<section class="protocol-library"><header class="page-header"><div><p class="page-header__eyebrow">Cognitive protocols</p><div class="page-header__title-row"><h1>Choose a way to think</h1></div><p class="page-header__supporting">Eight structured conversations, each with its own history, rhythm and discipline.</p></div></header><div class="protocol-library__grid">${cards(definitions)}</div></section>`;
  };
  const poll = async () => {
    if (!currentSession?.id || USE_LOCAL_DATA) return;
    try {
      const response = await fetch(`${API_BASE}/protocols?sessionId=${encodeURIComponent(currentSession.id)}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      currentSession = body.data.session;
      paint();
      if (["queued", "running"].includes(currentSession.status)) pollTimer = window.setTimeout(poll, PROTOCOL_POLL_MS);
    } catch {
      if (currentSession) {
        currentSession = { ...currentSession, error: { message: "Could not refresh this session. Retry keeps completed turns intact.", retryable: true } };
        paint();
      }
    }
  };
  const postAction = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE}/protocols`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message ?? "The protocol could not continue.");
    currentSession = body.data.session;
    paint();
    void poll();
  };
  host.onclick = event => {
    const target = event.target as HTMLElement;
    const scrubTo = target.closest<HTMLElement>("[data-protocol-scrub-to]");
    if (scrubTo && currentSession) { viewingIndex = Number(scrubTo.dataset.protocolScrubTo); paint(); return; }
    const scrub = target.closest<HTMLElement>("[data-protocol-scrub]")?.dataset.protocolScrub;
    if (scrub && currentSession) {
      const total = currentSession.transcript.length;
      if (scrub === "latest") viewingIndex = null;
      else if (scrub === "prev") viewingIndex = Math.max(effectiveIndex() - 1, 0);
      else if (scrub === "next") viewingIndex = Math.min(effectiveIndex() + 1, Math.max(total - 1, 0));
      paint();
      return;
    }
    const flip = target.closest<HTMLButtonElement>("[data-protocol-flip]");
    if (flip) {
      const card = flip.closest<HTMLElement>("[data-protocol-card]");
      if (!card) return;
      const open = !card.classList.contains("is-open");
      card.classList.toggle("is-open", open);
      card.querySelector<HTMLButtonElement>(".protocol-card__front")?.setAttribute("aria-expanded", String(open));
      return;
    }
    const begin = target.closest<HTMLButtonElement>("[data-protocol-begin]");
    if (begin) { selected = definitions.find(d => d.id === begin.dataset.protocolBegin) ?? null; currentSession = null; viewingIndex = null; paint(); return; }
    if (target.closest("[data-protocol-close]")) { stopPolling(); selected = null; currentSession = null; viewingIndex = null; paint(); return; }
    const action = target.closest<HTMLButtonElement>("[data-protocol-action]")?.dataset.protocolAction;
    if (action && currentSession) void postAction({ sessionId: currentSession.id, revision: currentSession.revision, requestId: crypto.randomUUID(), action });
  };
  host.onsubmit = async event => {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    if (form.matches("[data-protocol-form]")) {
      if (USE_LOCAL_DATA || !selected) return;
      const data = new FormData(form);
      const prompt = String(data.get("prompt") ?? "").trim();
      currentSession = { id: "", status: "queued", stage: "briefing", speaker: selected.voices[0]?.id ?? null, revision: 0, transcript: [], checkpoint: null, allowedActions: ["cancel"], error: null };
      viewingIndex = null;
      paint();
      try {
        await postAction({ protocolId: selected.id, mode: data.get("mode"), intake: compactIntake(selected, prompt), requestId: crypto.randomUUID() });
      } catch (reason) {
        currentSession = null;
        paint();
        const error = host.querySelector<HTMLElement>("[data-protocol-error]");
        if (error) { error.textContent = reason instanceof Error ? reason.message : "The protocol could not start."; error.hidden = false; }
      }
      return;
    }
    if (!form.matches("[data-protocol-reply]") || !currentSession) return;
    const data = new FormData(form);
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const kind = currentSession.checkpoint?.kind;
    const action = submitter?.name === "action" ? String(submitter.value) : (["verify", "confirm"].includes(kind ?? "") ? "confirm" : kind === "reflection" ? "reflect" : "answer");
    const text = String(data.get("reply") ?? "");
    if (["answer", "correct", "reflect"].includes(action) && !text.trim()) return;
    const prior = currentSession;
    currentSession = {
      ...prior,
      status: action === "cancel" ? "cancelled" : "queued",
      checkpoint: null,
      transcript: text.trim() ? [...prior.transcript, { id: `local-${prior.revision}`, role: "user", speaker: "you", stage: prior.stage, text: text.trim() }] : prior.transcript
    };
    viewingIndex = null;
    paint();
    try { await postAction({ sessionId: prior.id, revision: prior.revision, requestId: crypto.randomUUID(), action, text }); }
    catch { currentSession = { ...prior, error: { message: "The reply could not be sent.", retryable: true } }; paint(); }
  };
  paint();
  void catalog().then(next => { definitions = next; if (!selected) paint(); }).catch(() => undefined);
  return stopPolling;
}
