/**
 * The twenty topic planets: each one's god or goddess name and its painted surface.
 * One recipe per topic, seeded by the topic, so a planet looks the same in the universe,
 * the orrery drawer and its own system view at any size.
 */
import { hashUnit } from "./solarModel";
import { mulberry, TAU } from "./universeDraw";

export type Pantheon = "Greek" | "Roman" | "Egyptian" | "Celtic" | "Japanese" | "Chinese";

type Rng = () => number;
type Ctx = CanvasRenderingContext2D;

type SurfaceLayer =
  | { kind: "bands"; n: number; colors: string[]; wobble: number; alpha: number }
  | { kind: "craters"; n: number; min: number; max: number }
  | { kind: "speckle"; n: number; color: string; alpha: number; min: number; max: number }
  | { kind: "blobs"; n: number; color: string; alpha: number; min: number; max: number }
  | { kind: "clouds"; n: number; color: string; alpha: number }
  | { kind: "swirl"; n: number; colors: string[]; alpha: number; wmin: number; wmax: number }
  | { kind: "hatch"; n: number; color: string; angle: number; alpha: number }
  | { kind: "facets"; n: number; alpha: number; edges?: string }
  | { kind: "script"; color: string; alpha: number }
  | { kind: "split"; color: string }
  | { kind: "spot"; x: number; y: number; s: number; color: string }
  | { kind: "line"; y: number; color: string; w: number; alpha: number };

type LightLayer =
  | { kind: "cracks"; n: number; color: string }
  | { kind: "grid"; n: number; color: string }
  | { kind: "embers"; n: number; color: string }
  | { kind: "lightning"; n: number; color: string };

export type PlanetLook = {
  topic: string;
  name: string;
  pantheon: Pantheon;
  /** Who they are, as a short phrase: "Titaness of memory". */
  domain: string;
  /** Warm halo colour for planets that glow (hearth, sun-storm). */
  halo?: string;
  surface: (base: string) => SurfaceLayer[];
  lights?: LightLayer[];
};

// ---------- colour ----------
function channels(hex: string) {
  const raw = hex.replace("#", "");
  return [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(a: string, b: string, t: number) {
  const A = channels(a);
  const B = channels(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

const light = (c: string, t: number) => mix(c, "#ffffff", t);
const dark = (c: string, t: number) => mix(c, "#000000", t);

function rgba(hex: string, a: number) {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- the twenty ----------
const bands = (n: number, colors: string[], wobble: number, alpha: number): SurfaceLayer => ({ kind: "bands", n, colors, wobble, alpha });
const speckle = (n: number, color: string, alpha: number, min = 0.012, max = 0.035): SurfaceLayer => ({ kind: "speckle", n, color, alpha, min, max });
const blobs = (n: number, color: string, alpha: number, min = 0.1, max = 0.3): SurfaceLayer => ({ kind: "blobs", n, color, alpha, min, max });
const clouds = (n: number, alpha: number, color = "#ffffff"): SurfaceLayer => ({ kind: "clouds", n, color, alpha });
const swirl = (n: number, colors: string[], alpha: number, wmin = 0.04, wmax = 0.12): SurfaceLayer => ({ kind: "swirl", n, colors, alpha, wmin, wmax });

export const PLANET_LOOKS: readonly PlanetLook[] = [
  {
    topic: "Learning Science and Cognition",
    name: "Mnemosyne",
    pantheon: "Greek",
    domain: "Titaness of memory, mother of the Muses",
    surface: c => [bands(16, [light(c, 0.3), dark(c, 0.25), c, light(c, 0.12)], 0.015, 0.5), speckle(18, light(c, 0.6), 0.4)],
  },
  {
    topic: "Motivation and Self Regulation",
    name: "Sophrosyne",
    pantheon: "Greek",
    domain: "spirit of self-control and moderation",
    surface: c => [bands(7, [light(c, 0.2), c, dark(c, 0.12)], 0.006, 0.35), { kind: "line", y: 0.04, color: light(c, 0.55), w: 0.07, alpha: 0.6 }],
  },
  {
    topic: "Pedagogy and Instructional Design",
    name: "Athena",
    pantheon: "Greek",
    domain: "goddess of wisdom, strategy and craft",
    surface: c => [{ kind: "facets", n: 30, alpha: 0.4, edges: light(c, 0.5) }, blobs(3, dark(c, 0.3), 0.35)],
  },
  {
    topic: "Assessment Feedback and Evaluation",
    name: "Maat",
    pantheon: "Egyptian",
    domain: "goddess of truth and balance, whose feather weighs the heart",
    surface: c => [
      { kind: "hatch", n: 60, color: light(c, 0.65), angle: -0.6, alpha: 0.45 },
      { kind: "line", y: 0, color: "#e6c47a", w: 0.035, alpha: 0.9 },
    ],
  },
  {
    topic: "Curriculum Differentiation and Enrichment",
    name: "Proteus",
    pantheon: "Greek",
    domain: "sea god who can take any shape",
    surface: c => [swirl(16, ["#3d9aa6", light(c, 0.4), dark(c, 0.3), "#6fb0a8"], 0.5)],
  },
  {
    topic: "High Potential and High Ability Education",
    name: "Lugh",
    pantheon: "Celtic",
    domain: "the Samildánach, skilled in all the arts",
    halo: "#f0b25a",
    surface: c => [
      bands(11, ["#e6c47a", dark(c, 0.2), "#f68620", light(c, 0.25), "#d46a8a"], 0.03, 0.5),
      { kind: "spot", x: 0.3, y: 0.25, s: 0.14, color: "#f2cf7a" },
    ],
  },
  {
    topic: "Child and Adolescent Development",
    name: "Hebe",
    pantheon: "Greek",
    domain: "goddess of youth",
    surface: () => [blobs(5, "#7aaa5a", 0.75), clouds(9, 0.55)],
  },
  {
    topic: "Wellbeing Mental Health and Trauma",
    name: "Guanyin",
    pantheon: "Chinese",
    domain: "goddess of compassion, who hears the cries of the world",
    surface: c => [swirl(8, [light(c, 0.45), "#c98b78"], 0.35, 0.1, 0.2), clouds(14, 0.5, "#fff4ec")],
  },
  {
    topic: "Neurodiversity Inclusion and Disability",
    name: "Ebisu",
    pantheon: "Japanese",
    domain: "god of good fortune, born different and set adrift",
    surface: () => [blobs(9, "#7aaa5a", 0.8, 0.05, 0.12), speckle(30, "#6fb0a8", 0.6), clouds(4, 0.35)],
  },
  {
    topic: "Literacy Language and Communication",
    name: "Thoth",
    pantheon: "Egyptian",
    domain: "god of writing, language and the moon",
    surface: c => [{ kind: "craters", n: 9, min: 0.05, max: 0.13 }, { kind: "script", color: light(c, 0.7), alpha: 0.55 }],
  },
  {
    topic: "Critical Creative and Higher Order Thinking",
    name: "Prometheus",
    pantheon: "Greek",
    domain: "Titan of forethought, who stole fire",
    surface: c => [blobs(6, dark(c, 0.35), 0.35)],
    lights: [{ kind: "cracks", n: 7, color: "#9fd4ff" }],
  },
  {
    topic: "Research Methods and Evidence Literacy",
    name: "Veritas",
    pantheon: "Roman",
    domain: "goddess of truth, hidden at the bottom of a well",
    surface: () => [
      { kind: "facets", n: 26, alpha: 0.4, edges: "#e9fbe0" },
      { kind: "hatch", n: 14, color: "#e9fbe0", angle: 0.9, alpha: 0.35 },
    ],
  },
  {
    topic: "Educational Leadership and Change",
    name: "Janus",
    pantheon: "Roman",
    domain: "two-faced god of doorways and change",
    surface: c => [{ kind: "split", color: dark(c, 0.45) }, speckle(20, light(c, 0.5), 0.35)],
  },
  {
    topic: "Policy Ethics and Governance",
    name: "Themis",
    pantheon: "Greek",
    domain: "Titaness of divine law and order",
    surface: c => [bands(10, [light(c, 0.3), dark(c, 0.2)], 0, 0.45)],
  },
  {
    topic: "Technology AI and Digital Learning",
    name: "Hephaestus",
    pantheon: "Greek",
    domain: "god of the forge, builder of the gods’ machines",
    surface: () => [{ kind: "facets", n: 12, alpha: 0.25 }],
    lights: [{ kind: "grid", n: 34, color: "#f2a65a" }],
  },
  {
    topic: "Sociocultural Diversity and Equity",
    name: "Harmonia",
    pantheon: "Greek",
    domain: "goddess of harmony and concord",
    surface: () => [bands(9, ["#5b8ec8", "#d4b44a", "#4a9a68", "#d46a8a", "#9b7eb8", "#3d9aa6"], 0.05, 0.5)],
  },
  {
    topic: "Classroom Culture and Engagement",
    name: "Brigid",
    pantheon: "Celtic",
    domain: "goddess of the hearth, poetry and holy wells",
    halo: "#f2a65a",
    surface: c => [blobs(6, dark(c, 0.35), 0.55), clouds(5, 0.3)],
    lights: [{ kind: "embers", n: 22, color: "#f6a24a" }],
  },
  {
    topic: "Teacher Practice and Professional Learning",
    name: "Chiron",
    pantheon: "Greek",
    domain: "the wise centaur who taught heroes",
    surface: () => [blobs(7, "#4a6a48", 0.6), { kind: "craters", n: 5, min: 0.04, max: 0.1 }, clouds(4, 0.3)],
  },
  {
    topic: "Higher Education and Academic Practice",
    name: "Tenjin",
    pantheon: "Japanese",
    domain: "god of scholarship, prayed to before exams",
    surface: c => [bands(6, [light(c, 0.3), dark(c, 0.2)], 0.04, 0.25), speckle(40, "#f2a7c3", 0.85, 0.015, 0.04)],
    lights: [{ kind: "lightning", n: 3, color: "#c9d8ff" }],
  },
  {
    topic: "Philosophy Knowledge and Society",
    name: "Sophia",
    pantheon: "Greek",
    domain: "wisdom itself",
    surface: c => [swirl(7, [dark(c, 0.35), light(c, 0.15)], 0.5), speckle(55, "#ffe9c9", 0.9, 0.006, 0.018)],
  },
];

const BY_TOPIC = new Map(PLANET_LOOKS.map(look => [look.topic.toLowerCase(), look]));

export function planetLook(topic: string): PlanetLook | null {
  return BY_TOPIC.get(topic.trim().toLowerCase()) ?? null;
}

/** The planet's god name, or the topic itself for a topic with no look. */
export function planetName(topic: string) {
  return planetLook(topic)?.name ?? topic;
}

// ---------- surface painters (unit sphere of radius r at the origin, already clipped) ----------
const rand = (rng: Rng, a: number, b: number) => a + (b - a) * rng();

function inDisc(rng: Rng, r: number, k = 0.92) {
  const a = rng() * TAU;
  const d = Math.sqrt(rng()) * r * k;
  return [Math.cos(a) * d, Math.sin(a) * d] as const;
}

function paintSurface(ctx: Ctx, r: number, rng: Rng, base: string, layer: SurfaceLayer) {
  ctx.globalAlpha = 1;
  switch (layer.kind) {
    case "bands": {
      for (let i = 0; i < layer.n; i++) {
        const y0 = -r + (2 * r * i) / layer.n;
        const y1 = y0 + (2 * r) / layer.n;
        const ph = rng() * TAU;
        const fr = rand(rng, 2, 5);
        const amp = layer.wobble * r * rand(rng, 0.4, 1);
        ctx.beginPath();
        for (let x = -r; x <= r; x += r / 14) ctx.lineTo(x, y0 + Math.sin((x / r) * fr + ph) * amp);
        for (let x = r; x >= -r; x -= r / 14) ctx.lineTo(x, y1 + Math.sin((x / r) * fr + ph + 1) * amp);
        ctx.closePath();
        ctx.globalAlpha = layer.alpha;
        ctx.fillStyle = layer.colors[i % layer.colors.length]!;
        ctx.fill();
      }
      break;
    }
    case "craters": {
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r);
        const s = r * rand(rng, layer.min, layer.max);
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = dark(base, 0.35);
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = light(base, 0.4);
        ctx.lineWidth = Math.max(0.4, s * 0.22);
        ctx.beginPath();
        ctx.arc(x + s * 0.12, y + s * 0.12, s * 0.9, Math.PI * 0.05, Math.PI * 0.95);
        ctx.stroke();
      }
      break;
    }
    case "speckle": {
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = layer.alpha;
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r, 0.98);
        ctx.beginPath();
        ctx.arc(x, y, r * rand(rng, layer.min, layer.max), 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "blobs": {
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = layer.alpha;
      for (let i = 0; i < layer.n; i++) {
        const [cx, cy] = inDisc(rng, r);
        const s = r * rand(rng, layer.min, layer.max);
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const a = (j / 10) * TAU;
          const d = s * rand(rng, 0.55, 1.15);
          ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "clouds": {
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r);
        const s = r * rand(rng, 0.15, 0.4);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.42);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
        g.addColorStop(0, rgba(layer.color, layer.alpha));
        g.addColorStop(1, rgba(layer.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "swirl": {
      ctx.lineCap = "round";
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r, 0.8);
        const len = r * rand(rng, 0.5, 1.3);
        const a = rand(rng, -0.5, 0.5);
        ctx.strokeStyle = layer.colors[i % layer.colors.length]!;
        ctx.globalAlpha = layer.alpha;
        ctx.lineWidth = r * rand(rng, layer.wmin, layer.wmax);
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.bezierCurveTo(x - len / 4, y - len * 0.35 + a * r, x + len / 4, y + len * 0.35 - a * r, x + len / 2, y + a * r * 0.3);
        ctx.stroke();
      }
      break;
    }
    case "hatch": {
      ctx.strokeStyle = layer.color;
      ctx.lineCap = "round";
      ctx.globalAlpha = layer.alpha;
      ctx.lineWidth = Math.max(0.35, r * 0.018);
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r, 0.96);
        const len = r * rand(rng, 0.1, 0.28);
        const a = layer.angle + rand(rng, -0.15, 0.15);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      break;
    }
    case "facets": {
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r, 1);
        const s = r * rand(rng, 0.2, 0.5);
        ctx.fillStyle = rng() > 0.5 ? light(base, rand(rng, 0.1, 0.35)) : dark(base, rand(rng, 0.1, 0.3));
        ctx.globalAlpha = layer.alpha;
        ctx.beginPath();
        for (let j = 0; j < 3; j++) {
          const a = rng() * TAU;
          ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
        }
        ctx.closePath();
        ctx.fill();
        if (layer.edges) {
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = layer.edges;
          ctx.lineWidth = Math.max(0.3, r * 0.01);
          ctx.stroke();
        }
      }
      break;
    }
    case "script": {
      ctx.strokeStyle = layer.color;
      ctx.lineCap = "round";
      ctx.globalAlpha = layer.alpha;
      ctx.lineWidth = Math.max(0.4, r * 0.022);
      for (let y = -r * 0.55; y <= r * 0.6; y += r * 0.17) {
        const half = Math.sqrt(Math.max(0, r * r - y * y)) * 0.8;
        let x = -half;
        while (x < half) {
          const w = r * rand(rng, 0.03, 0.09);
          ctx.beginPath();
          if (rng() > 0.5) {
            ctx.moveTo(x, y - r * 0.04);
            ctx.lineTo(x, y + r * 0.04);
            ctx.lineTo(x + w, y + r * 0.04);
          } else {
            ctx.arc(x + w / 2, y, w / 2, Math.PI, 0);
          }
          ctx.stroke();
          x += w + r * rand(rng, 0.03, 0.08);
        }
      }
      break;
    }
    case "split": {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(r * 1.2, -r * 1.2);
      for (let y = -r; y <= r; y += r / 10) ctx.lineTo(Math.sin((y / r) * 3) * r * 0.06, y);
      ctx.lineTo(r * 1.2, r * 1.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "spot": {
      ctx.save();
      ctx.translate(layer.x * r, layer.y * r);
      ctx.scale(1, 0.6);
      ctx.fillStyle = light(layer.color, 0.4);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, layer.s * r * 1.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, layer.s * r, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "line": {
      ctx.strokeStyle = layer.color;
      ctx.globalAlpha = layer.alpha;
      ctx.lineWidth = Math.max(0.6, r * layer.w);
      ctx.beginPath();
      ctx.moveTo(-r, layer.y * r);
      ctx.lineTo(r, layer.y * r);
      ctx.stroke();
      break;
    }
  }
  ctx.globalAlpha = 1;
}

function paintLight(ctx: Ctx, r: number, rng: Rng, layer: LightLayer) {
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (layer.kind) {
    case "cracks": {
      for (let i = 0; i < layer.n; i++) {
        let [x, y] = inDisc(rng, r, 0.75);
        let a = rng() * TAU;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 9; s++) {
          a += rand(rng, -0.8, 0.8);
          x += Math.cos(a) * r * 0.1;
          y += Math.sin(a) * r * 0.1;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(layer.color, 0.35);
        ctx.lineWidth = r * 0.07;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = Math.max(0.5, r * 0.018);
        ctx.stroke();
      }
      break;
    }
    case "grid": {
      const step = r * 0.16;
      for (let i = 0; i < layer.n; i++) {
        let x = Math.round(rand(rng, -r, r) / step) * step;
        let y = Math.round(rand(rng, -r, r) / step) * step;
        const horiz = rng() > 0.5;
        const len = step * Math.ceil(rand(rng, 1, 3));
        if (Math.hypot(x, y) > r * 0.95) continue;
        ctx.strokeStyle = rgba(layer.color, 0.75);
        ctx.lineWidth = Math.max(0.4, r * 0.016);
        ctx.beginPath();
        ctx.moveTo(x, y);
        if (horiz) x += len;
        else y += len;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = rgba(layer.color, 0.95);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, r * 0.028), 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "embers": {
      for (let i = 0; i < layer.n; i++) {
        const [x, y] = inDisc(rng, r, 0.95);
        const s = r * rand(rng, 0.03, 0.09);
        const g = ctx.createRadialGradient(x, y, 0, x, y, s);
        g.addColorStop(0, rgba(layer.color, 0.9));
        g.addColorStop(1, rgba(layer.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "lightning": {
      for (let i = 0; i < layer.n; i++) {
        let [x, y] = inDisc(rng, r, 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) {
          x += rand(rng, -0.09, 0.09) * r;
          y += r * 0.08;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(layer.color, 0.4);
        ctx.lineWidth = r * 0.05;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = Math.max(0.4, r * 0.014);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- sprites ----------
/** Planets smaller than this (screen px radius) draw as a flat disc: the texture can't read anyway. */
export const PLANET_TEXTURE_MIN_PX = 3;
const BUCKETS = [6, 12, 24, 48, 96, 192, 384];

export function spriteBucket(radiusPx: number) {
  return BUCKETS.find(b => b >= radiusPx) ?? BUCKETS[BUCKETS.length - 1]!;
}

type Sprites = { surface: HTMLCanvasElement; lights: HTMLCanvasElement | null; size: number };
const spriteCache = new Map<string, Sprites | null>();

/**
 * How far the painted surfaces lean toward the flat moon dots: texture marks are this much
 * fainter and fewer, and the sphere shading is this much softer. 0 = fully painted, 1 = flat disc.
 */
export const PLANET_FLATTEN = 0.3;

/** A layer with its detail eased toward flat: fewer marks, lower alpha, gentler wobble. */
export function flattenLayer<T extends { kind: string }>(layer: T, f = PLANET_FLATTEN): T {
  const out: Record<string, unknown> = { ...layer };
  if (typeof out.alpha === "number") out.alpha = (out.alpha as number) * (1 - f);
  if (typeof out.n === "number" && layer.kind !== "bands") out.n = Math.max(1, Math.round((out.n as number) * (1 - f)));
  if (layer.kind === "bands") {
    out.n = Math.max(3, Math.round((out.n as number) * (1 - f * 0.6)));
    out.wobble = (out.wobble as number) * (1 - f);
  }
  return out as T;
}

function seedFor(key: string) {
  return Math.floor(hashUnit(key) * 4294967296);
}

function makeCanvas(px: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  canvas.dataset.planetSprite = "1";
  return canvas;
}

/** Surface and lights painted once per topic and size bucket, centred, radius `r` device pixels. */
function sprites(topic: string, base: string, r: number): Sprites | null {
  const key = `${topic}|${base}|${r}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;
  const look = planetLook(topic);
  const size = r * 2;
  const surface = makeCanvas(size);
  const g = surface?.getContext("2d") ?? null;
  if (!surface || !g) {
    spriteCache.set(key, null);
    return null;
  }
  g.translate(r, r);
  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.clip();
  g.fillStyle = base;
  g.fillRect(-r, -r, size, size);
  const rng = mulberry(seedFor(`planet:${topic}`));
  for (const layer of look?.surface(base) ?? []) paintSurface(g, r, rng, base, flattenLayer(layer));
  g.restore();

  let lights: HTMLCanvasElement | null = null;
  if (look?.lights?.length) {
    lights = makeCanvas(size);
    const l = lights?.getContext("2d") ?? null;
    if (lights && l) {
      l.translate(r, r);
      l.beginPath();
      l.arc(0, 0, r, 0, TAU);
      l.clip();
      const lrng = mulberry(seedFor(`planet-lights:${topic}`));
      for (const layer of look.lights) paintLight(l, r, lrng, flattenLayer(layer));
    } else {
      lights = null;
    }
  }
  const out = { surface, lights, size };
  spriteCache.set(key, out);
  return out;
}

/**
 * Draws a textured planet of screen radius `pr` at (x, y), lit from `lightDir`
 * (a unit vector pointing from the planet toward the light; null lights from the upper left).
 */
export function drawPlanetBody(
  ctx: Ctx,
  topic: string,
  base: string,
  x: number,
  y: number,
  pr: number,
  alpha: number,
  lightDir: { x: number; y: number } | null,
  dpr = 1,
) {
  if (pr <= 0 || alpha <= 0.003) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  const sprite = pr >= PLANET_TEXTURE_MIN_PX ? sprites(topic, base, spriteBucket(pr * dpr)) : null;
  if (sprite) {
    ctx.drawImage(sprite.surface, x - pr, y - pr, pr * 2, pr * 2);
  } else {
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, TAU);
    ctx.fill();
  }
  if (pr >= PLANET_TEXTURE_MIN_PX) {
    const lx = lightDir?.x ?? -0.62;
    const ly = lightDir?.y ?? -0.7;
    const shade = ctx.createRadialGradient(x + lx * pr * 0.45, y + ly * pr * 0.45, pr * 0.05, x + lx * pr * 0.1, y + ly * pr * 0.1, pr * 1.35);
    shade.addColorStop(0, `rgba(255,255,255,${0.22 * (1 - PLANET_FLATTEN)})`);
    shade.addColorStop(0.45, "rgba(0,0,0,0)");
    shade.addColorStop(1, `rgba(0,0,0,${0.7 * (1 - PLANET_FLATTEN)})`);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, TAU);
    ctx.fill();
    if (sprite?.lights) {
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(sprite.lights, x - pr, y - pr, pr * 2, pr * 2);
      ctx.globalCompositeOperation = op;
    }
  }
  ctx.globalAlpha = prevAlpha;
}

/** Square box (CSS px) an orrery icon of radius `r` needs, with room for a ring. */
export function planetIconBox(r: number, ringed: boolean) {
  return Math.ceil(r * (ringed ? 4.8 : 2.4));
}

/** Paints one planet into its own canvas for the orrery drawer (CSS radius `r`); the caller sizes it with CSS. */
export function paintPlanetIcon(canvas: HTMLCanvasElement, topic: string, base: string, r: number, ringed = false) {
  const dpr = typeof devicePixelRatio === "number" ? Math.min(2, devicePixelRatio) : 1;
  const box = planetIconBox(r, ringed);
  canvas.width = Math.round(box * dpr);
  canvas.height = Math.round(box * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = box / 2;
  const look = planetLook(topic);
  const halo = ctx.createRadialGradient(c, c, r * 0.85, c, c, r * 1.2);
  halo.addColorStop(0, rgba(look?.halo ?? base, look?.halo ? 0.45 : 0.25));
  halo.addColorStop(1, rgba(look?.halo ?? base, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(c, c, r * 1.2, 0, TAU);
  ctx.fill();
  const ring = (front: boolean) => {
    if (!ringed) return;
    ctx.save();
    ctx.beginPath();
    if (front) ctx.rect(0, c, box, box);
    else ctx.rect(0, 0, box, c);
    ctx.clip();
    ctx.strokeStyle = rgba(light(base, 0.35), 0.75);
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.beginPath();
    ctx.ellipse(c, c, r * 2.1, r * 0.55, -0.32, 0, TAU);
    ctx.stroke();
    ctx.restore();
  };
  ring(false);
  drawPlanetBody(ctx, topic, base, c, c, r, 1, { x: 0, y: -1 }, dpr);
  ring(true);
}

/** Device-pixel radius buckets currently painted; tests use it to prove sprites are reused. */
export function planetSpriteCount() {
  return spriteCache.size;
}
