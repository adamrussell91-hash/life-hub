// packages/change-book/families/time-value.mjs
// The time_value family (Multitasking): where a workday's attention went and what it was worth.
// Four modes, each scored twice with the chart's own controls: the time it took, a whole share
// of the working day from 0 to 100, and its value to the person, 1 to 10. One snapshot holds both
// ({ time: { a, b, c, d }, value: { a, b, c, d } }); the latest wins, and the earlier ones stay so
// a re-score after a change can show the previous profile faintly.
//
// No sum rule. The book asks for each mode's share of the day on its own, and switching happens
// between the other modes and inside focused work, so the shares overlap: the total can fall
// short of 100 or pass it. This settles the one fact the pack left unsure.
//
// Slots: the subject (the workday), notes tagged with a mode, and the reflection on the gap
// between time and value.
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from '../../decision-book/families/common.mjs';

/** Gap flag thresholds: a lot of the day for little worth, or great worth for little of the day. */
export const GAP = Object.freeze({ heavyTime: 25, lowValue: 4, highValue: 8, lightTime: 15 });

export const GAP_WORDS = Object.freeze({
  costly: 'Takes a lot, worth little',
  starved: 'Worth a lot, gets little'
});

const isSnapshot = (snap) => snap && snap.time && snap.value;

/** Every saved snapshot, oldest first: `{ at, time, value }`. */
export function snapshotsOf(run) {
  return (run.scores?.snapshots ?? []).filter(isSnapshot).map((snap) => ({ at: snap.at, time: { ...snap.time }, value: { ...snap.value } }));
}

/** The latest snapshot, or null. */
export function latestProfile(run) {
  return snapshotsOf(run).at(-1) ?? null;
}

/** Saved snapshots, newest first (as scales `historyOf`): the first is the one in force. */
export function profileHistory(run, count = 2) {
  return snapshotsOf(run).reverse().slice(0, count);
}

/** The modes' time shares added up: overlap means this can pass 100. */
export function timeTotal(snap, modes) {
  return snap ? modes.reduce((sum, id) => sum + (snap.time[id] ?? 0), 0) : 0;
}

/** Each mode out of step with its worth: `{ mode, kind: 'costly' | 'starved' }`, in mode order. */
export function gapFlags(snap, modes) {
  if (!snap) return [];
  const out = [];
  for (const mode of modes) {
    const time = snap.time[mode];
    const value = snap.value[mode];
    if (time >= GAP.heavyTime && value <= GAP.lowValue) out.push({ mode, kind: 'costly' });
    else if (value >= GAP.highValue && time <= GAP.lightTime) out.push({ mode, kind: 'starved' });
  }
  return out;
}

/** The readout under the chart: the total, and why it may pass 100. */
export function totalWords(total) {
  if (total === 100) return 'Adds up to 100% of the day';
  if (total > 100) return `Adds up to ${total}% — switching overlaps the other three, so this can pass 100`;
  return `${100 - total}% of the day not counted`;
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {string} config.chart.subject what the subject slot holds (the workday)
 * @param {{id: string, label: string, short?: string}[]} config.chart.modes four modes, ids a to d
 * @param {string} [config.chart.reflection]
 */
export function timeValueTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(typeof chart.subject === 'string' && chart.subject, id, 'needs a subject: the workday looked at');
  check(Array.isArray(chart.modes) && chart.modes.length >= 3, id, 'needs at least three modes');
  for (const mode of chart.modes) check(isKey(mode.id) && typeof mode.label === 'string' && mode.label, id, `mode ${mode.id} needs a key and a label`);
  const modes = chart.modes.map((mode) => mode.id);
  const { subject, reflection } = framing(config);
  const scored = (run) => Boolean(latestProfile(run));
  const label = (mode) => chart.modes.find((m) => m.id === mode)?.label ?? mode;

  return baseTool(config, 'time_value', { note: 'A note on one mode: what fills it, or why it is worth what it is' }, {
    nodeTags: { note: modes },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'note', modes.length * 2), reflection && scored(run) ? 'reflection' : null);
    },
    pickScores(payload) {
      return { time: payload?.time, value: payload?.value };
    },
    validateScores(_run, { time, value }) {
      const whole = (set) => set && typeof set === 'object' && Object.keys(set).length === modes.length && modes.every((m) => Number.isInteger(set[m]));
      if (!whole(time) || !whole(value)) return `Give a whole number for the time and the value of every mode: ${modes.join(', ')}.`;
      if (!modes.every((m) => time[m] >= 0 && time[m] <= 100)) return 'Each time is a share of the working day, 0 to 100. They need not add up to 100.';
      if (!modes.every((m) => value[m] >= 1 && value[m] <= 10)) return 'Each value runs from 1 to 10.';
      return null;
    },
    scoreLine(run) {
      const snap = latestProfile(run);
      if (!snap) return null;
      const parts = modes.map((m) => `${m} (${label(m)}) time ${snap.time[m]}%, value ${snap.value[m]}/10`).join('; ');
      const flags = gapFlags(snap, modes).map((f) => `${f.mode}: ${GAP_WORDS[f.kind]}`).join('; ');
      const saves = snapshotsOf(run).length;
      return `${parts}. Time adds up to ${timeTotal(snap, modes)}% (overlap allowed).${flags ? ` Gaps: ${flags}.` : ' No gap flags.'}${saves > 1 ? ` Saved ${saves} times; the chart shows the previous profile faintly.` : ''}`;
    },
    awaiting(run) {
      if (subject && countSlots(run, 'subject') === 0) return null;
      return scored(run) ? null : 'The person sets each mode\'s share of the day (0 to 100, overlap allowed) and its value (1 to 10) with the chart\'s controls, then saves; ask them to, and wait.';
    },
    complete(run) {
      return (!subject || countSlots(run, 'subject') === 1) && scored(run) && reflected(run, reflection);
    }
  });
}
