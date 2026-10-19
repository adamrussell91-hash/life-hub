import { isCurriculumLinesV2, type CurriculumLinesBlock } from '@/schemas/block';
import './curriculum-lines.css';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { mountNetworkStage, networkLegend } from '@/network/draw';
import { buildUnitNetwork, convertV1, withStops, type NetLesson } from '@/network/model';
import type { NetInput } from '@/network/layout';

/** The map's input for this viewer. Version 1 blocks are converted in memory, never saved here. */
export function unitNetworkInput(block: CurriculumLinesBlock, ctx: RenderContext): NetInput {
  const network = ctx.network;
  let lines = network?.lines ?? [];
  let lessons: NetLesson[] = network?.lessons ?? (ctx.unitLessons ?? []).map((l) => ({ id: l.id, title: l.title, href: l.href }));
  let content = block.content;
  if (!isCurriculumLinesV2(content)) {
    const converted = convertV1(content, lines, lessons, block.id);
    content = converted.content;
    lines = converted.lines;
    lessons = withStops(lessons, converted.lessonStops);
  }
  return buildUnitNetwork(content, lines, lessons, network?.bands);
}

export function renderCurriculumLines(block: CurriculumLinesBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = document.createElement('section');
  root.className = 'block block-curriculum-lines';
  root.dataset.blockId = block.id;
  const title = block.content.title?.trim();
  if (title) {
    const h = document.createElement('h3');
    h.className = 'cl-title';
    h.textContent = title;
    root.append(h);
  }
  const input = unitNetworkInput(block, ctx);
  if (!input.lines.length && !input.rows.length) {
    const empty = document.createElement('p');
    empty.className = 'net-empty';
    empty.textContent = mode === 'student'
      ? 'This map has no lessons yet.'
      : 'No lines or lessons yet. Add this subject’s lines, then tag each lesson with the lines it serves.';
    root.append(empty);
    return root;
  }
  root.append(
    mountNetworkStage(input, { print: mode === 'print', label: title ? `Curriculum map: ${title}` : 'Unit curriculum map' }),
    networkLegend('unit')
  );
  return root;
}
