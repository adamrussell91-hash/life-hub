import { isCurriculumLinesV2, type CurriculumLinesBlock } from '@/schemas/block';
import './curriculum-lines.css';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { mountNetworkStage, networkLegend } from '@/network/draw';
import { buildUnitNetwork, convertV1, withStops, type NetLesson } from '@/network/model';
import type { NetInput } from '@/network/layout';
import { loadAlignment, mountCoveragePanel } from '@/alignment/coverage-panel';
import { focusAreaFor } from '@/alignment/coverage';
import { buildCoverageMap, type CoverageMapInput } from '@/network/coverage-map/model';
import { mountCoverageMap } from '@/network/coverage-map/mount';

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
  return buildUnitNetwork(content, lines, lessons, network?.bands, network?.dates);
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
    empty.className = 'block-empty';
    empty.textContent = mode === 'student'
      ? 'This map has no lessons yet.'
      : 'No lines or lessons yet. Add this subject’s lines, then tag each lesson with the lines it serves.';
    root.append(empty);
    return root;
  }
  const label = title ? `Curriculum map: ${title}` : 'Unit curriculum map';
  if (mode === 'student' || !ctx.network) root.append(mountNetworkStage(input, { print: mode === 'print', label }), networkLegend('unit'));
  else mountTeacherMap(root, block, ctx.network, mode === 'print', label);
  // Teachers see what the lines cover in the syllabus, under the map.
  if (mode === 'teacher' && ctx.network) {
    mountCoveragePanel(root, {
      lines: ctx.network.lines,
      lessons: ctx.network.lessons.map((l) => ({ id: l.id, title: l.title, line_stops: l.line_stops ?? [], dot_points: l.dot_points ?? [] })),
      unitTitle: ctx.network.unitTitle,
      ...(isCurriculumLinesV2(block.content) && block.content.focus_area ? { focusArea: block.content.focus_area } : {})
    });
  }
  return root;
}

/**
 * Teachers see the coverage map: lessons down the page with support,
 * extension and options beside the core route, and a branch per syllabus
 * item. The dot points arrive with the alignment, after the first paint.
 */
function mountTeacherMap(root: HTMLElement, block: CurriculumLinesBlock, network: NonNullable<RenderContext['network']>, print: boolean, label: string): void {
  let content = block.content;
  let lines = network.lines;
  let lessons = network.lessons;
  if (!isCurriculumLinesV2(content)) {
    const converted = convertV1(content, lines, lessons, block.id);
    content = converted.content;
    lines = converted.lines;
    lessons = withStops(lessons, converted.lessonStops);
  }
  const base: CoverageMapInput = {
    content,
    lines,
    lessons,
    ...(network.bands ? { bands: network.bands } : {}),
    ...(network.dates ? { dates: network.dates } : {})
  };
  const host = document.createElement('div');
  root.append(host);
  const view = mountCoverageMap(host, {
    map: buildCoverageMap(base),
    label,
    print,
    ...(network.classes?.length && network.loadClass ? { classes: network.classes, loadClass: network.loadClass } : {}),
    ...(network.saveTook ? { saveTook: network.saveTook } : {})
  });
  if (!network.usesAlignment) return;
  const focus = isCurriculumLinesV2(block.content) ? block.content.focus_area : undefined;
  void loadAlignment()
    .then((doc) => {
      const area = focusAreaFor(doc, network.unitTitle, focus);
      const points = area ? doc.focus_areas.find((f) => f.id === area.id)?.points ?? [] : [];
      if (area && points.length) view.update(buildCoverageMap({ ...base, points: { area: area.id, points } }));
    })
    .catch(() => { /* No alignment: the map keeps its lines. */ });
}
