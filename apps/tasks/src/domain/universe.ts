import { stringList } from '@/domain/task-shape';
import type { Project } from '@/schemas/project';
import type { Task, TaskDomain } from '@/schemas/task';
import { DEFAULT_DOMAIN_COLORS, DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import { getTaskPropertiesSync } from '@/services/task-properties';

/** Default domain ids — tests and cold start before Properties loads. */
export const DOMAIN_VOCABULARY: readonly TaskDomain[] = DEFAULT_TASK_PROPERTY_CONFIG.domains.map(
  (entry) => entry.id
);

function activeDomainIds(): readonly string[] {
  return getTaskPropertiesSync().domains.map((entry) => entry.id);
}

function activeDomainSet(): Set<string> {
  return new Set(activeDomainIds());
}

export const MIN_TAG_PAGES = 1;
export const ORBIT_GAP = 2.4;
export const SUN_RADIUS = 26;
export const PAGE_RADIUS = 0.85;
export const ROCK_RADIUS = 1.1;

const A0 = 420;
const AN = 3000;
const TAU = Math.PI * 2;

const SWARM_E0 = 0.1;
const SWARM_E_SPAN = 0.32;
const SWARM_E_MAX = SWARM_E0 + SWARM_E_SPAN;
const INCLINE_CAP = 0.85;
const INCLINE_SQUASH = 0.42;
const SWARM_MIN_RADIAL_FACTOR = (1 - SWARM_E_MAX) * (1 - INCLINE_CAP * INCLINE_SQUASH);

export type BodyKind = 'sun' | 'planet' | 'minor' | 'moon' | 'page' | 'rock';

export type Body = {
  idx: number;
  id: string;
  kind: BodyKind;
  label: string;
  parent: number;
  pageId?: string;
  excerpt?: string;
  count: number;
  r: number;
  sysR: number;
  a: number;
  phase: number;
  period: number;
  e: number;
  argP: number;
  incline: number;
  ringed?: boolean;
  giant?: boolean;
  color: string;
  ink: string;
  children: Body[];
};

export type RankedTag = { tag: string; count: number };

export type UniverseEntry = {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
};

export type SolarModel = {
  bodies: Body[];
  sun: Body;
  planets: Body[];
  rocks: Body[];
  reach: number;
  tightest: number;
};

export type TopicPaint = { fill: string; ink: string };

function inkForFill(fill: string, domainId: string): string {
  return DEFAULT_DOMAIN_COLORS[domainId]?.ink ?? fill;
}

function domainPaintFor(id: string): TopicPaint | null {
  const domain = getTaskPropertiesSync().domains.find((entry) => entry.id === id);
  if (!domain) return null;
  const fill = domain.color ?? DEFAULT_DOMAIN_COLORS[id]?.fill ?? '#244f7c';
  return { fill, ink: inkForFill(fill, id) };
}

const EXTRA_PAINT: TopicPaint[] = [
  { fill: '#376fb7', ink: '#17375e' },
  { fill: '#5d4e70', ink: '#5d4e70' },
  { fill: '#2f7a4f', ink: '#3c5949' },
  { fill: '#a85a0c', ink: '#6c581f' },
  { fill: '#142b51', ink: '#0a1536' }
];

export function hashUnit(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function paintForTag(tag: string): TopicPaint {
  const domainPaint = domainPaintFor(tag);
  if (domainPaint) return domainPaint;
  return EXTRA_PAINT[Math.floor(hashUnit(`paint:${tag}`) * EXTRA_PAINT.length)]!;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function lift(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const mix = (offset: number) => {
    const channel = parseInt(raw.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

function makeBody(
  partial: Omit<Body, 'idx' | 'parent' | 'children' | 'e' | 'argP' | 'incline'> &
    Partial<Pick<Body, 'e' | 'argP' | 'incline' | 'children' | 'ringed' | 'giant'>>
): Body {
  return {
    idx: -1,
    parent: -1,
    e: 0,
    argP: 0,
    incline: 0,
    children: partial.children ?? [],
    ...partial
  };
}

export function orbitOffset(body: Body, clock: number): { x: number; y: number } {
  const mean = body.phase + (body.period ? (clock / body.period) * TAU : 0);
  const e = body.e || 0;
  const ecc = mean + e * Math.sin(mean);
  const radius = (body.a * (1 - e * e)) / Math.max(1e-6, 1 + e * Math.cos(ecc));
  const ang = ecc + (body.argP || 0);
  const squash = 1 - Math.min(body.incline || 0, INCLINE_CAP) * INCLINE_SQUASH;
  return { x: Math.cos(ang) * radius, y: Math.sin(ang) * radius * squash };
}

export function massOf(body: Body): number {
  return Math.max(body.count, 1) * Math.max(body.r * body.r, 0.4);
}

function subtreeMass(body: Body): number {
  let mass = massOf(body);
  for (const child of body.children) mass += subtreeMass(child);
  return mass;
}

export function worldPositions(bodies: Body[], clock: number): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(bodies.length);
  const y = new Float64Array(bodies.length);
  const root = bodies.find((body) => body.parent < 0) ?? bodies[0];
  if (!root) return { x, y };

  const place = (body: Body, cx: number, cy: number) => {
    const kids = body.children;
    const offs = kids.map((child) => orbitOffset(child, clock));
    let mTot = massOf(body);
    let cmx = 0;
    let cmy = 0;
    for (let i = 0; i < kids.length; i++) {
      const mass = subtreeMass(kids[i]!);
      mTot += mass;
      cmx += mass * offs[i]!.x;
      cmy += mass * offs[i]!.y;
    }
    const px = cx - cmx / Math.max(mTot, 1e-6);
    const py = cy - cmy / Math.max(mTot, 1e-6);
    x[body.idx] = px;
    y[body.idx] = py;
    for (let i = 0; i < kids.length; i++) {
      place(kids[i]!, px + offs[i]!.x, py + offs[i]!.y);
    }
  };
  place(root, 0, 0);
  return { x, y };
}

export function universeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function tagsForTask(task: Task, projectTitle: string | null): string[] {
  const tags = [task.domain, ...stringList(task.tags)];
  if (projectTitle) tags.push(projectTitle);
  return universeTags(tags);
}

export function entriesFromWork(tasks: Task[], projects: Project[]): UniverseEntry[] {
  const titles = new Map(projects.map((project) => [project.id, project.title]));
  return tasks
    .filter((task) => task.status !== 'dead')
    .map((task) => ({
      id: task.id,
      title: task.title,
      excerpt: task.description,
      tags: tagsForTask(task, task.parent_project_id ? (titles.get(task.parent_project_id) ?? null) : null)
    }));
}

export function rankTags(entries: UniverseEntry[]): RankedTag[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of universeTags(entry.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_TAG_PAGES)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

function pairWeights(entries: UniverseEntry[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const entry of entries) {
    const tags = universeTags(entry.tags);
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = pairKey(tags[i]!, tags[j]!);
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
    }
  }
  return weights;
}

/** Domains stay planets; projects and free tags become minor planets. */
export function attachMinors(
  ranked: RankedTag[],
  weights: Map<string, number>
): { majors: RankedTag[]; minors: RankedTag[]; ownerOf: Map<string, string> } {
  const domainSet = activeDomainSet();
  const majors = ranked.filter((item) => domainSet.has(item.tag));
  const minors = ranked.filter((item) => !domainSet.has(item.tag));
  const ownerOf = new Map<string, string>();
  for (const minor of minors) {
    let bestOwner = majors[0]?.tag ?? minor.tag;
    let bestWeight = -1;
    for (const major of majors) {
      const weight = weights.get(pairKey(minor.tag, major.tag)) ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestOwner = major.tag;
      }
    }
    ownerOf.set(minor.tag, bestOwner);
  }
  return { majors, minors, ownerOf };
}

export function packOrbits(children: Body[], innerRadius: number, solo = false): number {
  if (!children.length) return innerRadius;
  const remaining = [...children].sort((a, b) => b.sysR - a.sysR || a.id.localeCompare(b.id));
  let a = innerRadius;
  while (remaining.length) {
    const head = remaining[0]!;
    const ringR = a + head.sysR;
    const capacity = solo
      ? 1
      : Math.max(1, Math.floor((TAU * ringR) / (2.35 * head.sysR + ORBIT_GAP)));
    const minSize = head.sysR / 1.7;
    const ring: Body[] = [];
    const next: Body[] = [];
    for (const child of remaining) {
      if (ring.length < capacity && child.sysR >= minSize) ring.push(child);
      else next.push(child);
    }
    const slot = TAU / ring.length;
    ring.forEach((child, index) => {
      child.a = ringR;
      child.phase = index * slot + (hashUnit(child.id) - 0.5) * slot * 0.04;
    });
    a = ringR + head.sysR + ORBIT_GAP;
    remaining.length = 0;
    remaining.push(...next);
  }
  return a;
}

function scaleSubtree(body: Body, factor: number, scaleSelfR: boolean): void {
  body.sysR *= factor;
  if (scaleSelfR) body.r *= factor;
  for (const child of body.children) {
    child.a *= factor;
    scaleSubtree(child, factor, true);
  }
}

function recomputeSysR(body: Body): number {
  let outer = body.r;
  for (const child of body.children) {
    const reach = child.a * (1 + (child.e || 0)) + recomputeSysR(child);
    if (reach > outer) outer = reach;
  }
  body.sysR = outer;
  return outer;
}

function paintOrbit(body: Body, e0: number, eSpan: number, i0: number, iSpan: number): void {
  body.e = e0 + hashUnit(`${body.id}:e`) * eSpan;
  body.argP = hashUnit(`${body.id}:w`) * TAU;
  body.incline = i0 + hashUnit(`${body.id}:i`) * iSpan;
}

function organicizeSwarm(children: Body[], seed: string, inner = 0, span = 0): void {
  if (!children.length) return;
  const nClumps = children.length <= 2 ? 1 : children.length <= 6 ? 2 : 3;
  const arm = hashUnit(`${seed}:arm`) * TAU;
  const centers: number[] = [];
  let ang = arm;
  for (let c = 0; c < nClumps; c++) {
    ang += c === 0 ? 0 : 0.55 + hashUnit(`${seed}:gap:${c}`) * 0.85;
    centers.push(ang);
  }
  for (const child of children) {
    const clump = Math.floor(hashUnit(`${child.id}:clump`) * nClumps) % nClumps;
    child.phase = centers[clump]! + (hashUnit(`${child.id}:ph`) - 0.5) * 1.15;
    if (span > 0) child.a = inner + hashUnit(`${child.id}:ra`) * span;
    else child.a *= 0.7 + hashUnit(`${child.id}:ra`) * 0.85;
    paintOrbit(child, SWARM_E0, SWARM_E_SPAN, 0.08, 0.55);
  }
}

function scatterPages(moon: Body): void {
  const kids = moon.children.filter((child) => child.kind === 'page');
  if (kids.length) {
    const inner = moon.r * 1.8;
    const span = Math.max(5, Math.sqrt(kids.length) * 2.8);
    organicizeSwarm(kids, moon.id, inner, span);
  }
  recomputeSysR(moon);
}

function swarmClearance(hostR: number, bodies: Body[]): number {
  const maxSysR = Math.max(0, ...bodies.map((body) => body.sysR));
  return (hostR + maxSysR + ORBIT_GAP) / SWARM_MIN_RADIAL_FACTOR;
}

function clearedSwarmBounds(
  hostR: number,
  bodies: Body[],
  inner0: number,
  span0: number
): { inner: number; span: number } {
  const inner = Math.max(inner0, swarmClearance(hostR, bodies));
  return { inner, span: span0 * (inner / inner0) };
}

function assignMoonOrbits(planet: Body): void {
  const moons = planet.children
    .filter((child) => child.kind === 'moon')
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  if (!moons.length) return;
  const keep =
    moons.length <= 4 ? moons.length : Math.min(4, Math.max(2, moons.length - Math.ceil(moons.length * 0.55)));
  const majorMoons = moons.slice(0, keep);
  const belt = moons.slice(keep);
  const majors = clearedSwarmBounds(
    planet.r,
    majorMoons,
    planet.r * 3.4,
    planet.r * (2.2 + majorMoons.length * 3.4)
  );
  organicizeSwarm(majorMoons, `${planet.id}:majors`, majors.inner, majors.span);
  if (!belt.length) return;
  const beltBounds = clearedSwarmBounds(
    planet.r,
    belt,
    planet.r * (10 + majorMoons.length * 2.2),
    planet.r * (12 + Math.sqrt(belt.length) * 2.2)
  );
  organicizeSwarm(belt, `${planet.id}:moon-belt`, beltBounds.inner, beltBounds.span);
  for (const moon of belt) moon.r = Math.min(moon.r, 2.4);
}

function placePlanets(planets: Body[]): Body[] {
  const bySize = [...planets].sort((a, b) => a.sysR - b.sysR || a.label.localeCompare(b.label));
  const n = bySize.length;
  const arm = hashUnit('solar-arm') * TAU;
  const ranks = bySize.map((_, i) => i);
  if (n >= 4) {
    const swap = 1 + Math.floor(hashUnit('orbit-swap') * (n - 2));
    const left = ranks[swap]!;
    ranks[swap] = ranks[swap - 1]!;
    ranks[swap - 1] = left;
  }
  for (let i = 0; i < n; i++) {
    const planet = bySize[i]!;
    const t = n <= 1 ? 0 : ranks[i]! / (n - 1);
    const jitter = 0.76 + hashUnit(`${planet.id}:a`) * 0.52;
    planet.a = (n <= 1 ? A0 : A0 + (AN - A0) * t ** 1.08) * jitter;
    const wander = hashUnit(`${planet.id}:lon`);
    planet.phase =
      wander < 0.2
        ? hashUnit(`${planet.id}:wander`) * TAU
        : arm + (hashUnit(`${planet.id}:arm`) - 0.5) * 1.38;
    paintOrbit(planet, 0.05, 0.24, 0.06, 0.32);
  }
  for (const planet of bySize) {
    const cap = Math.max(planet.a * 0.82, 80);
    if (planet.sysR > cap) scaleSubtree(planet, cap / planet.sysR, false);
  }
  return bySize;
}

function decorateCharacters(planets: Body[]): void {
  if (!planets.length) return;
  const scored = planets
    .map((planet) => ({
      planet,
      moons: planet.children.filter((child) => child.kind === 'moon').length
    }))
    .sort(
      (a, b) =>
        b.moons - a.moons || b.planet.count - a.planet.count || a.planet.label.localeCompare(b.planet.label)
    );
  const giant = scored[0]!.planet;
  giant.giant = true;
  giant.ringed = true;
  const otherR = Math.max(0, ...planets.filter((planet) => planet !== giant).map((planet) => planet.r));
  giant.r = Math.max(giant.r * 2.5, otherR * 2.2, 28);
  giant.e = 0.035 + hashUnit(`${giant.id}:ge`) * 0.05;
  assignMoonOrbits(giant);
  const saturn = scored[1]?.planet;
  if (saturn && saturn !== giant) saturn.ringed = true;
}

function placeRocks(rocks: Body[], planets: Body[]): void {
  const sorted = [...planets].sort((a, b) => a.a - b.a);
  const beltInner = sorted[1]?.a ? sorted[1].a * 0.82 : 720;
  const beltOuter = sorted[Math.min(4, Math.max(sorted.length - 1, 0))]?.a
    ? sorted[Math.min(4, Math.max(sorted.length - 1, 0))]!.a * 1.12
    : 1680;
  const span = Math.max(beltOuter - beltInner, 1);
  const last = sorted.at(-1)?.a ?? 2200;
  const swarms = [0, 1, 2].map((i) => hashUnit(`rock-swarm:${i}`) * TAU);
  const regions: Array<[number, number]> = [
    [0, 0.28],
    [0.36, 0.58],
    [0.66, 1]
  ];
  const regionLen = regions.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
  for (const rock of rocks) {
    const roll = hashUnit(`${rock.id}:family`);
    if (roll < 0.08 && sorted.length) {
      const host =
        sorted[
          Math.min(sorted.length - 1, 1 + Math.floor(hashUnit(`${rock.id}:t`) * Math.max(sorted.length - 1, 1)))
        ]!;
      rock.a = host.a * (0.97 + hashUnit(`${rock.id}:ta`) * 0.06);
      rock.phase =
        host.phase +
        (hashUnit(`${rock.id}:tp`) < 0.5 ? 1 : -1) * (Math.PI / 3) +
        (hashUnit(`${rock.id}:tj`) - 0.5) * 0.35;
    } else if (roll < 0.16) {
      rock.a = last * (1.18 + hashUnit(`${rock.id}:k`) * 0.7);
      rock.phase = hashUnit(`${rock.id}:kp`) * TAU;
    } else {
      let walk = hashUnit(`${rock.id}:a`) * regionLen;
      let frac = regions[0]![0];
      for (const [lo, hi] of regions) {
        const len = hi - lo;
        if (walk <= len) {
          frac = lo + walk;
          break;
        }
        walk -= len;
      }
      rock.a = beltInner + frac * span;
      const swarm = Math.floor(hashUnit(`${rock.id}:sw`) * 3) % 3;
      rock.phase = swarms[swarm]! + (hashUnit(`${rock.id}:ph`) - 0.5) * 0.68;
    }
    paintOrbit(rock, 0.12, 0.28, 0.18, 0.55);
    rock.r = ROCK_RADIUS * (0.35 + hashUnit(`${rock.id}:r`) * 1.7);
    rock.sysR = rock.r;
  }
}

function flatten(body: Body, parentIdx: number, out: Body[]): void {
  body.idx = out.length;
  body.parent = parentIdx;
  out.push(body);
  for (const child of body.children) flatten(child, body.idx, out);
}

function moonKey(tags: string[]): string[] {
  return universeTags(tags).sort((a, b) => a.localeCompare(b));
}

function ownerOfPage(tags: string[], counts: Map<string, number>, valid: Set<string>): string | null {
  const candidates = universeTags(tags).filter((tag) => valid.has(tag));
  if (!candidates.length) return null;
  return candidates.reduce((best, tag) => (counts.get(tag)! < counts.get(best)! ? tag : best));
}

function applyPeriods(bodies: Body[]): void {
  for (const body of bodies) {
    if (body.parent < 0 || body.a <= 0 || body.kind === 'sun') {
      body.period = 0;
      continue;
    }
    const parent = bodies[body.parent]!;
    const mass = Math.max(massOf(parent), 1);
    let period = Math.max(7, 24 * Math.sqrt(body.a ** 3 / mass));
    if (parent.period > 0 && period >= parent.period * 0.72) {
      period = parent.period * (0.14 + hashUnit(`${body.id}:year`) * 0.42);
    }
    period *= 0.8 + hashUnit(`${body.id}:tempo`) * 0.4;
    if (parent.period > 0) period = Math.min(period, parent.period * 0.7);
    body.period = period;
  }
}

/** Knowledge Hub solar model, fed by task/project tags instead of note keywords. */
export function buildSolarModel(entries: UniverseEntry[]): SolarModel {
  const sun = makeBody({
    id: 'sun:hub',
    kind: 'sun',
    label: 'Adam',
    count: entries.length,
    r: SUN_RADIUS,
    sysR: SUN_RADIUS,
    a: 0,
    phase: 0,
    period: 0,
    color: '#f68620',
    ink: '#6c581f'
  });

  const ranked = rankTags(entries);
  const counts = new Map(ranked.map((item) => [item.tag, item.count]));
  const valid = new Set(ranked.map((item) => item.tag));
  const { majors, minors, ownerOf } = attachMinors(ranked, pairWeights(entries));
  const colorByTag = new Map(ranked.map((item) => [item.tag, paintForTag(item.tag)]));

  const owned = new Map<string, UniverseEntry[]>();
  const rocks: Body[] = [];
  for (const entry of entries) {
    const owner = ownerOfPage(entry.tags, counts, valid);
    if (!owner) {
      rocks.push(
        makeBody({
          id: `rock:${entry.id}`,
          kind: 'rock',
          label: entry.title,
          pageId: entry.id,
          excerpt: entry.excerpt,
          count: 1,
          r: ROCK_RADIUS,
          sysR: ROCK_RADIUS,
          a: 0,
          phase: hashUnit(entry.id) * TAU,
          period: 0,
          color: '#f0cfac',
          ink: '#6c581f'
        })
      );
      continue;
    }
    const list = owned.get(owner) ?? [];
    list.push(entry);
    owned.set(owner, list);
  }

  const minorsByMajor = new Map<string, RankedTag[]>();
  for (const minor of minors) {
    const major = ownerOf.get(minor.tag) ?? majors[0]?.tag;
    if (!major) continue;
    const list = minorsByMajor.get(major) ?? [];
    list.push(minor);
    minorsByMajor.set(major, list);
  }

  function moonsFor(owner: string, paint: TopicPaint): Body[] {
    const pages = owned.get(owner) ?? [];
    const groups = new Map<string, { tags: string[]; pages: UniverseEntry[] }>();
    for (const entry of pages) {
      const tags = moonKey(entry.tags);
      const key = tags.join('\0');
      const group = groups.get(key) ?? { tags, pages: [] };
      group.pages.push(entry);
      groups.set(key, group);
    }
    return [...groups.values()]
      .sort((a, b) => b.pages.length - a.pages.length || a.tags.join(' ').localeCompare(b.tags.join(' ')))
      .map((group) => {
        const kids = group.pages.map((entry) =>
          makeBody({
            id: `page:${entry.id}`,
            kind: 'page',
            label: entry.title,
            pageId: entry.id,
            excerpt: entry.excerpt,
            count: 1,
            r: PAGE_RADIUS * (0.48 + hashUnit(`page-r:${entry.id}`) * 1.2),
            sysR: PAGE_RADIUS * (0.48 + hashUnit(`page-r:${entry.id}`) * 1.2),
            a: 0,
            phase: 0,
            period: 0,
            color: lift(paint.fill, 0.24),
            ink: paint.ink
          })
        );
        const moon = makeBody({
          id: `moon:${owner}:${group.tags.join('+')}`,
          kind: 'moon',
          label: group.tags.join(' + ') || owner,
          count: kids.length,
          r: Math.min(6, Math.max(1.5, Math.sqrt(kids.length) * 0.62)),
          sysR: 0,
          a: 0,
          phase: 0,
          period: 0,
          color: paint.fill,
          ink: paint.ink,
          children: kids
        });
        scatterPages(moon);
        return moon;
      });
  }

  const planets: Body[] = majors.map((major) => {
    const paint = colorByTag.get(major.tag)!;
    const minorBodies = (minorsByMajor.get(major.tag) ?? [])
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .map((minor) => {
        const minorPaint = colorByTag.get(minor.tag)!;
        const moons = moonsFor(minor.tag, minorPaint);
        const body = makeBody({
          id: `minor:${minor.tag}`,
          kind: 'minor',
          label: minor.tag,
          count: minor.count,
          r: Math.max(3.4, Math.sqrt(minor.count) * 0.3),
          sysR: 0,
          a: 0,
          phase: 0,
          period: 0,
          color: minorPaint.fill,
          ink: minorPaint.ink,
          children: moons
        });
        body.sysR = packOrbits(moons, body.r, false);
        return body;
      });
    const ownMoons = moonsFor(major.tag, paint);
    const planet = makeBody({
      id: `planet:${major.tag}`,
      kind: 'planet',
      label: major.tag,
      count: major.count,
      r: Math.max(6, Math.sqrt(major.count) * 0.85),
      sysR: 0,
      a: 0,
      phase: 0,
      period: 0,
      color: paint.fill,
      ink: paint.ink,
      children: [...minorBodies, ...ownMoons]
    });
    packOrbits(minorBodies, planet.r, true);
    for (const minor of minorBodies) {
      paintOrbit(minor, 0.04, 0.16, 0.08, 0.4);
      assignMoonOrbits(minor);
    }
    assignMoonOrbits(planet);
    return planet;
  });

  for (const planet of planets) recomputeSysR(planet);
  decorateCharacters(planets);
  for (const planet of planets) recomputeSysR(planet);
  const bySize = placePlanets(planets);
  placeRocks(rocks, bySize);

  sun.children = [...bySize, ...rocks];
  recomputeSysR(sun);

  const bodies: Body[] = [];
  flatten(sun, -1, bodies);
  applyPeriods(bodies);

  const moons = bodies.filter((body) => body.kind === 'moon');
  const tightest = moons.length ? Math.min(...moons.map((moon) => moon.sysR)) : sun.r;

  return {
    bodies,
    sun,
    planets,
    rocks,
    reach: Math.max(sun.sysR, 1),
    tightest: Math.max(tightest, PAGE_RADIUS)
  };
}

export function buildUniverseModel(tasks: Task[], projects: Project[]): SolarModel {
  return buildSolarModel(entriesFromWork(tasks, projects));
}
