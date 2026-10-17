/**
 * Line-art glyphs for the seven analogy blocks: 256px grid, 12px round stroke,
 * the same stroke as the lesson block icons. The PNGs in
 * `public/assets/blocks/analogy_*.png` are rendered from these, and the block
 * card draws them inline so the picker and the page match.
 */

import type { AnalogyMoveType } from '@/toolkit/analogy-moves';

export const ANALOGY_ICON_BODY: Record<AnalogyMoveType, string> = {
  // A bridge: an arch and a deck between two piers.
  analogy_close_reading:
    '<path d="M24 172H232"/><path d="M44 172Q128 52 212 172"/><path d="M68 172V212M188 172V212"/><path d="M100 124V172M128 112V172M156 124V172"/>',
  // The same three-step pattern, found again lower down.
  analogy_pattern:
    '<path d="M36 52l28 28-28 28M96 52l28 28-28 28M156 52l28 28-28 28"/><path d="M72 148l28 28-28 28M132 148l28 28-28 28M192 148l28 28-28 28" stroke-dasharray="1 22"/>',
  // A test: holds on one side, breaks on the other.
  analogy_reverse:
    '<path d="M128 52V204"/><path d="M40 128l26 26 42-52"/><path d="M156 100l56 56M212 100l-56 56"/>',
  // Out to another field and back.
  analogy_problem:
    '<rect x="28" y="64" width="44" height="44" rx="10"/><path d="M72 86H176a42 42 0 0 1 0 84H88"/><path d="M108 150l-20 20 20 20"/>',
  // A metaphor and the ripples that spread from it.
  analogy_metaphor:
    '<circle cx="80" cy="128" r="18"/><path d="M122 92a52 52 0 0 1 0 72"/><path d="M152 66a88 88 0 0 1 0 124"/><path d="M184 42a122 122 0 0 1 0 172" stroke-dasharray="2 24"/>',
  // A rule, carried down into three new places.
  analogy_transfer:
    '<path d="M56 52H200"/><path d="M128 52V108M64 108H192M64 108V140M128 108V140M192 108V140"/><rect x="40" y="140" width="48" height="48" rx="10"/><rect x="104" y="140" width="48" height="48" rx="10"/><rect x="168" y="140" width="48" height="48" rx="10"/>',
  // Three links of a chain.
  analogy_chains:
    '<rect x="20" y="104" width="96" height="48" rx="24"/><rect x="80" y="104" width="96" height="48" rx="24"/><rect x="140" y="104" width="96" height="48" rx="24"/>'
};

export function analogyIconSvg(type: AnalogyMoveType, stroke = 'currentColor'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" stroke="${stroke}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">${ANALOGY_ICON_BODY[type]}</svg>`;
}
