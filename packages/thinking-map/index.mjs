// packages/thinking-map/index.mjs
// The thinking map: one registry of every option a thread can move to (the eight Tasks
// thinking tools, every model in their catalogues, Problem Solver's process models, the
// Thought Starter chapters and the eight Knowledge protocols), with signals and links. Pure
// data, no AI. The guide may only choose from `shortlist`.
//
// Option ids: `tool:<toolId>`, `protocol:<protocolId>`, `ps:<modelId>`, and every catalogue
// model or chapter under its own id (`dm_record`-style ids are never renamed). Every option has a
// family (families.mjs; null for tool-level options). Snares (snares.mjs) are not options.
import { MODELS, MODEL_IDS } from '../problem-solver/models.mjs';
import { TOOLS as PS_TOOLS } from '../problem-solver/tools/index.mjs';
import { CATALOGUE as DECISION_CATALOGUE } from '../decision-book/catalogue.mjs';
import { CATALOGUE as GEAR_CATALOGUE } from '../get-things-done/catalogue.mjs';
import { CATALOGUE as RULES_CATALOGUE } from '../rules-book/catalogue.mjs';
import { CATALOGUE as CHANGE_CATALOGUE } from '../change-book/catalogue.mjs';
import { CATALOGUE as COLLAB_CATALOGUE } from '../collaboration-book/catalogue.mjs';
import { CATALOGUE as COMM_CATALOGUE } from '../communication-book/catalogue.mjs';
import { CHAPTERS as QUESTION_CHAPTERS } from '../question-book/catalogue.mjs';
import { catalog as PROTOCOL_CATALOG } from '../../config/knowledge/cognitive/definitions.mjs';
import {
  ID_SIGNALS, PROTOCOL_SIGNALS, PROTOCOL_WHEN, PS_MODEL_SIGNALS, SECTION_SIGNALS, SIGNAL_IDS,
  SIGNAL_KEYWORDS, TOOL_SIGNALS, TOOL_WHEN
} from './signals.mjs';
import { NEW_LINKS } from './links.mjs';
import { FAMILIES, familyOf } from './families.mjs';
import { SNARES, getSnare, snaresFor } from './snares.mjs';

export { NEW_LINKS, FAMILIES, SNARES, getSnare, snaresFor };

export const SIGNALS = Object.freeze([...SIGNAL_IDS]);

/** The eight thinking tools, in nav order, with their display names (Phase 0) and routes. */
export const TOOLS = Object.freeze([
  Object.freeze({ id: 'problem-solver', name: 'Problem Solver', route: '#/problem-solver' }),
  Object.freeze({ id: 'decision-book', name: 'Decision Maker', route: '#/decision-maker' }),
  Object.freeze({ id: 'get-things-done', name: 'Gear Shifter', route: '#/gear-shifter' }),
  Object.freeze({ id: 'rules-book', name: 'Wayfinder', route: '#/rules-book' }),
  Object.freeze({ id: 'change-book', name: 'Change Navigator', route: '#/change-book' }),
  Object.freeze({ id: 'collaboration-book', name: 'Team Builder', route: '#/collaboration-book' }),
  Object.freeze({ id: 'communication-book', name: 'Conversation Guide', route: '#/communication-book' }),
  Object.freeze({ id: 'question-book', name: 'Thought Starter', route: '#/question-book' })
]);

/** The eight Knowledge protocols. */
export const PROTOCOLS = Object.freeze(PROTOCOL_CATALOG.map((p) => Object.freeze({ id: p.id, name: p.name })));

/** The tool id protocol options belong to. */
export const PROTOCOL_TOOL = 'knowledge-protocols';

export const getTool = (id) => TOOLS.find((t) => t.id === id) ?? null;

const CATALOGUES = Object.freeze([
  ['decision-book', DECISION_CATALOGUE],
  ['get-things-done', GEAR_CATALOGUE],
  ['rules-book', RULES_CATALOGUE],
  ['change-book', CHANGE_CATALOGUE],
  ['collaboration-book', COLLAB_CATALOGUE],
  ['communication-book', COMM_CATALOGUE]
]);

const uniq = (list) => [...new Set(list)];

function build() {
  const raw = [];
  const push = (option, rawLinks = []) => raw.push({ ...option, rawLinks });

  for (const tool of TOOLS) {
    push({ id: `tool:${tool.id}`, tool: tool.id, kind: 'tool', title: tool.name, when: TOOL_WHEN[tool.id] ?? '', signals: TOOL_SIGNALS[tool.id] ?? [] });
  }
  for (const id of MODEL_IDS) {
    const model = MODELS[id];
    push({ id: `ps:${id}`, tool: 'problem-solver', kind: 'model', title: model.name, when: model.when ?? '', signals: [...(PS_MODEL_SIGNALS[id] ?? []), ...(ID_SIGNALS[`ps:${id}`] ?? [])] });
  }
  for (const [tool, catalogue] of CATALOGUES) {
    for (const entry of catalogue) {
      const def = PS_TOOLS[entry.id];
      push(
        {
          id: entry.id,
          tool,
          kind: 'model',
          title: entry.title,
          when: def?.when ?? ID_WHEN_FALLBACK,
          signals: [...(SECTION_SIGNALS[tool]?.[entry.section] ?? []), ...(ID_SIGNALS[entry.id] ?? [])]
        },
        [...(entry.pairsWell ?? []), ...(entry.seeAlso ?? []), ...(def?.pairsWell ?? [])]
      );
    }
  }
  for (const chapter of QUESTION_CHAPTERS) {
    if (chapter.kind !== 'questions') continue;
    push({ id: chapter.id, tool: 'question-book', kind: 'chapter', title: chapter.title, when: chapter.when ?? '', signals: [...(SECTION_SIGNALS['question-book'][chapter.group] ?? []), ...(ID_SIGNALS[chapter.id] ?? [])] });
  }
  for (const protocol of PROTOCOL_CATALOG) {
    push({ id: `protocol:${protocol.id}`, tool: PROTOCOL_TOOL, kind: 'protocol', title: protocol.name, when: PROTOCOL_WHEN[protocol.id] ?? '', signals: PROTOCOL_SIGNALS[protocol.id] ?? [] });
  }

  const ids = new Set(raw.map((o) => o.id));
  // A catalogue link to a registered tool that is not itself an option goes to its tool as a
  // whole: a book's own tool (dm_record) to that book, a Problem Solver toolkit tool (kanban,
  // smart…) to Problem Solver. Anything else unknown is kept, so mapProblems flags it.
  const resolve = (target) => {
    if (ids.has(target)) return target;
    if (!PS_TOOLS[target]) return target;
    const book = BOOK_PREFIX[String(target).slice(0, 3)];
    return book ? `tool:${book}` : 'tool:problem-solver';
  };
  const extra = new Map();
  for (const link of NEW_LINKS) extra.set(link.from, [...(extra.get(link.from) ?? []), link.to]);

  return raw.map(({ rawLinks, ...option }) => Object.freeze({
    ...option,
    family: familyOf(option),
    signals: Object.freeze(uniq(option.signals)),
    links: Object.freeze(uniq([...rawLinks.map(resolve), ...(extra.get(option.id) ?? [])]).filter((to) => to !== option.id))
  }));
}

/** Id prefixes of the tools that were books, for links to a book's own tool. */
const BOOK_PREFIX = Object.freeze({ dm_: 'decision-book', gt_: 'get-things-done', rb_: 'rules-book', ch_: 'change-book', cb_: 'collaboration-book', cm_: 'communication-book' });

/** A model the registry has no `when` line for (should never happen; mapProblems flags it). */
const ID_WHEN_FALLBACK = '';

let OPTIONS = null;
let BY_ID = null;

/** Every option, built once and frozen. */
export function allOptions() {
  if (!OPTIONS) {
    OPTIONS = Object.freeze(build());
    BY_ID = new Map(OPTIONS.map((o) => [o.id, o]));
  }
  return OPTIONS;
}

/** One option by id, or null. */
export function getOption(id) {
  allOptions();
  return BY_ID.get(id) ?? null;
}

const PER_TOOL = 3;

/**
 * Options ranked by signal overlap, plus a link from (or to) `fromOptionId`. Tool-level options
 * get a small lift so a tool comes before its single models; at most three per tool keep the
 * list varied. Never includes `exclude` ids or the from option. With nothing to go on, the
 * tool-level options in nav order.
 */
export function shortlist({ signals = [], fromOptionId = null, exclude = [], limit = 8 } = {}) {
  const wanted = new Set((signals ?? []).filter((s) => SIGNALS.includes(s)));
  const skip = new Set([...(exclude ?? []), ...(fromOptionId ? [fromOptionId] : [])]);
  const from = fromOptionId ? getOption(fromOptionId) : null;
  const scored = allOptions()
    .filter((o) => !skip.has(o.id))
    .map((o, order) => {
      const overlap = o.signals.filter((s) => wanted.has(s)).length;
      const linked = from && (from.links.includes(o.id) || o.links.includes(from.id)) ? 3 : 0;
      const score = overlap * 2 + linked + (overlap || linked ? (o.kind === 'tool' ? 2 : 0) : 0);
      return { o, score, order };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  if (!scored.length) return TOOLS.map((t) => getOption(`tool:${t.id}`)).filter((o) => !skip.has(o.id)).slice(0, limit);
  const perTool = new Map();
  const out = [];
  for (const { o } of scored) {
    const n = perTool.get(o.tool) ?? 0;
    if (n >= PER_TOOL) continue;
    perTool.set(o.tool, n + 1);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

/** Keyword rules from text to signals, in SIGNALS order. The fallback when the guide fails. */
export function signalsFromText(text) {
  const clean = String(text ?? '');
  if (!clean.trim()) return [];
  return SIGNALS.filter((s) => SIGNAL_KEYWORDS[s]?.test(clean));
}

/** Protocols that need not counter any snare: they open or direct thinking rather than test it. */
const SNARE_FREE_PROTOCOLS = Object.freeze(['fates', 'horizon']);

/**
 * Integrity problems, [] when the map is sound: duplicate ids, a missing `when` or signal, an
 * unknown signal, a link to no option, a protocol reachable from fewer than two tools, a tool
 * with no links in or out, an option without a family; and for snares, an id that is not unique
 * or not `sn_`, a missing `when` or `check`, no valid signal, a counter that is not an option,
 * and a protocol (other than Fates and Horizon) that counters no snare.
 */
export function mapProblems() {
  const problems = [];
  const options = allOptions();
  const seen = new Set();
  for (const o of options) {
    if (seen.has(o.id)) problems.push(`duplicate id ${o.id}`);
    seen.add(o.id);
    if (!o.when || !String(o.when).trim()) problems.push(`${o.id} has no when line`);
    if (!o.signals.length) problems.push(`${o.id} has no signal`);
    for (const s of o.signals) if (!SIGNALS.includes(s)) problems.push(`${o.id} has unknown signal ${s}`);
    for (const to of o.links) if (!getOption(to)) problems.push(`${o.id} links to unknown ${to}`);
    if (o.kind === 'tool' ? o.family !== null : !FAMILIES.includes(o.family) || o.family === 'snare') problems.push(`${o.id} has family ${o.family}`);
  }
  const snareIds = new Set();
  for (const snare of SNARES) {
    if (snareIds.has(snare.id)) problems.push(`duplicate snare ${snare.id}`);
    snareIds.add(snare.id);
    if (!/^sn_[a-z_]+$/.test(snare.id)) problems.push(`snare ${snare.id} needs the sn_ prefix`);
    if (seen.has(snare.id)) problems.push(`snare ${snare.id} is also an option`);
    if (!snare.title || !String(snare.title).trim()) problems.push(`${snare.id} has no title`);
    if (!snare.when || !String(snare.when).trim()) problems.push(`${snare.id} has no when line`);
    if (!snare.check || !String(snare.check).trim()) problems.push(`${snare.id} has no check`);
    if (!snare.signals.some((s) => SIGNALS.includes(s))) problems.push(`${snare.id} has no valid signal`);
    for (const s of snare.signals) if (!SIGNALS.includes(s)) problems.push(`${snare.id} has unknown signal ${s}`);
    if (!snare.counters.length || snare.counters.length > 3) problems.push(`${snare.id} has ${snare.counters.length} counters`);
    for (const c of snare.counters) if (!getOption(c)) problems.push(`${snare.id} counters unknown ${c}`);
    if (!(snare.tells instanceof RegExp)) problems.push(`${snare.id} has no tells`);
  }
  for (const p of PROTOCOLS) {
    if (SNARE_FREE_PROTOCOLS.includes(p.id)) continue;
    if (!SNARES.some((snare) => snare.counters.includes(`protocol:${p.id}`))) problems.push(`protocol:${p.id} counters no snare`);
  }
  for (const link of NEW_LINKS) {
    if (!getOption(link.from)) problems.push(`new link from unknown ${link.from}`);
    if (!link.why || !String(link.why).trim()) problems.push(`new link ${link.from} -> ${link.to} has no why`);
  }
  const toolOf = (id) => getOption(id)?.tool ?? null;
  for (const p of PROTOCOLS) {
    const target = `protocol:${p.id}`;
    const from = new Set(options.filter((o) => o.tool !== PROTOCOL_TOOL && o.links.includes(target)).map((o) => o.tool));
    if (from.size < 2) problems.push(`${target} is reachable from ${from.size} tool(s)`);
  }
  for (const t of TOOLS) {
    const out = options.some((o) => o.tool === t.id && o.links.some((to) => toolOf(to) && toolOf(to) !== t.id));
    const into = options.some((o) => o.tool !== t.id && o.links.some((to) => toolOf(to) === t.id));
    if (!out) problems.push(`tool ${t.id} has no links out`);
    if (!into) problems.push(`tool ${t.id} has no links in`);
  }
  return problems;
}
