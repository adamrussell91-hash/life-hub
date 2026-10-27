// packages/decision-book/work-through.mjs
// Works a registered tool to completion the way a patient person would: each open slot in
// turn (the reflection last), the least-used tag the tool accepts, the link a slot requires,
// and mid-range scores whenever the tool is waiting for the person's own placing or scoring.
// For tests and the contact sheet; never used in a session.
import { TOOLS } from '../problem-solver/tools/index.mjs';
import { addEdge, applyScores, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../problem-solver/machine.mjs';
import { parseSlot } from '../problem-solver/slots.mjs';

// Scores are stamped with a fixed date, so a dated chart's legend reads as a date.
const AT = '2026-10-01T09:00:00.000Z';

/** Scores the tool is waiting for: every point in the middle, every series at a valid value. */
function scoreWaiting(run, def) {
  if (def.family === 'plot') {
    const points = Object.fromEntries(run.nodes.filter((n) => parseSlot(n.slot).name === 'point').map((n, i) => [n.id, { x: 2 + ((i * 3) % 8), y: 3 + ((i * 5) % 7), ...(def.chart.size ? { size: 3 + (i % 5) } : {}) }]));
    return applyScores(run, { points }, AT);
  }
  if (def.family === 'ratings') {
    // Every rater still to score rates every idea mid-range, and ranks the ideas in slot order.
    const of = (name) => run.nodes.filter((n) => parseSlot(n.slot).name === name).map((n) => n.id);
    const scored = new Set((run.scores?.snapshots ?? []).map((snap) => snap.rater));
    for (const [r, rater] of of('rater').entries()) {
      if (scored.has(rater)) continue;
      const scores = Object.fromEntries(of('idea').map((idea, i) => [idea, Object.fromEntries(of('criterion').map((c, k) => [c, 1 + ((i * 3 + k * 2 + r) % 10)]))]));
      run = applyScores(run, { rater, scores, ranking: of('idea') }, AT);
    }
    return run;
  }
  if (def.family === 'time_value') {
    // The Change Book's split star: shares of the day that overlap (no total), values 1 to 10.
    const modes = def.chart.modes.map((mode) => mode.id);
    const time = Object.fromEntries(modes.map((id, i) => [id, [30, 40, 20, 35][i % 4]]));
    const value = Object.fromEntries(modes.map((id, i) => [id, [8, 3, 9, 2][i % 4]]));
    return applyScores(run, { time, value }, AT);
  }
  if (def.family === 'attribution') {
    // The Change Book's table of forces: every force on the table (the person's own too), 1 to 5.
    const own = run.nodes.filter((n) => parseSlot(n.slot).name === 'force').map((n) => `own_${parseSlot(n.slot).index ?? 1}`);
    const ids = [...def.chart.forces.map((f) => f.id), ...own];
    const col = (shift) => Object.fromEntries(ids.map((id, i) => [id, 1 + ((i + shift) % 5)]));
    return applyScores(run, { feeling: 'happy', now: 3, later: 4, influenceNow: col(0), influenceLater: col(1) }, AT);
  }
  for (const [k, s] of (def.chart.series ?? [{ id: 'now' }]).entries()) {
    const ids = def.chart.scales.map((scale) => scale.id);
    const values = Object.fromEntries(ids.map((id, i) => [id, def.chart.mode === 'shares' ? (i === 0 ? 100 - 15 * (ids.length - 1) : 15) : 2 + ((i * 3 + k * 2) % 8)]));
    run = applyScores(run, { series: s.id, values }, AT);
  }
  return run;
}

/**
 * A completed run of tool `id`. `answer(slot, i)` gives each node's words (default: the slot's
 * own description). Throws if the tool gets stuck or never completes.
 */
export function workThrough(id, answer = (slot) => TOOLS[id].slots[parseSlot(slot).name] ?? slot) {
  const def = TOOLS[id];
  if (!def) throw new Error(`Unknown tool: ${id}`);
  let run = newRun(id, `run-${id}`);
  for (let turn = 0; turn < 160 && !isComplete(run); turn += 1) {
    if (def.awaiting?.(run)) {
      run = scoreWaiting(run, def);
      continue;
    }
    const open = nextSlots(run);
    if (!open.length) throw new Error(`${id} is stuck with nothing open after ${run.nodes.length} nodes`);
    const slot = open.includes('reflection') ? 'reflection' : open[0];
    const name = parseSlot(slot).name;
    const tags = def.nodeTags?.[name] ?? [null];
    const used = (tag) => run.nodes.filter((n) => n.tag === tag).length;
    const nodeId = `n${run.nodes.length + 1}`;
    const kind = def.requiredLinks?.[name]?.kind;
    const linkTo = kind ? run.nodes.find((n) => canEdge({ ...run, nodes: [...run.nodes, { id: '__candidate__', slot }] }, '__candidate__', n.id, kind)) : null;
    const edges = linkTo ? [{ from: slot, to: linkTo.slot, kind }] : [];
    const tag = [...tags].sort((a, b) => used(a) - used(b)).find((t) => !checkNode(run, { slot, text: 'An answer', tag: t ?? undefined }, edges));
    if (tag === undefined) throw new Error(`${id}: no acceptable tag for ${slot}`);
    const text = answer(slot, run.nodes.length);
    run = placeNode(run, { id: nodeId, slot, text, title: text.slice(0, 40), ...(tag ? { tag } : {}), state: 'accepted', skills: [], turnId: null });
    if (linkTo) run = addEdge(run, { from: nodeId, to: linkTo.id, kind });
  }
  if (!isComplete(run)) throw new Error(`${id} did not complete (${run.nodes.length} nodes)`);
  return run;
}
