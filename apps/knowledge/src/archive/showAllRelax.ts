/**
 * The neural map's final shape: the branching seed (showAllNeural.ts) relaxed with forces —
 * backbone links pull tight, cross-links pull gently, notes push apart locally, and a soft pull to
 * the centre gathers everything into one round mass. This is what makes it read as neurons.
 *
 * It runs off-screen (in a worker in the browser) for a fixed number of ticks, so the reader never
 * sees it move, and it is deterministic: same seed in, same picture out.
 */
import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";

export const RELAX_TICKS = 170;
const CENTRE = { x: 760, y: 560 };

export type RelaxNode = { id: string; x: number; y: number };
export type RelaxLink = { source: string; target: string; backbone: boolean };
export type RelaxShape = { spread: number; gather: number };

type SimNode = RelaxNode & { vx?: number; vy?: number; index?: number };

export function relaxNeural(
  input: RelaxNode[],
  links: RelaxLink[],
  shape: RelaxShape = { spread: 1, gather: 1 },
  ticks = RELAX_TICKS,
): Float64Array {
  const nodes: SimNode[] = input.map(node => ({ id: node.id, x: node.x, y: node.y }));
  const ids = new Set(nodes.map(node => node.id));
  const simLinks = links
    .filter(link => ids.has(link.source) && ids.has(link.target))
    .map(link => ({ ...link }));
  const pull = 0.04 * shape.gather;
  forceSimulation<SimNode>(nodes)
    .stop()
    .alpha(0.6)
    .alphaDecay(0.03)
    .velocityDecay(0.35)
    .force(
      "link",
      forceLink<SimNode, RelaxLink & { source: string | SimNode; target: string | SimNode }>(simLinks)
        .id(node => node.id)
        .distance(link => (link.backbone ? 14 : 30) * shape.spread)
        .strength(link => (link.backbone ? 0.9 : 0.15)),
    )
    // Spread lengthens links only; repulsion stays put, so the texture loosens rather than just scaling.
    .force("charge", forceManyBody<SimNode>().strength(-20).distanceMax(160).theta(1.2))
    .force("x", forceX<SimNode>(CENTRE.x).strength(pull))
    .force("y", forceY<SimNode>(CENTRE.y).strength(pull))
    .tick(ticks);
  const out = new Float64Array(nodes.length * 2);
  nodes.forEach((node, i) => {
    out[i * 2] = node.x;
    out[i * 2 + 1] = node.y;
  });
  return out;
}

export type RelaxRequest = { token: number; nodes: RelaxNode[]; links: RelaxLink[]; shape: RelaxShape };
export type RelaxReply = { token: number; positions: Float64Array };

/** Stable cache key for a seed + links + shape, so returning to the map is instant. */
export function relaxKey(nodes: RelaxNode[], links: RelaxLink[], shape: RelaxShape) {
  let hash = 2166136261;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const node of nodes) mix(`${node.id}:${node.x.toFixed(1)},${node.y.toFixed(1)};`);
  for (const link of links) mix(`${link.source}>${link.target}${link.backbone ? "b" : "c"};`);
  mix(`${shape.spread.toFixed(3)}|${shape.gather.toFixed(3)}`);
  return `${nodes.length}:${links.length}:${(hash >>> 0).toString(36)}`;
}
