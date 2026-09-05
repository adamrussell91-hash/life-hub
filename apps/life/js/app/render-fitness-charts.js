import { buildColumns } from './chart-kit/columns.js';
import { formatDisplayDate } from '../core/time.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

function setHidden(element, hidden) {
  if (!element) return;
  if (hidden) element.setAttribute('hidden', '');
  else element.removeAttribute('hidden');
}

function formatKg(kg) {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return '—';
  const text = Number.isInteger(kg) ? kg.toLocaleString('en-AU') : kg.toFixed(1);
  return `${text} kg`;
}

function formatSigned(value, unit) {
  if (value == null || !Number.isFinite(value) || value === 0) return 'same';
  const sign = value > 0 ? '+' : '−';
  const mag = Math.abs(value);
  const text = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  return unit ? `${sign}${text} ${unit}` : `${sign}${text}`;
}

function formatReading(value, unit) {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

function setBarWidth(fill, pct) {
  const width = `${Math.max(8, pct)}%`;
  fill.style = fill.style ?? {};
  if (typeof fill.style.setProperty === 'function') fill.style.setProperty('--bar', width);
  else fill.style['--bar'] = width;
}

function renderPips(root, selector, { value = 0, target = 0 } = {}) {
  const host = root.querySelector(selector);
  if (!host || typeof root.createElement !== 'function') return;
  host.replaceChildren();
  const slots = Math.max(0, Number(target) || 0);
  const filled = Math.max(0, Number(value) || 0);
  for (let index = 0; index < slots; index += 1) {
    const pip = root.createElement('span');
    pip.className = 'fitness-pip';
    pip.dataset.filled = index < filled ? 'true' : 'false';
    host.append(pip);
  }
}

function renderMonthPips(root, marks) {
  const host = root.querySelector('[data-fitness="month-pips"]');
  const card = root.querySelector('#fitness-rest-card');
  const empty = root.querySelector('[data-fitness-empty="rest"]');
  if (!host) return;
  host.replaceChildren();
  if (!marks?.length) {
    setHidden(card, true);
    return;
  }
  const trained = marks.filter(day => day.trained).length;
  if (trained === 0) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  setHidden(empty, true);
  for (const day of marks) {
    const pip = root.createElement('span');
    pip.className = 'fitness-month-pip';
    pip.dataset.hit = day.trained ? 'true' : 'false';
    pip.title = formatDisplayDate(day.date);
    host.append(pip);
  }
  setText(root, '[data-fitness="rest-summary"]', `${trained} trained · ${marks.length - trained} rest`);
}

function renderShareList(root, { card, host, empty, items, formatValue }) {
  const cardEl = root.querySelector(card);
  const list = root.querySelector(host);
  const emptyEl = root.querySelector(empty);
  if (!list) return;
  list.replaceChildren();
  if (!items?.length) {
    setHidden(cardEl, true);
    return;
  }
  setHidden(cardEl, false);
  setHidden(emptyEl, true);
  const chart = buildColumns(items.map(item => ({
    key: item.key,
    label: item.label,
    value: item.value
  })));
  for (const bar of chart.bars) {
    const row = root.createElement('div');
    row.className = 'fitness-share-row';
    const label = root.createElement('strong');
    label.textContent = bar.label;
    const track = root.createElement('span');
    track.className = 'fitness-share-row__track';
    const fill = root.createElement('i');
    setBarWidth(fill, bar.heightPct);
    track.append(fill);
    const value = root.createElement('span');
    value.textContent = formatValue(bar.value);
    row.append(label, track, value);
    list.append(row);
  }
}

function renderPushPull(root, items) {
  const card = root.querySelector('#fitness-push-pull-card');
  const empty = root.querySelector('[data-fitness-empty="push-pull"]');
  const bar = root.querySelector('[data-fitness="push-pull-bar"]');
  if (!items?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  setHidden(empty, true);
  const push = items.find(item => item.key === 'push')?.value ?? 0;
  const pull = items.find(item => item.key === 'pull')?.value ?? 0;
  const total = push + pull;
  setText(root, '[data-fitness="push-kg"]', formatKg(push));
  setText(root, '[data-fitness="pull-kg"]', formatKg(pull));
  if (bar && typeof root.createElement === 'function') {
    bar.replaceChildren();
    if (total > 0) {
      const pushFill = root.createElement('i');
      pushFill.className = 'fitness-split__push';
      setBarWidth(pushFill, (push / total) * 100);
      const pullFill = root.createElement('i');
      pullFill.className = 'fitness-split__pull';
      setBarWidth(pullFill, (pull / total) * 100);
      bar.append(pushFill, pullFill);
    }
  }
}

function renderRecovery(root, flags) {
  const list = root.querySelector('#fitness-recovery-list');
  const rows = flags ?? [];
  setText(root, '[data-fitness="recovery-count"]', String(rows.length));
  if (!list) return;
  list.replaceChildren();
  if (!rows.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'None added this window';
    list.append(empty);
    return;
  }
  for (const flag of rows) {
    const item = root.createElement('div');
    item.className = 'fitness-kv-row';
    const name = root.createElement('strong');
    name.textContent = flag.title;
    const date = root.createElement('span');
    date.textContent = formatDisplayDate(flag.date);
    item.append(name, date);
    list.append(item);
  }
}

function renderE1rm(root, trends) {
  const card = root.querySelector('#fitness-e1rm-card');
  const host = root.querySelector('#fitness-e1rm-list');
  if (!host) return;
  host.replaceChildren();
  if (!trends?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  for (const lift of trends) {
    const item = root.createElement('div');
    item.className = 'fitness-kv-row fitness-kv-row--triple';
    const name = root.createElement('strong');
    name.textContent = lift.name;
    const current = root.createElement('span');
    current.textContent = `${lift.current.toFixed(1)} kg`;
    const delta = root.createElement('span');
    delta.className = 'fitness-delta';
    delta.dataset.colour = lift.delta > 0 ? 'up' : lift.delta < 0 ? 'down' : 'same';
    delta.textContent = formatSigned(lift.delta, 'kg');
    item.append(name, current, delta);
    host.append(item);
  }
}

function renderEfficiency(root, weeks) {
  const card = root.querySelector('#fitness-efficiency-card');
  const host = root.querySelector('#fitness-efficiency-bars');
  if (!host) return;
  host.replaceChildren();
  if (!weeks?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  const chart = buildColumns(
    weeks.map(week => ({
      key: week.weekStart,
      label: `w/c ${formatDisplayDate(week.weekStart)}`,
      value: week.value
    }))
  );
  for (const bar of chart.bars) {
    const row = root.createElement('div');
    row.className = 'fitness-share-row';
    const label = root.createElement('strong');
    label.textContent = bar.label;
    const track = root.createElement('span');
    track.className = 'fitness-share-row__track';
    const fill = root.createElement('i');
    setBarWidth(fill, bar.heightPct);
    track.append(fill);
    const value = root.createElement('span');
    value.textContent = `${bar.value.toFixed(1)} kg/set`;
    row.append(label, track, value);
    host.append(row);
  }
}

function renderReadings(root, readings) {
  const card = root.querySelector('#fitness-readings-card');
  const host = root.querySelector('#fitness-readings');
  if (!host) return;
  host.replaceChildren();
  if (!readings?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  for (const row of readings) {
    const item = root.createElement('div');
    item.className = 'fitness-kv-row fitness-kv-row--triple';
    const name = root.createElement('strong');
    name.textContent = row.label;
    const current = root.createElement('span');
    current.textContent = formatReading(row.current, row.unit);
    const delta = root.createElement('span');
    delta.className = 'fitness-delta';
    delta.dataset.colour = row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : 'same';
    delta.textContent = formatSigned(row.delta, row.unit);
    item.append(name, current, delta);
    host.append(item);
  }
}

function renderPain(root, rows) {
  const card = root.querySelector('#fitness-pain-card');
  const host = root.querySelector('#fitness-pain-list');
  if (!host) return;
  host.replaceChildren();
  if (!rows?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  for (const row of rows) {
    const item = root.createElement('div');
    item.className = 'fitness-kv-row';
    const name = root.createElement('strong');
    name.textContent = row.site;
    const count = root.createElement('span');
    count.textContent = `${row.count} session${row.count === 1 ? '' : 's'}`;
    item.append(name, count);
    host.append(item);
  }
}

function missedDetail(skips) {
  const skipped = skips.skipped ?? 0;
  const pastDue = skips.pastDue ?? 0;
  if (!skips.missed) return 'None this window';
  const parts = [];
  if (skipped) parts.push(`${skipped} skipped`);
  if (pastDue) parts.push(`${pastDue} left planned`);
  return parts.join(' · ') || `${skips.missed} missed`;
}

export function renderFitnessCharts(root, charts = {}) {
  setText(root, '[data-fitness="longest-streak"]', String(charts.longestStreak ?? 0));

  const week = charts.weekRing ?? { value: 0, target: 4 };
  renderPips(root, '[data-fitness="week-pips"]', week);
  setText(root, '[data-fitness="week-ring-value"]', String(week.value));
  setText(root, '[data-fitness="week-ring-target"]', `/ ${week.target}`);

  const skips = charts.skipRing ?? { missed: 0, skipped: 0, pastDue: 0 };
  setText(root, '[data-fitness="missed-count"]', String(skips.missed ?? 0));
  setText(root, '[data-fitness="missed-detail"]', missedDetail(skips));

  renderRecovery(root, charts.recoveryFlags ?? []);
  renderMonthPips(root, charts.trainedMarks);
  renderShareList(root, {
    card: '#fitness-rep-card',
    host: '#fitness-rep-bars',
    empty: '[data-fitness-empty="reps"]',
    items: charts.repRanges ?? [],
    formatValue: value => `${value} set${value === 1 ? '' : 's'}`
  });
  renderShareList(root, {
    card: '#fitness-region-vol-card',
    host: '#fitness-region-vol-bars',
    empty: '[data-fitness-empty="region-vol"]',
    items: charts.regionVolume ?? [],
    formatValue: formatKg
  });
  renderPushPull(root, charts.pushPull ?? []);
  renderE1rm(root, charts.e1rmTrends);
  renderEfficiency(root, charts.volumePerSetWeeks);
  renderReadings(root, charts.sessionReadings);
  renderPain(root, charts.painBySite);
}
