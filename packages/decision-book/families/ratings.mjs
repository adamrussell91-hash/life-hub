// packages/decision-book/families/ratings.mjs
// The ratings family: a group compares a shortlist of ideas. The person names the ideas (2 to
// 7), the criteria (2 or 3 by default) and the raters; then, with the chart's own form, enters
// each rater's scores (1 to 10 for every idea on every criterion) and that rater's own ranking,
// one score snapshot per rater ({ rater, scores: { idea: { criterion: n } }, ranking }), the
// latest per rater winning. Once every rater has scored, a written recommendation and the
// named decision owner close it.
// What it shows stays apart on purpose: the mean, the sample SD and n per idea and criterion,
// a pooled mean and SD per idea across the raters, each rater's mean and each rater's own
// ranking. Raters weigh equally. There is no weighted total, no combined ranking and no
// winner: the owner decides, with the disagreement in view.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, nodesIn, reflected, subjectFirst } from './common.mjs';

export const MAX_IDEAS = 7;
export const MAX_RATERS = 12;
export const SCORE_RANGE = Object.freeze([1, 10]);

const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

/** The sample standard deviation (n − 1), or null for fewer than two values. */
export function sampleSd(list) {
  if (list.length < 2) return null;
  const m = mean(list);
  return Math.sqrt(list.reduce((sum, x) => sum + (x - m) ** 2, 0) / (list.length - 1));
}

const stat = (list) => ({ mean: list.length ? mean(list) : null, sd: sampleSd(list), n: list.length });

/** Each rater's latest snapshot, by rater node id. */
function latestByRater(run) {
  const out = {};
  for (const snap of run.scores?.snapshots ?? []) if (snap.rater) out[snap.rater] = snap;
  return out;
}

/** True when a snapshot scores every idea on every criterion and ranks every idea once. */
function covers(snap, ideaIds, criterionIds) {
  if (!snap) return false;
  const scored = ideaIds.every((idea) => criterionIds.every((c) => Number.isInteger(snap.scores?.[idea]?.[c])));
  const ranked = Array.isArray(snap.ranking) && snap.ranking.length === ideaIds.length && ideaIds.every((idea) => snap.ranking.includes(idea));
  return scored && ranked;
}

/**
 * Everything the chart shows, computed from the run. Ideas, criteria and raters are in slot
 * order. Only raters whose latest snapshot covers the current ideas and criteria count.
 */
export function ratingsOf(run) {
  const ideas = nodesIn(run, 'idea');
  const criteria = nodesIn(run, 'criterion');
  const raters = nodesIn(run, 'rater');
  const ideaIds = ideas.map((n) => n.id);
  const criterionIds = criteria.map((n) => n.id);
  const latest = latestByRater(run);
  const scored = raters.filter((r) => covers(latest[r.id], ideaIds, criterionIds)).map((r) => r.id);
  const cells = {};
  const pooled = {};
  for (const idea of ideaIds) {
    cells[idea] = {};
    for (const c of criterionIds) cells[idea][c] = stat(scored.map((r) => latest[r].scores[idea][c]));
    // Pooled across raters: each rater's own mean for this idea, so n stays the number of raters.
    pooled[idea] = stat(scored.map((r) => mean(criterionIds.map((c) => latest[r].scores[idea][c]))));
  }
  const raterMeans = {};
  const rankings = {};
  for (const r of scored) {
    raterMeans[r] = mean(ideaIds.flatMap((idea) => criterionIds.map((c) => latest[r].scores[idea][c])));
    rankings[r] = [...latest[r].ranking];
  }
  return { ideas: ideaIds, criteria: criterionIds, raters: raters.map((n) => n.id), scored, cells, pooled, raterMeans, rankings };
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {string} config.chart.idea what one idea slot holds
 * @param {string} config.chart.criterion what one criterion slot holds
 * @param {string} config.chart.rater what one rater slot holds (a name)
 * @param {number} [config.chart.maxIdeas] at most seven (default 7)
 * @param {[number, number]} [config.chart.criteria] how many criteria, within 2 to 3 (default [2, 3])
 * @param {string} [config.chart.recommendation] the recommendation slot's label
 * @param {string} [config.chart.owner] the decision owner slot's label
 */
export function ratingsTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  for (const key of ['idea', 'criterion', 'rater']) check(typeof chart[key] === 'string' && chart[key], id, `needs a ${key} label`);
  const maxIdeas = chart.maxIdeas ?? MAX_IDEAS;
  check(Number.isInteger(maxIdeas) && maxIdeas >= 2 && maxIdeas <= MAX_IDEAS, id, 'takes at most seven ideas (and at least two)');
  const [minCriteria, maxCriteria] = chart.criteria ?? [2, 3];
  check(Number.isInteger(minCriteria) && Number.isInteger(maxCriteria) && minCriteria >= 2 && maxCriteria <= 3 && minCriteria <= maxCriteria, id, 'criteria run from 2 to 3');
  const { subject, reflection } = framing(config);
  const [low, high] = SCORE_RANGE;

  const ready = (run) => countSlots(run, 'idea') >= 2 && countSlots(run, 'criterion') >= minCriteria && countSlots(run, 'rater') >= 1;
  const started = (run) => (run.scores?.snapshots ?? []).length > 0;
  const waiting = (run) => {
    const r = ratingsOf(run);
    return r.raters.filter((rater) => !r.scored.includes(rater));
  };

  return baseTool(config, 'ratings', {
    idea: chart.idea,
    criterion: chart.criterion,
    rater: chart.rater,
    recommendation: chart.recommendation ?? 'The recommendation, written for the decision owner',
    owner: chart.owner ?? 'Who decides'
  }, {
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (!started(run)) return open(nextIndexed(run, 'idea', maxIdeas), nextIndexed(run, 'criterion', maxCriteria), nextIndexed(run, 'rater', MAX_RATERS));
      if (waiting(run).length) return [];
      const closing = open(hasSlot(run, 'recommendation') ? null : 'recommendation', hasSlot(run, 'owner') ? null : 'owner');
      if (closing.length) return closing;
      return reflection && !countSlots(run, 'reflection') ? ['reflection'] : [];
    },
    pickScores(payload) {
      return { rater: payload?.rater, scores: payload?.scores, ranking: payload?.ranking };
    },
    validateScores(run, { rater, scores, ranking }) {
      if (!ready(run)) return `Name at least two ideas, ${minCriteria} criteria and one rater before scoring.`;
      const ideas = nodesIn(run, 'idea').map((n) => n.id);
      const criteria = nodesIn(run, 'criterion').map((n) => n.id);
      if (!nodesIn(run, 'rater').some((n) => n.id === rater)) return 'Score for one of the named raters.';
      if (!scores || typeof scores !== 'object' || Object.keys(scores).length !== ideas.length || ideas.some((idea) => !scores[idea] || Object.keys(scores[idea]).length !== criteria.length || criteria.some((c) => !Number.isInteger(scores[idea][c])))) return 'Give a whole-number score for every idea on every criterion.';
      if (ideas.some((idea) => criteria.some((c) => scores[idea][c] < low || scores[idea][c] > high))) return `Scores run from ${low} to ${high}.`;
      if (!Array.isArray(ranking) || ranking.length !== ideas.length || new Set(ranking).size !== ideas.length || ideas.some((idea) => !ranking.includes(idea))) return 'This rater must rank every idea once, best first.';
      return null;
    },
    awaiting(run) {
      if (!ready(run)) return null;
      const left = waiting(run);
      if (!left.length) return null;
      const names = nodesIn(run, 'rater').filter((n) => left.includes(n.id)).map((n) => n.title ?? n.text);
      return `The person enters each rater's scores with the chart's form: ${names.join(', ')} still to score every idea on every criterion and rank them. Ask them to, and wait.`;
    },
    complete(run) {
      return ready(run) && !waiting(run).length && hasSlot(run, 'recommendation') && hasSlot(run, 'owner') && reflected(run, reflection);
    }
  });
}
