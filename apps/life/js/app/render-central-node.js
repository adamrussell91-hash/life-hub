import { renderInlineMarkdown } from './render-chat.js';
import { formatGrams } from '../core/aggregate.js';
import { formatDisplayDate, isCalendarDate } from '../core/time.js';
import { loopId } from './central-node-board.js';

const LOOP_STORE_KEY = 'life-hub-cn-loop-hidden';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function createSvg(root, tag) {
  return root.createElementNS?.('http://www.w3.org/2000/svg', tag) ?? root.createElement(tag);
}

function setText(node, value) {
  if (!node) return;
  node.textContent = value ?? '';
}

function weekdayLabel(dateKey) {
  if (!isCalendarDate(dateKey)) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function readHiddenLoopIds(storage) {
  try {
    const raw = storage?.getItem?.(LOOP_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function hideLoopId(id, storage) {
  if (!id || !storage?.setItem) return readHiddenLoopIds(storage);
  const next = [...new Set([...readHiddenLoopIds(storage), id])];
  storage.setItem(LOOP_STORE_KEY, JSON.stringify(next));
  return next;
}

export function paintChartOrEmpty(root, host, svg, { need, have, unit }) {
  const count = Number(have) || 0;
  const threshold = Number(need) || 0;
  const qualifies = count >= threshold;
  const rawChildren = host?.children;
  const children = rawChildren && typeof rawChildren[Symbol.iterator] === 'function'
    ? [...rawChildren]
    : [];
  let empty = children.find(node => String(node.className || '').split(/\s+/).includes('cn-honest-empty'));
  if (svg) {
    svg.hidden = !qualifies;
    if (!qualifies) svg.replaceChildren?.();
    else svg.removeAttribute?.('hidden');
  }
  if (qualifies) {
    if (empty) {
      empty.hidden = true;
      empty.textContent = '';
    }
    return true;
  }
  if (!empty) {
    empty = root.createElement('p');
    empty.className = 'cn-honest-empty mind-honest-empty metric-caption';
  }
  if (svg && typeof svg.after === 'function') svg.after(empty);
  else if (!children.includes(empty)) host.append(empty);
  empty.hidden = false;
  empty.textContent = `Need ${threshold} ${unit}. ${count} so far.`;
  return false;
}

export function packCnBoard() {
  return undefined;
}

function renderMarkdown(root, selector, prose, emptyText) {
  const container = root.querySelector(selector);
  if (!container) return;
  const text = typeof prose === 'string' ? prose.trim() : '';
  if (text) {
    renderInlineMarkdown(root, container, text, { multiline: true });
    container.removeAttribute?.('hidden');
    return;
  }
  container.textContent = emptyText ?? '';
}

function renderSupporting(root, model) {
  const deposits = model.deposits?.length ?? 0;
  const needs = model.needsYou?.length ?? 0;
  const loops = model.openLoops?.length ?? 0;
  const bits = [];
  if (deposits) bits.push(`${deposits} deposit${deposits === 1 ? '' : 's'} since the last sweep`);
  if (needs) bits.push(`${needs} thing${needs === 1 ? '' : 's'} need you`);
  else if (loops) bits.push(`${loops} open loop${loops === 1 ? '' : 's'}`);
  setText(root.querySelector('[data-central-node="supporting"]'), bits.join('. ') || 'No new deposits since the last run.');
}

function renderNeedsYou(root, model) {
  const host = root.querySelector('#cn-needs');
  if (!host) return;
  host.replaceChildren();
  const items = model.needsYou ?? [];
  if (!items.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'Nothing waiting on you.';
    host.append(empty);
    return;
  }
  for (const item of items) {
    const card = root.createElement('section');
    card.className = 'confirm-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Confirm change');
    const eyebrow = root.createElement('p');
    eyebrow.className = 'page-header__eyebrow';
    eyebrow.textContent = item.owner === 'Hammond' ? 'Hammond is waiting on you' : `${item.owner} proposes`;
    const title = root.createElement('h2');
    title.className = 'page-header__title';
    title.style.fontSize = 'var(--text-lg)';
    title.textContent = item.title;
    const support = root.createElement('p');
    support.className = 'page-header__supporting';
    support.textContent = typeof item.ageDays === 'number' ? `Open ${item.ageDays} days.` : 'Open loop.';
    const actions = root.createElement('div');
    actions.className = 'confirm-card__actions';
    const later = root.createElement('button');
    later.className = 'btn btn--ghost';
    later.type = 'button';
    later.textContent = 'Not now';
    later.dataset.loopId = loopId(item);
    later.dataset.act = 'dismiss';
    const answer = root.createElement('button');
    answer.className = 'btn btn--primary';
    answer.type = 'button';
    answer.textContent = 'Answer';
    answer.dataset.act = 'answer';
    actions.append(later, answer);
    card.append(eyebrow, title, support, actions);
    host.append(card);
  }
}

function renderFat(root, model) {
  const svg = root.querySelector('#cn-fat');
  const tile = root.querySelector('#cn-tile-fat');
  const read = root.querySelector('[data-cn="fat-read"]');
  const goal = root.querySelector('[data-cn="fat-goal"]');
  if (!svg || !tile) return;
  const series = model.fat?.days ?? [];
  const ceiling = model.fat?.fatCeiling ?? 50;
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: series.length, unit: 'logged fat days' })) {
    setText(read, '');
    setText(goal, '');
    return;
  }
  svg.replaceChildren();
  const base = 170;
  const max = Math.max(ceiling, ...series.map(day => day.fat_g), 1);
  const k = 140 / max;
  const w = 34;
  const gap = 20;
  const x0 = 36;
  const axis = createSvg(root, 'line');
  axis.setAttribute('x1', '28');
  axis.setAttribute('x2', '624');
  axis.setAttribute('y1', String(base));
  axis.setAttribute('y2', String(base));
  axis.setAttribute('stroke', 'var(--line)');
  svg.append(axis);
  series.forEach((day, index) => {
    const h = Math.max(4, day.fat_g * k);
    const x = x0 + index * (w + gap);
    const bar = createSvg(root, 'rect');
    bar.setAttribute('x', String(x));
    bar.setAttribute('y', String(base - h));
    bar.setAttribute('width', String(w));
    bar.setAttribute('height', String(h));
    bar.setAttribute('rx', '4');
    bar.setAttribute('class', day.over ? 'cn-bar cn-bar--over' : 'cn-bar');
    bar.setAttribute('tabindex', '0');
    const label = `${formatDisplayDate(day.date)} · ${formatGrams(day.fat_g)} g fat${day.over ? ' · over the ceiling' : ''}`;
    const show = () => setText(read, label);
    bar.addEventListener?.('mouseenter', show);
    bar.addEventListener?.('focus', show);
    svg.append(bar);
  });
  const cy = base - ceiling * k;
  const line = createSvg(root, 'line');
  line.setAttribute('x1', '28');
  line.setAttribute('x2', '624');
  line.setAttribute('y1', String(cy));
  line.setAttribute('y2', String(cy));
  line.setAttribute('class', 'cn-ceiling');
  svg.append(line);
  const label = createSvg(root, 'text');
  label.setAttribute('x', '624');
  label.setAttribute('y', String(cy - 5));
  label.setAttribute('text-anchor', 'end');
  label.setAttribute('style', 'fill:var(--danger);font-weight:600');
  label.textContent = `${ceiling} g ceiling`;
  svg.append(label);
  const over = series.filter(day => day.over).length;
  setText(read, over ? `${over} of ${series.length} days over the ${ceiling} g ceiling.` : `All ${series.length} logged days under the ${ceiling} g ceiling.`);
  setText(goal, over
    ? 'For your goal: the 78 to 82 kg recomposition cannot move while the flare rule is being broken.'
    : 'For your goal: fat is holding the flare rule. Keep eating-out days as the watch.');
}

function renderWeight(root, model) {
  const svg = root.querySelector('#cn-weight');
  const tile = root.querySelector('#cn-tile-weight');
  const read = root.querySelector('[data-cn="weight-read"]');
  const goal = root.querySelector('[data-cn="weight-goal"]');
  if (!svg || !tile) return;
  const point = model.weight?.point;
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: point ? 1 : 0, unit: 'weigh-ins' })) {
    setText(read, '');
    setText(goal, '');
    return;
  }
  svg.replaceChildren();
  const target = model.weight?.target ?? { low: 78, high: 82 };
  const min = Math.min(70, target.low - 4, point.weight_kg - 4);
  const max = Math.max(95, target.high + 4, point.weight_kg + 4);
  const xOf = value => 20 + ((value - min) / (max - min)) * 260;
  const track = createSvg(root, 'rect');
  track.setAttribute('x', '20');
  track.setAttribute('y', '34');
  track.setAttribute('width', '260');
  track.setAttribute('height', '10');
  track.setAttribute('rx', '5');
  track.setAttribute('fill', 'var(--shore)');
  svg.append(track);
  const band = createSvg(root, 'rect');
  band.setAttribute('x', String(xOf(target.low)));
  band.setAttribute('y', '34');
  band.setAttribute('width', String(Math.max(4, xOf(target.high) - xOf(target.low))));
  band.setAttribute('height', '10');
  band.setAttribute('rx', '5');
  band.setAttribute('fill', 'var(--pastel-sage)');
  svg.append(band);
  const dot = createSvg(root, 'circle');
  dot.setAttribute('cx', String(xOf(point.weight_kg)));
  dot.setAttribute('cy', '39');
  dot.setAttribute('r', '7');
  dot.setAttribute('fill', 'var(--wave)');
  svg.append(dot);
  const value = createSvg(root, 'text');
  value.setAttribute('x', String(xOf(point.weight_kg)));
  value.setAttribute('y', '66');
  value.setAttribute('text-anchor', 'middle');
  value.setAttribute('style', 'fill:var(--ink);font-weight:600');
  value.textContent = `${point.weight_kg} kg · ${formatDisplayDate(point.date)}`;
  svg.append(value);
  setText(read, `${point.weight_kg} kg on ${formatDisplayDate(point.date)}. Target ${target.low} to ${target.high} kg.`);
  const delta = point.weight_kg - target.high;
  setText(goal, delta > 0
    ? `For your goal: ${formatGrams(delta)} kg above the top of the range.`
    : 'For your goal: inside or under the recomposition band.');
}

function renderLoad(root, model) {
  const svg = root.querySelector('#cn-load');
  const tile = root.querySelector('#cn-tile-load');
  const read = root.querySelector('[data-cn="load-read"]');
  if (!svg || !tile) return;
  const load = model.hubLoad;
  const hubs = load?.hubs ?? [];
  const days = load?.days ?? [];
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: hubs.length, unit: 'hubs with load this week' })) {
    setText(read, 'Teaching, Tasks and planned workouts will land here when those hubs answer.');
    return;
  }
  svg.replaceChildren();
  const teaching = hubs.find(hub => hub.name === 'Teaching')?.vals ?? days.map(() => 0);
  const tasks = hubs.find(hub => hub.name === 'Tasks')?.vals ?? days.map(() => 0);
  const life = hubs.find(hub => hub.name === 'Life')?.vals ?? days.map(() => 0);
  const totals = days.map((_, index) => teaching[index] + tasks[index] + life[index]);
  const max = Math.max(1, ...totals);
  const base = 140;
  const u = 100 / max;
  const w = 28;
  const gap = 12;
  const x0 = 14;
  const axis = createSvg(root, 'line');
  axis.setAttribute('x1', '8');
  axis.setAttribute('x2', '292');
  axis.setAttribute('y1', String(base));
  axis.setAttribute('y2', String(base));
  axis.setAttribute('stroke', 'var(--line)');
  svg.append(axis);
  days.forEach((day, index) => {
    let y = base;
    const x = x0 + index * (w + gap);
    [['var(--wave)', teaching[index]], ['var(--marine)', tasks[index]], ['var(--success)', life[index]]].forEach(([fill, value]) => {
      if (!value) return;
      const h = Math.max(4, value * u);
      y -= h;
      const rect = createSvg(root, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h - 1));
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', fill);
      rect.setAttribute('fill-opacity', '0.82');
      svg.append(rect);
    });
    const tick = createSvg(root, 'text');
    tick.setAttribute('x', String(x + w / 2));
    tick.setAttribute('y', '156');
    tick.setAttribute('text-anchor', 'middle');
    tick.textContent = weekdayLabel(day).slice(0, 2);
    svg.append(tick);
  });
  const peak = totals.reduce((best, value, index) => value > totals[best] ? index : best, 0);
  setText(read, `${formatDisplayDate(days[peak])}: ${teaching[peak]} lessons, ${tasks[peak]} tasks due, ${life[peak]} workouts.`);
}

function renderHeatGrid(root, host, { columns, rows, days, onCell }, peakIndex = -1) {
  host.replaceChildren();
  host.style.gridTemplateColumns = `${columns === 7 ? '7.2rem' : '9.5rem'} repeat(${columns}, minmax(0, 1fr))`;
  host.append(root.createElement('span'));
  days.forEach((day, index) => {
    const head = root.createElement('div');
    head.className = 'cn-heat-day' + (index === peakIndex ? ' is-peak' : '');
    head.textContent = columns === 7 ? weekdayLabel(day).slice(0, 3) : formatDisplayDate(day).slice(0, 5);
    host.append(head);
  });
  rows.forEach(row => {
    const max = Math.max(1, ...row.vals);
    const lab = root.createElement('div');
    lab.className = 'cn-heat-lab';
    lab.textContent = row.name;
    host.append(lab);
    row.vals.forEach((value, index) => {
      const cell = root.createElement('button');
      cell.type = 'button';
      const empty = !(value > 0);
      cell.className = 'cn-heat-cell' + (empty ? ' is-empty' : '') + (!empty && index === peakIndex ? ' is-peak' : '');
      cell.style.setProperty('--h', empty ? '1' : String((0.28 + 0.72 * (value / max)).toFixed(2)));
      if (empty) cell.tabIndex = -1;
      const show = () => onCell?.(row, index, value);
      cell.addEventListener('mouseenter', show);
      cell.addEventListener('focus', show);
      cell.addEventListener('click', show);
      host.append(cell);
    });
  });
}

function renderCollide(root, model) {
  const host = root.querySelector('#cn-collide');
  const tile = root.querySelector('#cn-tile-collide');
  const read = root.querySelector('[data-cn="collide-read"]');
  const goal = root.querySelector('[data-cn="collide-goal"]');
  if (!host || !tile) return;
  const load = model.hubLoad;
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: load?.hubs?.length ?? 0, unit: 'hubs with a deposit this week' })) {
    setText(read, 'Cross-hub load appears when Teaching, Tasks or workouts land on the same days.');
    setText(goal, '');
    return;
  }
  const peak = (load.stack ?? []).reduce((best, value, index) => value > (load.stack[best] ?? 0) ? index : best, 0);
  renderHeatGrid(root, host, {
    columns: load.days.length,
    rows: load.hubs,
    days: load.days,
    peakIndex: (load.stack?.[peak] ?? 0) >= 2 ? peak : -1,
    onCell: (row, index, value) => {
      setText(read, value
        ? `${row.name} · ${formatDisplayDate(load.days[index])} · ${value}`
        : `${row.name} on ${formatDisplayDate(load.days[index])} is quiet.`);
    }
  }, (load.stack?.[peak] ?? 0) >= 2 ? peak : -1);
  const stack = load.stack?.[peak] ?? 0;
  setText(read, stack >= 2
    ? `${formatDisplayDate(load.days[peak])} is the pile-up: ${stack} hubs lit.`
    : 'No day has more than one hub lit.');
  setText(goal, stack >= 2
    ? 'For your goal: a life worth enjoying loses to overload first. Move one block off the peak day.'
    : '');
}

function renderMind(root, model) {
  const host = root.querySelector('#cn-pairs');
  const tile = root.querySelector('#cn-tile-mind');
  const read = root.querySelector('[data-cn="mind-read"]');
  const goal = root.querySelector('[data-cn="mind-goal"]');
  if (!host || !tile) return;
  const strip = model.moodStrip ?? [];
  const logged = strip.filter(day => day.logged);
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: logged.length, unit: 'diary days' })) {
    setText(read, 'No diary in this window.');
    setText(goal, '');
    return;
  }
  host.replaceChildren();
  strip.forEach(day => {
    const col = root.createElement('div');
    col.className = 'cn-pair';
    const bars = root.createElement('div');
    bars.className = 'cn-pair-bars';
    [['m', day.mood], ['e', day.energy]].forEach(([cls, value]) => {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = cls;
      button.style.height = `${value ? (value / 10) * 80 : 4}px`;
      button.style.opacity = value ? '1' : '0.28';
      const show = () => setText(read, day.logged
        ? `${formatDisplayDate(day.date)} · mood ${day.mood} · energy ${day.energy}`
        : `${formatDisplayDate(day.date)} · no diary`);
      button.addEventListener('mouseenter', show);
      button.addEventListener('focus', show);
      bars.append(button);
    });
    const lab = root.createElement('div');
    lab.className = 'cn-pair-d';
    lab.textContent = day.date.slice(8);
    col.append(bars, lab);
    host.append(col);
  });
  const last = [...logged].at(-1);
  const quiet = strip.filter(day => !day.logged && day.date > (last?.date ?? '')).length;
  setText(read, last
    ? `${formatDisplayDate(last.date)} is the last diary: mood ${last.mood}. ${quiet} quiet days after that.`
    : '');
  setText(goal, quiet >= 7
    ? 'For your goal: quiet diary weeks show up when teaching takes the week and the people you want time with get the leftover.'
    : 'For your goal: the diary is still talking. Keep the thread.');
}

function renderTrain(root, model) {
  const svg = root.querySelector('#cn-train');
  const tile = root.querySelector('#cn-tile-train');
  const read = root.querySelector('[data-cn="train-read"]');
  const goal = root.querySelector('[data-cn="train-goal"]');
  if (!svg || !tile) return;
  const weeks = model.trainingWeeks ?? [];
  const withWork = weeks.filter(week => week.minutes > 0);
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: withWork.length, unit: 'training weeks' })) {
    setText(read, '');
    setText(goal, '');
    return;
  }
  svg.replaceChildren();
  const base = 140;
  const max = Math.max(30, ...weeks.map(week => week.minutes), 1);
  const k = 110 / max;
  const w = 32;
  const gap = 16;
  const x0 = 18;
  const axis = createSvg(root, 'line');
  axis.setAttribute('x1', '10');
  axis.setAttribute('x2', '290');
  axis.setAttribute('y1', String(base));
  axis.setAttribute('y2', String(base));
  axis.setAttribute('stroke', 'var(--line)');
  svg.append(axis);
  const cy = base - 30 * k;
  const cap = createSvg(root, 'line');
  cap.setAttribute('x1', '10');
  cap.setAttribute('x2', '290');
  cap.setAttribute('y1', String(cy));
  cap.setAttribute('y2', String(cy));
  cap.setAttribute('class', 'cn-ceiling');
  svg.append(cap);
  weeks.forEach((week, index) => {
    const h = Math.max(4, week.minutes * k);
    const x = x0 + index * (w + gap);
    const bar = createSvg(root, 'rect');
    bar.setAttribute('x', String(x));
    bar.setAttribute('y', String(base - h));
    bar.setAttribute('width', String(w));
    bar.setAttribute('height', String(h));
    bar.setAttribute('rx', '4');
    bar.setAttribute('class', week.over ? 'cn-bar cn-bar--over' : 'cn-bar');
    bar.setAttribute('tabindex', '0');
    const show = () => setText(read, `Week of ${formatDisplayDate(week.weekStart)} · ${week.minutes} min`);
    bar.addEventListener?.('mouseenter', show);
    bar.addEventListener?.('focus', show);
    svg.append(bar);
    const tick = createSvg(root, 'text');
    tick.setAttribute('x', String(x + w / 2));
    tick.setAttribute('y', '156');
    tick.setAttribute('text-anchor', 'middle');
    tick.textContent = formatDisplayDate(week.weekStart).slice(0, 5);
    svg.append(tick);
  });
  const last = withWork.at(-1);
  setText(read, last
    ? `Latest week: ${last.minutes} min${last.over ? '. Over the 30 min flare cap.' : '.'}`
    : '');
  setText(goal, last?.over
    ? 'For your goal: osteopenia still wants spine-loading work, but flare sessions stay 20 to 30 min. Cut the session, do not skip the week.'
    : 'For your goal: training is holding the flare cap.');
}

function renderKnowledge(root, model) {
  const host = root.querySelector('#cn-know');
  const tile = root.querySelector('#cn-tile-knowledge');
  const read = root.querySelector('[data-cn="know-read"]');
  const goal = root.querySelector('[data-cn="know-goal"]');
  if (!host || !tile) return;
  const topics = model.knowledgeTopics?.topics ?? [];
  const weeks = model.knowledgeTopics?.weeks ?? [];
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: topics.length, unit: 'reading topics this window' })) {
    setText(read, 'Knowledge notes will land here when a book note or tagged page is filed in the last six weeks.');
    setText(goal, '');
    return;
  }
  renderHeatGrid(root, host, {
    columns: weeks.length,
    rows: topics,
    days: weeks,
    onCell: (row, index, value) => {
      setText(read, value
        ? `${row.name} · week of ${formatDisplayDate(weeks[index])} · ${value} notes`
        : `${row.name} · week of ${formatDisplayDate(weeks[index])} · no notes`);
    }
  });
  const live = topics.filter(topic => topic.vals.at(-1) > 0).map(topic => topic.name);
  setText(read, live.length ? `${live.join(' and ')} ${live.length === 1 ? 'is' : 'are'} the live thread.` : 'No notes in the current week.');
  setText(goal, 'For your goal: the notes you are adding show the work you still care about, not only the degree you want finished.');
}

function renderLoops(root, model) {
  const host = root.querySelector('#cn-loops');
  const read = root.querySelector('[data-cn="loop-read"]');
  const empty = root.querySelector('[data-cn="loops-empty"]');
  if (!host) return;
  host.replaceChildren();
  const loops = model.openLoops ?? [];
  if (empty) empty.hidden = loops.length > 0;
  if (!loops.length) {
    setText(read, '');
    return;
  }
  for (const loop of loops) {
    const row = root.createElement('div');
    row.className = 'cn-loop';
    row.dataset.loopId = loopId(loop);
    const copy = root.createElement('div');
    const title = root.createElement('h3');
    title.textContent = loop.title;
    if (typeof loop.ageDays === 'number') {
      const age = root.createElement('span');
      age.className = 'cn-loop-age';
      age.textContent = `${loop.ageDays} days`;
      title.append(age);
    }
    const why = root.createElement('p');
    why.textContent = `${loop.owner}${loop.dateKey ? ` · opened ${formatDisplayDate(loop.dateKey)}` : ''}`;
    copy.append(title, why);
    const actions = root.createElement('div');
    actions.className = 'cn-loop-actions';
    for (const [act, label, kind] of [['dismiss', 'Dismiss', 'ghost'], ['archive', 'Archive', 'ghost'], ['close', 'Close', 'primary']]) {
      const button = root.createElement('button');
      button.className = kind === 'primary' ? 'btn btn--primary' : 'btn btn--ghost';
      button.type = 'button';
      button.dataset.act = act;
      button.dataset.loopId = loopId(loop);
      button.textContent = label;
      actions.append(button);
    }
    row.append(copy, actions);
    host.append(row);
  }
  setText(read, 'Pick Dismiss, Archive or Close. The row leaves the board.');
}

function renderAgents(root, model) {
  const host = root.querySelector('[data-central-node="recent-actions"]');
  if (!host) return;
  host.replaceChildren();
  const deposits = model.deposits ?? [];
  if (!deposits.length) {
    host.textContent = 'No agent deposits in the last 48 hours.';
    return;
  }
  deposits.slice(0, 8).forEach(item => {
    const line = root.createElement('p');
    const who = item.from && item.to ? `${item.from} to ${item.to}` : item.from || 'Agent';
    line.innerHTML = '';
    const name = root.createElement('b');
    name.textContent = who;
    line.append(name);
    const body = root.createElement('small');
    body.textContent = item.text;
    line.append(body);
    host.append(line);
  });
}

function bindBoard(root, { storage, onLoopsChange } = {}) {
  const host = root.querySelector('#central-node-dashboard') ?? root;
  if (!host?.addEventListener || host.dataset?.cnBoardBound === '1') return;
  if (host.dataset) host.dataset.cnBoardBound = '1';
  host.addEventListener('click', event => {
    const about = event.target.closest?.('[data-cn="about-chip"]');
    if (about) {
      const tile = about.closest('article');
      const read = tile?.querySelector('.cn-readout');
      if (read) read.textContent = 'Hammond framed this from About Me (work, relationships, life events, goals). The file itself stays collapsed.';
      return;
    }
    const answer = event.target.closest?.('[data-act="answer"]');
    if (answer) {
      root.querySelector('#central-node-chat-button')?.click();
      return;
    }
    const act = event.target.closest?.('[data-act]');
    if (!act?.dataset.loopId) return;
    hideLoopId(act.dataset.loopId, storage);
    const said = {
      dismiss: 'Dismissed. Hammond will stop putting this on the board.',
      archive: 'Archived. It leaves the board and sits in change history.',
      close: 'Closed. The loop is done.'
    };
    const read = root.querySelector('[data-cn="loop-read"]');
    if (read) read.textContent = said[act.dataset.act] ?? said.dismiss;
    onLoopsChange?.(readHiddenLoopIds(storage));
  });
}

export function renderCentralNode(root, model, options = {}) {
  if (!root || !model) return;
  renderSupporting(root, model);
  renderNeedsYou(root, model);
  renderFat(root, model);
  renderWeight(root, model);
  renderLoad(root, model);
  renderCollide(root, model);
  renderMind(root, model);
  renderTrain(root, model);
  renderKnowledge(root, model);
  renderLoops(root, model);
  renderAgents(root, model);
  renderMarkdown(root, '[data-central-node="constraints"]', model.sections?.constraints, 'No constraints on file.');
  renderMarkdown(root, '[data-central-node="about-me"]', model.sections?.aboutMe, 'No About Me notes yet.');
  bindBoard(root, {
    storage: options.storage ?? globalThis.localStorage,
    onLoopsChange: options.onLoopsChange
  });
  root.querySelector('#central-node-dashboard')?.removeAttribute('hidden');
}
