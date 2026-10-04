import "./wireless.css";
import { KIND_INK } from "./kinds";
import { getPodcast, getPodcastAudioUrl, listPodcasts, startPodcast } from "../api/client";
import { PodcastDialsSchema, PodcastEpisodeSchema, type PodcastEpisode, type PodcastTurn } from "../podcast/schema";
import type { BookModel } from "./model";
import {
  DEFAULT_MIX,
  DIAL_MAX,
  DIAL_MIN,
  SEGMENT_LABEL,
  buildDial,
  clampKhz,
  clock,
  disagreementFor,
  estimatedStarts,
  holdThoughtDraft,
  latestBroadcast,
  mixCounts,
  nearestStation,
  orderDial,
  orderFromDial,
  runningOrder,
  signalFor,
  turnSegments,
  type Dial,
  type Mix,
  type OrderEntry,
  type Segment,
  type Station,
} from "./wirelessModel";

/**
 * The Wireless room of the Bookshelf: the shelf behind dial glass, and a book
 * played as a programme. State lives here, outside the DOM, so the shelf can
 * repaint without losing the needle or stopping the broadcast.
 */

export type WirelessHost = {
  /** Kit page header; title is HTML. */
  header: (supporting: string, opts?: { eyebrow?: string; title?: string; actions?: string }) => string;
  openPage: (id: string) => void;
  /** Starts a From-a-book note at this page, in Chat. */
  holdThought: (bookLabel: string, locus?: string, draft?: string) => void;
  toast: (message: string, ms?: number) => void;
  /** Asks the shelf to repaint (on-air swaps the page header). */
  repaint: () => void;
};

type Saved = { id: string; order: OrderEntry[]; khz: number };

type OnAir = {
  book: string;
  khz: number;
  order: OrderEntry[];
  episode?: PodcastEpisode;
  starting: boolean;
  error?: string;
  index: number;
  playing: boolean;
  loadingLine: boolean;
  skip: Set<Segment>;
};

const KHZ_KEY = "knowledge-hub:wireless-khz";
const STATION_KEY = "knowledge-hub:wireless-station";
const MIX_KEY = "knowledge-hub:wireless-mix";
const EPISODES_KEY = "knowledge-hub:wireless-episodes";
const POS_KEY = "knowledge-hub:wireless-pos:";
/** On air has its own address, so Back returns to the dial. */
export const AIR_ROUTE = "~air";
const PEAK_BARS = 48;
const IN_RANGE = 0.6;
const PHONE = "(max-width: 720px)";

const SEGMENT_COLOUR: Record<Segment, string> = {
  "cold-open": "var(--navy)",
  feature: KIND_INK.idea,
  backstory: KIND_INK.case,
  counterpoint: KIND_INK.debate,
  extends: KIND_INK.bridge,
  crosstalk: "var(--pastel-lilac-ink)",
  "phone-in": "var(--orca)",
};

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the dial still works, it just forgets on reload.
  }
}

function shortDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function speaker(turn?: PodcastTurn) {
  if (!turn) return "";
  return turn.speaker === "ann" ? "Ann O’Tation" : "Professor Clementine Haig";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function isPlayable(turn?: PodcastTurn) {
  return Boolean(turn?.audioKey) && turn?.kind !== "empty";
}

/** Seconds a line takes, before its audio has loaded: 2.6 words a second. */
function guessSeconds(turn: PodcastTurn) {
  return Math.max(2, turn.text.split(/\s+/).length / 2.6);
}

function brokenWorker(message: string) {
  return /invalid (enum|option)|received '?broadcast|expected .*recap/i.test(message);
}

export function createWireless(host: WirelessHost) {
  let books: BookModel[] = [];
  let dial: Dial = { bands: [], stations: [], spacing: 30 };
  let khz = readJson<number>(KHZ_KEY, 0);
  /** The station you last settled on; the needle follows it when the dial is rebuilt. */
  let anchor = readJson<string>(STATION_KEY, "");
  /** False until you move the needle; until then it follows the default station as the shelf loads. */
  let chosen = khz > 0;
  let mix: Mix = { ...DEFAULT_MIX, ...readJson<Partial<Mix>>(MIX_KEY, {}) };
  const saved = readJson<Record<string, Saved>>(EPISODES_KEY, {});
  let onAir: OnAir | null = null;
  let root: HTMLElement | null = null;
  let pollTimer = 0;
  let playGen = 0;
  let frame = 0;
  let dragging = false;
  const durations = new Map<string, number>();
  /** Loudness per line, from the decoded clip, once it has played (when storage allows the read). */
  const peaks = new Map<string, number[]>();
  let clipUrl = "";
  /** Broadcasts from the Podcast library, so a broadcast made on one device replays on another. */
  let library: PodcastEpisode[] | null = null;
  let libraryLoading = false;
  /** Where the needle goes when on air ends (the mini dial picks a station). */
  let retuneTo: number | undefined;
  let audio: HTMLAudioElement | null = null;
  let noise: HTMLCanvasElement | null = null;
  const phone = window.matchMedia(PHONE);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setBooks(next: BookModel[]) {
    books = next;
    dial = buildDial(books);
    if (!dial.stations.length) return;
    const held = dial.stations.find(s => s.key === anchor);
    if (held) {
      khz = held.khz;
      return;
    }
    if (chosen && khz >= DIAL_MIN && khz <= DIAL_MAX) return;
    // Nothing chosen yet: start on a book you're reading, else the busiest.
    const start = books.find(book => book.reading) ?? [...books].sort((a, b) => b.noteCount - a.noteCount)[0];
    khz = dial.stations.find(s => s.key === start?.key)?.khz ?? dial.stations[0]!.khz;
  }

  const station = () => nearestStation(dial, khz);

  function remember() {
    const near = nearestStation(dial, khz);
    anchor = near && signalFor(khz, near, dial.spacing) >= IN_RANGE ? near.key : "";
    chosen = true;
    writeJson(KHZ_KEY, Math.round(khz));
    writeJson(STATION_KEY, anchor);
  }
  const strength = (s?: Station) => (s ? signalFor(khz, s, dial.spacing) : 0);
  const bandName = (s?: Station) => (s ? dial.bands[s.band]?.name ?? "" : "");
  const book = (key: string) => books.find(b => b.key === key);

  function loadLibrary() {
    if (library || libraryLoading) return;
    libraryLoading = true;
    void listPodcasts()
      .then(raw => {
        const list = raw && typeof raw === "object" && Array.isArray((raw as { episodes?: unknown }).episodes) ? (raw as { episodes: unknown[] }).episodes : [];
        library = list.flatMap(item => {
          const parsed = PodcastEpisodeSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
        if (root && !onAir) updateDial(true);
      })
      .catch(() => {
        // Local preview, or the library is down: fall back to this browser's memory.
        library = [];
      })
      .finally(() => {
        libraryLoading = false;
      });
  }

  /** The last broadcast of a book: the Podcast library first, then this browser's memory. */
  function lastFor(b: BookModel): { id: string; order: OrderEntry[] } | undefined {
    const remote = library ? latestBroadcast(library, b.key) : undefined;
    const local = saved[b.key];
    if (remote && (!local || remote.id !== local.id)) {
      const order = orderFromDial(remote.modeDial.order ?? "", b);
      if (order.length) return { id: remote.id, order };
    }
    return local ? { id: local.id, order: local.order } : undefined;
  }

  // ── Header (the shelf calls this so the page title can go on air) ──

  function headerHtml(): string | null {
    if (!onAir) return null;
    const b = book(onAir.book);
    const label = b?.label ?? onAir.book;
    const ep = onAir.episode;
    const notes = new Set(onAir.order.map(o => o.pageId)).size;
    const supporting = ep?.status === "ready" || ep?.status === "cancelled"
      ? `A programme cut from ${notes === 1 ? "one of your notes" : `${notes} of your notes`}, ${clock(totalSeconds())} long.`
      : onAir.error
        ? "The broadcast didn't make it to air."
        : `Cutting a programme from ${plural(notes, "note")}. Clementine and Ann are writing and recording it.`;
    return host.header(esc(supporting), {
      // The badge rides in the eyebrow: the kit title is kinetic text and would flatten it.
      eyebrow: `<span class="wl-onair${ep?.status === "ready" && onAir.playing ? " is-live" : ""}">${ep?.status === "ready" || ep?.status === "cancelled" ? "On air" : onAir.error ? "Off air" : "Warming up"}</span>Bookshelf / ${onAir.khz} kHz`,
      title: esc(label),
      actions: `<button class="btn btn--secondary" type="button" data-wl-retune>Retune</button>
        <button class="btn btn--primary" type="button" data-wl-hold${ep?.status === "ready" || ep?.status === "cancelled" ? "" : " disabled"}>Hold this thought</button>`,
    });
  }

  function supporting() {
    return phone.matches
      ? "Your shelf is the dial. Drag the band or turn the knob; books sharpen as you come into range."
      : "Your shelf is the dial. Turn the knob or drag the needle; books sharpen as you come into range.";
  }

  // ── Mount ──────────────────────────────────────────────────────────

  function mount(el: HTMLElement) {
    root = el;
    loadLibrary();
    if (onAir) paintOnAir();
    else paintDial();
    bindHeader();
  }

  function bindHeader() {
    const page = root?.closest(".shelf-root") ?? document;
    page.querySelector<HTMLButtonElement>("[data-wl-retune]")?.addEventListener("click", retune);
    page.querySelector<HTMLButtonElement>("[data-wl-hold]")?.addEventListener("click", holdThought);
  }

  function unmount() {
    cancelAnimationFrame(frame);
    root = null;
  }

  function destroy() {
    unmount();
    window.clearTimeout(pollTimer);
    playGen += 1;
    audio?.pause();
    audio = null;
  }

  // ── Dial ───────────────────────────────────────────────────────────

  function geometry(glass: HTMLElement) {
    const view = glass.clientWidth || 900;
    const minStep = phone.matches ? 58 : 34;
    const track = Math.max(view, Math.ceil(((DIAL_MAX - DIAL_MIN) / dial.spacing) * minStep));
    const pad = 22;
    const x = (k: number) => pad + ((k - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * (track - 2 * pad);
    const offset = Math.min(Math.max(0, x(khz) - view / 2), track - view);
    return { view, track, x, offset, pxPerKhz: (track - 2 * pad) / (DIAL_MAX - DIAL_MIN) };
  }

  function presets() {
    const reading = books.filter(b => b.reading);
    const busiest = [...books].sort((a, b) => b.noteCount - a.noteCount);
    const list: BookModel[] = [];
    for (const b of [...reading, ...busiest]) if (!list.includes(b) && list.length < 4) list.push(b);
    return list.map(b => dial.stations.find(s => s.key === b.key)!).filter(Boolean);
  }

  function paintDial() {
    if (!root) return;
    if (!dial.stations.length) {
      root.innerHTML = `<div class="wl-panel"><p class="shelf-eyebrow">The Wireless</p><p>No books on the shelf yet, so there's nothing to tune to.</p></div>`;
      return;
    }
    root.innerHTML = `<div class="wl-panel">
      <div class="wl-bands" data-bands aria-hidden="true"></div>
      <div class="wl-glass" data-glass tabindex="0" role="slider" aria-label="Tuning" aria-valuemin="${DIAL_MIN}" aria-valuemax="${DIAL_MAX}">
        <div class="wl-track" data-track></div>
        <canvas class="wl-static${reduced.matches ? "" : " is-moving"}" data-static aria-hidden="true"></canvas>
        <div class="wl-needle" data-needle aria-hidden="true"><span class="wl-flag" data-flag></span></div>
      </div>
      <div class="wl-console">
        <div class="wl-knob-wrap">
          <button class="wl-knob" type="button" data-knob aria-label="Tuning knob: drag, scroll, or use the arrow keys"><i data-knob-mark></i></button>
          <span class="wl-caption">Tune</span>
          <div class="wl-nudge"><button class="btn btn--ghost" type="button" data-step="-1" aria-label="Previous station">‹</button><button class="btn btn--ghost" type="button" data-step="1" aria-label="Next station">›</button></div>
        </div>
        <div class="wl-meter-wrap">
          <p class="shelf-eyebrow">Signal</p>
          <svg class="wl-meter" viewBox="0 0 220 124" aria-hidden="true">
            <path class="wl-meter__track" d="M 22 112 A 88 88 0 0 1 198 112" />
            <path class="wl-meter__fill" data-meter-fill d="M 22 112 A 88 88 0 0 1 198 112" pathLength="100" />
            <line class="wl-meter__needle" data-meter-needle x1="110" y1="112" x2="110" y2="40" />
            <circle cx="110" cy="112" r="6" class="wl-meter__hub" />
            <text x="22" y="124" class="wl-meter__end">Faint</text><text x="198" y="124" text-anchor="end" class="wl-meter__end">Strong</text>
          </svg>
          <p class="wl-stats" data-stats></p>
        </div>
        <div class="wl-readout" data-readout aria-live="polite"></div>
      </div>
    </div>`;
    const glass = root.querySelector<HTMLElement>("[data-glass]")!;
    paintTrack(glass);
    paintNoise(glass);
    bindDial(glass);
    updateDial(true);
  }

  function paintTrack(glass: HTMLElement) {
    const g = geometry(glass);
    const track = glass.querySelector<HTMLElement>("[data-track]")!;
    track.style.width = `${g.track}px`;
    const most = Math.max(1, ...books.map(b => b.noteCount));
    const width = Math.max(18, Math.min(phone.matches ? 46 : 64, dial.spacing * g.pxPerKhz * 0.8));
    const spines = dial.stations.map(s => {
      const h = 46 + (s.book.noteCount / most) * 44;
      return `<button type="button" class="wl-spine" data-station="${esc(s.key)}" tabindex="-1"
        style="left:${g.x(s.khz) - width / 2}px;width:${width}px;height:${h}%;--c:${s.book.swatch.fill};--c-ink:${s.book.swatch.ink}"
        aria-label="${esc(`${s.label}, ${s.khz} kHz`)}"><span class="wl-spine__title">${esc(s.label)}</span><span class="wl-spine__count">${s.book.noteCount}</span></button>`;
    }).join("");
    const ticks: string[] = [];
    for (let k = 540; k <= DIAL_MAX; k += 20) {
      const major = k % 100 === 0;
      ticks.push(`<i class="wl-tick${major ? " is-major" : ""}" style="left:${g.x(k)}px"></i>${major ? `<span class="wl-num" style="left:${g.x(k)}px">${k}</span>` : ""}`);
    }
    track.innerHTML = `<div class="wl-spines">${spines}</div><div class="wl-scale">${ticks.join("")}<span class="wl-unit">kHz</span></div>`;
    // Bands sit above the glass, positioned by the same scale.
    const bands = root!.querySelector<HTMLElement>("[data-bands]")!;
    bands.innerHTML = `<div class="wl-bands__track" data-bands-track style="width:${g.track}px">${dial.bands.map((band, i) => {
      const from = g.x(band.from) - width / 2;
      const next = dial.bands[i + 1];
      // A label may run on towards the next band, so one-book bands still read.
      const to = next ? g.x(next.from) - width / 2 - 16 : g.track - 8;
      return `<span class="wl-band" data-from="${from}" data-to="${to}" style="left:${from}px;width:${Math.max(to - from, 40)}px" title="${esc(band.name)}"><b>${esc(band.name)}</b> · ${band.from === band.to ? band.from : `${band.from}–${band.to}`}</span>`;
    }).join("")}</div>`;
  }

  function paintNoise(glass: HTMLElement) {
    const canvas = glass.querySelector<HTMLCanvasElement>("[data-static]")!;
    if (!noise) {
      noise = document.createElement("canvas");
      noise.width = 256;
      noise.height = 256;
      const ctx = noise.getContext("2d");
      if (ctx) {
        const img = ctx.createImageData(256, 256);
        let s = 1234567;
        for (let i = 0; i < img.data.length; i += 4) {
          s = (s * 16807) % 2147483647;
          const v = 90 + (s % 150);
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v + 6;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
    }
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx && noise) {
      ctx.fillStyle = ctx.createPattern(noise, "repeat") ?? "#999";
      ctx.fillRect(0, 0, 512, 512);
      // The same grain sits on each spine, so a tuned book can come through clean.
      try {
        root?.style.setProperty("--wl-noise", `url(${noise.toDataURL()})`);
      } catch {
        // Tainted or unsupported canvas: spines just blur.
      }
    }
  }

  function updateDial(full = false) {
    if (!root || onAir) return;
    const glass = root.querySelector<HTMLElement>("[data-glass]");
    if (!glass) return;
    const g = geometry(glass);
    const near = station();
    const signal = strength(near);
    root.querySelector<HTMLElement>("[data-track]")!.style.transform = `translateX(${-g.offset}px)`;
    const bandsTrack = root.querySelector<HTMLElement>("[data-bands-track]");
    if (bandsTrack) {
      bandsTrack.style.transform = `translateX(${-g.offset}px)`;
      // A band label sticks to the left edge while its band is still on the glass.
      for (const label of bandsTrack.querySelectorAll<HTMLElement>(".wl-band")) {
        const from = Number(label.dataset.from);
        const to = Number(label.dataset.to);
        const left = Math.min(Math.max(from, g.offset + 6), Math.max(from, to - 60));
        label.style.left = `${left}px`;
        label.style.width = `${Math.max(40, to - left)}px`;
      }
    }
    const needle = root.querySelector<HTMLElement>("[data-needle]")!;
    const nx = g.x(khz) - g.offset;
    needle.style.left = `${nx}px`;
    const flag = root.querySelector<HTMLElement>("[data-flag]")!;
    flag.textContent = signal >= IN_RANGE && near ? `${near.khz} kHz · ${near.label}` : `${Math.round(khz)} kHz`;
    flag.classList.toggle("is-left", nx > g.view - 150);
    for (const spine of root.querySelectorAll<HTMLElement>(".wl-spine")) {
      const s = dial.stations.find(item => item.key === spine.dataset.station)!;
      const sig = strength(s);
      spine.style.setProperty("--sig", sig.toFixed(3));
      spine.classList.toggle("is-tuned", sig >= IN_RANGE && s === near);
    }
    root.querySelector<HTMLElement>("[data-static]")!.style.opacity = (0.1 + (1 - signal) * 0.35).toFixed(3);
    glass.setAttribute("aria-valuenow", String(Math.round(khz)));
    glass.setAttribute("aria-valuetext", near && signal >= IN_RANGE ? `${near.khz} kHz, ${near.label}` : `${Math.round(khz)} kHz, between stations`);
    // Meter: the needle swings from 180° (faint) to 0° (strong).
    const angle = Math.PI * (1 - signal);
    const meterNeedle = root.querySelector<SVGLineElement>("[data-meter-needle]")!;
    meterNeedle.setAttribute("x2", (110 + Math.cos(angle) * 72).toFixed(1));
    meterNeedle.setAttribute("y2", (112 - Math.sin(angle) * 72).toFixed(1));
    const fill = root.querySelector<SVGPathElement>("[data-meter-fill]")!;
    fill.style.strokeDasharray = `${(signal * 100).toFixed(1)} 100`;
    fill.style.opacity = signal < 0.03 ? "0" : "1";
    root.querySelector<HTMLElement>("[data-knob-mark]")!.style.transform = `rotate(${((khz - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * 300 - 150}deg)`;
    const readout = root.querySelector<HTMLElement>("[data-readout]")!;
    const key = `${near?.key}|${signal >= IN_RANGE}`;
    if (full || readout.dataset.key !== key) {
      readout.dataset.key = key;
      readout.innerHTML = readoutHtml(near, signal);
      bindReadout(readout);
      const stats = root.querySelector<HTMLElement>("[data-stats]")!;
      stats.textContent = near ? statsLine(near.book) : "";
    }
  }

  function statsLine(b: BookModel) {
    const notes = [...b.placed, ...b.loose];
    const week = Date.now() - 7 * 24 * 3600 * 1000;
    const fresh = notes.filter(n => n.createdAt && Date.parse(n.createdAt) >= week).length;
    const last = notes.map(n => n.createdAt ?? "").sort().at(-1);
    return [plural(notes.length, "note"), fresh ? `${fresh} added this week` : "", last ? `last ${shortDate(last)}` : ""].filter(Boolean).join(" · ");
  }

  function readoutHtml(near: Station | undefined, signal: number) {
    const presetHtml = `<div class="wl-presets" role="group" aria-label="Presets">${presets().map((s, i) => `<button type="button" class="wl-preset${near?.key === s.key && signal >= IN_RANGE ? " is-active" : ""}" data-preset="${esc(s.key)}"><b>${i + 1}</b>${esc(s.label)}</button>`).join("")}</div>`;
    if (!near || signal < IN_RANGE) {
      return `<p class="shelf-eyebrow">Between stations · ${Math.round(khz)} kHz</p>
        <h2 class="wl-title wl-title--static">Static</h2>
        <p class="wl-blurb">${near ? `Nearest is ${esc(near.label)} at ${near.khz} kHz.` : ""} Keep turning, or press a preset.</p>
        ${near ? `<p><button class="btn btn--secondary" type="button" data-snap>Tune to ${esc(near.label)}</button></p>` : ""}
        ${presetHtml}`;
    }
    const b = near.book;
    const order = runningOrder(b, mix);
    const counts = mixCounts(b);
    const crossBooks = [...new Set(b.links.map(l => l.toLabel))];
    const last = lastFor(b);
    const blurb = !b.noteCount
      ? "No notes on this book yet, so there's nothing to broadcast. Write one from Chat with From a book."
      : `A programme cut from ${b.noteCount === 1 ? "your one note" : `your ${b.noteCount} notes`}: ${[
          counts.supports ? plural(counts.supports, "explainer") : "",
          counts.counter ? plural(counts.counter, "debate") : "",
          counts.extends ? plural(counts.extends, "so-what") : "",
          crossBooks.length ? `crosstalk from ${crossBooks.slice(0, 2).map(esc).join(" and ")}${crossBooks.length > 2 ? ` and ${crossBooks.length - 2} more` : ""}` : "",
        ].filter(Boolean).join(", ") || "explainers only"}${order.some(o => o.segment === "phone-in") ? ", and a phone-in of your open questions" : ""}.`;
    return `<div class="wl-readout__head">
        <div class="wl-readout__copy">
          <p class="shelf-eyebrow">In range · ${near.khz} kHz · ${esc(bandName(near))} band</p>
          <h2 class="wl-title">${esc(b.label)}</h2>
        </div>
        <div class="wl-readout__go">
          ${last ? `<button class="btn btn--primary wl-tune" type="button" data-tune="replay">Tune in</button><span class="wl-caption">Plays your last broadcast</span>` : `<button class="btn btn--primary wl-tune" type="button" data-tune="new"${b.noteCount ? "" : " disabled"}>Tune in</button><span class="wl-caption">Cuts a broadcast · a few minutes</span>`}
        </div>
      </div>
      <p class="wl-blurb">${blurb}</p>
      ${presetHtml}`;
  }

  function bindReadout(readout: HTMLElement) {
    readout.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(button => {
      button.onclick = () => glide(dial.stations.find(s => s.key === button.dataset.preset)!.khz);
    });
    readout.querySelector<HTMLButtonElement>("[data-snap]")?.addEventListener("click", () => glide(station()!.khz));
    readout.querySelector<HTMLButtonElement>("[data-tune]")?.addEventListener("click", event => {
      const near = station();
      if (!near) return;
      void tuneIn(near, (event.currentTarget as HTMLElement).dataset.tune === "new");
    });
  }

  function setKhz(next: number, persist = false) {
    khz = clampKhz(next);
    if (persist) remember();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => updateDial());
  }

  /** Eases the needle onto a frequency, the way a tuned set settles. */
  function glide(target: number) {
    if (reduced.matches) {
      setKhz(target, true);
      return;
    }
    const from = khz;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / 380));
      khz = from + (target - from) * (1 - (1 - t) ** 3);
      updateDial();
      if (t < 1) frame = requestAnimationFrame(step);
      else remember();
    };
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(step);
  }

  function settle() {
    const near = station();
    if (near && Math.abs(near.khz - khz) < dial.spacing * 0.45) glide(near.khz);
    else remember();
  }

  function stepStation(direction: number) {
    const sorted = dial.stations;
    const next = direction > 0 ? sorted.find(s => s.khz > khz + 1) : [...sorted].reverse().find(s => s.khz < khz - 1);
    if (next) glide(next.khz);
  }

  function bindDial(glass: HTMLElement) {
    const panel = root!;
    let lastX = 0;
    let moved = 0;
    glass.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      dragging = true;
      moved = 0;
      lastX = event.clientX;
      glass.setPointerCapture(event.pointerId);
      glass.classList.add("is-dragging");
      if (!phone.matches) {
        // Desktop: the needle jumps to where you press, then follows.
        const g = geometry(glass);
        const rect = glass.getBoundingClientRect();
        const x = event.clientX - rect.left + g.offset;
        setKhz(DIAL_MIN + ((x - 22) / g.pxPerKhz));
      }
    });
    glass.addEventListener("pointermove", event => {
      if (!dragging) return;
      const g = geometry(glass);
      const dx = event.clientX - lastX;
      moved += Math.abs(dx);
      lastX = event.clientX;
      // Phone: the band slides under a fixed needle, like a strip tuner.
      setKhz(khz + (phone.matches ? -dx : dx) / g.pxPerKhz);
    });
    const end = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      glass.classList.remove("is-dragging");
      if (glass.hasPointerCapture(event.pointerId)) glass.releasePointerCapture(event.pointerId);
      if (moved < 4 && phone.matches) {
        // A tap on a spine tunes to it.
        const spine = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>(".wl-spine");
        const s = spine && dial.stations.find(item => item.key === spine.dataset.station);
        if (s) return glide(s.khz);
      }
      settle();
    };
    glass.addEventListener("pointerup", end);
    glass.addEventListener("pointercancel", end);
    glass.addEventListener("keydown", event => {
      const keys: Record<string, () => void> = {
        ArrowLeft: () => (event.shiftKey ? stepStation(-1) : setKhz(khz - 9, true)),
        ArrowRight: () => (event.shiftKey ? stepStation(1) : setKhz(khz + 9, true)),
        ArrowDown: () => setKhz(khz - 9, true),
        ArrowUp: () => setKhz(khz + 9, true),
        PageDown: () => stepStation(-1),
        PageUp: () => stepStation(1),
        Home: () => glide(dial.stations[0]!.khz),
        End: () => glide(dial.stations.at(-1)!.khz),
        Enter: () => {
          const near = station();
          if (near && strength(near) >= IN_RANGE) void tuneIn(near, !lastFor(near.book));
        },
      };
      const preset = /^[1-4]$/.test(event.key) ? presets()[Number(event.key) - 1] : undefined;
      if (preset) {
        event.preventDefault();
        glide(preset.khz);
        return;
      }
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    });
    glass.addEventListener("keyup", event => {
      if (event.key.startsWith("Arrow") && !event.shiftKey) settle();
    });

    const knob = panel.querySelector<HTMLButtonElement>("[data-knob]")!;
    let knobAngle = 0;
    const centre = () => {
      const rect = knob.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    knob.addEventListener("pointerdown", event => {
      const c = centre();
      knobAngle = Math.atan2(event.clientY - c.y, event.clientX - c.x);
      knob.setPointerCapture(event.pointerId);
      knob.classList.add("is-turning");
    });
    knob.addEventListener("pointermove", event => {
      if (!knob.hasPointerCapture(event.pointerId)) return;
      const c = centre();
      const a = Math.atan2(event.clientY - c.y, event.clientX - c.x);
      let d = a - knobAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      knobAngle = a;
      // One full turn sweeps about a third of the dial.
      setKhz(khz + (d / (2 * Math.PI)) * 360);
    });
    const knobEnd = (event: PointerEvent) => {
      if (!knob.hasPointerCapture(event.pointerId)) return;
      knob.releasePointerCapture(event.pointerId);
      knob.classList.remove("is-turning");
      settle();
    };
    knob.addEventListener("pointerup", knobEnd);
    knob.addEventListener("pointercancel", knobEnd);
    let wheelTimer = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setKhz(khz + Math.sign(event.deltaY || event.deltaX) * 9);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(settle, 220);
    };
    knob.addEventListener("wheel", onWheel, { passive: false });
    knob.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        setKhz(khz - 9, true);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        setKhz(khz + 9, true);
      }
    });
    knob.addEventListener("keyup", () => settle());
    panel.querySelectorAll<HTMLButtonElement>("[data-step]").forEach(button => {
      button.onclick = () => stepStation(Number(button.dataset.step));
    });
    // Desktop spines are also click targets (the glass handles the drag).
    panel.querySelectorAll<HTMLButtonElement>(".wl-spine").forEach(spine => {
      spine.addEventListener("dblclick", () => {
        const s = dial.stations.find(item => item.key === spine.dataset.station);
        if (s) void tuneIn(s, !lastFor(s.book));
      });
    });
  }

  // ── On air ─────────────────────────────────────────────────────────

  async function tuneIn(s: Station, fresh: boolean) {
    const b = s.book;
    if (!b.noteCount) return;
    khz = s.khz;
    remember();
    goOnAirRoute(b.key);
    const last = lastFor(b);
    if (!fresh && last) {
      onAir = { book: b.key, khz: s.khz, order: last.order, starting: true, index: readJson<number>(POS_KEY + last.id, 0), playing: false, loadingLine: false, skip: new Set() };
      host.repaint();
      await follow(last.id);
      return;
    }
    const order = runningOrder(b, mix);
    onAir = { book: b.key, khz: s.khz, order, starting: true, index: 0, playing: false, loadingLine: false, skip: new Set() };
    host.repaint();
    try {
      const dials = PodcastDialsSchema.parse({ length: mix.length, disagreement: disagreementFor(mix.counter) });
      const episode = PodcastEpisodeSchema.parse(await startPodcast({
        mode: "broadcast",
        modeDial: { book: b.label, ...(b.author ? { author: b.author } : {}), order: orderDial(order) },
        dials,
        sourcePageIds: [...new Set(order.map(o => o.pageId))],
      }));
      saved[b.key] = { id: episode.id, order, khz: s.khz };
      writeJson(EPISODES_KEY, saved);
      if (onAir?.book === b.key) {
        onAir.episode = episode;
        onAir.starting = false;
        repaintOnAir();
        poll(episode.id);
      }
    } catch (error) {
      if (onAir?.book !== b.key) return;
      const message = error instanceof Error ? error.message : "The broadcast could not start.";
      onAir.starting = false;
      onAir.error = brokenWorker(message)
        ? "The radio needs the research Worker redeployed before it can broadcast a book. Run npm run research:deploy in apps/knowledge, then tune in again."
        : message;
      repaintOnAir();
    }
  }

  async function follow(id: string) {
    try {
      const episode = PodcastEpisodeSchema.parse(await getPodcast(id));
      if (!onAir) return;
      onAir.episode = episode;
      onAir.starting = false;
      if (episode.status === "running") poll(id);
      if (episode.status === "error") onAir.error = episode.error || "The broadcast failed.";
    } catch (error) {
      if (!onAir) return;
      onAir.starting = false;
      onAir.error = error instanceof Error ? error.message : "The last broadcast could not be found.";
    }
    repaintOnAir();
  }

  function poll(id: string) {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(async () => {
      if (!onAir || onAir.episode?.id !== id) return;
      try {
        const episode = PodcastEpisodeSchema.parse(await getPodcast(id));
        if (!onAir || onAir.episode?.id !== id) return;
        onAir.episode = episode;
        if (episode.status === "error") {
          onAir.error = brokenWorker(episode.error ?? "")
            ? "The radio needs the research Worker redeployed before it can broadcast a book. Run npm run research:deploy in apps/knowledge, then tune in again."
            : episode.error || "The broadcast failed.";
        }
        if (episode.status === "running") poll(id);
        else if (episode.status === "ready") host.toast(`${book(onAir.book)?.label ?? "The broadcast"} is ready to play.`);
        repaintOnAir();
      } catch {
        poll(id);
      }
    }, 6000);
  }

  function airHash(key: string) {
    return `#bookshelf/${AIR_ROUTE}/${encodeURIComponent(key)}`;
  }

  function goOnAirRoute(key: string) {
    const next = airHash(key);
    if (location.hash === next) return;
    if (history.state?.wlAir) history.replaceState({ wlAir: true }, "", next);
    else history.pushState({ wlAir: true }, "", next);
  }

  /** Leaves the broadcast without touching history (Back already moved it). */
  function leaveAir() {
    playGen += 1;
    audio?.pause();
    window.clearTimeout(pollTimer);
    if (onAir) {
      const episodeId = onAir.episode?.id;
      if (episodeId) writeJson(POS_KEY + episodeId, onAir.index);
      khz = retuneTo ?? onAir.khz;
      remember();
    }
    retuneTo = undefined;
    onAir = null;
    host.repaint();
  }

  /** Retune, Esc and the mini dial: step back through history when we pushed the on-air address. */
  function retune() {
    if (history.state?.wlAir) {
      history.back();
      return;
    }
    if (location.hash.startsWith(`#bookshelf/${AIR_ROUTE}`)) history.replaceState(null, "", "#bookshelf");
    leaveAir();
  }

  /** Arriving at #bookshelf/~air/<book> (reload, Back from a note): replay the saved broadcast, never cut a new one. */
  async function restore(key: string) {
    if (onAir?.book === key) return;
    const s = dial.stations.find(item => item.key === key);
    if (!s) return;
    khz = s.khz;
    remember();
    if (!library && !libraryLoading) loadLibrary();
    for (let i = 0; i < 20 && libraryLoading; i += 1) await new Promise(resolve => setTimeout(resolve, 150));
    if (lastFor(s.book)) await tuneIn(s, false);
    else {
      history.replaceState(null, "", "#bookshelf");
      host.repaint();
    }
  }

  function holdThought() {
    if (!onAir) return;
    const b = book(onAir.book);
    if (!b) return;
    playGen += 1;
    audio?.pause();
    onAir.playing = false;
    const entry = onAir.order[segmentIndexes()[onAir.index] ?? 0];
    const turn = turns()[onAir.index];
    if (onAir.episode) writeJson(POS_KEY + onAir.episode.id, onAir.index);
    const draft = holdThoughtDraft({
      book: b.label,
      page: entry?.page,
      at: elapsedSeconds(),
      segment: entry?.segment ?? "feature",
      speaker: turn ? speaker(turn) : undefined,
      line: turn?.text,
    });
    host.holdThought(b.label, entry?.page ? `p. ${entry.page}` : undefined, draft);
  }

  /** Player changes redraw the on-air panels only; a full repaint would replay the kinetic title. */
  function refreshAir() {
    if (!root || !onAir) return;
    paintOnAir();
    const page = root.closest(".shelf-root") ?? document;
    page.querySelector(".wl-onair")?.classList.toggle("is-live", onAir.playing);
  }

  function repaintOnAir() {
    // The header carries status, so repaint the shelf when we're mounted.
    if (root) host.repaint();
  }

  function turns() {
    return onAir?.episode?.turns ?? [];
  }

  function segmentIndexes() {
    return onAir ? turnSegments(turns(), onAir.order) : [];
  }

  function totalSeconds() {
    return turns().reduce((sum, turn) => sum + (durations.get(turn.id) ?? guessSeconds(turn)), 0);
  }

  function elapsedSeconds() {
    const list = turns();
    let sum = 0;
    for (let i = 0; i < (onAir?.index ?? 0) && i < list.length; i += 1) sum += durations.get(list[i]!.id) ?? guessSeconds(list[i]!);
    return sum + (onAir?.playing && audio ? audio.currentTime : 0);
  }

  function paintOnAir() {
    if (!root || !onAir) return;
    const b = book(onAir.book);
    const ep = onAir.episode;
    const ready = ep?.status === "ready" || ep?.status === "cancelled";
    const segs = segmentIndexes();
    const current = ready ? segs[onAir.index] ?? 0 : -1;
    const starts = estimatedStarts(onAir.order);
    const firstTurn = (i: number) => segs.indexOf(i);
    const orderRows = onAir.order.map((item, i) => {
      const turnAt = firstTurn(i);
      const turnsBefore = turns().slice(0, Math.max(0, turnAt));
      const at = ready && turnAt >= 0 ? turnsBefore.reduce((sum, t) => sum + (durations.get(t.id) ?? guessSeconds(t)), 0) : starts[i]!;
      const label = item.segment === "crosstalk" && item.via ? `${item.title} · ${item.via}` : item.title;
      const missing = ready && turnAt < 0;
      return `<li class="wl-ro__item${i === current ? " is-now" : ""}${missing ? " is-cut" : ""}" style="--seg:${SEGMENT_COLOUR[item.segment]}">
        <button type="button" data-seek-segment="${i}"${ready && !missing ? "" : " disabled"}>
          <span class="wl-ro__time">${ready && !missing ? "" : "≈ "}${clock(at)}</span>
          <span class="wl-ro__seg">${SEGMENT_LABEL[item.segment]}${item.page ? ` · p.${item.page}` : ""}</span>
          <span class="wl-ro__title">${esc(item.segment === "phone-in" && item.questions?.length ? item.questions[0] : label)}</span>
        </button>
      </li>`;
    }).join("");

    root.innerHTML = `<div class="wl-air">
      ${miniDialHtml()}
      <section class="wl-card wl-ro" aria-label="Running order">
        <p class="shelf-eyebrow">Running order</p>
        <ol class="wl-ro__list">${orderRows}</ol>
        ${ready ? "" : `<p class="wl-caption">Times are estimates until the programme is recorded.</p>`}
      </section>
      <div class="wl-stage">
        <section class="wl-card wl-signal" aria-label="Signal">
          ${signalHtml(ready)}
        </section>
        <div class="wl-under">
          <section class="wl-card wl-now" aria-live="polite">${nowHtml(ready)}</section>
          <section class="wl-card wl-mixer" aria-label="Mix the next broadcast">${mixerHtml(b)}</section>
        </div>
      </div>
    </div>`;
    bindOnAir(root, ready);
    if (ready) drawWave();
  }

  function miniDialHtml() {
    const stations = dial.stations.map(s => {
      const left = ((s.khz - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * 100;
      return `<button type="button" class="wl-mini__book${s.key === onAir?.book ? " is-on" : ""}" style="left:${left}%;--c:${s.book.swatch.fill}" data-mini="${esc(s.key)}" aria-label="${esc(`Retune to ${s.label}`)}" title="${esc(`${s.label} · ${s.khz} kHz`)}"></button>`;
    }).join("");
    const nums = [600, 800, 1000, 1200, 1400].map(k => `<span style="left:${((k - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * 100}%">${k}</span>`).join("");
    const at = ((onAir!.khz - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * 100;
    return `<div class="wl-mini" aria-label="Dial">${stations}<i class="wl-mini__needle" style="left:${at}%"></i><div class="wl-mini__nums" aria-hidden="true">${nums}</div></div>`;
  }

  function signalHtml(ready: boolean) {
    const ep = onAir!.episode;
    if (onAir!.error) {
      return `<p class="shelf-eyebrow">Signal</p><div class="wl-dead"><p class="shelf-sheet__error" role="alert">${esc(onAir!.error)}</p>
        <button class="btn btn--secondary" type="button" data-wl-recut>Try again</button></div>`;
    }
    if (!ready) {
      return `<p class="shelf-eyebrow">Signal</p>
        <div class="wl-warming${reduced.matches ? "" : " is-moving"}" aria-hidden="true">${Array.from({ length: 64 }, (_, i) => `<i style="--h:${18 + (hash(String(i)) % 60)}%;--d:${(i % 9) * 0.11}s"></i>`).join("")}</div>
        <p class="wl-blurb" role="status">${onAir!.starting && !ep ? "Calling the studio…" : "Clementine and Ann are writing and recording the programme. This usually takes a few minutes; you can leave and tune in again later."}</p>`;
    }
    const total = totalSeconds();
    return `<p class="shelf-eyebrow">Signal</p>
      <div class="wl-wave" data-wave>
        <div class="wl-wave__labels" data-wave-labels></div>
        <canvas data-wave-canvas aria-label="Waveform: tap to jump to a line" role="img"></canvas>
        <i class="wl-wave__head" data-wave-head></i>
      </div>
      <div class="wl-transport">
        <button class="btn btn--ghost wl-tbtn" type="button" data-seg-step="-1" aria-label="Previous segment">⏮</button>
        <button class="btn btn--primary wl-play" type="button" data-play aria-label="${onAir!.playing ? "Pause" : "Play"}">${onAir!.playing ? "❚❚" : "▶"}</button>
        <button class="btn btn--ghost wl-tbtn" type="button" data-seg-step="1" aria-label="Next segment">⏭</button>
        <span class="wl-time" data-time>${clock(elapsedSeconds())} / ${clock(total)}</span>
        <span class="wl-legend">${(["feature", "backstory", "counterpoint", "extends", "crosstalk", "phone-in"] as Segment[]).filter(seg => onAir!.order.some(o => o.segment === seg)).map(seg => `<span style="--seg:${SEGMENT_COLOUR[seg]}">${SEGMENT_LABEL[seg]}</span>`).join("")}</span>
      </div>`;
  }

  function nowHtml(ready: boolean) {
    const item = onAir!.order[ready ? segmentIndexes()[onAir!.index] ?? 0 : 0];
    if (!item) return "";
    const turn = turns()[onAir!.index];
    const pastNow = ready ? clock(elapsedSeconds()) : "";
    const skipLabel = item.segment === "cold-open" ? "" : onAir!.skip.has(item.segment) ? `Play ${SEGMENT_LABEL[item.segment].toLowerCase()}s again` : `Skip ${SEGMENT_LABEL[item.segment].toLowerCase()}s`;
    return `<p class="shelf-eyebrow" style="color:${SEGMENT_COLOUR[item.segment]}">${ready ? `Now · ${pastNow} · ` : "First up · "}${SEGMENT_LABEL[item.segment]}${item.page ? ` · p.${item.page}` : ""}</p>
      <h3 class="wl-now__title">${esc(item.title)}</h3>
      ${ready && turn ? `<p class="wl-now__who">${esc(speaker(turn))}</p><blockquote class="wl-now__line">${esc(turn.text)}</blockquote>` : item.questions?.length ? `<ul class="wl-now__qs">${item.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
      <div class="wl-now__actions">
        <button class="btn btn--primary" type="button" data-open-note="${esc(item.pageId)}">Open note</button>
        ${ready && skipLabel ? `<button class="btn btn--secondary" type="button" data-skip-seg="${item.segment}">${skipLabel}</button>` : ""}
      </div>`;
  }

  function mixerHtml(b?: BookModel) {
    if (!b) return "";
    const counts = mixCounts(b);
    const fader = (key: keyof typeof counts, label: string, detail: string, colour: string) => `
      <label class="wl-fader" style="--seg:${colour}">
        <input type="range" min="0" max="100" step="5" value="${mix[key]}" data-fader="${key}" aria-label="${label}"${counts[key] ? "" : " disabled"} />
        <b>${label}</b><span>${detail}</span>
      </label>`;
    const lengths: Array<Mix["length"]> = ["short", "standard", "deep"];
    return `<p class="shelf-eyebrow">Mix the next broadcast</p>
      <div class="wl-faders">
        ${fader("supports", "Explains", plural(counts.supports, "note"), SEGMENT_COLOUR.feature)}
        ${fader("counter", "Debate", plural(counts.counter, "note"), SEGMENT_COLOUR.counterpoint)}
        ${fader("extends", "So what", plural(counts.extends, "note"), SEGMENT_COLOUR.extends)}
        ${fader("crosstalk", "Crosstalk", plural(counts.crosstalk, "book"), SEGMENT_COLOUR.crosstalk)}
      </div>
      <p class="wl-caption">Debate also sets how hard Ann argues with the book: <b data-argue>${disagreementFor(mix.counter)}</b>.</p>
      <div class="hub-pills wl-length" role="group" aria-label="Length">${lengths.map(l => `<button class="hub-pills__btn${mix.length === l ? " is-active" : ""}" type="button" data-length="${l}" aria-pressed="${mix.length === l}">${l[0]!.toUpperCase()}${l.slice(1)}</button>`).join("")}</div>
      <button class="btn btn--secondary wl-recut" type="button" data-wl-recut>Cut a new broadcast</button>`;
  }

  function bindOnAir(el: HTMLElement, ready: boolean) {
    el.querySelectorAll<HTMLButtonElement>("[data-mini]").forEach(button => {
      button.onclick = () => {
        const s = dial.stations.find(item => item.key === button.dataset.mini);
        if (!s) return;
        retuneTo = s.khz;
        retune();
      };
    });
    el.querySelectorAll<HTMLButtonElement>("[data-open-note]").forEach(button => {
      button.onclick = () => {
        playGen += 1;
        audio?.pause();
        if (onAir) onAir.playing = false;
        if (onAir?.episode) writeJson(POS_KEY + onAir.episode.id, onAir.index);
        host.openPage(button.dataset.openNote!);
      };
    });
    el.querySelectorAll<HTMLButtonElement>("[data-wl-recut]").forEach(button => {
      button.onclick = () => {
        const s = dial.stations.find(item => item.key === onAir?.book);
        if (!s) return;
        playGen += 1;
        audio?.pause();
        void tuneIn(s, true);
      };
    });
    el.querySelectorAll<HTMLInputElement>("[data-fader]").forEach(input => {
      input.oninput = () => {
        mix = { ...mix, [input.dataset.fader!]: Number(input.value) };
        writeJson(MIX_KEY, mix);
        const argue = el.querySelector<HTMLElement>("[data-argue]");
        if (argue) argue.textContent = disagreementFor(mix.counter);
      };
    });
    el.querySelectorAll<HTMLButtonElement>("[data-length]").forEach(button => {
      button.onclick = () => {
        mix = { ...mix, length: button.dataset.length as Mix["length"] };
        writeJson(MIX_KEY, mix);
        el.querySelectorAll<HTMLButtonElement>("[data-length]").forEach(other => {
          const on = other === button;
          other.classList.toggle("is-active", on);
          other.setAttribute("aria-pressed", String(on));
        });
      };
    });
    if (!ready) return;
    el.querySelector<HTMLButtonElement>("[data-play]")!.onclick = () => (onAir?.playing ? pause() : void play(onAir!.index));
    el.querySelectorAll<HTMLButtonElement>("[data-seg-step]").forEach(button => {
      button.onclick = () => jumpSegment(Number(button.dataset.segStep));
    });
    el.querySelectorAll<HTMLButtonElement>("[data-seek-segment]").forEach(button => {
      button.onclick = () => {
        const at = segmentIndexes().indexOf(Number(button.dataset.seekSegment));
        if (at >= 0) void play(at);
      };
    });
    el.querySelector<HTMLButtonElement>("[data-skip-seg]")?.addEventListener("click", event => {
      const seg = (event.currentTarget as HTMLElement).dataset.skipSeg as Segment;
      if (!onAir) return;
      if (onAir.skip.has(seg)) onAir.skip.delete(seg);
      else onAir.skip.add(seg);
      if (onAir.skip.has(seg) && onAir.playing) void play(nextPlayable(onAir.index + 1));
      else paintOnAir();
    });
    const canvas = el.querySelector<HTMLCanvasElement>("[data-wave-canvas]");
    canvas?.addEventListener("click", event => {
      const rect = canvas.getBoundingClientRect();
      const at = turnAtFraction((event.clientX - rect.left) / rect.width);
      if (at >= 0) void play(at);
    });
  }

  // ── Player ─────────────────────────────────────────────────────────

  function nextPlayable(from: number) {
    const list = turns();
    const segs = segmentIndexes();
    for (let i = Math.max(0, from); i < list.length; i += 1) {
      const seg = onAir!.order[segs[i] ?? 0]?.segment;
      if (isPlayable(list[i]) && !(seg && onAir!.skip.has(seg))) return i;
    }
    return -1;
  }

  function jumpSegment(direction: number) {
    if (!onAir) return;
    const segs = segmentIndexes();
    const here = segs[onAir.index] ?? 0;
    if (direction > 0) {
      const at = segs.findIndex(s => s > here);
      if (at >= 0) void play(at);
    } else {
      const start = segs.indexOf(here);
      const target = onAir.index - start > 1 || here === 0 ? here : here - 1;
      void play(Math.max(0, segs.indexOf(target)));
    }
  }

  function pause() {
    playGen += 1;
    audio?.pause();
    if (onAir) onAir.playing = false;
    if (onAir?.episode) writeJson(POS_KEY + onAir.episode.id, onAir.index);
    refreshAir();
  }

  async function play(index: number) {
    if (!onAir?.episode) return;
    const at = nextPlayable(index);
    if (at < 0) {
      onAir.playing = false;
      onAir.index = Math.max(0, turns().length - 1);
      writeJson(POS_KEY + onAir.episode.id, 0);
      refreshAir();
      host.toast("That's the end of the broadcast.");
      return;
    }
    const gen = ++playGen;
    const episodeId = onAir.episode.id;
    const turn = turns()[at]!;
    onAir.index = at;
    onAir.playing = true;
    onAir.loadingLine = true;
    refreshAir();
    try {
      const { url } = await getPodcastAudioUrl(episodeId, turn.id);
      if (gen !== playGen || !onAir) return;
      audio ??= new Audio();
      const player = audio;
      player.src = await clipSource(url, turn.id, gen);
      if (gen !== playGen || !onAir) return;
      player.onloadedmetadata = () => {
        if (Number.isFinite(player.duration)) durations.set(turn.id, player.duration);
      };
      player.ontimeupdate = () => tickPlayhead();
      player.onended = () => {
        if (gen !== playGen || !onAir) return;
        void play(at + 1);
      };
      await player.play();
      onAir.loadingLine = false;
      writeJson(POS_KEY + episodeId, at);
    } catch (error) {
      if (gen !== playGen || !onAir) return;
      onAir.playing = false;
      onAir.loadingLine = false;
      refreshAir();
      host.toast(error instanceof Error ? `Couldn't play that line: ${error.message}` : "Couldn't play that line.");
    }
  }

  /**
   * Downloads the clip once, so the waveform can draw its real loudness and the
   * player plays the same bytes. If storage refuses a cross-origin read, the
   * player streams the URL and that line keeps its drawn bars.
   */
  async function clipSource(url: string, turnId: string, gen: number): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) return url;
      const blob = await response.blob();
      if (gen !== playGen) return url;
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      clipUrl = URL.createObjectURL(blob);
      if (!peaks.has(turnId)) void readPeaks(blob, turnId);
      return clipUrl;
    } catch {
      return url;
    }
  }

  async function readPeaks(blob: Blob, turnId: string) {
    try {
      const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      if (!Ctx) return;
      const decoder = new Ctx(1, 1, 22050);
      const buffer = await decoder.decodeAudioData(await blob.arrayBuffer());
      const data = buffer.getChannelData(0);
      const size = Math.max(1, Math.floor(data.length / PEAK_BARS));
      const bars: number[] = [];
      for (let i = 0; i < PEAK_BARS; i += 1) {
        let sum = 0;
        for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j += 1) sum += data[j]! * data[j]!;
        bars.push(Math.sqrt(sum / size));
      }
      const loudest = Math.max(...bars, 1e-6);
      peaks.set(turnId, bars.map(v => v / loudest));
      durations.set(turnId, buffer.duration);
      if (root && onAir) drawWave();
    } catch {
      // Undecodable clip: keep the drawn bars for this line.
    }
  }

  // ── Waveform ───────────────────────────────────────────────────────

  function turnSpans() {
    const list = turns();
    const total = totalSeconds() || 1;
    let at = 0;
    return list.map(turn => {
      const width = (durations.get(turn.id) ?? guessSeconds(turn)) / total;
      const span = { from: at, to: at + width };
      at += width;
      return span;
    });
  }

  function turnAtFraction(fraction: number) {
    const spans = turnSpans();
    const i = spans.findIndex(span => fraction >= span.from && fraction < span.to);
    return i < 0 ? spans.length - 1 : i;
  }

  function drawWave() {
    const wave = root?.querySelector<HTMLElement>("[data-wave]");
    const canvas = wave?.querySelector<HTMLCanvasElement>("[data-wave-canvas]");
    if (!wave || !canvas || !onAir) return;
    const width = wave.clientWidth || 600;
    const height = phone.matches ? 96 : 150;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const list = turns();
    const spans = turnSpans();
    const segs = segmentIndexes();
    const styles = getComputedStyle(wave);
    const colour = (seg: Segment) => styles.getPropertyValue(`--wl-${seg}`).trim() || "#376fb7";
    const bar = 3;
    const playedTo = spans[onAir.index]?.from ?? 0;
    for (let x = 0; x < width; x += bar + 1) {
      const f = x / width;
      const i = Math.max(0, spans.findIndex(span => f >= span.from && f < span.to));
      const turn = list[i];
      if (!turn) continue;
      const seg = onAir.order[segs[i] ?? 0]?.segment ?? "feature";
      const real = peaks.get(turn.id);
      const span = spans[i]!;
      const within = span.to > span.from ? (f - span.from) / (span.to - span.from) : 0;
      const h = turn.kind === "cue" || turn.kind === "empty"
        ? 0.06
        : real
          ? 0.08 + real[Math.min(real.length - 1, Math.floor(within * real.length))]! * 0.88
          : 0.18 + ((hash(`${turn.id}:${x}`) % 1000) / 1000) * 0.7 * (turn.speaker === "ann" ? 0.8 : 1);
      ctx.globalAlpha = onAir.skip.has(seg) ? 0.15 : f < playedTo ? 0.95 : 0.42;
      ctx.fillStyle = colour(seg);
      const bh = Math.max(2, h * height * 0.9);
      ctx.fillRect(x, (height - bh) / 2, bar, bh);
    }
    // Segment labels: one per run, dropped when it would collide with the last (C1).
    const labels: string[] = [];
    let lastRight = -Infinity;
    let lastSeg: Segment | "" = "";
    spans.forEach((span, i) => {
      const item = onAir!.order[segs[i] ?? 0];
      if (!item || item.segment === lastSeg) return;
      lastSeg = item.segment;
      const left = span.from * width;
      const text = SEGMENT_LABEL[item.segment];
      const est = Math.min(200, text.length * 8.4 + 6);
      if (left < lastRight + 6 || left + 40 > width) return;
      lastRight = left + est;
      labels.push(`<span style="left:${(span.from * 100).toFixed(2)}%;max-width:${est}px;color:${SEGMENT_COLOUR[item.segment]}">${esc(text)}</span>`);
    });
    wave.querySelector<HTMLElement>("[data-wave-labels]")!.innerHTML = labels.join("");
    tickPlayhead();
  }

  function tickPlayhead() {
    if (!root || !onAir) return;
    const head = root.querySelector<HTMLElement>("[data-wave-head]");
    const span = turnSpans()[onAir.index];
    if (head && span) {
      const d = audio && onAir.playing && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      head.style.left = `${((span.from + (span.to - span.from) * d) * 100).toFixed(2)}%`;
    }
    const time = root.querySelector<HTMLElement>("[data-time]");
    if (time) time.textContent = `${clock(elapsedSeconds())} / ${clock(totalSeconds())}`;
  }

  const onMedia = () => {
    if (root && !onAir) paintDial();
    else if (root && onAir) paintOnAir();
  };
  phone.addEventListener("change", onMedia);

  return {
    setBooks,
    mount,
    unmount,
    destroy: () => {
      destroy();
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      phone.removeEventListener("change", onMedia);
    },
    headerHtml,
    supporting,
    get onAir() {
      return onAir !== null;
    },
    onAirBook: () => onAir?.book,
    restore: (key: string) => void restore(key),
    leaveAir,
    /** Escape on air goes back to the dial. */
    escape() {
      if (!onAir) return false;
      retune();
      return true;
    },
    /** Resize: redraw the dial geometry or the waveform. */
    resize() {
      if (!root) return;
      if (onAir) drawWave();
      else paintDial();
    },
  };
}

export type Wireless = ReturnType<typeof createWireless>;
