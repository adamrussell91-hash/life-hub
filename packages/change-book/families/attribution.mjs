// packages/change-book/families/attribution.mjs
// The attribution family ((Un)Happiness): how much of a feeling the person puts down to each
// force in their life, now and in three years. The worksheet's shape: a column of forces, the
// influence of each now on one side and in three years on the other, and two overall ratings,
// now and in three years. Everything runs 1 to 5.
//
// The feeling defaults to happy; the person can swap it for rich, lonely or a word of their own,
// and every label then uses that word. One snapshot holds the lot:
//   { feeling, now, later, influenceNow: { forceId: n }, influenceLater: { forceId: n } }
// covering the chart's forces and any the person added. The latest wins.
//
// Slots: an optional subject; `force`, up to three forces of the person's own (each scored under
// the id own_1 to own_3, by slot number); `got_here` and `get_there`, the two arrows (what got
// the person to now, what will get them to the later rating); notes tagged with a force; and the
// reflection comparing the two columns.
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from '../../decision-book/families/common.mjs';

export const MAX_OWN = 3;
export const RANGE = Object.freeze([1, 5]);
export const FEELINGS = Object.freeze(['happy', 'rich', 'lonely']);
const OWN_IDS = Object.freeze(Array.from({ length: MAX_OWN }, (_, i) => `own_${i + 1}`));

/** A feeling word: a word or two of letters, 1 to 24 characters, stored lower case. */
export function cleanFeeling(word) {
  const text = String(word ?? '').trim().toLowerCase();
  return /^[a-z][a-z' -]{0,23}$/.test(text) ? text : null;
}

/** The person's own forces, in slot order: `{ id: 'own_N', label, node }`. */
export function ownForces(run) {
  return nodesIn(run, 'force').map((node) => ({ id: `own_${parseSlot(node.slot)?.index ?? 1}`, label: node.title ?? node.text, node }));
}

/** Every force on this run's table: the chart's, then the person's own. */
export function forcesOf(run, chart) {
  return [...chart.forces.map((f) => ({ id: f.id, label: f.label, own: false })), ...ownForces(run).map((f) => ({ id: f.id, label: f.label, own: true }))];
}

const isSnapshot = (snap) => snap && snap.influenceNow && snap.influenceLater;

/** The latest snapshot, or null. */
export function latestAttribution(run) {
  const snaps = (run.scores?.snapshots ?? []).filter(isSnapshot);
  return snaps.length ? structuredClone(snaps.at(-1)) : null;
}

/** True when the snapshot scores every force on the table, both columns. */
export function covers(snap, ids) {
  if (!snap) return false;
  return ['influenceNow', 'influenceLater'].every((col) => ids.every((id) => Number.isInteger(snap[col]?.[id])));
}

/**
 * The share of the influence points the person gives their own thoughts and actions, in one
 * column: `{ self, total, share }`, self and total summed over the scored forces. Null when unscored.
 */
export function selfShare(snap, column, selfIds, ids) {
  if (!snap?.[column]) return null;
  const scored = ids.filter((id) => Number.isInteger(snap[column][id]));
  const total = scored.reduce((sum, id) => sum + snap[column][id], 0);
  const self = scored.filter((id) => selfIds.includes(id)).reduce((sum, id) => sum + snap[column][id], 0);
  return total ? { self, total, share: self / total } : null;
}

/** The share as points out of ten, rounded: 0.27 -> 3. */
export const outOfTen = (share) => Math.round(share * 10);

/**
 * The summary line: how much of the feeling the person puts down to themselves, now and in
 * three years, as points out of ten.
 */
export function selfWords(snap, selfIds, ids) {
  const now = selfShare(snap, 'influenceNow', selfIds, ids);
  const later = selfShare(snap, 'influenceLater', selfIds, ids);
  if (!now || !later) return null;
  const a = outOfTen(now.share);
  const b = outOfTen(later.share);
  return `Your own thoughts and actions take ${a} of every 10 points of influence now, and ${b} of 10 in three years; the other forces share the rest.`;
}

/** Where a force's influence moves between the columns: up, down or same (null when unscored). */
export function drift(snap, id) {
  const a = snap?.influenceNow?.[id];
  const b = snap?.influenceLater?.[id];
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  return b > a ? 'up' : b < a ? 'down' : 'same';
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{id: string, label: string, self?: boolean}[]} config.chart.forces the table's forces; `self` marks the person's own thoughts and actions
 * @param {string} [config.chart.subject]
 * @param {string} [config.chart.reflection]
 */
export function attributionTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(Array.isArray(chart.forces) && chart.forces.length >= 2, id, 'needs at least two forces');
  for (const force of chart.forces) check(isKey(force.id) && !OWN_IDS.includes(force.id) && typeof force.label === 'string' && force.label, id, `force ${force.id} needs a key and a label`);
  check(chart.forces.some((f) => f.self) && chart.forces.some((f) => !f.self), id, 'marks the person\'s own forces with self, and has others');
  const selfIds = chart.forces.filter((f) => f.self).map((f) => f.id);
  const { subject, reflection } = framing(config);
  const [low, high] = RANGE;
  const ids = (run) => forcesOf(run, chart).map((f) => f.id);
  const scored = (run) => covers(latestAttribution(run), ids(run));
  const arrows = (run) => open(hasSlot(run, 'got_here') ? null : 'got_here', hasSlot(run, 'get_there') ? null : 'get_there');

  return baseTool(config, 'attribution', {
    force: 'A force of your own that shapes the feeling, beyond the ones listed',
    got_here: 'What has got you to this point: what brought the feeling to where it is now',
    get_there: 'What will get you to that point: what would bring the feeling to where you expect it in three years',
    note: 'A note on one force: why it carries the influence it does'
  }, {
    nodeTags: { note: [...chart.forces.map((f) => f.id), ...OWN_IDS] },
    validateNode(run, node) {
      if (parseSlot(node.slot)?.name === 'note' && OWN_IDS.includes(node.tag) && !ids(run).includes(node.tag)) return `There is no ${node.tag.replace('_', ' ')} force yet: tag a force on the table.`;
      return null;
    },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      const more = nextIndexed(run, 'force', MAX_OWN);
      if (!scored(run)) return open(more);
      const left = arrows(run);
      if (left.length) return left;
      return open(nextIndexed(run, 'note', 2 * (chart.forces.length + MAX_OWN)), more, reflection ? 'reflection' : null);
    },
    pickScores(payload) {
      return { feeling: cleanFeeling(payload?.feeling), now: payload?.now, later: payload?.later, influenceNow: payload?.influenceNow, influenceLater: payload?.influenceLater };
    },
    validateScores(run, scores) {
      if (!scores.feeling) return 'Name the feeling in a word: happy, rich, lonely or your own.';
      const inRange = (n) => Number.isInteger(n) && n >= low && n <= high;
      if (!inRange(scores.now) || !inRange(scores.later)) return `Rate the feeling now and in three years, each ${low} to ${high}.`;
      const want = ids(run);
      for (const col of ['influenceNow', 'influenceLater']) {
        const set = scores[col];
        if (!set || typeof set !== 'object' || Object.keys(set).length !== want.length || !want.every((f) => f in set)) return `Rate every force in both columns: ${want.join(', ')}.`;
        if (!want.every((f) => inRange(set[f]))) return `Each force's influence runs ${low} to ${high}.`;
      }
      return null;
    },
    scoreLine(run) {
      const snap = latestAttribution(run);
      if (!snap) return null;
      const table = forcesOf(run, chart);
      const rows = table.map((f) => `${f.label} ${snap.influenceNow?.[f.id] ?? '?'}->${snap.influenceLater?.[f.id] ?? '?'}`).join('; ');
      const summary = selfWords(snap, selfIds, table.map((f) => f.id));
      const stale = scored(run) ? '' : ' A force was added after this save: the table needs scoring again.';
      return `Feeling: ${snap.feeling}. Now ${snap.now}/5, in three years ${snap.later}/5. Influence now->later (1-5): ${rows}.${summary ? ` ${summary}` : ''}${stale}`;
    },
    awaiting(run) {
      if (subject && !hasSlot(run, 'subject')) return null;
      if (scored(run)) return null;
      return 'The person rates the feeling now and in three years and every force\'s influence in both columns (1 to 5) with the chart\'s controls, and may swap the word happy for rich, lonely or their own; ask them to, and wait.';
    },
    complete(run) {
      return (!subject || hasSlot(run, 'subject')) && scored(run) && !arrows(run).length && reflected(run, reflection);
    }
  });
}
