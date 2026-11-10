// apps/tasks/src/views/thinking/map.ts
// Typed access to the thinking map (packages/thinking-map): names for options and tools, and the
// no-AI shortlist the Detour menu offers.
import { getOption, shortlist, signalsFromText, TOOLS, PROTOCOLS } from '../../../../../packages/thinking-map/index.mjs';
import { catalog as PROTOCOL_CATALOG } from '../../../../../config/knowledge/cognitive/definitions.mjs';

export type MapOption = { id: string; tool: string; kind: 'tool' | 'model' | 'chapter' | 'protocol'; title: string; when: string; signals: readonly string[]; links: readonly string[] };

export const PROTOCOL_TOOL = 'knowledge-protocols';

export const option = (id: string): MapOption | null => (getOption(id) as MapOption | null) ?? null;

/** A tool's display name ("Decision Maker"); protocols are "Protocol". */
export function toolName(toolId: string): string {
  if (toolId === PROTOCOL_TOOL) return 'Protocol';
  return (TOOLS as readonly { id: string; name: string }[]).find((t) => t.id === toolId)?.name ?? toolId;
}

/** Where a tool opens in Tasks, or null for protocols. */
export function toolRoute(toolId: string): string | null {
  return (TOOLS as readonly { id: string; route: string }[]).find((t) => t.id === toolId)?.route ?? null;
}

/** "Decision Maker" for a tool-level option, "Decision Maker: Pareto" for a model, a protocol's own name. */
export function optionLabel(id: string): string {
  const o = option(id);
  if (!o) return id;
  if (o.kind === 'tool' || o.kind === 'protocol') return o.title;
  return `${toolName(o.tool)}: ${o.title}`;
}

export function isProtocolOption(id: string): boolean {
  return id.startsWith('protocol:');
}

/** The mode's label in the protocol catalogue ("Sprint"), or the id. */
export function modeLabel(protocolId: string, mode: string): string {
  const def = (PROTOCOL_CATALOG as { id: string; modes: { id: string; label: string }[] }[]).find((p) => p.id === protocolId);
  return def?.modes.find((m) => m.id === mode)?.label ?? mode;
}

export const protocolName = (protocolId: string): string => (PROTOCOLS as readonly { id: string; name: string }[]).find((p) => p.id === protocolId)?.name ?? protocolId;

/**
 * Options the Detour menu offers from a step: the map's shortlist for the thread's situation
 * and the step's text, excluding tools already in the thread and what was said Not now to here.
 * No AI call.
 */
export function detourChoices(opts: { text: string; fromOptionId: string | null; exclude: string[]; limit?: number }): MapOption[] {
  const pick = shortlist as unknown as (o: { signals: string[]; fromOptionId: string | null; exclude: string[]; limit: number }) => MapOption[];
  return pick({ signals: signalsFromText(opts.text) as string[], fromOptionId: opts.fromOptionId, exclude: opts.exclude, limit: opts.limit ?? 8 });
}
