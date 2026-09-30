/**
 * Life Home challenge-sprint cards (#home-sprints).
 * Reads GET /api/challenges/active → computeSprintState (same source as prompts/nudges).
 * Presentation reuses Home metric-card / progress-track / agent-avatar patterns
 * plus allowlisted chart-kit mounts from sprint.viz.
 */
import { formatDisplayDate } from '../core/time.js';
import { resolveSprintViz, vizPlainName } from '../core/sprint-viz.js';
import { avatarForSlug } from './agent-avatars.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildCarvedAway } from './chart-kit/carved-away.js';
import { buildGateRings } from './chart-kit/gate-rings.js';
import { buildGlideSlope } from './chart-kit/glide-slope.js';
import { buildStairsDown } from './chart-kit/stairs-down.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { mountSceneChart } from './render-scene-chart.js';
import {
  buildSprintAreaSeries,
  buildSprintCarvedChart,
  buildSprintGateKeys,
  buildSprintGlideChart,
  buildSprintStairsChart,
  headlineRingTarget
} from './sprint-viz-charts.js';

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

function setProgress(track, pct) {
  const clamped = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  track.setAttribute('aria-valuenow', String(clamped));
  if (track.style?.setProperty) {
    track.style.setProperty('--progress', `${clamped}%`);
  } else if (track.style) {
    track.style['--progress'] = `${clamped}%`;
  }
}

function agentDisplay(slug) {
  const avatar = avatarForSlug(slug);
  return {
    slug,
    name: avatar?.shortName || avatar?.name || slug,
    purpose: avatar?.purpose || '',
    src: avatar?.src || '',
    colour: avatar?.colour || ''
  };
}

function fmtDelta(state) {
  const h = state?.headline;
  if (!h) return 'No headline metric yet';
  const unit = h.unit ? ` ${h.unit}` : '';
  if (!h.readings?.length) {
    return h.baseline != null
      ? `Baseline ${h.baseline}${unit} — waiting for the next reading`
      : 'No readings yet';
  }
  if (h.readings.length < 2) {
    return `Baseline ${h.baseline}${unit} — waiting for the next reading`;
  }
  const delta = h.delta;
  const sign = delta > 0 ? '+' : '';
  return `${h.metricLabel || h.label}: ${h.latest.value}${unit} (${sign}${delta}${unit} since baseline)`;
}

function headlineDeltaChip(state) {
  const h = state?.headline;
  if (h?.delta == null || !Number.isFinite(Number(h.delta))) return null;
  const unit = h.unit ? ` ${h.unit}` : '';
  const delta = Number(h.delta);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${unit}`;
}

function dayProgressPct(state) {
  const n = Number(state?.day_n);
  const len = Number(state?.length_days);
  if (!Number.isFinite(n) || !Number.isFinite(len) || len <= 0) return 0;
  return Math.min(100, Math.max(0, (n / len) * 100));
}

function measureProgressPct(measure) {
  const judged = Number(measure?.judged) || 0;
  const met = Number(measure?.met) || 0;
  if (judged <= 0) return 0;
  return Math.min(100, Math.max(0, (met / judged) * 100));
}

function measurePhrase(measure) {
  const label = measure?.label || 'Measure';
  const judged = Number(measure?.judged) || 0;
  const met = Number(measure?.met) || 0;
  if (judged > 0) return `${label} · ${met} of ${judged} days`;
  return label;
}

function agentChatHref(agent) {
  return `#/chat/${encodeURIComponent(agent)}`;
}

function checkinHref(sprintId, ended) {
  const protocol = ended ? 'sprint-final' : 'sprint-checkin';
  return `#/chat/hammond?protocol=${protocol}&sprint=${encodeURIComponent(sprintId)}`;
}

function sparkGeometry(readings) {
  if (!Array.isArray(readings) || readings.length < 2) return null;
  const values = readings.map(r => Number(r.value)).filter(Number.isFinite);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 240;
  const h = 56;
  const padY = 4;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = padY + (h - padY * 2) - ((v - min) / span) * (h - padY * 2);
    return { x, y };
  });
  const line = points.map(p => `${p.x},${p.y}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return { w, h, line, area, latest: points[points.length - 1] };
}

function createEl(root, tag) {
  return root.createElement(tag);
}

function createSvg(root, tag) {
  if (typeof root.createElementNS === 'function') {
    return root.createElementNS('http://www.w3.org/2000/svg', tag);
  }
  return root.createElement(tag);
}

function appendProgressTrack(root, parent, {
  pct,
  label,
  variant = 'marine',
  status = null
} = {}) {
  const wrap = createEl(root, 'div');
  wrap.className = 'home-sprint-card__measure';
  if (status) wrap.dataset.status = status;

  const caption = createEl(root, 'p');
  caption.className = 'home-sprint-card__measure-label';
  caption.textContent = label;

  const track = createEl(root, 'div');
  track.className = `progress-track progress-track--${variant} home-sprint-card__track`;
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  setProgress(track, pct);
  const fill = createEl(root, 'span');
  track.append(fill);

  wrap.append(caption, track);
  parent.append(wrap);
  return wrap;
}

function renderSparkArea(root, state, labelText) {
  const geo = sparkGeometry(state.headline?.readings);
  if (!geo) return null;
  const trendHost = createEl(root, 'div');
  trendHost.className = 'home-sprint-card__trend';
  const svg = createSvg(root, 'svg');
  svg.setAttribute('viewBox', `0 0 ${geo.w} ${geo.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${labelText} trend`);
  const area = createSvg(root, 'polygon');
  area.setAttribute('class', 'home-sprint-card__trend-area');
  area.setAttribute('points', geo.area);
  const poly = createSvg(root, 'polyline');
  poly.setAttribute('class', 'home-sprint-card__trend-line');
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke-width', '2.5');
  poly.setAttribute('stroke-linecap', 'round');
  poly.setAttribute('stroke-linejoin', 'round');
  poly.setAttribute('points', geo.line);
  const dot = createSvg(root, 'circle');
  dot.setAttribute('class', 'home-sprint-card__trend-dot');
  dot.setAttribute('cx', String(geo.latest.x));
  dot.setAttribute('cy', String(geo.latest.y));
  dot.setAttribute('r', '3.5');
  svg.append(area, poly, dot);
  trendHost.append(svg);
  return trendHost;
}

function renderAreaLineChart(root, state, labelText) {
  const series = buildSprintAreaSeries(state.headline);
  if (series.length < 2) return renderSparkArea(root, state, labelText);
  const built = buildAreaLine(series, {
    width: 320,
    height: 88,
    padding: 8,
    yDomain: 'padded'
  });
  const trendHost = createEl(root, 'div');
  trendHost.className = 'home-sprint-card__trend home-sprint-card__trend--kit';
  trendHost.dataset.viz = 'area-line';
  const svg = createSvg(root, 'svg');
  svg.setAttribute('viewBox', `0 0 ${built.width} ${built.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${labelText} area-line`);
  svg.setAttribute('class', 'home-sprint-card__area-line');
  if (built.areaPath) {
    const area = createSvg(root, 'path');
    area.setAttribute('d', built.areaPath);
    area.setAttribute('class', 'home-sprint-card__trend-area');
    svg.append(area);
  }
  if (built.linePath) {
    const line = createSvg(root, 'path');
    line.setAttribute('d', built.linePath);
    line.setAttribute('class', 'home-sprint-card__trend-line');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', '2');
    svg.append(line);
  }
  trendHost.append(svg);
  return trendHost;
}

function mountHeadlineScene(root, host, build, data, vizId) {
  if (!host || !data || !host.ownerDocument) return false;
  host.className = 'home-sprint-card__chart hc-host';
  host.dataset.viz = vizId;
  try {
    mountSceneChart(host, build, data, { quiet: true, maxWidth: 560 });
    return true;
  } catch {
    return false;
  }
}

function renderHeadlineChart(root, state, vizId, labelText) {
  const wrap = createEl(root, 'div');
  wrap.className = 'home-sprint-card__viz';
  wrap.dataset.viz = vizId;

  if (vizId === 'glide-slope') {
    const data = buildSprintGlideChart(state.headline);
    if (data && mountHeadlineScene(root, wrap, buildGlideSlope, data, vizId)) return wrap;
    return renderAreaLineChart(root, state, labelText);
  }
  if (vizId === 'carved-away') {
    const data = buildSprintCarvedChart(state.headline);
    if (data?.status === 'ready' && mountHeadlineScene(root, wrap, buildCarvedAway, data, vizId)) return wrap;
    return renderAreaLineChart(root, state, labelText);
  }
  if (vizId === 'stairs-down') {
    const data = buildSprintStairsChart(state.headline);
    if (data?.status === 'ready' && mountHeadlineScene(root, wrap, buildStairsDown, data, vizId)) return wrap;
    return renderAreaLineChart(root, state, labelText);
  }
  if (vizId === 'ring') {
    const target = headlineRingTarget(state.headline);
    if (target) {
      wrap.className = 'home-sprint-card__viz home-sprint-card__viz--ring';
      const svg = createSvg(root, 'svg');
      svg.className = 'metric-ring home-sprint-card__ring';
      svg.setAttribute('class', 'metric-ring home-sprint-card__ring');
      svg.setAttribute('viewBox', '0 0 64 64');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${labelText} progress ring`);
      const track = createSvg(root, 'circle');
      track.setAttribute('data-role', 'track');
      track.setAttribute('class', 'metric-ring-track');
      track.setAttribute('fill', 'none');
      const fill = createSvg(root, 'circle');
      fill.setAttribute('data-role', 'fill');
      fill.setAttribute('class', 'metric-ring-fill');
      fill.setAttribute('fill', 'none');
      svg.append(track, fill);
      wrap.append(svg);
      if (typeof applyRingTarget === 'function') {
        try { applyRingTarget(svg, target, { size: 64, strokeWidth: 8, reducedMotion: true }); } catch { /* unit fake DOM */ }
      }
      return wrap;
    }
    return renderSparkArea(root, state, labelText);
  }
  if (vizId === 'area-line') return renderAreaLineChart(root, state, labelText);
  return renderSparkArea(root, state, labelText);
}

function renderTrend(root, state, vizResolution) {
  const block = createEl(root, 'section');
  block.className = 'home-sprint-card__headline-block';

  const head = createEl(root, 'div');
  head.className = 'home-sprint-card__headline-head';

  const label = createEl(root, 'p');
  label.className = 'metric-label';
  label.textContent = state.headline?.metricLabel || state.headline?.label || 'Headline';

  const deltaText = headlineDeltaChip(state);
  if (deltaText) {
    const chip = createEl(root, 'span');
    chip.className = 'home-sprint-card__delta';
    const direction = state.headline?.direction || 'down';
    const delta = Number(state.headline?.delta);
    const improving = direction === 'down' ? delta < 0 : delta > 0;
    chip.dataset.tone = improving ? 'good' : (delta === 0 ? 'flat' : 'watch');
    chip.textContent = deltaText;
    head.append(label, chip);
  } else {
    head.append(label);
  }

  const valueRow = createEl(root, 'div');
  valueRow.className = 'home-sprint-card__headline-value';
  const strong = createEl(root, 'strong');
  const latest = state.headline?.latest?.value;
  const baseline = state.headline?.baseline;
  strong.textContent = latest != null ? String(latest) : (baseline != null ? String(baseline) : '—');
  const unit = createEl(root, 'span');
  unit.textContent = state.headline?.unit || '';
  valueRow.append(strong, unit);

  const caption = createEl(root, 'p');
  caption.className = 'metric-caption home-sprint-card__headline-caption';
  caption.textContent = fmtDelta(state);

  const vizHint = createEl(root, 'p');
  vizHint.className = 'metric-caption home-sprint-card__viz-label';
  vizHint.textContent = vizPlainName(vizResolution.headline, 'headline');

  block.append(head, valueRow, caption, vizHint);

  const chart = renderHeadlineChart(root, state, vizResolution.headline, label.textContent);
  if (chart) block.append(chart);

  return block;
}

function appendMeasureRing(root, parent, { pct, label, status = null } = {}) {
  const wrap = createEl(root, 'div');
  wrap.className = 'home-sprint-card__measure home-sprint-card__measure--ring';
  if (status) wrap.dataset.status = status;
  const caption = createEl(root, 'p');
  caption.className = 'home-sprint-card__measure-label';
  caption.textContent = label;
  const svg = createSvg(root, 'svg');
  svg.className = 'metric-ring home-sprint-card__lane-ring';
  svg.setAttribute('class', 'metric-ring home-sprint-card__lane-ring');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const track = createSvg(root, 'circle');
  track.setAttribute('data-role', 'track');
  track.setAttribute('class', 'metric-ring-track');
  track.setAttribute('fill', 'none');
  const fill = createSvg(root, 'circle');
  fill.setAttribute('data-role', 'fill');
  fill.setAttribute('class', 'metric-ring-fill');
  fill.setAttribute('fill', 'none');
  svg.append(track, fill);
  wrap.append(caption, svg);
  parent.append(wrap);
  try {
    applyRingTarget(svg, { value: pct, target: 100 }, { size: 48, strokeWidth: 6, reducedMotion: true });
  } catch { /* fake DOM */ }
  return wrap;
}

function renderLane(root, lane, options, laneViz = 'progress-track') {
  const agent = agentDisplay(lane.agent);
  const li = createEl(root, 'li');
  li.className = 'home-sprint-card__lane';
  li.dataset.status = lane.status || 'no_evidence';

  const link = createEl(root, 'a');
  link.className = 'home-sprint-card__lane-link';
  link.href = agentChatHref(lane.agent);
  link.setAttribute('aria-label', `Open chat with ${agent.name}`);
  if (agent.colour) link.style?.setProperty?.('--agent-colour', agent.colour);
  link.addEventListener('click', event => {
    if (options.onOpenChat) {
      event.preventDefault();
      options.onOpenChat(link.href);
    }
  });

  const identity = createEl(root, 'div');
  identity.className = 'home-sprint-card__lane-identity';

  if (agent.src) {
    const img = createEl(root, 'img');
    img.className = 'chat-message__avatar home-sprint-card__avatar';
    img.src = agent.src;
    img.alt = '';
    img.width = 40;
    img.height = 40;
    img.decoding = 'async';
    identity.append(img);
  } else {
    const fallback = createEl(root, 'span');
    fallback.className = 'home-sprint-card__avatar-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = (agent.name || '?').slice(0, 1).toUpperCase();
    identity.append(fallback);
  }

  const copy = createEl(root, 'div');
  copy.className = 'home-sprint-card__lane-copy';
  const name = createEl(root, 'span');
  name.className = 'home-sprint-card__lane-name';
  name.textContent = agent.name;
  const role = createEl(root, 'span');
  role.className = 'home-sprint-card__lane-role';
  role.textContent = lane.role || 'Lane';
  copy.append(name, role);
  identity.append(copy);

  const statusWrap = createEl(root, 'span');
  statusWrap.className = 'home-sprint-card__status';
  const dot = createEl(root, 'span');
  dot.className = 'status-dot home-sprint-card__status-dot';
  dot.setAttribute('aria-hidden', 'true');
  const chip = createEl(root, 'span');
  chip.className = 'home-sprint-card__chip';
  chip.dataset.status = lane.status;
  chip.textContent = STATUS_LABEL[lane.status] || lane.status;
  statusWrap.append(dot, chip);

  const top = createEl(root, 'div');
  top.className = 'home-sprint-card__lane-top';
  top.append(identity, statusWrap);

  const measures = createEl(root, 'div');
  measures.className = 'home-sprint-card__lane-measures';
  const summaries = Array.isArray(lane.measureSummaries) ? lane.measureSummaries : [];
  if (summaries.length) {
    for (const measure of summaries) {
      const judged = Number(measure.judged) || 0;
      const variant = lane.status === 'stalled' ? 'logging' : 'marine';
      const label = judged > 0
        ? measurePhrase(measure)
        : (lane.status === 'unavailable'
          ? `${measure.label || 'Measure'} · unavailable`
          : `${measure.label || 'Measure'} · no evidence yet`);
      const pct = judged > 0 ? measureProgressPct(measure) : 0;
      if (laneViz === 'ring') {
        appendMeasureRing(root, measures, { pct, label, status: lane.status });
      } else {
        appendProgressTrack(root, measures, {
          pct,
          label,
          variant,
          status: lane.status
        });
      }
    }
  } else {
    const detail = createEl(root, 'p');
    detail.className = 'metric-caption';
    detail.textContent = lane.role || 'No lead measures yet';
    measures.append(detail);
  }

  link.append(top, measures);
  li.append(link);
  return li;
}

function renderLaneGateRings(root, state) {
  const keys = buildSprintGateKeys(state.lanes);
  if (!keys.length) return null;
  const host = createEl(root, 'div');
  host.className = 'home-sprint-card__gate';
  host.dataset.viz = 'gate-rings';
  if (host.ownerDocument) {
    try {
      mountSceneChart(host, buildGateRings, { keys }, { quiet: true, maxWidth: 420 });
    } catch { /* ignore */ }
  }
  return host;
}

function renderActions(root, state, options) {
  const actions = createEl(root, 'div');
  actions.className = 'home-sprint-card__actions';

  if (state.ended_awaiting_review) {
    const btn = createEl(root, 'button');
    btn.type = 'button';
    btn.className = 'btn btn--primary home-sprint-card__cta';
    btn.textContent = 'Ended — final review';
    btn.addEventListener('click', () => options.onOpenChat?.(checkinHref(state.id, true)));
    actions.append(btn);
    return actions;
  }

  if (state.checkin_done_today) {
    const done = createEl(root, 'p');
    done.className = 'home-sprint-card__done';
    done.textContent = 'Check-in done today';
    actions.append(done);
  } else {
    const btn = createEl(root, 'button');
    btn.type = 'button';
    btn.className = 'btn btn--primary home-sprint-card__cta';
    btn.textContent = 'Check in';
    btn.addEventListener('click', () => options.onOpenChat?.(checkinHref(state.id, false)));
    actions.append(btn);
  }

  const lead = agentDisplay(state.lead_agent || 'hammond');
  const secondary = createEl(root, 'a');
  secondary.className = 'btn btn--ghost home-sprint-card__secondary';
  secondary.href = agentChatHref(lead.slug);
  secondary.textContent = `Message ${lead.name}`;
  secondary.addEventListener('click', event => {
    if (options.onOpenChat) {
      event.preventDefault();
      options.onOpenChat(secondary.href);
    }
  });
  actions.append(secondary);
  return actions;
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
  const countEl = host.querySelector('[data-home-sprints-count]');
  if (!rail) return;

  setHidden(host, true);
  if (status) {
    status.className = 'metric-caption home-sprints__status';
    status.replaceChildren?.();
    const pulse = createEl(root, 'span');
    pulse.className = 'sync-pulse';
    pulse.setAttribute('aria-hidden', 'true');
    const text = createEl(root, 'span');
    text.textContent = 'Loading sprints…';
    if (status.append) status.append(pulse, text);
    else status.textContent = 'Loading sprints…';
  }
  if (countEl) countEl.textContent = '';

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
    if (countEl) countEl.textContent = '';
    return;
  }

  setHidden(host, false);
  if (status) status.textContent = '';
  if (countEl) {
    const n = visible.length;
    countEl.textContent = n === 1 ? '1 open' : `${n} open`;
  }

  // Section title leads with the challenge name when one sprint is open.
  const heading = host.querySelector('#home-sprints-heading');
  if (heading) {
    if (visible.length === 1) {
      heading.textContent = visible[0].state?.title || 'Challenge sprint';
    } else {
      heading.textContent = 'Challenge sprints';
    }
  }

  const frag = typeof root.createDocumentFragment === 'function'
    ? root.createDocumentFragment()
    : { children: [], append(...nodes) { this.children.push(...nodes); } };

  for (const row of visible) {
    const state = row.state;
    const viz = resolveSprintViz({
      ...state,
      viz: state.viz || row.sprint?.viz || null
    });
    const card = createEl(root, 'article');
    card.className = 'home-sprint-card metric-card';
    card.dataset.sprintId = state.id;
    card.dataset.vizHeadline = viz.headline;
    card.dataset.vizLanes = viz.lanes;
    if (state.ended_awaiting_review) card.dataset.state = 'ended';
    else if (state.checkin_done_today) card.dataset.state = 'checked-in';
    else card.dataset.state = 'open';

    const head = createEl(root, 'header');
    head.className = 'home-sprint-card__head metric-heading';

    const titleBlock = createEl(root, 'div');
    const title = createEl(root, 'h3');
    title.className = 'home-sprint-card__title metric-label';
    title.textContent = state.title;
    const meta = createEl(root, 'p');
    meta.className = 'metric-context';
    const ends = state.end_date ? `Ends ${formatDisplayDate(state.end_date)}` : '';
    meta.textContent = ends;
    titleBlock.append(title, meta);

    const dayChip = createEl(root, 'span');
    dayChip.className = state.ended_awaiting_review
      ? 'system-chip home-sprint-card__day'
      : 'date-chip home-sprint-card__day';
    if (state.ended_awaiting_review) {
      dayChip.textContent = 'Ended — final review';
    } else {
      const dayBit = state.day_label
        ? `Day ${String(state.day_label).replace(/^day\s+/i, '')}`
        : (state.day_n != null ? `Day ${state.day_n}` : 'In progress');
      dayChip.textContent = dayBit;
    }
    head.append(titleBlock, dayChip);

    const sprintProgress = createEl(root, 'div');
    sprintProgress.className = 'home-sprint-card__sprint-progress';
    appendProgressTrack(root, sprintProgress, {
      pct: state.ended_awaiting_review ? 100 : dayProgressPct(state),
      label: state.ended_awaiting_review
        ? 'Sprint complete — awaiting review'
        : `Sprint progress · day ${state.day_n ?? '—'} of ${state.length_days ?? '—'}`,
      variant: 'marine'
    });

    const headline = renderTrend(root, state, viz);

    let lanesBlock;
    if (viz.lanes === 'gate-rings') {
      lanesBlock = createEl(root, 'div');
      lanesBlock.className = 'home-sprint-card__lanes-wrap';
      const gate = renderLaneGateRings(root, state);
      if (gate) lanesBlock.append(gate);
      const lanes = createEl(root, 'ul');
      lanes.className = 'home-sprint-card__lanes';
      lanes.setAttribute('aria-label', 'Sprint lanes');
      for (const lane of state.lanes || []) {
        lanes.append(renderLane(root, lane, options, 'progress-track'));
      }
      lanesBlock.append(lanes);
    } else {
      lanesBlock = createEl(root, 'ul');
      lanesBlock.className = 'home-sprint-card__lanes';
      lanesBlock.setAttribute('aria-label', 'Sprint lanes');
      for (const lane of state.lanes || []) {
        lanesBlock.append(renderLane(root, lane, options, viz.lanes));
      }
    }

    const actions = renderActions(root, state, options);
    card.append(head, sprintProgress, headline, lanesBlock, actions);
    frag.append(card);
  }

  rail.replaceChildren?.(frag);
}
