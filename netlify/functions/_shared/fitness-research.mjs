import { daysBetween } from '../../../apps/life/js/core/time.js';

export const FITNESS_RESEARCH_PATH = 'data/fitness-research.json';
export const FITNESS_RESEARCH_FRESH_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCE = new Set(['high', 'moderate', 'emerging', 'anecdotal']);

function clean(value, max = 500) {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : '';
}

function researchKey(entry) {
  return [entry?.area, entry?.goal].map(value => clean(value, 120).toLowerCase()).join('::');
}

export function parseFitnessResearch(content) {
  if (typeof content !== 'string') return [];
  let parsed;
  try { parsed = JSON.parse(content); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry => entry && typeof entry === 'object' && clean(entry.area));
}

export function validateFitnessResearchEntry(input, today) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const area = clean(input.area, 80);
  const goal = clean(input.goal, 160);
  const finding = clean(input.finding, 800);
  const source_title = clean(input.source_title, 240);
  const source_url = clean(input.source_url, 500);
  const researched_on = clean(input.researched_on, 10) || today;
  if (!area || !goal || !finding || !source_title || !source_url || !DATE_RE.test(researched_on)) return null;

  const entry = {
    area,
    goal,
    finding,
    source_title,
    source_url,
    researched_on
  };
  for (const [field, max] of [
    ['source_date', 10],
    ['application', 600],
    ['aeke_translation', 600],
    ['suitable_when', 400],
    ['avoid_when', 400],
    ['observed_response', 400]
  ]) {
    const value = clean(input[field], max);
    if (value) entry[field] = value;
  }
  const confidence = clean(input.confidence, 20).toLowerCase();
  if (confidence) {
    if (!CONFIDENCE.has(confidence)) return null;
    entry.confidence = confidence;
  }
  return entry;
}

export function upsertFitnessResearch(entries, entry, updatedAt) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const key = researchKey(entry);
  const index = list.findIndex(existing => researchKey(existing) === key);
  const next = { ...(index >= 0 ? list[index] : {}), ...entry, updated_at: updatedAt };
  if (index >= 0) list[index] = next;
  else list.push(next);
  return list;
}

export function fitnessResearchAge(entry, today) {
  if (!entry || !DATE_RE.test(entry.researched_on ?? '') || !DATE_RE.test(today ?? '')) return null;
  return daysBetween(entry.researched_on, today);
}

export function fitnessResearchIsDue(entry, today, freshnessDays = FITNESS_RESEARCH_FRESH_DAYS) {
  const age = fitnessResearchAge(entry, today);
  return age == null || age >= freshnessDays;
}

export function formatFitnessResearchForPrompt(entries, today) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  if (list.length === 0) {
    return `No stored fitness research yet. Today is ${today}. Any requested workout focus is due for targeted research before programming.`;
  }
  return list
    .sort((a, b) => String(b.researched_on ?? '').localeCompare(String(a.researched_on ?? '')))
    .slice(0, 40)
    .map(entry => {
      const age = fitnessResearchAge(entry, today);
      const due = fitnessResearchIsDue(entry, today);
      const freshness = age == null
        ? 'research date unknown, RESEARCH DUE'
        : `researched ${entry.researched_on}, ${age} day${age === 1 ? '' : 's'} ago, ${due ? 'RESEARCH DUE' : `${FITNESS_RESEARCH_FRESH_DAYS - age} days until review`}`;
      const source = entry.source_url ? `${entry.source_title} · ${entry.source_url}` : entry.source_title;
      return [
        `• ${entry.area} · goal: ${entry.goal} · ${freshness}`,
        `  finding: ${entry.finding}`,
        entry.aeke_translation ? `  AEKE translation: ${entry.aeke_translation}` : '',
        entry.suitable_when ? `  suitable when: ${entry.suitable_when}` : '',
        entry.avoid_when ? `  avoid when: ${entry.avoid_when}` : '',
        entry.observed_response ? `  Adam response: ${entry.observed_response}` : '',
        `  source: ${source}${entry.confidence ? ` · confidence: ${entry.confidence}` : ''}`
      ].filter(Boolean).join('\n');
    })
    .join('\n');
}

export function saveFitnessResearchSchema() {
  return {
    name: 'save_fitness_research',
    description: 'Save one distilled, reusable fitness research finding after web_search. Store the useful coaching conclusion, its source, goal relevance, AEKE translation, and safety limits. This is durable coaching memory, not a whole article dump.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Body area or programming topic, such as biceps, upper chest, shoulder to waist ratio, or recovery.' },
        goal: { type: 'string', description: 'The specific physique or performance goal this finding supports.' },
        finding: { type: 'string', description: 'Concise evidence based coaching finding.' },
        source_title: { type: 'string' },
        source_url: { type: 'string' },
        source_date: { type: 'string', description: 'Publication date when known.' },
        researched_on: { type: 'string', description: 'YYYY-MM-DD. Use today.' },
        confidence: { type: 'string', enum: ['high', 'moderate', 'emerging', 'anecdotal'] },
        application: { type: 'string', description: 'How this changes Adam\'s programming.' },
        aeke_translation: { type: 'string', description: 'Translation to a valid AEKE exercise or setup. Do not invent attachment swaps.' },
        suitable_when: { type: 'string' },
        avoid_when: { type: 'string' },
        observed_response: { type: 'string' }
      },
      required: ['area', 'goal', 'finding', 'source_title', 'source_url', 'researched_on']
    }
  };
}
