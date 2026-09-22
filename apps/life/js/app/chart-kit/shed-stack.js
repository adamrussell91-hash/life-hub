/**
 * shed-stack — today's weight as a stack of one-kilogram blocks. Every kilogram
 * shed since the heaviest weigh-in falls off the top of the stack and lands in a
 * pile beside it, coloured by the year it went. Dashed outlines keep the height
 * the stack used to reach. Blocks still above the target band are tinted.
 */
import { formatDisplayDate } from '../../core/time.js';
import { formatNumber, fx, monthShort, node, text } from './scene.js';

const LABEL_W = 92;
const MAX_ROWS = 14;
const FALL_MS = 640;
/** Newest year darkest. Classes map to token colours in app.css. */
const YEAR_CLASSES = ['bc-shed--3', 'bc-shed--2', 'bc-shed--1', 'bc-shed--0'];

const monthYear = date => `${monthShort(date)} ${date.slice(0, 4)}`;

function message(width, label, readout) {
  return {
    width,
    height: 64,
    label,
    readout,
    nodes: [text(0, 30, readout, { size: 12, cls: 'hc-text hc-text--muted' })],
    hits: {}
  };
}

export function buildShedStack(chart, { width = 520 } = {}) {
  const label = 'Weight as a stack of one-kilogram blocks, with every kilogram shed since your heaviest in a pile beside it.';
  if (chart?.status !== 'ready') return message(width, label, chart?.reason ?? 'No weigh-ins yet.');

  const top = Math.floor(chart.peak.kg);
  const now = Math.floor(chart.current.kg);
  const cols = Math.max(10, Math.ceil(top / MAX_ROWS));
  const step = Math.max(8, Math.min(15, Math.floor((width - 16 - LABEL_W) / (cols * 2))));
  const cell = step - 2;
  const rows = Math.ceil(top / cols);
  const stackX = 8;
  const heapX = stackX + cols * step + LABEL_W;
  const padTop = 10;
  const base = padTop + rows * step;
  const height = base + 36;
  const pos = (index, x0) => [x0 + (index % cols) * step, base - (Math.floor(index / cols) + 1) * step + 2];
  const band = chart.band;
  const nodes = [];
  const hits = {};

  nodes.push(node('line', { x1: 2, x2: fx(width - 2), y1: fx(base + 1.5), y2: fx(base + 1.5) }, { cls: 'bc-ground' }));

  // The stack that is you.
  for (let kg = 1; kg <= now; kg += 1) {
    const [x, y] = pos(kg - 1, stackX);
    const tone = band && kg > band.high ? ' bc-block--above' : band && kg > band.low ? ' bc-block--band' : '';
    nodes.push(node('rect', { x: fx(x), y: fx(y), width: cell, height: cell, rx: 2 }, { cls: `bc-block${tone}` }));
  }
  const part = chart.current.kg - now;
  if (part > 0.05) {
    const [x, y] = pos(now, stackX);
    const tone = band && now + 1 > band.high ? ' bc-block--above' : '';
    nodes.push(node('rect', { x: fx(x), y: fx(y + cell * (1 - part)), width: cell, height: fx(cell * part), rx: 1.5 }, { cls: `bc-block${tone}` }));
  }
  const [, stackTop] = pos(Math.max(0, now - 1), stackX);
  nodes.push(node('rect', {
    x: stackX - 2, y: fx(stackTop - 2), width: cols * step + 2, height: fx(base - stackTop + 2)
  }, { cls: 'hc-hitpad-fill', hit: 'stack' }));
  hits.stack = {
    id: 'stack',
    title: `${formatNumber(chart.current.kg, 1)} kg today`,
    lines: [
      band ? (chart.aboveBandKg > 0 ? `${formatNumber(chart.aboveBandKg, 1)} kg above the ${band.low}–${band.high} kg band` : `In the ${band.low}–${band.high} kg band`) : null,
      'One block is one kilogram'
    ].filter(Boolean),
    detail: `Today ${formatNumber(chart.current.kg, 1)} kg.${band && chart.aboveBandKg > 0 ? ` The tinted blocks are the ${formatNumber(chart.aboveBandKg, 1)} kg still above the band.` : ''}`
  };

  // The pile, falling in from where each block used to sit.
  const per = Math.min(55, 1700 / chart.blocks.length);
  const yearIndex = new Map(chart.years.map((year, i) => [year, chart.years.length - 1 - i]));
  chart.blocks.forEach((block, j) => {
    const [sx, sy] = pos(block.kg - 1, stackX);
    const [hx, hy] = pos(j, heapX);
    const delay = Math.round(j * per);
    nodes.push(node('rect', { x: fx(sx + 0.5), y: fx(sy + 0.5), width: cell - 1, height: cell - 1, rx: 2 }, {
      cls: 'bc-ghost', anim: 'fade', delay: delay + 60, dur: 200
    }));
    const id = `shed-${block.kg}`;
    nodes.push(node('rect', {
      x: fx(hx), y: fx(hy), width: cell, height: cell, rx: 2,
      style: `--hc-dx:${fx(sx - hx)}px;--hc-dy:${fx(sy - hy)}px`
    }, {
      cls: `bc-shed ${YEAR_CLASSES[Math.min(3, yearIndex.get(block.date.slice(0, 4)))]}`,
      hit: id, anim: 'fall', delay, dur: FALL_MS
    }));
    hits[id] = {
      id,
      title: `Below ${block.kg} kg`,
      lines: [`First on ${formatDisplayDate(block.date)}`, `${block.weeks} week${block.weeks === 1 ? '' : 's'} after your heaviest`],
      detail: `You first weighed in below ${block.kg} kg on ${formatDisplayDate(block.date)}, ${block.weeks} weeks after your heaviest.`
    };
  });

  // Labels between the stack and the pile.
  const lx = stackX + cols * step + 6;
  const rowY = kg => pos(kg - 1, stackX)[1] + cell / 2 + 3.5;
  nodes.push(text(lx, rowY(top), `${formatNumber(chart.peak.kg, 1)} heaviest`, { size: 10, cls: 'hc-text hc-text--muted' }));
  nodes.push(text(lx, rowY(now), `${formatNumber(chart.current.kg, 1)} today`, { size: 11, weight: 700 }));
  if (band && band.low < now - 2) {
    nodes.push(text(lx, rowY(band.low) + 4, `${band.low}–${band.high} band`, { size: 10, weight: 600, cls: 'hc-text hc-text--band' }));
  }
  nodes.push(text(stackX, base + 16, 'You · 1 block = 1 kg', { size: 10, cls: 'hc-text hc-text--muted' }));

  const heapRows = Math.ceil(chart.blocks.length / cols);
  const heapTop = base - heapRows * step;
  const settle = Math.round(chart.blocks.length * per + FALL_MS);
  nodes.push(text(heapX, heapTop - 22, `${formatNumber(chart.shedKg, 1)} kg shed`, { size: 14, weight: 700, anim: 'fade', delay: settle }));
  nodes.push(text(heapX, heapTop - 8, `since ${monthYear(chart.peak.date)}`, { size: 10, cls: 'hc-text hc-text--muted', anim: 'fade', delay: settle }));
  let legendX = heapX;
  const legendStep = Math.min(46, (width - heapX - 4) / Math.max(1, chart.years.length));
  for (const year of chart.years) {
    nodes.push(node('rect', { x: fx(legendX), y: fx(base + 8), width: 9, height: 9, rx: 2 }, {
      cls: `bc-shed ${YEAR_CLASSES[Math.min(3, yearIndex.get(year))]}`
    }));
    nodes.push(text(legendX + 12, base + 16, year, { size: 10, cls: 'hc-text hc-text--muted' }));
    legendX += legendStep;
  }

  return {
    width,
    height,
    label,
    readout: `${chart.blocks.length} blocks in the pile, one for each whole kilogram passed since ${monthYear(chart.peak.date)}.${band && chart.aboveBandKg > 0 ? ` ${Math.ceil(chart.aboveBandKg)} tinted blocks left above the band.` : ''} Tap a fallen block for the day it went.`,
    nodes,
    hits
  };
}
