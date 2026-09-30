/**
 * Prompt blocks for open challenge sprints (brief §2.1 / §2.3).
 */
import {
  computeSprintState,
  EVIDENCE_ADAPTERS,
  SPRINT_ROSTER
} from './sprint-evidence.mjs';

const MAX_SPRINT_CHARS = 700;

function fmtDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [, y, m, d] = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${d}/${m}/${y.slice(2)}`;
}

function fmtHeadline(state) {
  const h = state.headline;
  if (!h?.label && !h?.metricLabel) return 'Headline: (none)';
  const unit = h.unit ? ` ${h.unit}` : '';
  if (!h.readings?.length) {
    return `Headline: ${h.metricLabel || h.label} — no readings yet`;
  }
  if (h.readings.length === 1) {
    return `Headline: Baseline ${h.baseline}${unit}`;
  }
  const from = h.baseline;
  const to = h.latest?.value;
  const n = h.readings.length;
  let line = `Headline: ${h.metricLabel || h.label} ${from} → ${to}${unit} (${n} readings)`;
  for (const sec of h.secondary || []) {
    if (sec.latest && sec.baseline != null) {
      line += ` · ${sec.label} ${sec.baseline} → ${sec.latest.value}${sec.unit ? ` ${sec.unit}` : ''}`;
    }
  }
  return line;
}

function measureLine(laneState) {
  const parts = (laneState.measureSummaries || []).map(m => {
    if (m.judged === 0) {
      const t = m.today?.status;
      if (t === 'unavailable') return `${m.label} — unavailable`;
      if (t === 'met') return `${m.label} — met today`;
      return `${m.label} — no evidence`;
    }
    return `${m.label} — met ${m.met}/${m.judged} days`;
  });
  return parts.length ? parts.join(' · ') : 'self-report';
}

function otherLaneChip(lane) {
  const label = SPRINT_ROSTER[lane.agent] || lane.agent;
  if (lane.status === 'unavailable') return `${label} unavailable`;
  if (lane.status === 'no_evidence') return `${label} no evidence today`;
  if (lane.status === 'stalled') return `${label} stalled`;
  return `${label} on track`;
}

/**
 * @param {object[]} sprints raw challenge JSON (kind sprint)
 * @param {{ slug: string, today: string, records?: object[], evidence?: object }} opts
 */
export function formatOpenSprintsForPrompt(sprints, { slug, today, records = [] } = {}) {
  if (!Array.isArray(sprints) || !sprints.length || !slug || !today) return '';
  const blocks = [];
  for (const sprint of sprints) {
    const state = computeSprintState(sprint, records, today);
    if (!state.ok) continue;
    if (!state.open && !state.ended_awaiting_review) continue;

    const lead = SPRINT_ROSTER[state.lead_agent] || state.lead_agent;
    const ends = fmtDate(state.end_date);
    const dayBit = state.ended_awaiting_review
      ? `ended ${ends} — awaiting final review`
      : `${state.day_label} (ends ${ends})`;
    const header = `OPEN SPRINT — ${state.title} · ${dayBit} · lead: ${lead}`;
    const headline = fmtHeadline(state);

    const myLane = state.lanes.find(l => l.agent === slug);
    const isLead = slug === state.lead_agent || slug === 'hammond';
    let body;
    if (myLane || isLead) {
      if (isLead) {
        const laneLines = state.lanes.map(l => {
          const name = SPRINT_ROSTER[l.agent] || l.agent;
          return `${name} · ${l.role || 'lane'}: ${measureLine(l)} [${l.status}]`;
        });
        body = [headline, ...laneLines].join('\n');
      } else {
        const name = SPRINT_ROSTER[myLane.agent] || myLane.agent;
        const others = state.lanes.filter(l => l.agent !== slug).map(otherLaneChip);
        body = [
          headline,
          `YOUR LANE (${name} · ${myLane.role || 'lane'}): ${measureLine(myLane)}`,
          others.length ? `Other lanes: ${others.join(' · ')}` : ''
        ].filter(Boolean).join('\n');
      }
    } else {
      body = `${headline}\n(You have no lane — summary only)`;
    }

    const checkin = state.checkin_done_today
      ? "Today's check-in: done"
      : "Today's check-in: not yet done";
    const may = myLane
      ? 'You may: log progress on your lane (track_log_progress / track_checkin_lane). Lane changes → Hammond (Confirm).'
      : isLead
        ? 'You may: run check-in / revise / close (Confirm for open-revise-close).'
        : 'Lane changes → Hammond (Confirm).';

    let block = [header, body, checkin, may].join('\n');
    if (block.length > MAX_SPRINT_CHARS) {
      block = `${block.slice(0, MAX_SPRINT_CHARS - 1)}…`;
    }
    blocks.push(block);
  }
  return blocks.join('\n\n');
}

/** One line per roster agent: what they can log / which evidence sources they own. */
export function sprintRosterForPrompt() {
  const owners = {
    brisket: ['nutrition.meals_logged', 'nutrition.protein_target_met', 'nutrition.kcal_within_target'],
    chadwick: ['fitness.workout_completed'],
    sara: ['body.measurements.waist', 'body.measurements.hips', 'body.weight'],
    penelope: ['mind.diary_entry'],
    vera: [],
    clare: [],
    clementine: [],
    hyaluronica: [],
    ann: [],
    hammond: ['self_report']
  };
  return Object.keys(SPRINT_ROSTER).map(slug => {
    const name = SPRINT_ROSTER[slug];
    const sources = owners[slug] || [];
    const known = sources.filter(s => s in EVIDENCE_ADAPTERS);
    const src = known.length ? known.join(', ') : 'self_report only';
    return `${name} (${slug}): evidence — ${src}`;
  }).join('\n');
}

export function formatSprintRosterBlock(active) {
  if (!active) return '';
  return `SPRINT ROSTER (assign lanes only to these agents; use self_report when no adapter fits):\n${sprintRosterForPrompt()}`;
}
