#!/usr/bin/env node
// scripts/print-thinking-map-links.mjs
// Prints the thinking map's new links (packages/thinking-map/links.mjs) as a markdown table
// for review: from, to, why. Names come from the map, so the table reads without ids.
import { NEW_LINKS, getOption, getTool, PROTOCOL_TOOL } from '../packages/thinking-map/index.mjs';

const toolName = (id) => (id === PROTOCOL_TOOL ? 'Protocol' : getTool(id)?.name ?? id);
const label = (id) => {
  const option = getOption(id);
  if (!option) return `${id} (unknown)`;
  return option.kind === 'tool' || option.kind === 'protocol' ? `${option.title}` : `${toolName(option.tool)}: ${option.title}`;
};
const cell = (text) => String(text).replace(/\|/g, '\\|');

const lines = ['| From | To | Why |', '| --- | --- | --- |'];
for (const link of NEW_LINKS) lines.push(`| ${cell(label(link.from))} | ${cell(label(link.to))} | ${cell(link.why)} |`);
console.log(`${lines.join('\n')}\n\n${NEW_LINKS.length} new links.`);
