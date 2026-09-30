/**
 * Life Home challenge-sprint cards (#home-sprints).
 * Reads GET /api/challenges/active → computeSprintState (same source as prompts/nudges).
 */
import { formatDisplayDate } from '../core/time.js';

const STATUS_LABEL = {
  on_track: 'On track',
  stalled: 'Stalled',
  no_evidence: 'No evidence',
  unavailable: 'Unavailable'
};

function setHidden(el, hide) {
  if (!el) return;
  if (hide) el.setAttribute('hidden', '');
  else el.removeAttribute('hidden');
}

function fmtDelta(state) {
  const h = state?.headline;
  if (!h) return 'No headline';
  const unit = h.unit ? ` ${h.unit}` : '';
  if (!h.readings?.length) {
    return h.baseline != null
      ? `Baseline ${h.baseline}${unit} — next reading soon`
      : 'No readings yet';
  }
  if (h.readings.length < 2) {
    return `Baseline ${h.baseline}${unit} — next reading soon`;
  }
  const delta = h.delta;
  const sign = delta > 0 ? '+' : '';
  return `${h.metricLabel || h.label}: ${h.latest.value}${unit} (${sign}${delta}${unit} since baseline)`;
}

function measureSummary(lane) {
  const parts = (lane.measureSummaries || []).map(m => {
    if (m.judged > 0) return `${m.label.split(' ')[0].toLowerCase()} ${m.met}/${m.judged}`;
    return m.label;
  });
  return parts.length ? parts.join(' · ') : (lane.role || 'lane');
}

function agentChatHref(agent) {
  return `#/chat/${encodeURIComponent(agent)}`;
}

function checkinHref(sprintId, ended) {
  const protocol = ended ? 'sprint-final' : 'sprint-checkin';
  return `#/chat/hammond?protocol=${protocol}&sprint=${encodeURIComponent(sprintId)}`;
}

function sparkPoints(readings) {
  if (!Array.isArray(readings) || readings.length < 2) return null;
  const values = readings.map(r => Number(r.value)).filter(Number.isFinite);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x},${y}`;
  }).join(' ');
}

export function createHomeSprintsApi(fetchImpl = fetch) {
  return {
    async list() {
      const response = await fetchImpl('/api/challenges/active', {
        method: 'GET',
        headers: { accept: 'application/json' }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        const error = new Error(payload?.error?.message ?? 'Challenges request failed');
        error.code = payload?.error?.code ?? 'request_failed';
        error.status = response.status;
        throw error;
      }
      return payload.data ?? { sprints: [], flags: {} };
    }
  };
}

/**
 * @param {Document|ParentNode} root
 * @param {{ api?: { list(): Promise<any> }, onOpenChat?: (href: string) => void }} options
 */
export async function renderHomeSprints(root, options = {}) {
  const host = root.querySelector?.('#home-sprints');
  if (!host) return;
  const api = options.api ?? createHomeSprintsApi();
  const status = host.querySelector('[data-home-sprints-status]');
  const rail = host.querySelector('[data-home-sprints-rail]');
  if (!rail) return;

  setHidden(host, true);
  if (status) status.textContent = 'Loading sprints…';

  let data;
  try {
    data = await api.list();
  } catch (err) {
    setHidden(host, false);
    if (status) status.textContent = err?.message || 'Could not load sprints';
    rail.replaceChildren?.();
    return;
  }

  const rows = Array.isArray(data.sprints) ? data.sprints : [];
  const visible = rows.filter(row => row?.state?.open || row?.state?.ended_awaiting_review);
  if (!visible.length) {
    setHidden(host, true);
    rail.replaceChildren?.();
    if (status) status.textContent = '';
    return;
  }

  setHidden(host, false);
  if (status) status.textContent = '';
  const frag = typeof root.createDocumentFragment === 'function'
    ? root.createDocumentFragment()
    : { children: [], append(...nodes) { this.children.push(...nodes); } };

  for (const row of visible) {
    const state = row.state;
    const card = root.createElement('article');
    card.className = 'home-sprint-card metric-card';
    card.dataset.sprintId = state.id;

    const head = root.createElement('header');
    head.className = 'home-sprint-card__head';
    const title = root.createElement('h3');
    title.className = 'home-sprint-card__title';
    title.textContent = state.title;
    const meta = root.createElement('p');
    meta.className = 'metric-caption';
    const dayBit = state.ended_awaiting_review
      ? 'Ended — final review'
      : (state.day_label ? `Day ${String(state.day_label).replace(/^day\s+/i, '')}` : '');
    const ends = state.end_date ? `ends ${formatDisplayDate(state.end_date)}` : '';
    meta.textContent = [dayBit, ends].filter(Boolean).join(' · ');
    head.append(title, meta);

    const headline = root.createElement('p');
    headline.className = 'home-sprint-card__headline';
    headline.textContent = fmtDelta(state);

    const trendHost = root.createElement('div');
    trendHost.className = 'home-sprint-card__trend';
    const pts = sparkPoints(state.headline?.readings);
    if (pts) {
      const createEl = typeof root.createElementNS === 'function'
        ? (tag) => root.createElementNS('http://www.w3.org/2000/svg', tag)
        : (tag) => root.createElement(tag);
      const svg = createEl('svg');
      svg.setAttribute('viewBox', '0 0 120 28');
      svg.setAttribute('width', '120');
      svg.setAttribute('height', '28');
      svg.setAttribute('aria-hidden', 'true');
      const poly = createEl('polyline');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', 'currentColor');
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('points', pts);
      svg.append(poly);
      trendHost.append(svg);
    }

    const lanes = root.createElement('ul');
    lanes.className = 'home-sprint-card__lanes';
    for (const lane of state.lanes || []) {
      const li = root.createElement('li');
      li.className = 'home-sprint-card__lane';
      const link = root.createElement('a');
      link.className = 'home-sprint-card__lane-link';
      link.href = agentChatHref(lane.agent);
      link.addEventListener('click', event => {
        if (options.onOpenChat) {
          event.preventDefault();
          options.onOpenChat(link.href);
        }
      });
      const line1 = root.createElement('span');
      line1.className = 'home-sprint-card__lane-main';
      const name = root.createElement('span');
      name.textContent = lane.agent;
      const chip = root.createElement('span');
      chip.className = 'home-sprint-card__chip';
      chip.dataset.status = lane.status;
      chip.textContent = STATUS_LABEL[lane.status] || lane.status;
      line1.append(name, chip);
      const line2 = root.createElement('span');
      line2.className = 'home-sprint-card__lane-detail';
      line2.textContent = measureSummary(lane);
      link.append(line1, line2);
      li.append(link);
      lanes.append(li);
    }

    const actions = root.createElement('div');
    actions.className = 'home-sprint-card__actions';
    if (state.ended_awaiting_review) {
      const btn = root.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--primary';
      btn.textContent = 'Ended — final review';
      btn.addEventListener('click', () => options.onOpenChat?.(checkinHref(state.id, true)));
      actions.append(btn);
    } else if (state.checkin_done_today) {
      const done = root.createElement('p');
      done.className = 'metric-caption';
      done.textContent = 'Check-in done ✓';
      actions.append(done);
    } else {
      const btn = root.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--primary';
      btn.textContent = 'Check in';
      btn.addEventListener('click', () => options.onOpenChat?.(checkinHref(state.id, false)));
      actions.append(btn);
    }

    card.append(head, headline, trendHost, lanes, actions);
    frag.append(card);
  }

  rail.replaceChildren?.(frag);
}
