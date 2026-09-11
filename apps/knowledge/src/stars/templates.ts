import type { StarsTemplateId } from "./schema";

export type StarsPoint = { x: number; y: number };
export type StarsSegment = { source: number; target: number };
export type StarsLayout = { points: StarsPoint[]; segments: StarsSegment[] };

export const STARS_TEMPLATE_LABELS: Record<StarsTemplateId, string> = {
  eye: "Eye",
  bridge: "Bridge",
  cycle: "Cycle",
  spiral: "Spiral",
  tree: "Tree",
  compass: "Compass",
};

function chain(count: number): StarsSegment[] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, source) => ({ source, target: source + 1 }));
}

function ring(count: number): StarsSegment[] {
  return [...chain(count), { source: count - 1, target: 0 }];
}

function eye(count: number): StarsLayout {
  const outlineCount = Math.max(4, count - 1);
  const points = Array.from({ length: outlineCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / outlineCount;
    return { x: 0.5 + Math.cos(angle) * 0.39, y: 0.5 + Math.sin(angle) * 0.2 };
  });
  points.push({ x: 0.5, y: 0.5 });
  const centre = points.length - 1;
  return {
    points: points.slice(0, count),
    segments: [...ring(outlineCount), { source: 0, target: centre }, { source: Math.floor(outlineCount / 2), target: centre }],
  };
}

function bridge(count: number): StarsLayout {
  const points = Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return { x: 0.1 + t * 0.8, y: 0.68 - Math.sin(Math.PI * t) * 0.34 };
  });
  return { points, segments: chain(count) };
}

function cycle(count: number): StarsLayout {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return { x: 0.5 + Math.cos(angle) * 0.3, y: 0.5 + Math.sin(angle) * 0.34 };
  });
  return { points, segments: ring(count) };
}

function spiral(count: number): StarsLayout {
  const points = Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    const angle = Math.PI * 0.2 + t * Math.PI * 3.2;
    const radius = 0.06 + t * 0.34;
    return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius * 0.84 };
  });
  return { points, segments: chain(count) };
}

function tree(count: number): StarsLayout {
  const levels = [1, 2, Math.max(2, count - 3)];
  const points: StarsPoint[] = [];
  let used = 0;
  levels.forEach((size, level) => {
    const available = Math.min(size, count - used);
    for (let index = 0; index < available; index += 1) {
      points.push({
        x: available === 1 ? 0.5 : 0.16 + (0.68 * index) / (available - 1),
        y: 0.18 + level * 0.3,
      });
    }
    used += available;
  });
  const segments = points.slice(1).map((_, index) => ({
    source: Math.max(0, Math.floor(index / 2)),
    target: index + 1,
  }));
  return { points, segments };
}

function compass(count: number): StarsLayout {
  const points: StarsPoint[] = [{ x: 0.5, y: 0.5 }];
  for (let index = 1; index < count; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * (index - 1)) / (count - 1);
    points.push({ x: 0.5 + Math.cos(angle) * 0.34, y: 0.5 + Math.sin(angle) * 0.34 });
  }
  const segments = points.slice(1).map((_, index) => ({ source: 0, target: index + 1 }));
  if (count > 5) segments.push(...ring(count - 1).map(segment => ({ source: segment.source + 1, target: segment.target + 1 })));
  return { points, segments };
}

export function buildStarsLayout(templateId: StarsTemplateId, noteCount: number): StarsLayout {
  const count = Math.min(10, Math.max(5, Math.round(noteCount)));
  if (templateId === "eye") return eye(count);
  if (templateId === "bridge") return bridge(count);
  if (templateId === "cycle") return cycle(count);
  if (templateId === "spiral") return spiral(count);
  if (templateId === "tree") return tree(count);
  return compass(count);
}

export function templateForQuery(query: string): StarsTemplateId {
  const value = query.toLowerCase();
  if (/read|vision|perspective|view|literacy/.test(value)) return "eye";
  if (/change|cycle|development|process|loop/.test(value)) return "cycle";
  if (/lead|direction|decision|strategy/.test(value)) return "compass";
  if (/connect|transition|bridge|transfer/.test(value)) return "bridge";
  if (/growth|branch|differentiat|taxonomy/.test(value)) return "tree";
  return "spiral";
}
