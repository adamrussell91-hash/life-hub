import { chooseStarsTemplate, STARS_TEMPLATE_LABELS as TEMPLATE_LABELS } from "./chooseTemplate.mjs";
import type { StarsTemplateId } from "./schema";

export type StarsPoint = { x: number; y: number };
export type StarsSegment = { source: number; target: number };
export type StarsLayout = { points: StarsPoint[]; segments: StarsSegment[] };

export const STARS_TEMPLATE_LABELS = TEMPLATE_LABELS as Record<StarsTemplateId, string>;
export { chooseStarsTemplate };

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
    return { x: 0.5 + Math.cos(angle) * 0.44, y: 0.5 + Math.sin(angle) * 0.16 };
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
    return { x: 0.06 + t * 0.88, y: 0.78 - Math.sin(Math.PI * t) * 0.56 };
  });
  return { points, segments: chain(count) };
}

function cycle(count: number): StarsLayout {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return { x: 0.5 + Math.cos(angle) * 0.36, y: 0.5 + Math.sin(angle) * 0.36 };
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
  const yForLevel = [0.84, 0.5, 0.14];
  levels.forEach((size, level) => {
    const available = Math.min(size, count - used);
    for (let index = 0; index < available; index += 1) {
      points.push({
        x: available === 1 ? 0.5 : 0.12 + (0.76 * index) / (available - 1),
        y: yForLevel[level] ?? 0.14,
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
    if (index <= 4) {
      const angle = -Math.PI / 2 + ((index - 1) * Math.PI) / 2;
      points.push({ x: 0.5 + Math.cos(angle) * 0.4, y: 0.5 + Math.sin(angle) * 0.4 });
      continue;
    }
    const extra = index - 5;
    const extraCount = Math.max(1, count - 5);
    const angle = -Math.PI / 2 + Math.PI / 4 + (Math.PI * 2 * extra) / extraCount;
    points.push({ x: 0.5 + Math.cos(angle) * 0.2, y: 0.5 + Math.sin(angle) * 0.2 });
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
  return chooseStarsTemplate({ query });
}
