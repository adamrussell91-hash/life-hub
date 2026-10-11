import { mountChartInfo } from '../../../../packages/design-kit/js/hub-chart-info.js';
import { creatineEtaLabel } from '../core/creatine.js';
import { formatGrams } from '../core/aggregate.js';
import { addCalendarDays, formatDisplayDate, formatWeekday, getSydneyDateKey } from '../core/time.js';
import { motionIsQuiet } from './chart-kit/animate.js';
import { buildCreatineElastic } from './chart-kit/creatine-elastic.js';

const mounts = new WeakMap();
const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderCreatine(root, model, options = {}) {
  const host = root.querySelector('#nutrition-creatine');
  if (!host || !model) return () => {};
  const previous = mounts.get(host)?.model;
  mounts.get(host)?.cleanup();
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  host.innerHTML = '<p class="metric-label creatine-card__kicker"></p><div class="creatine-card__heading"><h3>Creatine</h3><strong class="creatine-card__eta" aria-live="polite"></strong></div><p class="creatine-card__routine"></p><div class="creatine-card__plot"><svg class="creatine-card__chart" role="img"></svg><p class="creatine-card__empty" hidden>History loading · estimate unavailable</p></div><div class="creatine-card__legend"><span><i class="creatine-key creatine-key--solid"></i>Muscle stores</span><span><i class="creatine-key creatine-key--open"></i>Recent dose</span><span><i class="creatine-key creatine-key--forecast"></i>Forecast</span></div><div class="creatine-card__intake"><button type="button" class="creatine-card__receipt"><strong></strong></button><span></span></div>';
  host.querySelector('.creatine-card__kicker').textContent = 'Today · ' + formatWeekday(model.date).slice(0, 3) + ' ' + formatDisplayDate(model.date);
  const etaLabel = creatineEtaLabel(model);
  const eta = host.querySelector('.creatine-card__eta');
  eta.setAttribute('aria-label', etaLabel);
  eta.title = etaLabel;
  for (const [kind, text] of [
    ['full', etaLabel],
    ['compact', etaLabel.replace(' days to target', 'd to target').replace('No target forecast', 'No forecast')],
    ['short', etaLabel.replace(' days to target', 'd').replace('In target zone', 'In target').replace('History unavailable', 'No history').replace('No target forecast', 'No forecast')]
  ]) {
    const span = doc.createElement('span');
    span.className = 'creatine-card__eta-' + kind;
    span.setAttribute('aria-hidden', 'true');
    span.textContent = text;
    eta.append(span);
  }
  host.querySelector('.creatine-card__routine').textContent = model.phase + ' · ' + formatGrams(model.dailyGrams) + ' g/day' + (model.planConfirmed ? '' : ' · default');
  host.querySelector('.creatine-card__intake strong').textContent = formatGrams(model.todayGrams) + ' g today';
  const todayDoses = (model.doses ?? []).filter(dose => dose.date === model.date);
  const lastDose = todayDoses.at(-1);
  const latestProduct = todayDoses.filter(dose => dose.product).at(-1)?.product;
  host.querySelector('.creatine-card__intake span').textContent = lastDose ? 'Logged ' + (lastDose.timeKnown ? lastDose.time : '· time not recorded') + (latestProduct ? ' · ' + latestProduct : '') : 'No doses logged';
  const svg = host.querySelector('svg');
  const plot = host.querySelector('.creatine-card__plot');
  const incomplete = model.confidence === 'incomplete';
  host.querySelector('.creatine-card__empty').hidden = !incomplete;
  svg.hidden = incomplete;
  host.querySelector('.creatine-card__legend').hidden = incomplete;
  svg.setAttribute('aria-label', 'Estimated supplemental muscle loading, not a measured level. ' + creatineEtaLabel(model) + '. ' + (model.pendingGrams > 0 ? 'Open circle shows recent dose potential as it contributes; no exact absorption deadline.' : ''));
  mountChartInfo(host.querySelector('h3'), {
    id: 'creatine', title: 'Creatine estimate',
    what: 'Estimated supplemental muscle stores and the likely loading range at your routine. This is not measured muscle saturation or a gram deficit. The open dot shows recent dose potential as it gradually contributes, not an exact absorption countdown.',
    how: 'Recomputed from recorded meal supplements and separate doses; unlogged intake counts as zero. The default is 5 g/day until a confirmed routine is recorded. Research supports gradual loading with 3–5 g/day, faster loading with divided doses, and washout over several weeks (ISSN position stand, 2017; Hultman et al., 1996). The stores curve, recent-dose dot and dashed forecast use the conservative lower estimate, matching the target and ETA. The shaded range retains both lower and upper estimates to show model uncertainty. History gaps hide the forecast; food creatine and personal response are not measured.'
  });
  const tip = doc.createElement('div');
  tip.className = 'hc-tip creatine-card__tooltip';
  tip.id = 'creatine-intake-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  plot.append(tip);
  const receipt = host.querySelector('.creatine-card__receipt');
  receipt.setAttribute('aria-label', 'Inspect saved creatine intake for ' + formatDisplayDate(model.date));
  receipt.setAttribute('aria-describedby', tip.id);
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-describedby', tip.id);
  svg.setAttribute('aria-label', svg.getAttribute('aria-label') + ' Hover or tap to inspect dates and saved intake. Use left and right arrow keys.');
  let frame = null, observer = null, progress = 1, stopped = false, lastWidth = 0, chartGeometry = null;
  let pinned = false, inspectIndex = Math.max(0, (model.trace?.length ?? 1) - 1);
  const dates = [...(model.trace ?? []).map(point => ({date:point.date, forecast:false})),
    ...(model.forecast ?? []).filter(point => point.days > 0).map(point => ({date:addCalendarDays(model.date, point.days),forecast:true,days:point.days}))];
  const clockLabel = instant => new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
  const show = (point, anchor = svg) => {
    if (!point || stopped) return;
    const title = doc.createElement('strong');
    title.textContent = point.recent ? 'Recent logged doses' : (point.forecast ? 'Forecast · ' : '') + formatDisplayDate(point.date);
    const lines = [];
    const doses = (model.doses ?? []).filter(dose => point.recent ? dose.at > new Date(model.asOf).getTime() - 86400000 : dose.date === point.date);
    if (point.forecast) lines.push('Projected estimate · not a saved intake');
    else {
      if (point.date === model.date && !point.recent) lines.push('As of ' + clockLabel(model.asOf) + ' · Sydney');
      for (const dose of doses) {
        const source = dose.recordType === 'meal' ? (dose.meal ? dose.meal[0].toUpperCase() + dose.meal.slice(1) : 'Linked') + ' meal' : 'Separate dose';
        lines.push(formatDisplayDate(dose.date) + ' · ' + (dose.timeKnown ? dose.time : 'Time not recorded') + ' · ' + formatGrams(dose.grams) + ' g · ' + source);
        if (dose.product) lines.push(dose.product);
        if (dose.savedAt && Number.isFinite(Date.parse(dose.savedAt))) {
          const savedDate = getSydneyDateKey(new Date(dose.savedAt));
          lines.push('Saved ' + formatDisplayDate(savedDate) + ' · ' + clockLabel(dose.savedAt));
        }
      }
      if (!doses.length) lines.push('No creatine logged');
    }
    const items = lines.map(text => { const span = doc.createElement('span'); span.textContent = text; return span; });
    tip.replaceChildren(title, ...items);
    tip.hidden = false;
    tip.classList.add('is-on');
    const box = plot.getBoundingClientRect(), target = anchor.getBoundingClientRect();
    const width = tip.getBoundingClientRect().width || Math.min(256, box.width);
    tip.style.left = Math.max(0, Math.min(box.width - width, target.left + target.width / 2 - box.left - width / 2)) + 'px';
    tip.style.top = Math.max(0, Math.min(box.height - tip.offsetHeight, target.top - box.top)) + 'px';
  };
  const hide = () => { pinned = false; tip.hidden = true; tip.classList.remove('is-on'); };
  const pointForEvent = event => {
    if (!chartGeometry) return dates[inspectIndex];
    if (event.target?.closest?.('[data-role="pending-dose"]')) return {recent:true};
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) * chartGeometry.width / (box.width || chartGeometry.width);
    const positions = [...chartGeometry.trace.map((point,index) => ({x:point.x,index})),
      ...dates.map((point,index) => point.forecast && point.days <= chartGeometry.horizon ? {x:chartGeometry.now + (chartGeometry.right-chartGeometry.now)*point.days/chartGeometry.horizon,index} : null).filter(Boolean)];
    const nearest = positions.reduce((best,item) => !best || Math.abs(item.x-x)<Math.abs(best.x-x) ? item : best,null);
    if (nearest) inspectIndex = nearest.index;
    return dates[inspectIndex];
  };
  const move = event => { if (!pinned && event.pointerType !== 'touch') show(pointForEvent(event), event.target?.closest?.('[data-role="pending-dose"]') ?? svg); };
  const leave = () => { if (!pinned) hide(); };
  const click = event => { if (pinned) hide(); else { show(pointForEvent(event)); pinned = true; } };
  const focus = () => show(dates[inspectIndex]);
  const key = event => {
    if (event.key === 'Escape') hide();
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); pinned = true;
      inspectIndex = Math.max(0, Math.min(dates.length-1, inspectIndex + (event.key === 'ArrowRight' ? 1 : -1)));
      show(dates[inspectIndex]);
    }
  };
  const receiptFocus = () => { inspectIndex = Math.max(0,(model.trace?.length ?? 1)-1); show({date:model.date}, receipt); };
  const receiptClick = () => { if (pinned) hide(); else { receiptFocus(); pinned = true; } };
  const outside = event => { if (!host.contains(event.target)) hide(); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerleave', leave);
  svg.addEventListener('click', click); svg.addEventListener('focus', focus); svg.addEventListener('blur', leave); svg.addEventListener('keydown', key);
  receipt.addEventListener('focus', receiptFocus); receipt.addEventListener('blur', leave); receipt.addEventListener('click', receiptClick); receipt.addEventListener('keydown', key);
  doc.addEventListener('pointerdown', outside);

  const node = (tag, attrs, text) => {
    const item = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value));
    if (text != null) item.textContent = text;
    svg.append(item);
    return item;
  };
  const draw = () => {
    if (stopped || incomplete) return;
    const width = plot.clientWidth || plot.getBoundingClientRect().width || 400;
    lastWidth = width;
    const chart = buildCreatineElastic(model, { width, progress, previous });
    chartGeometry = chart;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + chart.height);
    svg.replaceChildren();
    node('text', { x: width / 2, y: 12, 'text-anchor': 'middle', class: 'creatine-zone-label' }, 'Target zone');
    node('rect', { x: chart.left, y: chart.top, width: chart.right - chart.left, height: chart.targetY - chart.top, rx: 6, class: 'creatine-zone' });
    for (const y of [chart.base, (chart.base + chart.top) / 2]) node('line', { x1: chart.left, x2: chart.right, y1: y, y2: y, class: 'creatine-guide' });
    node('line', { x1: chart.now, x2: chart.now, y1: chart.targetY + 12, y2: chart.base, class: 'creatine-guide' });
    node('path', { d: chart.area, class: 'creatine-stores-area' });
    node('path', { d: chart.forecastBand, class: 'creatine-forecast-band' });
    node('path', { d: chart.line, class: 'creatine-stores-line', 'data-role': 'stores-line' });
    if (chart.forecast) node('path', { d: chart.forecast, class: 'creatine-forecast', 'data-role': 'forecast' });
    if (chart.pending) {
      node('path', { d: 'M ' + chart.current.x + ' ' + chart.current.y + ' Q ' + ((chart.current.x + chart.pending.x) / 2) + ' ' + chart.current.y + ' ' + chart.pending.x + ' ' + chart.pending.y, class: 'creatine-dose-link' });
      const circle = node('circle', { cx: chart.pending.x, cy: chart.pending.y, r: 6, class: 'creatine-pending', 'data-role': 'pending-dose' });
      const title = doc.createElementNS(SVG_NS, 'title');
      title.textContent = 'Recent dose potential · gradual contribution, not an exact absorption deadline';
      circle.append(title);
    }
    node('circle', { cx: chart.current.x, cy: chart.current.y, r: 5, class: 'creatine-current' });
    node('text', { x: chart.left, y: chart.height - 16 }, 'Recent days');
    node('text', { x: chart.now, y: chart.height - 16, 'text-anchor': 'middle', class: 'creatine-now' }, 'Now');
    node('text', { x: chart.right, y: chart.height - 16, 'text-anchor': 'end' }, '+' + chart.horizon + ' days');
  };
  const quiet = motionIsQuiet(host, { ...options, reducedMotion: win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
  if (!quiet && !incomplete && win?.requestAnimationFrame) {
    progress = 0;
    let start = null;
    const tick = at => {
      if (stopped) return;
      start ??= at;
      const t = Math.min(1, (at - start) / 900);
      progress = 1 - Math.pow(1 - t, 3);
      draw();
      frame = t < 1 ? win.requestAnimationFrame(tick) : null;
    };
    frame = win.requestAnimationFrame(tick);
  }
  draw();
  if (win?.ResizeObserver) {
    observer = new win.ResizeObserver(() => { if (Math.abs(plot.clientWidth - lastWidth) > 0.5) draw(); });
    observer.observe(plot);
  }
  const cleanup = () => {
    stopped = true;
    if (frame != null) win.cancelAnimationFrame(frame);
    observer?.disconnect();
    svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerleave', leave);
    svg.removeEventListener('click', click); svg.removeEventListener('focus', focus); svg.removeEventListener('blur', leave); svg.removeEventListener('keydown', key);
    receipt.removeEventListener('focus', receiptFocus); receipt.removeEventListener('blur', leave); receipt.removeEventListener('click', receiptClick); receipt.removeEventListener('keydown', key);
    doc.removeEventListener('pointerdown', outside);
  };
  mounts.set(host, { model, cleanup });
  return cleanup;
}
