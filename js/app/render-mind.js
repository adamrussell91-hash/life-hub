import { animateAreaReveal, animateColumnGrow } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildColumns } from './chart-kit/columns.js';

export function renderMind(root, model, { onRangeChange, onOpenAgent } = {}) {
  const dashboard = root.querySelector('#mind-dashboard');
  if (!dashboard || !model) return;

  const ranges = root.querySelector('#mind-range-control');
  if (ranges && !ranges.dataset.bound) {
    ranges.dataset.bound = '1';
    ranges.addEventListener('click', event => {
      const button = event.target.closest?.('[data-mind-range]');
      if (!button) return;
      onRangeChange?.(button.dataset.mindRange);
    });
  }
  if (ranges) {
    for (const button of ranges.querySelectorAll?.('[data-mind-range]') ?? []) {
      const active = button.dataset.mindRange === model.range;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  const caption = root.querySelector('[data-mind="entry-count"]');
  if (caption) {
    caption.textContent = model.entryCount
      ? `${model.entryCount} entr${model.entryCount === 1 ? 'y' : 'ies'} in range`
      : 'No diary entries in this range';
  }

  renderMoodChart(root, model.moodSeries);
  renderBarHost(root, '#mind-mood-columns', model.byMood);
  renderBarHost(root, '#mind-theme-columns', model.themes);
  renderBarHost(root, '#mind-energy-columns', model.energyByLevel);
  renderSilenceBanner(root, model);
  renderSessionList(root, model.sessions);
  renderInsightList(root, model.insights);
  renderCrossAgentStrip(root, model.crossAgentLines);

  const empty = root.querySelector('#mind-empty');
  if (empty) empty.hidden = !model.empty;

  for (const button of root.querySelectorAll?.('[data-mind-agent]') ?? []) {
    if (button.dataset.bound) continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => onOpenAgent?.(button.dataset.mindAgent));
  }

  dashboard.removeAttribute('hidden');
}

function renderMoodChart(root, series) {
  const svg = root.querySelector('#mind-mood-chart');
  if (!svg) return;
  const area = svg.querySelector('[data-role="area"]');
  const line = svg.querySelector('[data-role="line"]');
  if (!series.length) {
    if (area) area.setAttribute('d', '');
    if (line) line.setAttribute('d', '');
    svg.classList?.remove?.('chart-animating', 'chart-static');
    return;
  }
  const chart = buildAreaLine(series.map(point => ({ date: point.date, value: point.value })));
  if (area) area.setAttribute('d', chart.areaPath || '');
  if (line) line.setAttribute('d', chart.linePath || '');
  animateAreaReveal(svg);
}

function renderBarHost(root, selector, items) {
  const host = root.querySelector(selector);
  if (!host) return;
  host.replaceChildren();
  if (!items?.length) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = selector.includes('theme')
      ? 'No recurring themes in this range yet.'
      : selector.includes('energy')
        ? 'No energy entries in this range yet.'
        : 'No mood entries in this range yet.';
    host.append(caption);
    return;
  }
  const built = buildColumns(items, { height: 96 });
  for (const bar of built.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(fill, label);
    host.append(col);
    animateColumnGrow(fill, Math.max(bar.heightPct, bar.value > 0 ? 8 : 0));
  }
}

function renderSilenceBanner(root, model) {
  const host = root.querySelector('#mind-silence');
  if (!host) return;
  host.replaceChildren();
  if (!model.silence) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const chip = root.createElement('span');
  chip.className = 'body-tape-chip bloods-flag';
  chip.dataset.colour = 'neutral';
  chip.textContent = `${model.daysSinceLastDiary} days since diary · ${model.daysSinceLastMindSession} days since a Vera session.`;
  host.append(chip);
}

function renderSessionList(root, sessions) {
  const host = root.querySelector('#mind-sessions');
  if (!host) return;
  host.replaceChildren();
  if (!sessions?.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No sessions logged yet.';
    host.append(empty);
    return;
  }
  for (const session of sessions) {
    const card = root.createElement('article');
    card.className = 'mind-session-card';
    const date = root.createElement('p');
    date.className = 'mind-session-card__date';
    date.textContent = session.date;
    const title = root.createElement('h3');
    title.className = 'mind-session-card__theme';
    title.textContent = session.theme || 'Vera session';
    card.append(date, title);
    if (session.closingQuestion) {
      const question = root.createElement('p');
      question.className = 'mind-session-card__question';
      question.textContent = session.closingQuestion;
      card.append(question);
    }
    if (session.insight) {
      const insight = root.createElement('p');
      insight.className = 'mind-session-card__insight';
      insight.textContent = session.insight;
      card.append(insight);
    }
    host.append(card);
  }
}

function renderInsightList(root, insights) {
  const host = root.querySelector('#mind-insights');
  if (!host) return;
  host.replaceChildren();
  if (!insights?.length) {
    const empty = root.createElement('p');
    empty.className = 'governance-empty';
    empty.textContent = 'No governance entries yet.';
    host.append(empty);
    return;
  }
  for (const entry of insights) {
    const block = root.createElement('article');
    block.className = 'governance-entry';
    const heading = root.createElement('p');
    heading.className = 'governance-entry-heading';
    heading.textContent = [entry.dateKey, entry.entryType].filter(Boolean).join(' — ');
    block.append(heading);
    if (entry.title) {
      const title = root.createElement('p');
      title.className = 'governance-entry-title';
      title.textContent = entry.title;
      block.append(title);
    }
    if (entry.status) {
      const status = root.createElement('p');
      status.className = 'governance-entry-status';
      status.textContent = entry.status;
      block.append(status);
    }
    if (entry.body) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = entry.body;
      block.append(body);
    }
    host.append(block);
  }
}

function renderCrossAgentStrip(root, lines) {
  const host = root.querySelector('#mind-cross-agent');
  if (!host) return;
  host.replaceChildren();
  if (!lines?.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No Vera or Penelope coordination lines yet.';
    host.append(empty);
    return;
  }
  const list = root.createElement('ul');
  list.className = 'mind-cross-agent';
  for (const line of lines) {
    const item = root.createElement('li');
    item.className = 'mind-cross-agent__line';
    if (line.includes('Vera')) item.dataset.agent = 'vera';
    else if (line.includes('Penelope')) item.dataset.agent = 'penelope';
    item.textContent = line;
    list.append(item);
  }
  host.append(list);
}
