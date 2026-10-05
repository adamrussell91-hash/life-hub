/**
 * Morning bubbles: "How are you starting today?" — 1–3 quick, conditional questions.
 *
 * Spec: docs/capacity-forecast-handoff/check-ins-and-logging.md.
 * - Questions are predicted from yesterday's context, never from today's answer.
 * - Nothing is preselected or auto-submitted. Skip is always available.
 * - Each question has a "Something else" route for when its premise is wrong.
 * - Stale or contradictory context gets a neutral question instead of assuming an
 *   ongoing problem.
 * - The last question is overall readiness: it is the observation the forecast is
 *   checked against, so discrepancies compare like with like.
 * Pure: the view renders what this returns.
 */
import { ANSWERS, REASONS, addDays } from './readiness-model.js';

const opts = (domain, codes) => codes.map(code => ({ code, label: ANSWERS[domain][code].label }));

export const QUESTIONS = Object.freeze({
  sleep_followup: { id: 'sleep_followup', domain: 'sleep', prompt: 'How was last night?', options: opts('sleep', ['worse', 'still_poor', 'better_still_tired', 'restorative']) },
  sleep_neutral: { id: 'sleep_neutral', domain: 'sleep', prompt: 'How did you sleep?', options: opts('sleep', ['poor', 'okay', 'better_still_tired', 'restorative']) },
  energy: { id: 'energy', domain: 'energy', prompt: 'How is your energy?', options: opts('energy', ['drained', 'heavy_manageable', 'normal', 'energised']) },
  focus: { id: 'focus', domain: 'focus', prompt: 'How is focus?', options: opts('focus', ['foggy', 'distractible', 'brief', 'sharp']) },
  symptoms: { id: 'symptoms', domain: 'symptoms', prompt: 'How is it today?', options: opts('symptoms', ['worse', 'same', 'easing', 'gone']) },
  lingering: { id: 'lingering', domain: 'lingering', prompt: 'What is lingering?', options: opts('lingering', ['soreness', 'mental', 'both', 'recovered']) },
  break: { id: 'break', domain: 'break', prompt: 'Did the break help?', options: opts('break', ['not_really', 'little', 'refreshed']) },
  overall: { id: 'overall', domain: 'overall', prompt: 'How ready do you feel?', options: opts('overall', ['empty', 'limited', 'manageable', 'strong', 'full']) }
});

export const OPENING = 'How are you starting today?';
export const DISCREPANCY_PROMPT = 'That’s a bigger difference. What did we miss?';
export const REASON_OPTIONS = Object.entries(REASONS).map(([code, label]) => ({ code, label }));

const POOR_SLEEP = new Set(['worse', 'still_poor', 'poor']);
const LOW_ENERGY = new Set(['drained', 'heavy_manageable']);
const FOGGY = new Set(['foggy', 'brief']);
const ACTIVE = new Set(['worse', 'same', 'easing']);

/**
 * Latest answer per domain across recent observations (newest wins), with its date.
 * observations: [{ local_date, answers: { domain: code } , observed_at }]
 */
export function lastAnswers(observations, { before, days = 3 } = {}) {
  const from = before ? addDays(before, -days) : '0000-00-00';
  const out = {};
  const sorted = [...(observations ?? [])]
    .filter(o => (!before || o.local_date < before) && o.local_date >= from)
    .sort((a, b) => String(a.observed_at ?? a.local_date).localeCompare(String(b.observed_at ?? b.local_date)));
  for (const obs of sorted) {
    for (const [domain, code] of Object.entries(obs.answers ?? {})) {
      if (code && code !== 'premise_wrong') out[domain] = { code, date: obs.local_date };
    }
  }
  return out;
}

/**
 * Choose today's questions.
 * ctx: {
 *   date, observations (recent check-ins), evidence (collectEvidence for today),
 *   priorWork ('light'|'moderate'|'heavy'|null), symptomName?, recoveryOpportunity?
 * }
 * Returns { opening, questions: Question[] } with 1–3 questions, overall last.
 */
export function selectQuestions(ctx = {}) {
  const { date, observations = [], evidence = {}, priorWork = null, recoveryOpportunity = false } = ctx;
  const prev = lastAnswers(observations, { before: date, days: 2 });
  const chosen = [];

  // 1. Sleep: never measured, weighs heavily. Follow up only on fresh poor sleep.
  const poorSleepRecently = prev.sleep && POOR_SLEEP.has(prev.sleep.code)
    || (evidence.sleep && evidence.sleep.value < 60);
  chosen.push(poorSleepRecently ? QUESTIONS.sleep_followup : QUESTIONS.sleep_neutral);

  // 2. One context question, highest value first. Contradictory context → none.
  const symptomsActive = (evidence.symptoms?.length > 0 && !(prev.symptoms?.code === 'gone'))
    || (prev.symptoms && ACTIVE.has(prev.symptoms.code));
  const heavy = priorWork === 'heavy' || evidence.exercise === 'strenuous';
  const lowEnergy = (prev.energy && LOW_ENERGY.has(prev.energy.code)) || (evidence.priorEnergy != null && evidence.priorEnergy <= 40);
  const foggy = prev.focus && FOGGY.has(prev.focus.code);
  const recovered = prev.lingering?.code === 'recovered' && prev.lingering.date === addDays(date, -1);

  if (symptomsActive) {
    const name = evidence.symptoms?.[0];
    chosen.push(name ? { ...QUESTIONS.symptoms, prompt: `How is the ${name} today?` } : QUESTIONS.symptoms);
  } else if (heavy && !recovered) chosen.push(QUESTIONS.lingering);
  else if (recoveryOpportunity) chosen.push(QUESTIONS.break);
  else if (lowEnergy) chosen.push(QUESTIONS.energy);
  else if (foggy) chosen.push(QUESTIONS.focus);

  // 3. Overall readiness: the outcome the forecast is judged on.
  chosen.push(QUESTIONS.overall);
  return { opening: OPENING, questions: chosen.slice(0, 3) };
}

/**
 * Turn picked bubbles into the stored answers object (domain → code). Unanswered
 * questions are simply absent: skipped and unknown stay distinct from a real answer.
 */
export function answersFrom(questions, picks) {
  const answers = {};
  for (const q of questions ?? []) {
    const code = picks?.[q.id];
    if (!code) continue;
    if (code === 'premise_wrong' || q.options.some(o => o.code === code)) answers[q.domain] = code;
  }
  return answers;
}
