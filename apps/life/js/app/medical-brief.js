import { formatDisplayDate, daysBetween, isCalendarDate } from '../core/time.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EPISODE_EMOJI = { Acute: '🤧', IBD: '🩺', Liver: '🫀', Mind: '🧠' };

/** Relative / precision-aware label for Next rows and river countdowns. */
export function formatRelativeMedicalDate(date, today, {
  precision = null,
  status = null,
  virtual = false
} = {}) {
  if (status === 'to_book' || precision === 'tbd') return 'action';
  if (!date || !today || !isCalendarDate(date) || !isCalendarDate(today)) {
    return date ? formatDisplayDate(date) : '';
  }
  if (precision === 'month') {
    const [y, m] = date.split('-').map(Number);
    const mon = MONTHS_SHORT[m - 1] || '';
    const thisYear = Number(today.slice(0, 4));
    if (y === thisYear) return Number(date.slice(8, 10)) <= 10 ? `early ${mon}` : mon;
    return `${mon} ${y}`;
  }
  const days = daysBetween(today, date);
  const prefix = virtual ? '~' : '';
  if (days === 0) return `${prefix}today`;
  if (days === 1) return `${prefix}tomorrow`;
  if (days > 1 && days < 60) return `${prefix}in ${days} days`;
  if (days < 0 && days > -60) return `${Math.abs(days)}d ago`;
  return `${prefix}${formatDisplayDate(date)}`;
}

/**
 * Health Brief / Active Episode / Next card row (MO-12–16).
 * @param {object} root document-like with createElement / querySelector
 * @param {object} model buildMedicalModel result
 * @param {object} hooks onAddToTasks, onSelect, onJumpUpcoming, onOpenEpisode
 */
export function renderBriefRow(root, model, hooks = {}) {
  const host = root.querySelector('#medical-brief-row');
  if (!host || !model) return;
  host.replaceChildren();
  host.append(
    briefCard(root, model),
    episodeCard(root, model, hooks),
    nextCard(root, model, hooks)
  );
}

function briefCard(root, model) {
  const card = surfaceCard(root, 'Health Brief');
  const brief = model.brief || {};
  const has = brief.cycle || (brief.watch && brief.watch.length) || brief.verdict;
  if (!has) {
    card.append(emptyLine(root, 'No cycle meter, watch items, or verdict yet.'));
    return card;
  }

  if (brief.cycle) {
    const label = root.createElement('p');
    label.className = 'medical-brief__kicker';
    label.textContent = `${brief.cycle.label} cycle`;
    const value = root.createElement('p');
    value.className = 'medical-brief__value';
    value.textContent = `Week ${brief.cycle.week} of ${brief.cycle.of}`;
    const meter = root.createElement('div');
    meter.className = 'medical-brief__meter';
    meter.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= brief.cycle.of; i += 1) {
      const seg = root.createElement('i');
      if (i <= brief.cycle.week) seg.className = 'is-filled';
      meter.append(seg);
    }
    card.append(label, value, meter);
  }

  if (brief.watch?.length) {
    const watchLabel = root.createElement('p');
    watchLabel.className = 'medical-brief__kicker';
    watchLabel.textContent = 'Watch';
    card.append(watchLabel);
    for (const item of brief.watch) {
      const row = root.createElement('p');
      row.className = 'medical-brief__watch';
      row.dataset.status = item.status === 'High' || item.status === 'Low' ? 'flag' : 'ok';
      row.textContent = `${item.label} ${item.value ?? ''} ${item.arrow || ''}`.trim();
      card.append(row);
    }
  }

  if (brief.verdict) {
    const verdict = root.createElement('p');
    verdict.className = 'medical-brief__verdict';
    verdict.textContent = brief.verdict;
    card.append(verdict);
  }
  return card;
}

function episodeCard(root, model, hooks) {
  const card = surfaceCard(root, 'Active Episode');
  const ep = model.activeEpisode;
  if (!ep) {
    const last = lastResolvedEpisode(model.allVisits || model.visits || []);
    const line = emptyLine(
      root,
      last
        ? `No active episode · last: ${last.title}, resolved ${formatDisplayDate(last.resolved || last.lastDate)}`
        : 'No active episode.'
    );
    card.append(line);
    return card;
  }

  const emoji = EPISODE_EMOJI.Acute;
  const title = root.createElement('p');
  title.className = 'medical-brief__value';
  title.textContent = `${emoji} ${ep.title} · day ${ep.dayNumber || 1}`;

  const latest = ep.entries?.[0];
  const note = root.createElement('p');
  note.className = 'medical-brief__verdict';
  note.textContent = latest
    ? `${truncate(latest.notes || latest.title, 120)} · ${formatDisplayDate(latest.date)}`
    : '';

  const dots = root.createElement('div');
  dots.className = 'medical-brief__dots';
  dots.setAttribute('aria-hidden', 'true');
  const started = ep.started;
  const today = model.today;
  if (started && today && isCalendarDate(started) && isCalendarDate(today)) {
    const span = Math.max(1, daysBetween(started, today) + 1);
    const dated = new Set((ep.entries || []).map(entry => entry.date));
    for (let i = 0; i < span; i += 1) {
      const day = addDaysSafe(started, i);
      const dot = root.createElement('i');
      if (dated.has(day)) dot.className = 'is-filled';
      dots.append(dot);
    }
  }

  const btn = root.createElement('button');
  btn.type = 'button';
  btn.className = 'medical-brief__hit';
  btn.setAttribute('aria-label', `Open ${ep.title} episode in timeline`);
  btn.addEventListener('click', () => hooks.onOpenEpisode?.(ep.id));
  btn.append(title, note, dots);
  card.append(btn);
  return card;
}

function nextCard(root, model, hooks) {
  const card = surfaceCard(root, 'Next');
  const items = model.nextItems || [];
  if (!items.length) {
    card.append(emptyLine(root, 'Nothing planned.'));
    return card;
  }

  const list = root.createElement('ul');
  list.className = 'medical-brief__next';
  const shown = items.slice(0, 5);
  for (const visit of shown) list.append(buildNextRow(root, visit, model, hooks));
  card.append(list);

  const more = (model.nextItems?.length || 0) - shown.length;
  if (more > 0) {
    const moreBtn = root.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn btn--ghost medical-brief__more';
    moreBtn.textContent = `+${more} more`;
    moreBtn.addEventListener('click', () => hooks.onJumpUpcoming?.());
    card.append(moreBtn);
  }
  return card;
}

function buildNextRow(root, visit, model, hooks) {
  const li = root.createElement('li');
  li.className = 'medical-brief__next-row';

  const titleBtn = root.createElement('button');
  titleBtn.type = 'button';
  titleBtn.className = 'medical-brief__next-open';
  const title = root.createElement('span');
  title.className = 'medical-brief__next-title';
  title.textContent = visit.title;
  const when = root.createElement('span');
  when.className = 'medical-brief__next-when';
  const label = formatRelativeMedicalDate(visit.date, model.today, {
    precision: visit.date_precision,
    status: visit.status,
    virtual: visit.virtual
  });
  when.textContent = label;
  if (label === 'action') when.dataset.tone = 'danger';
  titleBtn.append(title, when);
  titleBtn.addEventListener('click', () => hooks.onSelect?.(visit.id));
  li.append(titleBtn);

  const eligible = visit.status === 'to_book' || visit.date_precision === 'tbd';
  if (eligible || visit.task_id) {
    const taskBtn = root.createElement('button');
    taskBtn.type = 'button';
    taskBtn.className = 'btn btn--ghost medical-brief__task';
    if (visit.task_id) {
      taskBtn.textContent = 'In Tasks ✓';
      taskBtn.disabled = true;
    } else {
      taskBtn.textContent = 'Add to Tasks';
      taskBtn.addEventListener('click', () => hooks.onAddToTasks?.(visit));
    }
    li.append(taskBtn);
  }
  return li;
}

function surfaceCard(root, heading) {
  const card = root.createElement('article');
  card.className = 'medical-brief-card';
  const h = root.createElement('h3');
  h.className = 'medical-brief-card__title';
  h.textContent = heading;
  card.append(h);
  return card;
}

function emptyLine(root, text) {
  const p = root.createElement('p');
  p.className = 'medical-brief__empty';
  p.textContent = text;
  return p;
}

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function lastResolvedEpisode(visits) {
  const byId = new Map();
  for (const visit of visits) {
    const ep = visit.episode;
    if (!ep?.id) continue;
    const status = ep.status || 'active';
    if (status !== 'resolved' && status !== 'resolved?') continue;
    const existing = byId.get(ep.id);
    if (!existing || visit.date > existing.lastDate) {
      byId.set(ep.id, {
        id: ep.id,
        title: ep.title,
        resolved: ep.resolved || visit.date,
        lastDate: visit.date
      });
    }
  }
  let best = null;
  for (const ep of byId.values()) {
    if (!best || ep.lastDate > best.lastDate) best = ep;
  }
  return best;
}

function addDaysSafe(dateKey, days) {
  if (!isCalendarDate(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
