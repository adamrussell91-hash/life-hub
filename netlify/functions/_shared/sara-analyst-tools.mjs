// Tool surface for Sara's analyst: schemas, history loading, and dispatch.
// The calculations live in sara-analyst.mjs (pure). This file only validates input,
// fetches the bounded history a calculation needs, and calls it.

import { isCalendarDate } from '../../../apps/life/js/core/time.js';
import {
  markerTrend, compareBloods, treatmentTimeline, symptomTimeline, openLoops, crossSignals, appointmentBrief
} from './sara-analyst.mjs';

export const SARA_ANALYST_TOOL_NAMES = [
  'get_marker_trend',
  'compare_bloods',
  'get_treatment_timeline',
  'get_symptom_timeline',
  'get_cross_signals',
  'get_open_loops',
  'build_appointment_brief'
];

export function isSaraAnalystTool(name) {
  return SARA_ANALYST_TOOL_NAMES.includes(name);
}

const dateProp = description => ({ type: 'string', description });

export function saraAnalystToolSchemas() {
  return [
    {
      name: 'get_marker_trend',
      description:
        'Every dated value of a blood marker (e.g. "GGT", "ferritin") or a group ("liver", "iron", "inflammation", "fbc") with reference range, change since the previous test and since the first, slope per month, and whether it is moving toward or away from range. Use for any "has X changed / is X getting worse / what is my X" question instead of reading raw bloods. Dates and values come back verbatim — cite them.',
      input_schema: {
        type: 'object',
        properties: {
          marker: { type: 'string', description: 'Marker key/label or group name.' },
          from: dateProp('Optional YYYY-MM-DD lower bound.'),
          to: dateProp('Optional YYYY-MM-DD upper bound.')
        },
        required: ['marker']
      }
    },
    {
      name: 'compare_bloods',
      description:
        'Compare two blood collections marker by marker: newly abnormal, normalised, still abnormal, biggest moves. Defaults to the latest two. Use after new results arrive or before an appointment.',
      input_schema: {
        type: 'object',
        properties: {
          date_a: dateProp('Earlier collection date YYYY-MM-DD (optional).'),
          date_b: dateProp('Later collection date YYYY-MM-DD (optional).')
        }
      }
    },
    {
      name: 'get_treatment_timeline',
      description:
        'Stelara (ustekinumab) dose history, cadence, today\'s cycle day, next dose due and whether it is overdue, plus any steroid courses on record. Use for anything involving timing against the injection cycle, dose reminders, or "when is my next one".',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'get_symptom_timeline',
      description:
        'Symptom episodes (onset, duration, resolved) with the Stelara cycle day of each entry, diary symptom days, and an honest post-dose pattern check that refuses to infer from a small sample. Use for "is this related to my injection", "how often do I get X", or when symptoms are mentioned.',
      input_schema: {
        type: 'object',
        properties: {
          from: dateProp('Optional YYYY-MM-DD lower bound.'),
          to: dateProp('Optional YYYY-MM-DD upper bound.')
        }
      }
    },
    {
      name: 'get_cross_signals',
      description:
        'Describe a window (default last 4 weeks) across nutrition (protein/calcium/fibre), training (sessions, pain flags), mood/energy, and weight, against the window before it, plus the 14-day lead-up to any anchor dates (e.g. a blood collection or symptom onset). States which domains lack data. Descriptive only — never a cause.',
      input_schema: {
        type: 'object',
        properties: {
          from: dateProp('Window start YYYY-MM-DD (optional).'),
          to: dateProp('Window end YYYY-MM-DD (optional).'),
          anchors: { type: 'array', items: { type: 'string' }, description: 'Dates to describe the 14 days before.' }
        }
      }
    },
    {
      name: 'get_open_loops',
      description:
        'What is outstanding: ordered-but-not-booked items, overdue follow-ups, abnormal results not repeated, Stelara overdue/due, visits in the next 30 days, and phrases in recent notes that mention orders or referrals (unconfirmed).',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'build_appointment_brief',
      description:
        'Brief a visit from its own date: results with trends, symptoms since the last visit, Stelara status, related open loops, generated questions to ask, and data gaps. Pass the visit id (from search/list results) or its date.',
      input_schema: {
        type: 'object',
        properties: {
          visit_id: { type: 'string', description: 'Medical visit id.' },
          date: dateProp('Visit date YYYY-MM-DD (when no id).')
        }
      }
    }
  ];
}

// ---------- bounded history loading ----------

const DOMAIN_PREFIX = {
  meal: 'data/nutrition/',
  workout: 'data/fitness/',
  diary: 'data/mind/',
  weight: 'data/body/'
};
const PATH_DATE = /(\d{4}-\d{2}-\d{2})-[^/]*\.md$/;
const MAX_HISTORY_BLOBS = 160;

/**
 * Read dated records of one type inside [from, to] from the repo tree, on demand.
 * Selecting by the date in the file name means a turn that never asks for history never pays for it.
 */
export function createHistoryLoader({ tree, readBlob, parse }) {
  return async function loadRecords(type, { from, to, limit = MAX_HISTORY_BLOBS } = {}) {
    const prefix = DOMAIN_PREFIX[type];
    if (!prefix || !Array.isArray(tree) || typeof readBlob !== 'function') return [];
    const entries = tree
      .filter(entry => entry?.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(prefix))
      .map(entry => ({ entry, date: PATH_DATE.exec(entry.path)?.[1] }))
      .filter(({ date }) => date && (!from || date >= from) && (!to || date <= to))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
    const out = [];
    for (const { entry } of entries) {
      try {
        const doc = parse(await readBlob(entry.sha), entry.path);
        if (doc?.record?.type === type || (type === 'weight' && typeof doc?.record?.weight_kg === 'number')) out.push(doc);
      } catch { /* skip unreadable */ }
    }
    return out;
  };
}

// ---------- dispatch ----------

const dateOrNull = value => (typeof value === 'string' && isCalendarDate(value.trim()) ? value.trim() : null);
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export async function executeSaraAnalystTool(name, input = {}, { medicalEvents = [], today, loadRecords = async () => [] } = {}) {
  const args = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'get_marker_trend':
      return markerTrend(medicalEvents, { query: args.marker, today, from: dateOrNull(args.from), to: dateOrNull(args.to) });
    case 'compare_bloods':
      return compareBloods(medicalEvents, { date_a: dateOrNull(args.date_a), date_b: dateOrNull(args.date_b), today });
    case 'get_treatment_timeline':
      return treatmentTimeline(medicalEvents, { today });
    case 'get_symptom_timeline': {
      const from = dateOrNull(args.from);
      const to = dateOrNull(args.to);
      const diary = await loadRecords('diary', { from: from ?? shift(today, -180), to: to ?? today });
      return symptomTimeline(medicalEvents, { today, from, to, diary });
    }
    case 'get_cross_signals': {
      const to = dateOrNull(args.to) ?? today;
      const from = dateOrNull(args.from) ?? shift(to, -27);
      const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
      const wideFrom = shift(from, -Math.max(span, 14));
      const [meals, workouts, diary, weights] = await Promise.all([
        loadRecords('meal', { from: wideFrom, to }),
        loadRecords('workout', { from: wideFrom, to }),
        loadRecords('diary', { from: wideFrom, to }),
        loadRecords('weight', { from: wideFrom, to })
      ]);
      const anchors = Array.isArray(args.anchors) ? args.anchors.map(dateOrNull).filter(Boolean) : [];
      return crossSignals({ today, from, to, anchors, meals, workouts, diary, weights });
    }
    case 'get_open_loops':
      return openLoops(medicalEvents, { today });
    case 'build_appointment_brief':
      return appointmentBrief(medicalEvents, {
        visit_id: typeof args.visit_id === 'string' && args.visit_id.trim() ? args.visit_id.trim() : null,
        date: dateOrNull(args.date),
        today
      });
    default:
      return { ok: false, error: 'unknown_tool' };
  }
}
