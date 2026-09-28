import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA } from "../api/client";
import { escapeHtml } from "../lib/dom";
import { stripDanglingQuestions } from "../../../../config/knowledge/cognitive/dangling-question.mjs";
import { catalog as definitionCatalog } from "../../../../config/knowledge/cognitive/definitions.mjs";

type Definition = { id: string; name: string; description: string; motif: string; defaultMode: string; modes: { id: string; label: string; description: string }[]; intake: { id: string; label: string; required: boolean; type: string; options?: { value: string; label: string }[] }[]; voices: { id: string; name: string; role: string }[] };
type Evidence = { id: string; kind?: string; title: string; text?: string; url?: string };
type Turn = { id: string; role: string; speaker: string; stage: string; text: string; evidenceIds?: string[] };
type Session = { id: string; status: string; stage: string; speaker: string | null; revision: number; transcript: Turn[]; evidence?: Evidence[]; checkpoint: null | { kind: string; question: string }; allowedActions: string[]; error: null | { message: string; retryable: boolean }; protocolId?: string; mode?: string; summary?: { title?: string; keyFinding?: string; summary?: string; openQuestions?: string[]; forHammond?: string | null } };
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
export function backgroundAsset(id: string, stage?: string) { return `${ASSET_ROOT}/backgrounds/${id}-background${stage ? `-${stage}` : ""}.png`; }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Named lighting stages across the transcript so far, opening to closing. */
export const LIGHTING_STAGES = ["sunrise", "morning", "golden-hour", "blue-hour", "just-after-dusk"] as const;
export const FATES_LIGHTING_STAGES = ["sunrise", "early-morning", "late-morning", "midday", "early-afternoon", "late-afternoon", "sunset", "blue-hour", "night"] as const;
export const CARTOGRAPHERS_LIGHTING_STAGES = ["dawn", "sunrise", "midday", "golden-hour", "twilight", "night"] as const;
export const MIRROR_LIGHTING_STAGES = ["sunrise", "morning", "midday", "golden-hour", "twilight", "night"] as const;
export const WITNESS_LIGHTING_STAGES = ["sunrise", "morning", "midday", "golden-hour", "night"] as const;
export const TRIBUNAL_LIGHTING_STAGES = ["midday", "golden-hour", "blue-hour"] as const;
const LIGHTING_BY_PROTOCOL: Record<string, readonly string[]> = {
  fates: FATES_LIGHTING_STAGES,
  cartographers: CARTOGRAPHERS_LIGHTING_STAGES,
  mirror: MIRROR_LIGHTING_STAGES,
  witness: WITNESS_LIGHTING_STAGES,
  tribunal: TRIBUNAL_LIGHTING_STAGES,
  consilium: MIRROR_LIGHTING_STAGES,
};
export function lightingStage(viewingIndex: number, totalTurns: number, protocolId?: string): string {
  const stages = (protocolId && LIGHTING_BY_PROTOCOL[protocolId]) || LIGHTING_STAGES;
  if (totalTurns <= 1) return stages[0];
  const fraction = clamp(viewingIndex, 0, totalTurns - 1) / (totalTurns - 1);
  return stages[clamp(Math.floor(fraction * stages.length), 0, stages.length - 1)];
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
/** Soft-crossfades a lighting-stage background; missing art keeps the current layer. */
function applyStagedBackground(section: HTMLElement, protocolId: string, stage: string) {
  const url = backgroundAsset(protocolId, stage);
  const apply = (resolved: string) => {
    const layers = section.querySelector(".protocol-bg");
    if (!layers) {
      section.style.setProperty("--protocol-background", `url('${resolved}')`);
      return;
    }
    const current = layers.querySelector<HTMLElement>(".protocol-bg__layer.is-shown");
    const next = layers.querySelector<HTMLElement>(".protocol-bg__layer:not(.is-shown)");
    if (!current || !next) {
      section.style.setProperty("--protocol-background", `url('${resolved}')`);
      return;
    }
    const shown = current.style.backgroundImage || getComputedStyle(current).backgroundImage;
    if (shown.includes(resolved)) return;
    next.style.backgroundImage = `url('${resolved}')`;
    next.classList.add("is-shown");
    current.classList.remove("is-shown");
    section.style.setProperty("--protocol-background", `url('${resolved}')`);
  };
  const cached = lightingArtCache.get(url);
  if (cached === true) { apply(url); return; }
  if (cached === false) return;
  void probeImage(url).then(ok => {
    lightingArtCache.set(url, ok);
    if (ok && section.isConnected) apply(url);
  });
}

function backgroundLayersHtml(protocolId: string) {
  const base = backgroundAsset(protocolId);
  return `<div class="protocol-bg" aria-hidden="true"><div class="protocol-bg__layer is-shown" style="background-image:url('${base}')"></div><div class="protocol-bg__layer"></div></div>`;
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

const LOCAL_VOICE_IDS: Record<string, string[]> = {
  fates: ["lachesis", "clotho", "atropos", "weave"],
  horizon: ["ketill", "alvar", "sigrid"],
  refinery: ["builder", "breaker", "reforger"],
  cartographers: ["surveyor", "miner", "cartographer"],
  mirror: ["retrospective", "prospective", "present"],
  consilium: ["principle", "consequence", "virtue"],
  witness: ["trace", "patterns", "recalibration"],
  tribunal: ["inverter", "scaler", "context-shifter"],
};

const localCatalog: Definition[] = [
  ["fates", "The Three Fates", "Live dialectic across generative, critical and strategic voices.", "Greek threads", "normal", ["Normal", "Sprint", "Long"], ["Lachesis", "Clotho", "Atropos", "The Weave"]],
  ["horizon", "The Horizon Council", "Map present trajectories against a desired future.", "Norse long hall", "full", ["Full", "Brief"], ["Ketill", "Alvar", "Sigrid"]],
  ["refinery", "The Refinery", "Build, break and reforge a defensible argument.", "Chevruta paired argument", "full", ["Full", "Build", "Break", "Reforge"], ["The Builder", "The Breaker", "The Reforger"]],
  ["cartographers", "The Cartographers", "Turn literature into a purpose-fit knowledge representation.", "Contours and bearings", "full", ["Full", "Focused", "Direct"], ["The Surveyor", "The Miner", "The Cartographer"]],
  ["mirror", "The Mirror Council", "Clarify the gap between behaviour, aspiration and present capacity.", "Confucian reflection", "quick", ["Quick", "Deep"], ["Gu Jian the Retrospective", "Wang Yuan the Prospective", "Zheng Ming the Present"]],
  ["consilium", "The Consilium", "Deliberate through incompatible ethical standpoints without a verdict.", "Roman advisory chamber", "standard", ["Standard", "Extended"], ["The Principle", "The Consequence", "The Virtue"]],
  ["witness", "The Witness", "Audit a specific thinking process before trusting its result.", "Zen and Vipassana observation", "standard", ["Standard", "Deep"], ["Process Trace", "Pattern Match", "Recalibration"]],
  ["tribunal", "The Tribunal of Frames", "Open three independent reframes of an entrenched problem.", "Nested frames and scale", "standard", ["Quick", "Standard", "Deep"], ["The Inverter", "The Scaler", "The Context Shifter"]]
].map(([id, name, description, motif, defaultMode, modes, voices]) => {
  const protocolId = id as string;
  const source = (definitionCatalog as Definition[]).find(entry => entry.id === protocolId);
  return {
    id: protocolId, name, description, motif, defaultMode,
    modes: (modes as string[]).map(label => {
      const modeId = label.toLowerCase();
      const sourceMode = source?.modes.find(mode => mode.id === modeId);
      // Only keep a distinct description; otherwise mirror the local label so modeHintText omits it.
      const description = sourceMode && sourceMode.description.trim() !== sourceMode.label.trim()
        ? sourceMode.description
        : label;
      return { id: modeId, label, description };
    }),
    intake: [{ id: "prompt", label: "What would you like to examine?", required: true, type: "textarea" }],
    voices: (voices as string[]).map((voiceName, index) => {
      const voiceId = LOCAL_VOICE_IDS[protocolId][index];
      return { id: voiceId, name: voiceName, role: source?.voices.find(voice => voice.id === voiceId)?.role ?? "" };
    }),
  };
});

async function catalog() {
  if (USE_LOCAL_DATA) return localCatalog;
  const response = await fetch(`${API_BASE}/protocols`, { credentials: "include" });
  if (!response.ok) throw new Error("The protocol catalogue is unavailable.");
  const body = await response.json();
  return body.data.catalog as Definition[];
}

async function listPastRuns(offset = 0, limit = 20) {
  if (USE_LOCAL_DATA) return [];
  const response = await fetch(`${API_BASE}/protocols?list=1&limit=${limit}&offset=${offset}`, { credentials: "include" });
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body?.data?.sessions) ? body.data.sessions : [];
}

function formatRunDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function protocolDisplayName(id: string, definitions: Definition[] = []) {
  return definitions.find(d => d.id === id)?.name || id;
}

export function pastRunsHtml(runs: Array<Record<string, unknown>>, filterId: string, definitions: Definition[] = [], { hasMore = false } = {}) {
  const filtered = filterId ? runs.filter(run => run.protocolId === filterId) : runs;
  const options = ["", "fates", "horizon", "refinery", "cartographers", "mirror", "consilium", "witness", "tribunal"]
    .map(id => `<option value="${id}" ${id === filterId ? "selected" : ""}>${id ? escapeHtml(protocolDisplayName(id, definitions)) : "All protocols"}</option>`)
    .join("");
  const rows = filtered.length
    ? filtered.map(run => {
      const resumable = run.status === "waiting" || run.status === "paused";
      return `<li class="protocol-past__row">
        <button type="button" class="protocol-past__open" data-protocol-open-run="${escapeHtml(String(run.id))}">
          <span>${escapeHtml(formatRunDate(String(run.updatedAt || run.createdAt || "")))}</span>
          <span>${escapeHtml(protocolDisplayName(String(run.protocolId || ""), definitions))}</span>
          <span>${escapeHtml(String(run.title || "Untitled"))}</span>
          <span>${escapeHtml(String(run.mode || ""))}</span>
          <span>${escapeHtml(String(run.status || ""))}</span>
        </button>
        ${resumable ? `<button type="button" class="btn btn--ghost" data-protocol-resume-run="${escapeHtml(String(run.id))}">Resume</button>` : ""}
      </li>`;
    }).join("")
    : `<li class="protocol-past__empty">No past runs yet.</li>`;
  const more = hasMore ? `<button type="button" class="btn btn--ghost" data-protocol-past-more>Load more</button>` : "";
  return `<section class="protocol-past" aria-label="Past runs"><header class="protocol-past__header"><h2>Past runs</h2><label>Filter by protocol<select data-protocol-past-filter>${options}</select></label></header><ul class="protocol-past__list">${rows}</ul>${more}</section>`;
}

function downloadMarkdown(session: Session & { summary?: { title?: string; keyFinding?: string; summary?: string; openQuestions?: string[] }; protocolId?: string; mode?: string }) {
  const lines = [
    `# ${session.summary?.title || session.protocolId || "Protocol run"}`,
    "",
    `- Protocol: ${session.protocolId || ""}`,
    `- Mode: ${session.mode || ""}`,
    `- Status: ${session.status}`,
    session.summary?.keyFinding ? `- Key finding: ${session.summary.keyFinding}` : "",
    "",
    session.summary?.summary || "",
    "",
    ...(session.summary?.openQuestions || []).map(q => `- ${q}`),
    "",
    "## Transcript",
    ...session.transcript.map(turn => `### ${turn.speaker} (${turn.stage})\n\n${turn.text}`)
  ].filter(line => line !== undefined);
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${session.protocolId || "protocol"}-${session.id || "run"}.md`;
  a.click();
  URL.revokeObjectURL(url);
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

const VOICE_PROFILE_TIPS: Record<string, string> = {
  // Mirror
  retrospective: "Gu Jian reads the ji — what was chosen and declined over months. Past tense, sample before pattern, one instance is never a trend.",
  prospective: "Wang Yuan reads only aspirations Adam stated. Toward, away from, or neutral — never invents a zhi to fill silence.",
  present: "Zheng Ming rectifies the name of the conflict and asks one seven-day question. He does not choose for you.",
  // Horizon
  ketill: "Ketill keeps the near horizon — six months to two years. Practical forks, Miðgarðr speech, no plan.",
  alvar: "Alvar works backwards from the far condition. Preconditions and Skuld, not advice.",
  sigrid: "Sigrid classifies each finding as trade-off, drift, or unclassified — one closing ask.",
  // Fates
  clotho: "Clotho spins — hot, generative, breathless. Options and Greek sparks; she asks what to spin with.",
  atropos: "Atropos cuts — dry, evidence-first. Demands definition or a falsification test.",
  lachesis: "Lachesis measures — level options and decisions. She asks early and stops at the choice.",
  weave: "The Weave witnesses only — durable threads, tensions, what remains open. No advocacy.",
  // Refinery
  builder: "Bezalel builds the affirmative Toulmin case — claim, grounds, warrant, backing, qualifier.",
  breaker: "Beruriah steelmans the weakest joint. Short, dry, no rebuild.",
  reforger: "Nechemya rebuilds accounting for each Breaker weakness — repaired or accepted.",
  // Cartographers
  surveyor: "Captain Everly maps the terrain — positions, contested edges, neglect. Never ranks.",
  miner: "Miss Quarrington extracts numbered citation slips. No cross-source synthesis.",
  cartographer: "Mr Meridith draws relations from Miner slips and leaves unsurveyed ground blank.",
  // Consilium
  principle: "Gaius Officius — duty and rights owed, regardless of cost. No consequentialism.",
  consequence: "Lucius Eventus — who is affected, how badly, how likely. If/then chains.",
  virtue: "Titus Honestus — what the choice practises in the person. Only stated aspirations.",
  // Witness
  trace: "Sati reconstructs the thinking sequence without story or judgement.",
  patterns: "Pañña — sound thinking is the null hypothesis; baseline before any pattern.",
  recalibration: "Upekkhā calibrates confidence and one disposition — not a replacement decision.",
  // Tribunal
  inverter: "Counselor Delacorte tests whether the problem is a solution to an unnamed problem.",
  scaler: "Special Master Abernathy runs one downscale and one upscale of the same claim.",
  "context-shifter": "Judge Venable names a setting where the problem would not arise.",
};

function voiceChipHtml(protocolId: string, voice: Definition["voices"][number]): string {
  const name = escapeHtml(voice.name);
  const role = (voice.role || VOICE_ROLES[voice.id] || "").trim();
  const tip = VOICE_PROFILE_TIPS[voice.id] || role;
  if (!tip) return `<span class="protocol-card__voice">${name}</span>`;
  const tipId = `protocol-voice-tip-${protocolId}-${voice.id}`;
  const tipHtml = escapeHtml(tip);
  const roleHtml = escapeHtml(role || tip);
  return `<span class="protocol-card__voice" tabindex="0" aria-describedby="${tipId}">${name}<span class="agent-protocol-pills__tip" id="${tipId}" role="tooltip">${tipHtml}</span><span class="protocol-card__voice-role">${roleHtml}</span></span>`;
}

function cards(definitions: Definition[]) {
  return definitions.map((d, index) => {
    const typeTipId = `protocol-type-tip-${d.id}`;
    const typeTip = escapeHtml(`${d.motif}. ${d.description}`);
    return `<article class="protocol-card protocol-card--${escapeHtml(d.id)}" data-protocol-card="${escapeHtml(d.id)}" style="--protocol-order:${index}">
    <div class="protocol-card__inner">
      <button type="button" class="protocol-card__front" data-protocol-flip aria-expanded="false" aria-label="Show details for ${escapeHtml(d.name)}" aria-describedby="${typeTipId}">
        <img class="protocol-card__front-art" src="${frontAsset(d.id)}" alt="">
        <span class="protocol-card__corner">${String(index + 1).padStart(2, "0")}</span><span class="protocol-card__eyebrow">${escapeHtml(d.motif)}</span><strong>${escapeHtml(d.name)}</strong><span class="protocol-card__description">${escapeHtml(d.description)}</span>
        <span class="agent-protocol-pills__tip protocol-card__type-tip" id="${typeTipId}" role="tooltip">${typeTip}</span>
      </button>
      <section class="protocol-card__back" aria-label="${escapeHtml(d.name)} details">
        <div class="protocol-card__back-media"><img src="${backAsset(d.id)}" alt=""></div><div class="protocol-card__back-copy"><p>${escapeHtml(d.description)}</p><p class="protocol-card__voices">${d.voices.map(v => voiceChipHtml(d.id, v)).join("")}</p></div>
        <div class="protocol-card__actions"><button class="btn btn--ghost" data-protocol-flip type="button">Back</button><button class="btn btn--primary" data-protocol-begin="${escapeHtml(d.id)}" type="button">Begin</button></div>
      </section>
    </div>
  </article>`;
  }).join("");
}

function modeHintText(mode: Definition["modes"][number] | undefined): string {
  if (!mode) return "";
  const description = mode.description.trim();
  return description && description !== mode.label.trim() ? description : "";
}

function intake(definition: Definition, gateMessage = "") {
  const freq = gateMessage
    ? `<label>Reason for another review within this quarter<textarea name="frequencyJustification" required placeholder="Why run Horizon again inside this quarter?">${escapeHtml(gateMessage)}</textarea></label>`
    : "";
  const error = gateMessage
    ? `<p class="protocol-intake__error" data-protocol-error role="status">${escapeHtml(gateMessage)}</p>`
    : `<p class="protocol-intake__error" data-protocol-error hidden role="status"></p>`;
  const selectedMode = definition.modes.find(m => m.id === definition.defaultMode) ?? definition.modes[0];
  const hint = modeHintText(selectedMode);
  return `<section class="protocol-intake" style="--protocol-background:url('${backgroundAsset(definition.id)}')"><div class="protocol-intake__content"><button class="btn btn--ghost" type="button" data-protocol-close>← Thinking</button><p class="page-header__eyebrow">${escapeHtml(definition.motif)}</p><h1>${escapeHtml(definition.name)}</h1><p>${escapeHtml(definition.description)}</p><form data-protocol-form><label>Run mode<select name="mode">${definition.modes.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === definition.defaultMode ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("")}</select></label><p class="compose__hint" data-protocol-mode-hint ${hint ? "" : "hidden"}>${escapeHtml(hint)}</p><label>What would you like to examine?<textarea name="prompt" required placeholder="Write the situation, question or claim in your own words."></textarea></label>${freq}<button class="btn btn--primary" type="submit">Begin ${escapeHtml(definition.name)}</button></form>${error}<p class="protocol-intake__note">One clear brief is enough. The protocol will ask for detail only when it needs it.</p></div></section>`;
}

export function compactIntake(definition: Pick<Definition, "id">, prompt: string, extra: Record<string, string> = {}, mode = "") {
  const required: Record<string, string[]> = { fates: ["task"], horizon: ["focus"], refinery: ["claim", "context", "audience"], cartographers: ["topic", "purpose"], mirror: ["conflict"], consilium: ["dilemma", "parties", "constraints"], witness: ["instance"], tribunal: ["problem", "entrenchment", "framing"] };
  // Direct and interrogation Cartographers read supplied papers only, so the single brief is also the source text.
  const sourced = definition.id === "cartographers" && (mode === "direct" || mode === "interrogation") ? ["sources"] : [];
  return Object.fromEntries([...(required[definition.id] ?? []), ...sourced, "userContext"].map(key => [key, prompt]).concat(Object.entries(extra).filter(([, v]) => v.trim())));
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

const THINKING_STATUSES: Record<string, string> = {
  "fates:lachesis": "Lachesis is measuring the thread against the loom.",
  "fates:clotho": "Clotho is spinning a fresh possibility into the pattern.",
  "fates:atropos": "Atropos is testing which thread must be cut away.",
  "fates:weave": "The Weave is gathering the loose threads into one pattern.",
  "horizon:ketill": "Ketill is consulting Odin's old counsel beside the hearth.",
  "horizon:alvar": "Alvar is scanning the far horizon for the shape of what comes next.",
  "horizon:sigrid": "Sigrid is asking the Norns what this path will cost.",
  "refinery:builder": "The Builder is setting the first sound beams in place.",
  "refinery:breaker": "The Breaker is tapping the argument for hidden cracks.",
  "refinery:reforger": "The Reforger is heating the strongest pieces for another pass.",
  "cartographers:surveyor": "The Surveyor is taking bearings before marking the map.",
  "cartographers:miner": "The Miner is following the richest seam of evidence.",
  "cartographers:cartographer": "The Cartographer is drawing the lines that connect the terrain.",
  "mirror:retrospective": "The Retrospective is polishing the record of what has already happened.",
  "mirror:prospective": "The Prospective is looking for the wish hidden inside the plan.",
  "mirror:present": "The Present is holding the mirror steady in the difficult light.",
  "consilium:principle": "The Principle is opening the old books of duty and promise.",
  "consilium:consequence": "The Consequence is counting who bears the weight of each outcome.",
  "consilium:virtue": "The Virtue is asking what kind of person this choice rehearses.",
  "witness:trace": "Process Trace is replaying the path, one decision at a time.",
  "witness:patterns": "Pattern Match is checking whether the familiar shape is really there.",
  "witness:recalibration": "Recalibration is setting the confidence dial back to honest.",
  "tribunal:inverter": "The Inverter is turning the frame inside out.",
  "tribunal:scaler": "The Scaler is stepping back until the proportions make sense.",
  "tribunal:context-shifter": "The Context Shifter is moving the whole question to a different room.",
};

export function thinkingStatus(definition: Definition, speakerId: string | null, name: string): string {
  return THINKING_STATUSES[`${definition.id}:${speakerId ?? ""}`] ?? `${name} is considering the next move.`;
}

type ProtocolActionPayload = Record<string, unknown> & {
  sessionId?: string;
  revision?: number;
  action?: string;
};

export class ProtocolRequestError extends Error {
  code: string;
  constructor(message: string, code = "protocol_failed") {
    super(message);
    this.name = "ProtocolRequestError";
    this.code = code;
  }
}

function protocolErrorMessage(payload: unknown): string {
  const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && message.trim() ? message : "The protocol request could not be completed.";
}

function protocolErrorCode(payload: unknown): string {
  const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "string" && code.trim() ? code : "protocol_failed";
}

function sessionFromProtocolPayload(payload: unknown): Session | null {
  const session = (payload as { data?: { session?: unknown } } | null)?.data?.session;
  return session && typeof session === "object" ? session as Session : null;
}

/** Retries a reply once after a concurrent poll has made its client revision stale. */
export async function postProtocolAction(payload: ProtocolActionPayload, fetchImpl: typeof fetch = fetch): Promise<Session> {
  const post = (body: ProtocolActionPayload) => fetchImpl(`${API_BASE}/protocols`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const readBody = (response: Response) => response.json().catch(() => null);

  let response = await post(payload);
  let body = await readBody(response);

  if (!response.ok && response.status === 409 && payload.sessionId && payload.action) {
    const latestResponse = await fetchImpl(`${API_BASE}/protocols?sessionId=${encodeURIComponent(payload.sessionId)}`, { credentials: "include" });
    const latest = latestResponse.ok ? sessionFromProtocolPayload(await readBody(latestResponse)) : null;
    if (latest?.status === "waiting" && latest.allowedActions.includes(payload.action)) {
      response = await post({ ...payload, revision: latest.revision });
      body = await readBody(response);
    } else if (latest) {
      return latest;
    }
  }

  if (!response.ok) throw new ProtocolRequestError(protocolErrorMessage(body), protocolErrorCode(body));
  const session = sessionFromProtocolPayload(body);
  if (!session) throw new ProtocolRequestError("The protocol returned an invalid session.");
  return session;
}

function sourcesHtml(turn: Turn | null | undefined, evidence: Evidence[] = []): string {
  const ids = turn?.evidenceIds ?? [];
  if (!ids.length || !evidence.length) return "";
  const links = ids
    .map(id => evidence.find(item => item.id === id))
    .filter((item): item is Evidence => Boolean(item?.url))
    .map(item => `<li><a href="${escapeHtml(item.url!)}" rel="noopener noreferrer" target="_blank">${escapeHtml(item.title || item.url!)}</a></li>`);
  if (!links.length) return "";
  return `<aside class="protocol-sources"><p class="protocol-sources__label">Sources</p><ul>${links.join("")}</ul></aside>`;
}
function liveSlotHtml(session: Session, definition: Definition, who: string, role: string, precedingText: string | null, precedingTurn: Turn | null = null): string {
  const preceding = precedingText ? turnBodyHtml(precedingText) : "";
  const sources = sourcesHtml(precedingTurn, session.evidence);
  if (session.error) {
    return `<div class="protocol-turn-card protocol-turn-card--live" data-protocol-composer>${personaMetaHtml(who, role)}${preceding}${sources}<p>${escapeHtml(session.error.message)}</p>${session.allowedActions.includes("retry") ? `<button class="btn btn--primary" data-protocol-action="retry" type="button">Retry this voice</button>` : ""}</div>`;
  }
  if (["queued", "running"].includes(session.status)) {
    return `<div class="protocol-turn-card protocol-turn-card--live protocol-turn-card--listening" data-protocol-composer>${personaMetaHtml(who, role)}${preceding}${sources}<p aria-live="polite">${escapeHtml(thinkingStatus(definition, session.speaker, who))}</p>${session.id ? `<button class="btn btn--ghost" data-protocol-action="cancel" type="button">End session</button>` : ""}</div>`;
  }
  if (!session.checkpoint) return `<div class="protocol-turn-card protocol-turn-card--live" data-protocol-composer>${preceding}${sources}</div>`;
  const reopen = session.allowedActions.includes("reopen");
  const wrap = session.allowedActions.includes("wrap");
  const close = session.allowedActions.includes("close");
  const confirm = session.allowedActions.includes("confirm") && (reopen || close);
  return `<form class="protocol-turn-card protocol-turn-card--live protocol-reply" data-protocol-reply data-protocol-composer data-checkpoint="${escapeHtml(session.checkpoint.question)}">${personaMetaHtml(who, role)}${preceding}${sources}<label class="protocol-reply__field"><span class="protocol-reply__visually-hidden">Reply to ${escapeHtml(who)}</span><textarea name="reply" placeholder="${reopen ? "Name the element to reopen, or reply" : `Reply to ${escapeHtml(who)}`}" autofocus></textarea></label><div class="protocol-reply__actions"><button class="btn btn--primary" type="submit">${confirm ? "Hold with caution" : "Continue"}</button>${reopen ? `<button class="btn btn--ghost" name="action" value="reopen" type="submit">Reopen</button>` : ""}${close ? `<button class="btn btn--ghost" name="action" value="close" type="submit">Close</button>` : ""}${wrap ? `<button class="btn btn--ghost" name="action" value="wrap" type="submit">Wrap to filter</button>` : ""}${session.allowedActions.includes("uncertain") ? `<button class="btn btn--ghost" name="action" value="uncertain" type="submit">Continue with uncertainty</button>` : ""}${session.allowedActions.includes("cancel") ? `<button class="btn btn--ghost" data-protocol-action="cancel" type="button">End session</button>` : ""}</div></form>`;
}
function readTurnCardHtml(turn: Turn, who: string, role: string, evidence: Evidence[] = []): string {
  return `<article class="protocol-turn-card" data-turn-id="${escapeHtml(turn.id)}">${personaMetaHtml(who, role)}${turnBodyHtml(turn.text)}${sourcesHtml(turn, evidence)}</article>`;
}
function endedTurnCardHtml(turn: Turn, who: string, role: string, evidence: Evidence[] = []): string {
  const body = stripDanglingQuestions(turn.text);
  return `<article class="protocol-turn-card" data-turn-id="${escapeHtml(turn.id)}">${personaMetaHtml(who, role)}${body ? turnBodyHtml(body) : ""}<p>Session ended.</p>${sourcesHtml(turn, evidence)}</article>`;
}
function joiningCardHtml(who: string, role: string): string {
  return `<div class="protocol-turn-card protocol-turn-card--live">${personaMetaHtml(who, role)}<p>${escapeHtml(who)} is joining the conversation…</p></div>`;
}
function renderScrubber(session: Session, index: number, isLatest: boolean, definition: Definition): string {
  const total = session.transcript.length;
  if (total === 0) return "";
  const dots = session.transcript.map((turn, i) => {
    const current = i === index;
    const label = turn.speaker === "you" ? "You" : turn.speaker === "controller" ? "Synthesis" : voiceOf(definition, turn.speaker)?.name ?? turn.speaker;
    const color = turn.speaker === "controller" ? "#e4c98a" : speakerColor(definition, turn.speaker);
    return `<button type="button" class="protocol-dot${current ? " is-current" : ""}" data-protocol-scrub-to="${i}" style="--dot-color:${color}" aria-current="${current ? "true" : "false"}" aria-label="${escapeHtml(label)}, turn ${i + 1} of ${total}"></button>`;
  }).join("");
  const nudge = !isLatest ? `<button type="button" class="protocol-scrub-nudge" data-protocol-scrub="latest">Continue reading ↓</button>` : "";
  return `<nav class="protocol-scrubber" aria-label="Conversation history" data-protocol-scrub-index="${index}"><button type="button" class="protocol-scrub-arrow" data-protocol-scrub="prev" ${index === 0 ? "disabled" : ""} aria-label="Previous turn">‹</button><div class="protocol-scrub-dots">${dots}</div><button type="button" class="protocol-scrub-arrow" data-protocol-scrub="next" ${index === total - 1 ? "disabled" : ""} aria-label="Next turn">›</button></nav>${nudge}`;
}

function summaryHtml(session: Session) {
  const summary = session.summary;
  if (!summary) return "";
  return `<aside class="protocol-summary" aria-label="Run summary"><h2>${escapeHtml(summary.title || "Summary")}</h2>${summary.keyFinding ? `<p>${escapeHtml(summary.keyFinding)}</p>` : ""}<p>${escapeHtml(summary.summary || "")}</p></aside>`;
}

function portraitHtmlFor(definition: Definition, activeSpeakerId: string | null, activeVoice: Definition["voices"][number] | null) {
  if (activeVoice) {
    const tip = VOICE_PROFILE_TIPS[activeVoice.id] || activeVoice.role || VOICE_ROLES[activeVoice.id] || "";
    const tipId = `protocol-portrait-tip-${definition.id}-${activeVoice.id}`;
    return `<div class="protocol-portrait" tabindex="0" aria-describedby="${tipId}"><img src="${voiceSrc(definition, activeVoice.id)}" alt="${escapeHtml(activeVoice.name)}" width="220" height="220">${tip ? `<span class="agent-protocol-pills__tip" id="${tipId}" role="tooltip">${escapeHtml(tip)}</span>` : ""}</div>`;
  }
  if (activeSpeakerId === "you") return `<div class="protocol-portrait protocol-portrait--you" aria-hidden="true">You</div>`;
  if (activeSpeakerId === "controller" || activeSpeakerId === "weave") {
    return `<div class="protocol-portrait protocol-portrait--council" aria-hidden="true" title="Council synthesis">镜</div>`;
  }
  return "";
}

export function sessionView(session: Session, definition: Definition, viewingIndex?: number) {
  const total = session.transcript.length;
  const index = total === 0 ? 0 : clamp(viewingIndex ?? total - 1, 0, total - 1);
  const isLatest = total === 0 || index === total - 1;
  const listening = ["queued", "running"].includes(session.status);
  const ended = session.status === "cancelled";
  const turn = total > 0 ? session.transcript[index] : null;
  const cardIsLive = !ended && isLatest && (listening || Boolean(session.error) || Boolean(session.checkpoint) || !turn);
  const activeSpeakerId = cardIsLive ? session.speaker : turn ? turn.speaker : session.speaker;
  const activeVoice = activeSpeakerId && activeSpeakerId !== "you" && activeSpeakerId !== "controller"
    ? voiceOf(definition, activeSpeakerId)
    : null;
  const isController = activeSpeakerId === "controller" || (!activeVoice && turn?.role === "controller");
  const activeRole = activeVoice
    ? activeVoice.role || VOICE_ROLES[activeVoice.id] || ""
    : isController ? "Clarified conflict" : "";
  const activeName = activeVoice
    ? activeVoice.name
    : activeSpeakerId === "you"
      ? "You"
      : isController
        ? "Council synthesis"
        : speakerName(session, definition);
  const precedingTurn = cardIsLive && turn && turn.speaker !== "you" ? turn : null;
  const precedingText = precedingTurn ? precedingTurn.text : null;
  const cardHtml = cardIsLive
    ? liveSlotHtml(session, definition, activeName, activeRole, precedingText, precedingTurn)
    : turn
      ? (ended && isLatest ? endedTurnCardHtml(turn, activeName, activeRole, session.evidence) : readTurnCardHtml(turn, activeName, activeRole, session.evidence))
      : ended
        ? `<article class="protocol-turn-card"><p>Session ended.</p></article>`
        : joiningCardHtml(activeName, activeRole);
  const showSummary = Boolean(session.summary) && isLatest;
  const complete = session.status === "completed" || showSummary;
  const portraitHtml = portraitHtmlFor(definition, activeSpeakerId, activeVoice);
  return `<section class="protocol-session${listening ? " is-listening" : ""}${complete ? " is-complete" : ""}" data-speaker="${escapeHtml(session.speaker ?? "")}" data-view-index="${index}" data-turn-total="${total}" style="--protocol-background:url('${backgroundAsset(definition.id)}')">${backgroundLayersHtml(definition.id)}<header><button class="btn btn--ghost" data-protocol-close type="button">← Thinking</button><p class="page-header__eyebrow">${escapeHtml(definition.name)}</p>${total > 0 ? `<p class="protocol-session__position">Turn ${index + 1} of ${total}</p>` : ""}${ended ? `<p class="protocol-session__position">Session ended</p>` : ""}${session.status === "completed" ? `<button class="btn btn--ghost" data-protocol-download type="button">Download as markdown</button>` : ""}</header>${portraitHtml}<div class="protocol-turn-card-slot">${cardHtml}${showSummary ? summaryHtml(session) : ""}</div>${renderScrubber(session, index, isLatest, definition)}</section>`;
}
export function applySession(root: HTMLElement, session: Session, definition: Definition, viewingIndex?: number) {
  const total = session.transcript.length;
  const index = total === 0 ? 0 : clamp(viewingIndex ?? total - 1, 0, total - 1);
  const key = [session.id, session.revision, session.status, session.error?.message ?? "", index, total, session.summary?.title ?? ""].join("|");
  if (root.dataset.protocolRenderKey === key) return;
  const priorBg = root.querySelector<HTMLElement>(".protocol-bg__layer.is-shown")?.style.backgroundImage ?? "";
  root.dataset.protocolRenderKey = key;
  root.innerHTML = sessionView(session, definition, index);
  const section = root.querySelector<HTMLElement>(".protocol-session");
  if (!section) return;
  if (priorBg) {
    const shown = section.querySelector<HTMLElement>(".protocol-bg__layer.is-shown");
    if (shown && !shown.style.backgroundImage) shown.style.backgroundImage = priorBg;
  }
  applyStagedBackground(section, definition.id, lightingStage(index, total, definition.id));
}

function catalogSignature(definitions: Definition[]) {
  return definitions.map(d => `${d.id}\0${d.name}\0${d.description}`).join("\n");
}

export function renderProtocols({ host }: { host: HTMLElement }) {
  let definitions = localCatalog;
  let selected: Definition | null = null;
  let currentSession: Session | null = null;
  let pastRuns: Array<Record<string, unknown>> = [];
  let pastFilter = "";
  let pastOffset = 0;
  let pastHasMore = false;
  const PAST_PAGE = 20;
  let pollTimer: number | null = null;
  let viewingIndex: number | null = null;
  let frequencyGate: string | null = null;
  let lastPrompt = "";
  let lastMode = "";
  let libraryDealt = false;
  const effectiveIndex = () => {
    const total = currentSession?.transcript.length ?? 0;
    if (total === 0) return 0;
    return viewingIndex === null ? total - 1 : clamp(viewingIndex, 0, total - 1);
  };
  const stopPolling = () => { if (pollTimer !== null) window.clearTimeout(pollTimer); pollTimer = null; };
  const paintPastRuns = () => {
    const library = host.querySelector(".protocol-library");
    if (!library) {
      paint();
      return;
    }
    library.classList.add("is-settled");
    const wrap = document.createElement("div");
    wrap.innerHTML = pastRunsHtml(pastRuns, pastFilter, definitions, { hasMore: pastHasMore });
    const next = wrap.firstElementChild;
    if (!next) return;
    const current = library.querySelector(".protocol-past");
    if (current) current.replaceWith(next);
    else library.append(next);
  };
  const refreshPastRuns = async ({ append = false } = {}) => {
    if (USE_LOCAL_DATA) return;
    const offset = append ? pastOffset : 0;
    const page = await listPastRuns(offset, PAST_PAGE);
    pastRuns = append ? [...pastRuns, ...page] : page;
    pastOffset = pastRuns.length;
    pastHasMore = page.length >= PAST_PAGE;
    // Patch past-runs only — do not wipe cards (that replayed protocol-deal).
    if (!selected && !currentSession) paintPastRuns();
  };
  const paint = () => {
    if (currentSession && selected) applySession(host, currentSession, selected, effectiveIndex());
    else if (selected) {
      host.innerHTML = intake(selected, frequencyGate ?? "");
      const prompt = host.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]');
      const mode = host.querySelector<HTMLSelectElement>('select[name="mode"]');
      const hint = host.querySelector<HTMLElement>("[data-protocol-mode-hint]");
      if (prompt && lastPrompt) prompt.value = lastPrompt;
      if (mode && lastMode) mode.value = lastMode;
      if (mode && hint) {
        const text = modeHintText(selected.modes.find(entry => entry.id === mode.value));
        hint.textContent = text;
        hint.hidden = !text;
      }
    } else {
      const existing = host.querySelector<HTMLElement>(".protocol-library");
      if (existing && libraryDealt) {
        existing.classList.add("is-settled");
        const grid = existing.querySelector(".protocol-library__grid");
        if (grid) grid.innerHTML = cards(definitions);
        paintPastRuns();
        return;
      }
      // Re-entry after intake/session keeps is-settled so deal does not replay.
      host.innerHTML = `<section class="protocol-library${libraryDealt ? " is-settled" : ""}"><header class="page-header"><div class="page-header__copy"><p class="page-header__eyebrow">Cognitive protocols</p><div class="page-header__title-row"><h1 class="page-header__title">Choose a way to think</h1></div><p class="page-header__supporting">Eight structured conversations, each with its own history, rhythm and discipline.</p></div></header><div class="protocol-library__grid">${cards(definitions)}</div>${pastRunsHtml(pastRuns, pastFilter, definitions, { hasMore: pastHasMore })}</section>`;
      libraryDealt = true;
    }
  };
  const poll = async () => {
    if (!currentSession?.id || USE_LOCAL_DATA) return;
    try {
      const response = await fetch(`${API_BASE}/protocols?sessionId=${encodeURIComponent(currentSession.id)}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      const next = body.data.session as Session;
      const prevLen = currentSession.transcript.length;
      const nextLen = next.transcript?.length ?? 0;
      // Hold the turn the user is reading — do not auto-advance when new rounds arrive.
      if (viewingIndex === null && nextLen > prevLen && prevLen > 0) {
        viewingIndex = prevLen - 1;
      }
      currentSession = next;
      paint();
      if (currentSession.status === "completed") void refreshPastRuns();
      if (["queued", "running"].includes(currentSession.status)) pollTimer = window.setTimeout(poll, PROTOCOL_POLL_MS);
    } catch {
      if (currentSession) {
        currentSession = { ...currentSession, error: { message: "Could not refresh this session. Retry keeps completed turns intact.", retryable: true } };
        paint();
      }
    }
  };
  const postAction = async (payload: Record<string, unknown>) => {
    currentSession = await postProtocolAction(payload);
    paint();
    void poll();
  };
  host.onchange = event => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[name='mode']");
    const hint = select && selected ? host.querySelector<HTMLElement>("[data-protocol-mode-hint]") : null;
    if (!select || !hint || !selected) return;
    const text = modeHintText(selected.modes.find(entry => entry.id === select.value));
    hint.textContent = text;
    hint.hidden = !text;
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
    if (begin) { selected = definitions.find(d => d.id === begin.dataset.protocolBegin) ?? null; currentSession = null; viewingIndex = null; frequencyGate = null; lastPrompt = ""; lastMode = ""; paint(); return; }
    if (target.closest("[data-protocol-close]")) { stopPolling(); selected = null; currentSession = null; viewingIndex = null; frequencyGate = null; paint(); void refreshPastRuns(); return; }
    if (target.closest("[data-protocol-past-more]")) { void refreshPastRuns({ append: true }); return; }
    if (target.closest("[data-protocol-download]") && currentSession) { downloadMarkdown(currentSession); return; }
    const openRun = target.closest<HTMLButtonElement>("[data-protocol-open-run]")?.dataset.protocolOpenRun
      || target.closest<HTMLButtonElement>("[data-protocol-resume-run]")?.dataset.protocolResumeRun;
    if (openRun) {
      void (async () => {
        try {
          const response = await fetch(`${API_BASE}/protocols?sessionId=${encodeURIComponent(openRun)}`, { credentials: "include" });
          const body = await response.json().catch(() => null);
          const session = sessionFromProtocolPayload(body);
          if (!session) return;
          selected = definitions.find(d => d.id === session.protocolId) ?? definitions.find(d => d.id === String((body as { data?: { session?: { protocolId?: string } } })?.data?.session?.protocolId)) ?? selected;
          if (!selected && session.protocolId) selected = definitions.find(d => d.id === session.protocolId) || null;
          currentSession = session;
          viewingIndex = null;
          if (target.closest("[data-protocol-resume-run]") && ["waiting", "paused"].includes(session.status) && session.allowedActions.includes("resume")) {
            await postAction({ sessionId: session.id, revision: session.revision, requestId: crypto.randomUUID(), action: "resume" });
          } else paint();
        } catch { /* leave library visible */ }
      })();
      return;
    }
    const filter = target.closest<HTMLSelectElement>("[data-protocol-past-filter]");
    if (filter && event.type === "click") return;
    const action = target.closest<HTMLButtonElement>("[data-protocol-action]")?.dataset.protocolAction;
    if (action && currentSession) {
      const prior = currentSession;
      // End session takes effect on screen at once; the server applies cancel to its latest state.
      if (action === "cancel") { currentSession = { ...prior, status: "cancelled", checkpoint: null }; paint(); }
      postAction({ sessionId: prior.id, revision: prior.revision, requestId: crypto.randomUUID(), action }).catch(reason => {
        currentSession = { ...prior, error: { message: reason instanceof Error ? reason.message : "That did not go through.", retryable: true } };
        paint();
      });
    }
  };
  host.onchange = event => {
    const filter = (event.target as HTMLElement | null)?.closest?.<HTMLSelectElement>("[data-protocol-past-filter]");
    if (!filter) return;
    pastFilter = filter.value;
    if (host.querySelector(".protocol-library")) paintPastRuns();
    else paint();
  };
  host.onsubmit = async event => {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    if (form.matches("[data-protocol-form]")) {
      if (USE_LOCAL_DATA || !selected) return;
      const data = new FormData(form);
      const prompt = String(data.get("prompt") ?? "").trim();
      const justification = String(data.get("frequencyJustification") ?? "").trim();
      lastPrompt = prompt;
      lastMode = String(data.get("mode") ?? selected.defaultMode);
      currentSession = { id: "", status: "queued", stage: "intake", speaker: null, revision: 0, transcript: [], checkpoint: null, allowedActions: ["cancel"], error: null };
      viewingIndex = null;
      paint();
      try {
        const intakePayload = compactIntake(selected, prompt, justification ? { frequencyJustification: justification } : {}, lastMode);
        await postAction({ protocolId: selected.id, mode: data.get("mode"), intake: intakePayload, requestId: crypto.randomUUID() });
        frequencyGate = null;
      } catch (reason) {
        currentSession = null;
        if (reason instanceof ProtocolRequestError && reason.code === "frequency_justification_required") {
          frequencyGate = reason.message;
          paint();
          return;
        }
        paint();
        const error = host.querySelector<HTMLElement>("[data-protocol-error]");
        if (error) { error.textContent = reason instanceof Error ? reason.message : "The protocol could not start."; error.hidden = false; }
      }
      return;
    }
    if (!form.matches("[data-protocol-reply]") || !currentSession || currentSession.status !== "waiting") return;
    const data = new FormData(form);
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const kind = currentSession.checkpoint?.kind;
    const action = submitter?.name === "action" ? String(submitter.value) : (["verify", "confirm"].includes(kind ?? "") || currentSession.allowedActions.includes("close") ? "confirm" : kind === "reflection" ? "reflect" : "answer");
    const text = String(data.get("reply") ?? "");
    if (["answer", "correct", "reflect", "reopen"].includes(action) && !text.trim()) return;
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
    catch (reason) {
      currentSession = { ...prior, error: { message: reason instanceof Error ? reason.message : "The reply could not be sent.", retryable: true } };
      paint();
    }
  };
  paint();
  const paintedCatalog = catalogSignature(definitions);
  void catalog().then(next => {
    const changed = catalogSignature(next) !== paintedCatalog;
    definitions = next;
    if (selected || currentSession || !changed) return;
    paint();
  }).catch(() => undefined);
  void refreshPastRuns().catch(() => undefined);
  return stopPolling;
}
