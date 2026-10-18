/**
 * Line-art glyphs for the seven analogy blocks: 256px grid, 10px round stroke,
 * the same stroke as the lesson block icons. The SVGs in
 * `public/assets/blocks/analogy_*.svg` are rendered from these, and the block
 * card draws them inline so the picker and the page match.
 */

import type { AnalogyMoveType } from '@/toolkit/analogy-moves';

export const ANALOGY_ICON_BODY: Record<AnalogyMoveType, string> = {
  analogy_close_reading:
    '<path d="M128 66c-26-20-64-24-100-12v142c36-12 74-8 100 12 26-20 64-24 100-12V54c-36-12-74-8-100 12Zm0 0v64M52 84h42M52 108h30M164 84h40M174 108h30"/><path d="M88 158h80m-16-16 16 16-16 16m-48-32-16 16 16 16"/>',
  analogy_pattern:
    '<rect x="30" y="38" width="196" height="70" rx="14"/><rect x="30" y="148" width="196" height="70" rx="14"/><circle cx="66" cy="73" r="13"/><path d="m110 86 17-26 17 26Z"/><rect x="174" y="60" width="26" height="26" rx="4"/><circle cx="66" cy="183" r="13"/><path d="m110 196 17-26 17 26Z"/><rect x="174" y="170" width="26" height="26" rx="4"/><path d="M128 112v32m-12-12 12 12 12-12"/>',
  analogy_reverse:
    '<rect x="42" y="38" width="172" height="184" rx="18"/><path d="M92 38v-8h72v32H92ZM128 88v108M62 160h132"/><path d="m67 118 13 13 24-28M155 107l28 28m0-28-28 28M66 183h34M154 183h34"/>',
  analogy_problem:
    '<rect x="28" y="38" width="76" height="84" rx="12"/><path d="M48 62h36M48 84h24M104 80h65q43 0 43 43t-43 43h-29m16-16-16 16 16 16"/><rect x="28" y="150" width="76" height="76" rx="12"/><path d="m48 188 12 12 25-28M140 166h-30"/>',
  analogy_metaphor:
    '<rect x="28" y="42" width="114" height="146" rx="14"/><path d="M52 70h65M52 94h48M52 118h26"/><circle cx="165" cy="157" r="55"/><path d="m205 198 27 29M143 158l16 16 28-34"/>',
  analogy_transfer:
    '<rect x="79" y="28" width="98" height="70" rx="12"/><path d="m105 62 15 15 29-30M128 98v32M56 150v-20h144v20m-157-12 13 12 13-12m118 0 13 12 13-12"/><rect x="24" y="164" width="64" height="64" rx="12"/><circle cx="200" cy="196" r="32"/><path d="m44 195 10 10 17-22m110 12 10 10 17-22"/>',
  analogy_chains:
    '<path d="m103 82 25-25a38 38 0 0 1 54 54l-25 25M99 120l-25 25a38 38 0 0 0 54 54l25-25M100 156l56-56"/><path d="M41 58h28M55 44v28M186 194h30m-15-15v30"/>'
};

export function analogyIconSvg(type: AnalogyMoveType, stroke = 'currentColor'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${ANALOGY_ICON_BODY[type]}</svg>`;
}
